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
  return computeDailyCashFlowSeries(legs);
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

  // Parse and normalize expiration dates to local midnight
  const expirations = openLegs
    .map(l => {
      if (!l.expiry) return null;
      // Handle standard "YYYY-MM-DD" strings locally to prevent UTC shift
      const cleanDateStr = l.expiry.split('T')[0];
      const parts = cleanDateStr.split('-');
      
      let d;
      if (parts.length === 3) {
        d = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        d = new Date(l.expiry);
      }
      
      if (isNaN(d)) return null;
      d.setHours(0, 0, 0, 0); // Strip time component
      return d;
    })
    .filter(d => d !== null);

  if (expirations.length === 0) return "-";

  const soonest = expirations.sort((a, b) => a - b)[0];
  
  // Normalize today's date to local midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = soonest - today;
  return Math.round(diffTime / 86400000); // 86400000 ms per day
}

/**
 * Calculates campaign duration in days from earliest leg open date 
 * to latest leg close date (or today if still open).
 */
export function getCampaignDuration(legs = []) {
  if (!legs || legs.length === 0) return 0;

  let minOpenTime = Infinity;
  let maxCloseTime = -Infinity;
  let hasOpenLegs = false;

  legs.forEach((leg) => {
    if (leg.openDate) {
      // Normalize to local midnight to prevent time zone offset errors
      const openTime = new Date(`${leg.openDate}T00:00:00`).getTime();
      if (!isNaN(openTime) && openTime < minOpenTime) {
        minOpenTime = openTime;
      }
    }

    if (leg.isOpen) {
      hasOpenLegs = true;
    } else if (leg.closeDate) {
      const closeTime = new Date(`${leg.closeDate}T00:00:00`).getTime();
      if (!isNaN(closeTime) && closeTime > maxCloseTime) {
        maxCloseTime = closeTime;
      }
    }
  });

  if (minOpenTime === Infinity) return 0;

  // Use current date if any leg is open; otherwise, use the latest close date
  const endTime = hasOpenLegs
    ? new Date().setHours(0, 0, 0, 0)
    : maxCloseTime !== -Infinity
    ? maxCloseTime
    : minOpenTime;

  const diffMs = Math.max(0, endTime - minOpenTime);
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Computes total quantity across legs and returns corresponding badge styling.
 */
export function detectStrategy(legs) {
  if (!legs || legs.length === 0) return "0 Legs";

  // Use the full array length instead of filtering active legs
  const count = legs.length;
  return `${count} ${count === 1 ? "Leg" : "Legs"}`;
}

// logic.js
export function getCampaignLabel(campaign, fallbackId = "") {
  if (!campaign) {
    return fallbackId ? `Campaign ${fallbackId.slice(0, 4)}` : "Unassigned";
  }
  
  const baseName = campaign.name || campaign.ticker || "Unnamed";
  
  return `${baseName}`;
}

/* -------------------------------------------------------
   Shared Cash Flow Helpers
------------------------------------------------------- */
export function getLegMultiplier(leg) {
  return leg.type?.includes("call") || leg.type?.includes("put") ? 100 : 1;
}

export function getCalendarDay(dateValue) {
  if (!dateValue) return null;
  if (typeof dateValue === "string") {
    const match = dateValue.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return null;
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* -------------------------------------------------------
   Updated Cash Flow Helpers in src/logic/logic.js
------------------------------------------------------- */
export function getLegCashFlowEvents(leg, campaign = null) {
  const events = [];
  const multiplier = getLegMultiplier(leg);
  const typeStr = String(leg.type || "").toLowerCase();

  const isStock = typeStr.includes("stock");
  const isSell = typeStr.startsWith("sell") || typeStr.startsWith("short");

  const campaignName = campaign
    ? (campaign.name || campaign.ticker)
    : (leg.ticker || leg.symbol || "");

  const legDesc = leg.type ? `${leg.type}${leg.strike ? ` $${leg.strike}` : ""}` : "";
  const label = campaignName && legDesc ? `${campaignName} (${legDesc})` : campaignName || legDesc || "Leg";

  // Opening Cash Flow
  if (leg.openDate && leg.openPrice != null) {
    if (!isStock) {
      const cashFlow = isSell
        ? Number(leg.openPrice) * Number(leg.qty || 1) * multiplier
        : -Number(leg.openPrice) * Number(leg.qty || 1) * multiplier;
      events.push({ date: leg.openDate, amount: cashFlow, label });
    }
  }

  // Closing Cash Flow
  if (leg.closeDate && leg.closePrice != null && !leg.isOpen) {
    let cashFlow;
    if (isStock) {
      cashFlow = isSell
        ? (Number(leg.openPrice) - Number(leg.closePrice)) * Number(leg.qty || 1)
        : (Number(leg.closePrice) - Number(leg.openPrice)) * Number(leg.qty || 1);
    } else {
      cashFlow = isSell
        ? -Number(leg.closePrice) * Number(leg.qty || 1) * multiplier
        : Number(leg.closePrice) * Number(leg.qty || 1) * multiplier;
    }
    events.push({ date: leg.closeDate, amount: cashFlow, label });
  }

  return events;
}

export function computeDailyCashFlowSeries(legs = [], campaigns = []) {
  const campaignMap = {};
  if (Array.isArray(campaigns)) {
    campaigns.forEach((c) => {
      if (c?.id) campaignMap[c.id] = c;
    });
  }

  const dailyMap = {};

  legs.forEach((leg) => {
    const campaign = campaignMap[leg.campaignId] || null;
    const events = getLegCashFlowEvents(leg, campaign);

    events.forEach((event) => {
      const day = getCalendarDay(event.date);
      if (!day) return;

      if (!dailyMap[day]) {
        dailyMap[day] = { amount: 0, items: [] };
      }

      dailyMap[day].amount += event.amount;
      if (event.label) {
        // Store label and amount together
        dailyMap[day].items.push({ label: event.label, amount: event.amount });
      }
    });
  });

  const sortedDays = Object.keys(dailyMap).sort();
  let cumulative = 0;

  return sortedDays.map((date) => {
    const netCashFlow = Number(dailyMap[date].amount.toFixed(2));
    cumulative += netCashFlow;

    // Format each item as "Label: +$150.00"
    const formattedLabels = dailyMap[date].items
      .map((item) => `${item.label}: ${fmt(item.amount)}`)
      .join(", ");

    return {
      date,
      netCashFlow,
      cumulativeCashFlow: Number(cumulative.toFixed(2)),
      labels: formattedLabels,
    };
  });
}