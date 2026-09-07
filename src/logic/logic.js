import dbLocal from "../db/dexie.js";
import { pullAllFromFirestore } from "../sync.js";
import { pushLeg } from '../sync.js';
import { pushTombstone } from "../sync/pushTombstone";

/* -------------------------------------------------------
   Formatting Helpers
------------------------------------------------------- */
export function fmt(x) {
  if (x == null || Number.isNaN(x)) return "-";
  return Number(x).toFixed(2);
}

export function cashClass(x) {
  if (x > 0) return "cash-pos";
  if (x < 0) return "cash-neg";
  return "cash-zero";
}

/* -------------------------------------------------------
   Loaders
------------------------------------------------------- */
export async function loadCampaignsAndLegs(uid) {
  console.log("[TRACE] loadCampaignsAndLegs CALLED from:", new Error().stack);
  console.log("[TRACE] uid =", uid);
  const campaigns = await dbLocal.campaigns.toArray();
  const legs = await dbLocal.legs.toArray();

  if (campaigns.length === 0 && legs.length === 0) {
    console.log("Dexie empty — pulling from Firestore");
    const remote = await pullAllFromFirestore(uid);

    await dbLocal.campaigns.bulkPut(remote.campaigns);
    await dbLocal.legs.bulkPut(remote.legs);

    return remote;
  }

  return { campaigns, legs };
}


/* -------------------------------------------------------
   Per-Leg P/L
------------------------------------------------------- */
export function computeLegPL(leg) {
  if (!leg.closePrice) return 0;
  return (leg.openPrice - leg.closePrice) * leg.qty;
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
    if (l.openDate) {
      events.push({
        date: l.openDate,
        pl: -(l.openPrice * l.qty)
      });
    }
    if (l.closeDate) {
      events.push({
        date: l.closeDate,
        pl: l.closePrice * l.qty
      });
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
   Leg Handlers
------------------------------------------------------- */
export async function addLeg(uid, leg, reloadAll) {
  const normalized = {
    ...leg,
    qty: Number(leg.qty),
    openPrice: Number(leg.openPrice),
    closePrice: Number(leg.closePrice || 0),
    updatedAt: new Date().toISOString(),
    dirty: true
  };

  // Dexie insert
  await dbLocal.legs.put(normalized);

  // Firestore insert/upsert
  await pushLeg(uid, normalized);

  // Refresh UI
  if (reloadAll) {
    await reloadAll(uid);
  }

  return normalized;
}

export async function editLeg(uid, updatedLeg, reloadAll) {
  const normalized = {
    ...updatedLeg,
    qty: Number(updatedLeg.qty),
    openPrice: Number(updatedLeg.openPrice),
    closePrice: Number(updatedLeg.closePrice || 0)
  };

  await dbLocal.updateLeg(updatedLeg.id, normalized);
  await pushLeg(uid, normalized);

  await reloadAll(uid);   // now reloadAll is passed in

  return normalized;
}

export async function handleCloseLeg(leg, closePrice) {
  await dbLocal.updateLeg(leg.id, {
    closePrice: Number(closePrice),
    closeDate: new Date().toISOString(),
    isOpen: false
  });
}

export async function rollLeg(uid, oldLeg, rollData, reloadAll) {
  // Close old leg
  await editLeg(uid, {
    ...oldLeg,
    closePrice: Number(rollData.closePrice),
    closeDate: new Date().toISOString(),
    isOpen: false
  }, reloadAll);

  // Create new leg
  const newLeg = {
    id: crypto.randomUUID(),
    campaignId: oldLeg.campaignId,
    ticker: oldLeg.ticker,
    type: oldLeg.type,
    qty: Number(rollData.qty),
    strike: rollData.strike,
    expiry: rollData.expiry,
    openPrice: Number(rollData.openPrice),
    closePrice: 0,
    isOpen: true,
    notes: oldLeg.notes,
    openDate: new Date().toISOString(),
    closeDate: null,
    linkedLegIds: [oldLeg.id]
  };

  await addLeg(uid, newLeg, reloadAll);
}

/* -------------------------------------------------------
   Campaign Handlers
------------------------------------------------------- */
export async function closeCampaign(uid, campaignId, legs, reloadAll) {
  const closeDates = legs
    .filter(l => l.campaignId === campaignId && l.closeDate)
    .map(l => new Date(l.closeDate));

  const endDate = closeDates.length
    ? new Date(Math.max(...closeDates)).toISOString()
    : new Date().toISOString();

  // Dexie update
  await dbLocal.updateCampaign(campaignId, {
    status: "closed",
    endDate,
    dirty: true,
    updatedAt: new Date().toISOString()
  });

  // Firestore update
  await pushCampaign(uid, {
    id: campaignId,
    status: "closed",
    endDate
  });

  // Reload Dexie → React
  await reloadAll(uid);
}

export async function handleReopenCampaign(campaignId) {
  await dbLocal.updateCampaign(campaignId, {
    status: "open",
    endDate: null
  });
}

export async function deleteCampaign(uid, id, reloadAll) {
  const now = new Date().toISOString();

  // Tombstone locally
  await dbLocal.campaigns.update(id, {
    deleted: true,
    deletedAt: now,
    dirty: true,
    updatedAt: now
  });

  await dbLocal.legs.where('campaignId').equals(id).modify(leg => {
    leg.deleted = true;
    leg.deletedAt = now;
    leg.dirty = true;
    leg.updatedAt = now;
  });

  try {
    if (uid) {
      await pushTombstone(uid, 'campaigns', id);

      const legs = await dbLocal.legs.where('campaignId').equals(id).toArray();
      await Promise.all(
        legs.map(l => pushTombstone(uid, 'legs', l.id))
      );
    }

    // ⭐ optional but recommended
    if (reloadAll) {
      await reloadAll(uid);
    }

    return { ok: true };

  } catch (err) {
    console.error("[deleteCampaign] hard failure", err);
    const cls = err._classification || { type: 'unknown', transient: false };

    if (cls.transient) {
      await dbLocal.deletionJobs.add({
        type: 'deleteCampaign',
        targetId: id,
        createdAt: Date.now(),
        attempts: 0
      });

      return { ok: false, queued: true, error: err, classification: cls };
    }

    return { ok: false, queued: false, error: err, classification: cls };
  }
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
  const optionsNet = legsForCampaign
    .filter(l => l.type.includes("call") || l.type.includes("put"))
    .reduce(
      (sum, l) => sum + (l.openPrice - (l.closePrice || 0)) * l.qty,
      0
    );

  const stockNet = legsForCampaign
    .filter(l => l.type.includes("stock"))
    .reduce(
      (sum, l) => sum + (l.openPrice - (l.closePrice || 0)) * l.qty,
      0
    );

  const openDates = legsForCampaign
    .filter(l => l.openDate)
    .map(l => new Date(l.openDate));

  const closeDates = legsForCampaign
    .filter(l => l.closeDate)
    .map(l => new Date(l.closeDate));

  const startDate = openDates.length
    ? new Date(Math.min(...openDates)).toISOString().slice(0, 10)
    : null;

  const endDate = closeDates.length
    ? new Date(Math.max(...closeDates)).toISOString().slice(0, 10)
    : campaign.endDate
      ? new Date(campaign.endDate).toISOString().slice(0, 10)
      : null;

  return {
    optionsNet,
    stockNet,
    netCredit: optionsNet + stockNet,
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

  const optionsNet = legs
    .filter(l => l.type.includes("call") || l.type.includes("put"))
    .reduce((sum, l) => sum + (l.openPrice - (l.closePrice || 0)) * l.qty, 0);

  const stockNet = legs
    .filter(l => l.type.includes("stock"))
    .reduce((sum, l) => sum + (l.openPrice - (l.closePrice || 0)) * l.qty, 0);

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
  const openLegs = legsForCampaign.filter(l => l.status === "open");

  if (openLegs.length === 0) return "-";

  const expirations = openLegs
    .map(l => new Date(l.expiry))
    .filter(d => !isNaN(d));

  if (expirations.length === 0) return "-";

  const soonest = expirations.sort((a, b) => a - b)[0];
  const today = new Date();

  return Math.ceil((soonest - today) / 86400000);
}
