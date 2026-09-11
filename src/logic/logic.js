import dbLocal from "../db/dexie.js";

/* -------------------------------------------------------
   Formatting Helpers
------------------------------------------------------- */
export function fmt(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "-";

  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function cashClass(x) {
  if (x == null) return "";
  if (x > 0) return "cash-pos";
  if (x < 0) return "cash-neg";
  return "cash-zero";
}

/* -------------------------------------------------------
   Per-Leg P/L
------------------------------------------------------- */
export function computeLegPL(leg) {
  const isOption = leg.type.includes("call") || leg.type.includes("put");
  const multiplier = isOption ? 100 : 1;

  const isSell = leg.type.startsWith("sell_");
  const isBuy  = leg.type.startsWith("buy_");

  // ⭐ No P/L until closed → return null
  if (leg.closePrice == null) {
    return null;
  }

  // ⭐ Realized P/L
  if (isSell) {
    // credit trade: profit when close < open
    return (leg.openPrice - leg.closePrice) * leg.qty * multiplier;
  }

  if (isBuy) {
    // debit trade: profit when close > open
    return (leg.closePrice - leg.openPrice) * leg.qty * multiplier;
  }

  // stock fallback
  return (leg.closePrice - leg.openPrice) * leg.qty * multiplier;
}

/* -------------------------------------------------------
   Group Campaigns
------------------------------------------------------- */
export function groupCampaignsByTicker(campaigns) {
  const groups = {};
  for (const c of campaigns) {
    if (!groups[c.ticker]) groups[c.ticker] = [];
    groups[c.ticker].push(c);
  }
  return groups;
}

/* -------------------------------------------------------
   Timeline
------------------------------------------------------- */
export function getCampaignTimeline(legs) {
  return legs.map(l => ({
    id: l.id,
    label: `${l.type} @ ${l.strike}`,
    start: l.openDate,
    end: l.closeDate || new Date().toISOString()
  }));
}

/* -------------------------------------------------------
   Performance Series
------------------------------------------------------- */
export function computeCampaignPLSeries(legs) {
  const events = [];

  for (const l of legs) {
    const isOption = l.type.includes("call") || l.type.includes("put");
    const multiplier = isOption ? 100 : 1;

    const isSell = l.type.startsWith("sell_");
    const isBuy  = l.type.startsWith("buy_");

    // ⭐ Opening cash flow
    if (l.openDate) {
      let cash;
      if (isSell) {
        cash = l.openPrice * l.qty * multiplier;   // credit
      } else if (isBuy) {
        cash = -l.openPrice * l.qty * multiplier;  // debit
      } else {
        cash = -l.openPrice * l.qty;               // stock
      }
      events.push({ date: l.openDate, pl: cash });
    }

    // ⭐ Closing cash flow
    if (l.closeDate) {
      let cash;
      if (isSell) {
        cash = -l.closePrice * l.qty * multiplier; // debit
      } else if (isBuy) {
        cash = l.closePrice * l.qty * multiplier;  // credit
      } else {
        cash = l.closePrice * l.qty;               // stock
      }
      events.push({ date: l.closeDate, pl: cash });
    }
  }

  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  let cumulative = 0;
  return events.map(e => {
    cumulative += e.pl;
    return { date: e.date.slice(0, 10), cumulative };
  });
}

/* -------------------------------------------------------
   Campaign Handlers
------------------------------------------------------- */
export async function reopenCampaign(campaignId) {
  await dbLocal.updateCampaign(campaignId, {
    status: "open",
    endDate: null
  });
}

export async function handleSplitCampaign(campaignId, legs, campaigns, n) {
  const base = campaigns.find(c => c.id === campaignId);
  if (!base) return;

  const legsForCampaign = legs.filter(l => l.campaignId === campaignId);
  const chunkSize = Math.ceil(legsForCampaign.length / n);

  const newIds = [];
  for (let i = 0; i < n; i++) {
    const newId = await dbLocal.addCampaign({
      ticker: base.ticker,
      status: "open",
      notes: `${base.notes || ""} (split ${i + 1}/${n})`,
      tags: base.tags || []
    });
    newIds.push(newId);
  }

  for (let i = 0; i < legsForCampaign.length; i++) {
    const leg = legsForCampaign[i];
    const idx = Math.floor(i / chunkSize);
    const targetId = newIds[Math.min(idx, newIds.length - 1)];
    await dbLocal.updateLeg(leg.id, { campaignId: targetId });
  }

  await dbLocal.updateCampaign(campaignId, { status: "closed" });
}

export async function handleCombineCampaign(ids, campaigns, legs) {
  const validIds = ids.filter(id => campaigns.some(c => c.id === id));
  if (validIds.length < 2) return null;

  const base = campaigns.find(c => c.id === validIds[0]);

  const newId = await dbLocal.addCampaign({
    ticker: base.ticker,
    status: "open",
    notes: `${base.notes || ""} (combined ${validIds.join(", ")})`,
    tags: base.tags || []
  });

  for (const leg of legs.filter(l => validIds.includes(l.campaignId))) {
    await dbLocal.updateLeg(leg.id, { campaignId: newId });
  }

  for (const id of validIds) {
    await dbLocal.updateCampaign(id, { status: "closed" });
  }

  return newId;
}

/* -------------------------------------------------------
   Campaign Summary
------------------------------------------------------- */
export function computeCampaignSummary(campaign, legsForCampaign) {
  const multiplierFor = (l) =>
    l.type.includes("call") || l.type.includes("put") ? 100 : 1;

  const isSell = (l) => l.type.startsWith("sell_");
  const isBuy  = (l) => l.type.startsWith("buy_");

  // ⭐ Realized P/L only
  const realizedPL = legsForCampaign
    .filter(l => l.closePrice != null)
    .reduce((sum, l) => {
      const mult = multiplierFor(l);
      if (isSell(l)) {
        return sum + (l.openPrice - l.closePrice) * l.qty * mult;
      }
      if (isBuy(l)) {
        return sum + (l.closePrice - l.openPrice) * l.qty * mult;
      }
      return sum + (l.closePrice - l.openPrice) * l.qty * mult;
    }, 0);

  // ⭐ Unrealized P/L = 0 (hidden)
  const unrealizedPL = 0;

  const totalPL = realizedPL;

  // ⭐ Net credit = total cash flow
  const netCredit = legsForCampaign.reduce((sum, l) => {
    const mult = multiplierFor(l);
    const close = l.closePrice ?? null;

    if (isSell(l)) {
      // credit trade: open cash in, close cash out
      if (close == null) return sum + (l.openPrice * l.qty * mult);
      return sum + ((l.openPrice - close) * l.qty * mult);
    }

    if (isBuy(l)) {
      // debit trade: open cash out, close cash in
      if (close == null) return sum - (l.openPrice * l.qty * mult);
      return sum + ((close - l.openPrice) * l.qty * mult);
    }

    // stock fallback
    if (close == null) return sum - (l.openPrice * l.qty);
    return sum + ((close - l.openPrice) * l.qty);
  }, 0);

  // Dates
  const openDates = legsForCampaign
    .filter(l => l.openDate)
    .map(l => new Date(l.openDate));

  const closeDates = legsForCampaign
    .filter(l => l.closeDate)
    .map(l => new Date(l.closeDate));

  const startDate = openDates.length
    ? new Date(Math.min(...openDates)).toISOString().slice(0, 10)
    : campaign.startDate || null;

  const endDate = closeDates.length
    ? new Date(Math.max(...closeDates)).toISOString().slice(0, 10)
    : campaign.endDate || null;

  return {
    totalPL,
    realizedPL,
    unrealizedPL,
    netCredit,
    legCount: legsForCampaign.length,
    startDate,
    endDate
  };
}

/* -------------------------------------------------------
   Dashboard Summary
------------------------------------------------------- */
export function computeDashboardSummary(campaigns, legs) {
  const openLegs = legs.filter(l => l.isOpen);
  const closedLegs = legs.filter(l => !l.isOpen);

  const multiplierFor = (l) =>
    l.type.includes("call") || l.type.includes("put") ? 100 : 1;

  const isSell = (l) => l.type.startsWith("sell_");
  const isBuy  = (l) => l.type.startsWith("buy_");

  const optionsNet = legs
    .filter(l => l.type.includes("call") || l.type.includes("put"))
    .reduce((sum, l) => {
      const mult = multiplierFor(l);
      const close = l.closePrice ?? null;

      if (isSell(l)) {
        if (close == null) return sum + (l.openPrice * l.qty * mult);
        return sum + ((l.openPrice - close) * l.qty * mult);
      }

      if (isBuy(l)) {
        if (close == null) return sum - (l.openPrice * l.qty * mult);
        return sum + ((close - l.openPrice) * l.qty * mult);
      }

      return sum;
    }, 0);

  const stockNet = legs
    .filter(l => l.type.includes("stock"))
    .reduce((sum, l) => {
      const close = l.closePrice ?? null;
      if (close == null) return sum - (l.openPrice * l.qty);
      return sum + ((close - l.openPrice) * l.qty);
    }, 0);

  const netCredit = optionsNet + stockNet;

  const openDates = legs
    .filter(l => l.openDate)
    .map(l => new Date(l.openDate));

  const closeDates = legs
    .filter(l => l.closeDate)
    .map(l => new Date(l.closeDate));

  return {
    netCredit,
    openLegCount: openLegs.length,
    closedLegCount: closedLegs.length,
    activeCampaigns: campaigns.filter(c => c.status === "open").length,
    closedCampaigns: campaigns.filter(c => c.status === "closed").length,
    earliestOpen: openDates.length
      ? new Date(Math.min(...openDates)).toISOString().slice(0, 10)
      : null,
    latestClose: closeDates.length
      ? new Date(Math.max(...closeDates)).toISOString().slice(0, 10)
      : null
  };
}

export function fmtCampaignDaysLeft(campaign, legs) {
  if (!legs) return "-";  // safety

  const legsForCampaign = legs.filter(l => l.campaignId === campaign.id);
  const openLegs = legsForCampaign.filter(l => l.isOpen);

  if (openLegs.length === 0) return null;

  const expirations = openLegs
    .map(l => new Date(l.expiry))
    .filter(d => !isNaN(d));

  if (expirations.length === 0) return "-";

  const soonest = expirations.sort((a, b) => a - b)[0];
  const today = new Date();

  return Math.ceil((soonest - today) / 86400000);
}

// Auto-detect Option Strategy from active legs
export function detectStrategy(legs) {
  if (!legs || legs.length === 0) return "Custom";

  let activeLegs = legs.filter(l => l.isOpen);
  if (activeLegs.length === 0) {
    const initialLegs = legs.filter(l => !l.rolledFrom);
    activeLegs = initialLegs.length > 0 ? initialLegs : [legs[0]];
  }

  const types = activeLegs.map(l => (l.type || "").toLowerCase().trim());
  const sellPuts = types.filter(t => t === "sell_put" || t === "short_put").length;
  const buyPuts = types.filter(t => t === "buy_put" || t === "long_put").length;
  const sellCalls = types.filter(t => t === "sell_call" || t === "short_call").length;
  const buyCalls = types.filter(t => t === "buy_call" || t === "long_call").length;
  const stocks = types.filter(t => t === "stock").length;

  const totalActive = activeLegs.length;

  if (totalActive === 1) {
    if (sellPuts === 1) return "Short Put";
    if (buyPuts === 1) return "Long Put";
    if (sellCalls === 1) return "Short Call";
    if (buyCalls === 1) return "Long Call";
    if (stocks === 1) return "Stock";
    return "Single Leg";
  }

  if (totalActive === 2) {
    if (sellPuts === 1 && buyPuts === 1) return "Put Vertical";
    if (sellCalls === 1 && buyCalls === 1) return "Call Vertical";
    if (sellPuts === 1 && sellCalls === 1) return "Short Strangle";
    if (buyPuts === 1 && buyCalls === 1) return "Long Strangle";
    if (stocks === 1 && sellCalls === 1) return "Covered Call";
    return "2-Leg Spread";
  }

  if (totalActive === 4) {
    if (sellPuts === 1 && buyPuts === 1 && sellCalls === 1 && buyCalls === 1) {
      return "Iron Condor";
    }
  }

  return `${totalActive}-Leg Position`;
}