// import dbLocal from "../db/dexie.js";
import { 
  updateCampaign, 
} from "../sync/sync.js";

const DEFAULT_MARGIN_RATIO = 0.3;
const MARGIN_RATIO_BY_TICKER = new Map([
  ["AAPL", 0.25],
  ["GOOG", 0.25],
  ["NVDA", 0.25],
  ["SOXL", 0.6],
]);

export const ACCOUNT_TYPE_OPTIONS = [
  { value: "taxable", label: "Taxable brokerage (Reg-T)" },
  { value: "roth_ira", label: "Roth IRA" },
  { value: "traditional_ira", label: "Traditional IRA" },
  { value: "401k", label: "401(k)" },
];

const FULL_COLLATERAL_ACCOUNT_TYPES = new Set([
  "roth_ira",
  "traditional_ira",
  "401k",
]);

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

export function fmtWholeDollars(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "-";

  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

export function cashClass(x) {
  return "";
  // if (x == null) return "";
  // if (x > 0) return "cash-pos";
  // if (x < 0) return "cash-neg";
  // return "cash-zero";
}

/* -------------------------------------------------------
   Per-Leg P/L
------------------------------------------------------- */
export function computeLegPL(leg) {
  if (!leg) return null;

  const type = String(leg.type ?? "").toLowerCase();
  if (!type) return null;

  const isBlank = (value) =>
    typeof value === "string" && value.trim() === "";

  if (leg.closePrice == null || isBlank(leg.closePrice)) {
    return null;
  }

  if (leg.openPrice == null || isBlank(leg.openPrice) ||
      leg.qty == null || isBlank(leg.qty)) {
    return null;
  }

  const openPrice = Number(leg.openPrice);
  const closePrice = Number(leg.closePrice);
  const qty = Number(leg.qty);

  if (
    !Number.isFinite(openPrice) ||
    !Number.isFinite(closePrice) ||
    !Number.isFinite(qty)
  ) {
    return null;
  }

  const multiplier =
    type.includes("call") || type.includes("put") ? 100 : 1;

  if (type.startsWith("sell_")) {
    return (openPrice - closePrice) * qty * multiplier;
  }

  if (type.startsWith("buy_")) {
    return (closePrice - openPrice) * qty * multiplier;
  }

  return (closePrice - openPrice) * qty * multiplier;
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
export async function reopenCampaign(uid, campaignId) {
  if (!uid) return;
  
  await updateCampaign(uid, campaignId, {
    status: "open",
    endDate: null
  });
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
  const realizedPL = legsForCampaign.reduce(
    (sum, leg) => sum + (computeLegPL(leg) ?? 0),
    0
  );

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
export function getCampaignDuration(legs = [], campaign = null) {
  if (!Array.isArray(legs) || legs.length === 0) return 0;

  const startDate =
    getCalendarDay(campaign?.startDate) ||
    legs
      .map((leg) => getCalendarDay(leg.openDate))
      .filter(Boolean)
      .sort()[0];

  if (!startDate) return 0;

  const openLegs = legs.filter((leg) => leg.isOpen);
  let endDate;

  if (openLegs.length > 0) {
    const expirations = openLegs
      .filter((leg) => {
        const type = String(leg.type || "").toLowerCase();
        return type.includes("call") || type.includes("put");
      })
      .map((leg) => getCalendarDay(leg.expiry || leg.expiration))
      .filter(Boolean)
      .sort();

    endDate =
      expirations[expirations.length - 1] ||
      getCalendarDay(new Date());
  } else {
    const closeDates = legs
      .map((leg) => getCalendarDay(leg.closeDate))
      .filter(Boolean)
      .sort();

    endDate = closeDates[closeDates.length - 1] || startDate;
  }

  const startTime = new Date(`${startDate}T00:00:00`).getTime();
  const endTime = new Date(`${endDate}T00:00:00`).getTime();

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;

  return Math.max(0, Math.round((endTime - startTime) / 86400000));
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

  const legDesc = leg.type
    ? `${leg.type}${leg.strike ? ` $${leg.strike}` : ""}`
    : "";

  const label =
    campaignName && legDesc
      ? `${campaignName} (${legDesc})`
      : campaignName || legDesc || "Leg";

  // Opening Cash Flow
  // No cash-flow impact for stocks or long options at open.
  // Only short/sell option positions receive cash at open.
  if (leg.openDate && leg.openPrice != null) {
    if (!isStock && isSell) {
      const cashFlow =
        Number(leg.openPrice) *
        Number(leg.qty || 1) *
        multiplier;

      events.push({
        date: leg.openDate,
        amount: cashFlow,
        label,
      });
    }
  }

  // Closing Cash Flow
  if (leg.closeDate && leg.closePrice != null && !leg.isOpen) {
    let cashFlow;

    if (isStock) {
      cashFlow = isSell
        ? (Number(leg.openPrice) - Number(leg.closePrice)) *
          Number(leg.qty || 1)
        : (Number(leg.closePrice) - Number(leg.openPrice)) *
          Number(leg.qty || 1);

    } else if (isSell) {
      // Short option:
      // premium received at open, then cost to close.
      cashFlow =
        -Number(leg.closePrice) *
        Number(leg.qty || 1) *
        multiplier;

    } else {
      // Long option:
      // Record ONLY the net P/L at close.
      cashFlow =
        (Number(leg.closePrice) - Number(leg.openPrice)) *
        Number(leg.qty || 1) *
        multiplier;
    }

    events.push({
      date: leg.closeDate,
      amount: cashFlow,
      label,
    });
  }

  return events;
}

export function computeCampaignProjectedPL(legs = [], campaign = null) {
  return legs.reduce((campaignTotal, leg) => {
    const legTotal = getLegCashFlowEvents(leg, campaign).reduce(
      (total, event) => total + event.amount,
      0
    );

    return campaignTotal + legTotal;
  }, 0);
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
      .map((item) => `${item.label}: ${fmtWholeDollars(item.amount)}`)
      .join(", ");

    return {
      date,
      netCashFlow,
      cumulativeCashFlow: Number(cumulative.toFixed(2)),
      labels: formattedLabels,
    };
  });
}

export function computeWeeklyCashFlowSeries(dailySeries = []) {
  const weeklyMap = {};

  dailySeries.forEach((day) => {
    const [year, month, date] = day.date.split("-").map(Number);
    const current = new Date(year, month - 1, date);

    // Monday-based week
    const mondayOffset = (current.getDay() + 6) % 7;
    current.setDate(current.getDate() - mondayOffset);

    const weekStart = [
      current.getFullYear(),
      String(current.getMonth() + 1).padStart(2, "0"),
      String(current.getDate()).padStart(2, "0"),
    ].join("-");

    weeklyMap[weekStart] =
      (weeklyMap[weekStart] || 0) + day.netCashFlow;
  });

  return Object.entries(weeklyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, netCashFlow]) => ({
      weekStart,
      timestamp: new Date(`${weekStart}T00:00:00`).getTime(),
      netCashFlow: Number(netCashFlow.toFixed(2)),
    }));
}

function getMarginRatio(leg, accountType = "taxable") {
  if (FULL_COLLATERAL_ACCOUNT_TYPES.has(accountType)) return 1;

  const ticker = String(leg.ticker ?? "").trim().toUpperCase();
  return MARGIN_RATIO_BY_TICKER.get(ticker) ?? DEFAULT_MARGIN_RATIO;
}

function standaloneMargin(leg, quantity, accountType) {
  const { type, strike, openPrice } = leg;
  const marginRatio = getMarginRatio(leg, accountType);

  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  if (type === "sell_put" || type === "sell_call") {
    return Number.isFinite(strike)
      ? marginRatio * strike * quantity * 100
      : null;
  }

  if (type === "buy_put" || type === "buy_call") {
    return Number.isFinite(openPrice) ? openPrice * quantity * 100 : null;
  }

  if (type === "buy_stock" || type === "sell_stock") {
    return Number.isFinite(openPrice)
      ? marginRatio * openPrice * quantity
      : null;
  }

  return null;
}

function nextDateKey(dateKey) {
  const date = new Date(String(dateKey) + "T00:00:00");
  if (isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + 1);
  return getCalendarDay(date);
}

function normalizeLegForMargin(leg, index) {
  const type = String(leg.type || "").toLowerCase();
  const right = type.endsWith("_call")
    ? "call"
    : type.endsWith("_put")
      ? "put"
      : null;
  const side = type.startsWith("buy_")
    ? "buy"
    : type.startsWith("sell_")
      ? "sell"
      : null;

  const openDate = getCalendarDay(leg.openDate);
  const closeDate = getCalendarDay(leg.closeDate);
  const expiryDate = getCalendarDay(leg.expiry || leg.expiration);
  const expiryEndDate = expiryDate ? nextDateKey(expiryDate) : null;

  const qtyAbs = Math.abs(Number(leg.qty));
  const strike = Number(leg.strike);
  const openPrice = Number(leg.openPrice);
  const ticker = String(leg.ticker || "").trim().toUpperCase();
  const campaignId = String(leg.campaignId ?? "unassigned");
  const legKey = String(leg.id ?? "__idx_" + String(index));

  const spreadKey =
    right && side && expiryDate && ticker
      ? campaignId + "|" + ticker + "|" + expiryDate + "|" + right
      : null;

  return {
    source: leg,
    legKey,
    campaignId,
    type,
    right,
    ticker,
    side,
    spreadKey,
    openDate,
    closeDate,
    expiryDate,
    expiryEndDate,
    qtyAbs,
    strike,
    openPrice,
    explicitlyClosedWithoutDate: leg.isOpen === false && !closeDate,
  };
}

function buildMarginRuntime(legs) {
  const normalized = [];
  const eventsByDay = Object.create(null);
  const anchorDays = new Set();

  function pushEvent(day, op, leg) {
    if (!day) return;
    if (!eventsByDay[day]) eventsByDay[day] = [];
    eventsByDay[day].push({ op, leg });
  }

  for (let i = 0; i < legs.length; i += 1) {
    const n = normalizeLegForMargin(legs[i], i);
    normalized.push(n);

    if (n.openDate) anchorDays.add(n.openDate);
    if (n.closeDate) anchorDays.add(n.closeDate);
    if (n.expiryEndDate) anchorDays.add(n.expiryEndDate);

    if (!n.openDate) continue;
    if (n.explicitlyClosedWithoutDate) continue;

    pushEvent(n.openDate, "add", n);

    if (n.closeDate) {
      pushEvent(n.closeDate, "remove", n);
    } else if (n.expiryEndDate) {
      pushEvent(n.expiryEndDate, "remove", n);
    }
  }

  return { normalized, eventsByDay, anchorDays };
}

function evaluateMarginFromActiveLegs(
  activeLegs,
  accountTypeByCampaign = new Map()
) {
  const byCampaign = {};
  const consumedQuantityByLegKey = new Map();
  const spreadGroups = new Map();
  const unsupportedLegs = [];
  let ambiguousSpreadGroups = 0;

  function addMargin(campaignId, amount) {
    const key = String(campaignId ?? "unassigned");
    byCampaign[key] = (byCampaign[key] || 0) + amount;
  }

  for (let i = 0; i < activeLegs.length; i += 1) {
    const leg = activeLegs[i];
    if (!leg.spreadKey) continue;

    const group = spreadGroups.get(leg.spreadKey) || [];
    group.push(leg);
    spreadGroups.set(leg.spreadKey, group);
  }

  for (const group of spreadGroups.values()) {
    const first = group[0];
    const second = group[1];

    if (group.length > 2) {
      let hasBuy = false, hasSell = false;
      for (let j = 0; j < group.length; j++) {
        if (group[j].side === "buy") hasBuy = true;
        if (group[j].side === "sell") hasSell = true;
      }
      if (hasBuy && hasSell) {
        ambiguousSpreadGroups += 1;
        continue;
      }
    }

    // Ensure exactly 2 legs with opposing sides
    if (group.length !== 2 || first.side === second.side) continue;

    if (
      !Number.isFinite(first.strike) ||
      !Number.isFinite(second.strike) ||
      !Number.isFinite(first.qtyAbs) ||
      !Number.isFinite(second.qtyAbs) ||
      first.strike === second.strike
    ) {
      continue;
    }

    const matchedQty = Math.min(first.qtyAbs, second.qtyAbs);
    if (matchedQty <= 0) continue;

    const spreadMargin = Math.abs(first.strike - second.strike) * 100 * matchedQty;

    addMargin(first.campaignId, spreadMargin);
    consumedQuantityByLegKey.set(first.legKey, matchedQty);
    consumedQuantityByLegKey.set(second.legKey, matchedQty);
  }

  for (let i = 0; i < activeLegs.length; i += 1) {
    const leg = activeLegs[i];
    const consumed = consumedQuantityByLegKey.get(leg.legKey) || 0;
    const remaining = leg.qtyAbs - consumed;

    if (!Number.isFinite(remaining) || remaining <= 0) continue;

    const accountType =
      accountTypeByCampaign.get(leg.campaignId) || "taxable";
    const amount = standaloneMargin(leg.source, remaining, accountType);

    if (amount == null) {
      unsupportedLegs.push(leg.source);
    } else {
      addMargin(leg.campaignId, amount);
    }
  }

  const total = Object.values(byCampaign).reduce((sum, amount) => sum + amount, 0);

  return {
    total,
    byCampaign,
    unsupportedLegs,
    ambiguousSpreadGroups,
  };
}

function isLegActiveOnDay(leg, day) {
  if (!leg.openDate || leg.openDate > day) return false;
  if (leg.closeDate && leg.closeDate <= day) return false;
  if (leg.expiryDate && leg.expiryDate < day) return false;
  if (leg.explicitlyClosedWithoutDate) return false;
  return true;
}

export function computeMarginEstimate(
  legs = [],
  asOfDate = new Date(),
  accountTypeByCampaign = new Map()
) {
  const day = getCalendarDay(asOfDate);
  if (!day) {
    return {
      total: 0,
      byCampaign: {},
      unsupportedLegs: [],
      ambiguousSpreadGroups: 0,
    };
  }

  const runtime = buildMarginRuntime(legs);
  const activeLegs = runtime.normalized.filter((leg) => isLegActiveOnDay(leg, day));
  return evaluateMarginFromActiveLegs(activeLegs, accountTypeByCampaign);
}

export function computeMarginHistorySeries(
  legs = [],
  {
    startDate = "",
    endDate = "",
    accountTypeByCampaign = new Map(),
  } = {}
) {
  const runtime = buildMarginRuntime(legs);
  const today = getCalendarDay(new Date());
  const lastDate = getCalendarDay(endDate) || today;

  const sortedAnchors = Array.from(runtime.anchorDays).sort();
  const firstEvent = sortedAnchors[0];
  const firstDate = getCalendarDay(startDate) || firstEvent || lastDate;

  if (!firstDate || !lastDate || firstDate > lastDate) return [];

  const renderDays = new Set([firstDate, lastDate]);
  for (let i = 0; i < sortedAnchors.length; i += 1) {
    const day = sortedAnchors[i];
    if (day >= firstDate && day <= lastDate) renderDays.add(day);
  }
  const sortedRenderDays = Array.from(renderDays).sort();

  const sortedEventDays = Object.keys(runtime.eventsByDay).sort();
  const activeMap = new Map();
  let eventCursor = 0;

  function applyEvents(day) {
    const events = runtime.eventsByDay[day] || [];
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (ev.op === "add") {
        activeMap.set(ev.leg.legKey, ev.leg);
      } else {
        activeMap.delete(ev.leg.legKey);
      }
    }
  }

  while (
    eventCursor < sortedEventDays.length &&
    sortedEventDays[eventCursor] <= firstDate
  ) {
    applyEvents(sortedEventDays[eventCursor]);
    eventCursor += 1;
  }

  const output = [];

  for (let i = 0; i < sortedRenderDays.length; i += 1) {
    const day = sortedRenderDays[i];

    if (i > 0) {
      while (
        eventCursor < sortedEventDays.length &&
        sortedEventDays[eventCursor] <= day
      ) {
        applyEvents(sortedEventDays[eventCursor]);
        eventCursor += 1;
      }
    }

    const snapshot = evaluateMarginFromActiveLegs(
      Array.from(activeMap.values()),
      accountTypeByCampaign
    );

    output.push({
      date: day,
      total: snapshot.total,
      byCampaign: snapshot.byCampaign,
      unsupportedLegs: snapshot.unsupportedLegs,
      ambiguousSpreadGroups: snapshot.ambiguousSpreadGroups,
    });
  }

  return output;
}

function readNonnegativePrice(value) {
  if (value == null || value === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function optionIntrinsic(right, spot, strike) {
  return right === "put"
    ? Math.max(strike - spot, 0)
    : Math.max(spot - strike, 0);
}

export function computeAccountMarginEstimate(
  legs = [],
  {
    asOfDate = new Date(),
    positionMarks = {},
    underlyingPrices = {},
    shockPercent = 0,
    minimumMarginRatio = 0.10,
    accountType = "taxable",
  } = {}
) {
  const day = getCalendarDay(asOfDate);
  const shock = Number(shockPercent);
  const minimumRate = Number(minimumMarginRatio);

  if (
    !day ||
    !Number.isFinite(shock) ||
    shock <= -100 ||
    !Number.isFinite(minimumRate) ||
    minimumRate < 0
  ) {
    return { total: null, complete: false, positions: [] };
  }

  const activeLegs = buildMarginRuntime(legs).normalized.filter((leg) =>
    isLegActiveOnDay(leg, day)
  );

  const positions = activeLegs.map((leg) => ({
    legId: leg.legKey,
    leg,
    requiredMargin: 0,
    status: "Estimated",
  }));

  const positionByKey = new Map(positions.map((position) => [
    position.leg.legKey,
    position,
  ]));
  const matchedQty = new Map(activeLegs.map((leg) => [leg.legKey, 0]));
  const spreadMargin = new Map(activeLegs.map((leg) => [leg.legKey, 0]));
  const ambiguous = new Set();
  const spreadGroups = new Map();

  for (const leg of activeLegs) {
    if (!leg.spreadKey) continue;
    const group = spreadGroups.get(leg.spreadKey) || [];
    group.push(leg);
    spreadGroups.set(leg.spreadKey, group);
  }

  for (const group of spreadGroups.values()) {
    if (group.length > 2) {
      const hasBuy = group.some((leg) => leg.side === "buy");
      const hasSell = group.some((leg) => leg.side === "sell");
      if (hasBuy && hasSell) {
        group.forEach((leg) => ambiguous.add(leg.legKey));
      }
      continue;
    }

    if (group.length !== 2 || group[0].side === group[1].side) continue;

    const [first, second] = group;
    if (
      !Number.isFinite(first.strike) ||
      !Number.isFinite(second.strike) ||
      first.strike <= 0 ||
      second.strike <= 0 ||
      first.strike === second.strike
    ) {
      continue;
    }

    const quantity = Math.min(first.qtyAbs, second.qtyAbs);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const shortLeg = first.side === "sell" ? first : second;
    const requirement = Math.abs(first.strike - second.strike) * 100 * quantity;

    spreadMargin.set(
      shortLeg.legKey,
      spreadMargin.get(shortLeg.legKey) + requirement
    );
    matchedQty.set(first.legKey, quantity);
    matchedQty.set(second.legKey, quantity);
  }

  for (const position of positions) {
    const leg = position.leg;
    const source = leg.source;
    const quantity = leg.qtyAbs;
    const spreadPart = spreadMargin.get(leg.legKey) || 0;

    if (ambiguous.has(leg.legKey)) {
      position.requiredMargin = null;
      position.status = "Ambiguous spread";
      continue;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      position.requiredMargin = null;
      position.status = "Invalid quantity";
      continue;
    }

    const remaining = quantity - (matchedQty.get(leg.legKey) || 0);
    if (remaining <= 0) {
      position.requiredMargin = spreadPart;
      position.status = "Defined-risk spread";
      continue;
    }

    const type = leg.type;
    const isOption = type === "buy_call" || type === "buy_put" ||
      type === "sell_call" || type === "sell_put";
    const isStock = type === "buy_stock" || type === "sell_stock";

    if (!isOption && !isStock) {
      position.requiredMargin = null;
      position.status = "Unsupported position type";
      continue;
    }

    const ratio = getMarginRatio(source, accountType);
    const multiplier = 1 + shock / 100;
    let standalone = null;

    if (isStock) {
      const stockMark = readNonnegativePrice(positionMarks[leg.legKey]);
      if (stockMark != null) {
        standalone = ratio * stockMark * multiplier * remaining;
      } else {
        position.status = "Missing stock price";
      }
    } else {
      const optionMark = readNonnegativePrice(positionMarks[leg.legKey]);
      const ticker = String(leg.ticker || "").trim().toUpperCase();
      const spot = readNonnegativePrice(underlyingPrices[ticker]);
      const strike = leg.strike;
      const hasUnderlying =
        spot != null && Number.isFinite(strike) && strike > 0;

      if (shock !== 0 && !hasUnderlying) {
        position.status = "Missing underlying price for scenario";
      } else if (optionMark == null && !hasUnderlying) {
        position.status = "Missing option premium or underlying price";
      } else {
        const scenarioSpot = hasUnderlying ? spot * multiplier : null;
        let scenarioPremium = optionMark;

        if (hasUnderlying) {
          const currentIntrinsic = optionIntrinsic(leg.right, spot, strike);
          const shockedIntrinsic = optionIntrinsic(
            leg.right,
            scenarioSpot,
            strike
          );
          const extrinsic =
            optionMark == null
              ? 0
              : Math.max(0, optionMark - currentIntrinsic);

          scenarioPremium = shockedIntrinsic + extrinsic;
        }

        if (type.startsWith("buy_")) {
          standalone = scenarioPremium * 100 * remaining;
        } else if (scenarioSpot != null) {
          const outOfMoney = leg.right === "put"
            ? Math.max(scenarioSpot - strike, 0)
            : Math.max(strike - scenarioSpot, 0);
          const floorReference = leg.right === "put" ? strike : scenarioSpot;

          const perShareRequirement =
            scenarioPremium +
            Math.max(
              ratio * scenarioSpot - outOfMoney,
              minimumRate * floorReference
            );

          standalone = perShareRequirement * 100 * remaining;
        } else {
          position.status = "Missing underlying price";
        }
      }
    }

    if (standalone != null && Number.isFinite(standalone)) {
      position.requiredMargin = spreadPart + standalone;
      if (spreadPart > 0) position.status = "Spread plus uncovered quantity";
    } else {
      position.requiredMargin = null;
    }
  }

  const complete = positions.every((position) =>
    Number.isFinite(position.requiredMargin)
  );

  return {
    total: complete
      ? positions.reduce((sum, position) => sum + position.requiredMargin, 0)
      : null,
    complete,
    positions: positions.map(({ leg, ...position }) => position),
  };
}

export function computeAROM(pl, margin, daysHeld) {
  const profit = Number(pl);
  const capital = Number(margin);
  const days = Number(daysHeld);

  if (
    !Number.isFinite(profit) ||
    !Number.isFinite(capital) ||
    !Number.isFinite(days) ||
    capital <= 0 ||
    days <= 0
  ) {
    return null;
  }

  return (profit / capital) * (365 / days) * 100;
}