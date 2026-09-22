// src/sync.js
import {
  collection,
  query,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";

import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { processDeletionQueue } from "./processDeletionQueue";
import { 
  toMillis,
  effectiveLocalTs,
  effectiveRemoteTs,
  normalizeRemoteDoc,
  chooseWinningRecord,
} from "./utils/firestoreUtils";

/* -----------------------
   Helpers
------------------------ */

function nowMillis() {
  return Date.now();
}

function normalizeCampaign(raw) {
  return {
    ...raw,
    deleted: !!raw.deleted,
    dirty: !!raw.dirty,
    updatedAt: toMillis(raw.updatedAt) ?? Date.now(),
    clientUpdatedAt: toMillis(raw.clientUpdatedAt) ?? toMillis(raw.updatedAt) ?? Date.now(),
    serverUpdatedAt: toMillis(raw.serverUpdatedAt) ?? null,
  };
}

function normalizeLeg(raw) {
  return {
    ...raw,
    deleted: !!raw.deleted,
    dirty: !!raw.dirty,
    updatedAt: toMillis(raw.updatedAt) ?? Date.now(),
    clientUpdatedAt: toMillis(raw.clientUpdatedAt) ?? toMillis(raw.updatedAt) ?? Date.now(),
    serverUpdatedAt: toMillis(raw.serverUpdatedAt) ?? null,
  };
}

async function guardAgainstStaleRemoteWrite(uid, collectionName, localRecord) {
  if (!uid || !localRecord?.id) return false;

  try {
    const remoteSnap = await getDoc(doc(db, "users", uid, collectionName, localRecord.id));
    if (!remoteSnap.exists()) return false;

    const remote = normalizeRemoteDoc(remoteSnap.id, remoteSnap.data());
    const localTs = effectiveLocalTs(localRecord);
    const remoteTs = effectiveRemoteTs(remote);

    if (localTs < remoteTs) {
      const winner = chooseWinningRecord(localRecord, remote);
      await dbLocal[collectionName].put({ ...winner, dirty: false });
      return true;
    }
  } catch (err) {
    console.warn("[sync] stale write check failed", err);
  }

  return false;
}

/* -----------------------
   Initial sync
------------------------ */

export async function initialSync(uid) {
  const campaignsSnap = await getDocs(collection(db, "users", uid, "campaigns"));
  const remoteCampaigns = campaignsSnap.docs.map(d =>
    normalizeCampaign({ id: d.id, ...d.data() })
  );

  const legsSnap = await getDocs(collection(db, "users", uid, "legs"));
  const remoteLegs = legsSnap.docs.map(d =>
    normalizeLeg({ id: d.id, ...d.data() })
  );

  const localCampaigns = await dbLocal.campaigns.toArray();
  const localLegs = await dbLocal.legs.toArray();

  const dirtyCampaignIds = new Set(localCampaigns.filter(c => c.dirty).map(c => c.id));
  const dirtyLegIds = new Set(localLegs.filter(l => l.dirty).map(l => l.id));

  // If Dexie is empty, do a full remote load and STOP
  if (localCampaigns.length === 0 && localLegs.length === 0) {
    const remote = await pullAllFromFirestore(uid);
    await dbLocal.campaigns.bulkPut(remote.campaigns);
    await dbLocal.legs.bulkPut(remote.legs);
    return;
  }

  // Otherwise: overwrite non-dirty rows
  for (const rc of remoteCampaigns) {
    if (!dirtyCampaignIds.has(rc.id)) {
      await dbLocal.campaigns.put(rc);
    }
  }

  for (const rl of remoteLegs) {
    if (!dirtyLegIds.has(rl.id)) {
      await dbLocal.legs.put(rl);
    }
  }
}

export async function pullAllFromFirestore(uid) {
  const campaignsRef = collection(db, "users", uid, "campaigns");
  const legsRef = collection(db, "users", uid, "legs");

  const [campaignsSnap, legsSnap] = await Promise.all([
    getDocs(campaignsRef),
    getDocs(legsRef)
  ]);

  const campaigns = campaignsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    deleted: !!doc.data().deleted,
    dirty: false,
  }));

  const legs = legsSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    deleted: !!doc.data().deleted,
    dirty: false,
  }));

  return { campaigns, legs };
}

/* -----------------------
   Realtime subscriptions
------------------------ */

export function subscribeToCampaigns(uid) {
  const qCampaigns = query(collection(db, "users", uid, "campaigns"));

  return onSnapshot(
    qCampaigns,
    async (snap) => {
      // Process only what changed, avoiding full collection rewrites
      for (const change of snap.docChanges()) {
        const id = change.doc.id;
        const localRecord = await dbLocal.campaigns.get(id);

        // The Golden Rule: Never overwrite a local dirty record
        if (localRecord && localRecord.dirty) continue;

        if (change.type === "added" || change.type === "modified") {
          const raw = change.doc.data();
          const data = normalizeCampaign({
            ...raw,
            id,
            dirty: false,
            updatedAt: toMillis(raw.updatedAt) ?? Date.now(),
            serverUpdatedAt: toMillis(raw.serverUpdatedAt) ?? null,
            clientUpdatedAt: toMillis(raw.clientUpdatedAt) ?? toMillis(raw.updatedAt) ?? Date.now(),
          });
          await dbLocal.campaigns.put(data);
        } else if (change.type === "removed") {
          await dbLocal.campaigns.delete(id);
        }
      }
    },
    (err) => {
      console.error("[subscribeToCampaigns] listener error", err);
    }
  );
}

export function subscribeToLegs(uid) {
  const qLegs = query(collection(db, "users", uid, "legs"));

  return onSnapshot(
    qLegs,
    async (snap) => {
      for (const change of snap.docChanges()) {
        const id = change.doc.id;
        const localRecord = await dbLocal.legs.get(id);

        // The Golden Rule: Never overwrite a local dirty record
        if (localRecord && localRecord.dirty) continue;

        if (change.type === "added" || change.type === "modified") {
          const raw = change.doc.data();
          const data = normalizeLeg({
            ...raw,
            id,
            dirty: false,
            updatedAt: toMillis(raw.updatedAt) ?? Date.now(),
            serverUpdatedAt: toMillis(raw.serverUpdatedAt) ?? null,
            clientUpdatedAt: toMillis(raw.clientUpdatedAt) ?? toMillis(raw.updatedAt) ?? Date.now(),
          });
          await dbLocal.legs.put(data);
        } else if (change.type === "removed") {
          await dbLocal.legs.delete(id);
        }
      }
    },
    (err) => {
      console.error("[subscribeToLegs] listener error", err);
    }
  );
}

export async function ensureInitialSync(uid) {
  if (!uid) return;

  const campaignCount = await dbLocal.campaigns.count();
  const legCount = await dbLocal.legs.count();

  if (campaignCount === 0 && legCount === 0) {
    await initialSync(uid);
  }

  processDeletionQueue().catch(console.error);
}

export function startBackgroundSync(uid) {
  if (!uid) return () => {};
  
  const unsubscribeCampaigns = subscribeToCampaigns(uid);
  const unsubscribeLegs = subscribeToLegs(uid);

  return () => {
    unsubscribeCampaigns();
    unsubscribeLegs();
  };
}

/* -----------------------
   Campaign mutators
------------------------ */

export async function createCampaign(uid, fields) {
  if (!uid) {
    console.error("❌ [createCampaign] Aborted: User ID (uid) is missing!");
    return null;
  }

  const now = Date.now();
  const id = fields.id || crypto.randomUUID();

  const count = await dbLocal.campaigns.count();
  const autoName = (fields.name && fields.name.trim())
    ? fields.name
    : `${fields.ticker || "UNKNOWN"} #${count + 1}`;

  const campaign = normalizeCampaign({
    id,
    uid,
    status: "open",
    ...fields,
    name: autoName,
    openDate: fields.openDate ?? now,
    updatedAt: now,
    clientUpdatedAt: now,
    serverUpdatedAt: null,
    deleted: false,
    dirty: true,
  });

  await dbLocal.campaigns.put(campaign);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "campaigns", campaign);
    if (remoteWon) return id;

    await setDoc(doc(db, "users", uid, "campaigns", id), {
      ...campaign,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.campaigns.update(id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.warn("⚠️ Saved to local IndexedDB, but remote sync failed (offline or network error):", err);
  }

  return id;
}

export async function updateCampaign(uid, id, fields) {
  const existing = await dbLocal.campaigns.get(id);
  if (!existing) {
    console.warn(`[updateCampaign] Local campaign not found: ${id}`);
    return;
  }

  const now = Date.now();

  const updated = normalizeCampaign({
    ...existing,
    ...fields,
    updatedAt: now,
    clientUpdatedAt: now,
    dirty: true,
  });

  await dbLocal.campaigns.put(updated);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "campaigns", updated);
    if (remoteWon) return;

    await setDoc(doc(db, "users", uid, "campaigns", id), {
      ...updated,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.campaigns.update(id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[updateCampaign] push failed", err);
  }
}

export async function closeCampaign(uid, id) {
  await updateCampaign(uid, id, { 
    status: "closed", 
    endDate: new Date().toISOString().slice(0, 10)
  });
}

export async function reopenCampaign(uid, id) {
  await updateCampaign(uid, id, { 
    status: "open", 
    deleted: false,
    deletedAt: null,
    endDate: ""
  });
}

export async function deleteCampaign(uid, id) {
  const existing = await dbLocal.campaigns.get(id);
  if (!existing) return;

  const now = nowMillis();

  const tombstone = {
    ...existing,
    deleted: true,
    dirty: true,
    updatedAt: now,
  };

  // Also tombstone child legs immediately so live queries (e.g. dashboard
  // totals) reflect the deletion right away, instead of waiting for the
  // deletion queue to reach the server (which requires connectivity).
  const legs = await dbLocal.legs.where("campaignId").equals(id).toArray();
  const legTombstones = legs.map((leg) => ({
    ...leg,
    deleted: true,
    dirty: true,
    updatedAt: now,
  }));

  await dbLocal.transaction("rw", dbLocal.campaigns, dbLocal.legs, async () => {
    await dbLocal.campaigns.put(tombstone);
    if (legTombstones.length) await dbLocal.legs.bulkPut(legTombstones);
  });

  await dbLocal.deletionJobs.add({
    uid,
    type: "deleteCampaign",
    targetId: id,
    createdAt: Date.now(),
    attempts: 0
  });
}

/* -----------------------
   Leg mutators
------------------------ */

export async function addLeg(uid, legFields) {
  const now = nowMillis();
  const id = crypto.randomUUID();

  const leg = normalizeLeg({
    id,
    uid,
    isOpen: true,
    ...legFields,
    openDate: legFields?.openDate ?? now,
    closeDate: null,
    closePrice: null,
    updatedAt: now,
    clientUpdatedAt: now,
    serverUpdatedAt: null,
    deleted: false,
    dirty: true,
  });

  await dbLocal.legs.put(leg);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "legs", leg);
    if (remoteWon) return id;

    await setDoc(doc(db, "users", uid, "legs", id), {
      ...leg,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.legs.update(id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[addLeg] push failed", err);
  }

  await syncCampaignDates(uid, legFields.campaignId);
  return id;
}

export async function editLeg(uid, leg) {
  const now = nowMillis();

  const updated = normalizeLeg({
    ...leg,
    updatedAt: now,
    clientUpdatedAt: now,
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "legs", updated);
    if (remoteWon) return;

    await setDoc(doc(db, "users", uid, "legs", updated.id), {
      ...updated,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.legs.update(updated.id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[editLeg] push failed", err);
  }

  await syncCampaignDates(uid, leg.campaignId);
}

export async function closeLeg(uid, leg, closePrice) {
  const now = Date.now();

  const d = new Date();
  const localYear = d.getFullYear();
  const localMonth = String(d.getMonth() + 1).padStart(2, "0");
  const localDay = String(d.getDate()).padStart(2, "0");
  const todayStr = `${localYear}-${localMonth}-${localDay}`;

  let finalClosePrice = leg.closePrice;
  if (closePrice !== undefined && closePrice !== null) {
    finalClosePrice = Number(closePrice);
  }

  const updated = normalizeLeg({
    ...leg,
    closePrice: finalClosePrice,
    closeDate: leg.closeDate || todayStr,
    isOpen: false,
    updatedAt: now,
    clientUpdatedAt: now,
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "legs", updated);
    if (remoteWon) return updated;

    await setDoc(doc(db, "users", uid, "legs", leg.id), {
      ...updated,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.legs.update(leg.id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[closeLeg] push failed", err);
  }

  await syncCampaignDates(uid, leg.campaignId);
  return updated;
}

export async function reopenLeg(uid, leg) {
  const now = Date.now();

  const updated = normalizeLeg({
    ...leg,
    closePrice: null,
    closeDate: null,
    isOpen: true,
    updatedAt: now,
    clientUpdatedAt: now,
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "legs", updated);
    if (remoteWon) return updated;

    await setDoc(doc(db, "users", uid, "legs", leg.id), {
      ...updated,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.legs.update(leg.id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[reopenLeg] push failed", err);
  }

  return updated;
}

export async function deleteLeg(uid, id) {
  const existing = await dbLocal.legs.get(id);
  if (!existing) return;

  const tombstone = {
    ...existing,
    deleted: true,
    dirty: true,
    updatedAt: nowMillis(),
  };

  await dbLocal.legs.put(tombstone);

  await dbLocal.deletionJobs.add({
    uid,
    type: "deleteLeg",
    targetId: id,
    createdAt: Date.now(),
    attempts: 0
  });

  await syncCampaignDates(uid, existing.campaignId);
}

export async function rollLeg(uid, sourceLeg, rollFields = {}) { 
  await editLeg(uid, {
    ...sourceLeg,
    isOpen: false,
    closeDate: rollFields.closeDate,
    closePrice: rollFields.closePrice,
  });

  await addLeg(uid, {
    ticker: sourceLeg.ticker,
    type: sourceLeg.type,     
    qty: rollFields.qty !== undefined ? rollFields.qty : sourceLeg.qty,       
    strike: rollFields.strike !== undefined ? rollFields.strike : sourceLeg.strike, 
    expiry: rollFields.expiry !== undefined ? rollFields.expiry : sourceLeg.expiry, 
    campaignId: sourceLeg.campaignId,
    isOpen: true,
    openDate: rollFields.rollDate, 
    openPrice: rollFields.openPrice,
  });
}

/* -----------------------
   Force sync & Utilities
------------------------ */

export async function forceSync(uid) {
  if (!uid) return;

  const dirtyCampaigns = await dbLocal.campaigns
    .filter((c) => c.dirty === true)
    .toArray();

  const dirtyLegs = await dbLocal.legs
    .filter((l) => l.dirty === true)
    .toArray();

  for (const c of dirtyCampaigns) {
    const latest = await dbLocal.campaigns.get(c.id);
    if (!latest || !latest.dirty) continue;
    await updateCampaign(uid, c.id, latest);
  }

  for (const l of dirtyLegs) {
    const latest = await dbLocal.legs.get(l.id);
    if (!latest || !latest.dirty) continue;
    await editLeg(uid, latest);
  }
}

export async function deleteAllRemote(uid) {
  const collectionsToClear = [
    `users/${uid}/campaigns`,
    `users/${uid}/legs`
  ];

  for (const collectionPath of collectionsToClear) {
    const ref = collection(db, collectionPath);
    const snapshot = await getDocs(ref);

    let batch = writeBatch(db);
    let operationCount = 0;

    for (const docSnapshot of snapshot.docs) {
      batch.delete(docSnapshot.ref);
      operationCount++;

      if (operationCount === 400) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }
  }
}

export async function combineCampaigns(uid, sourceCampaignId, targetCampaignId) {
  if (sourceCampaignId === targetCampaignId) {
    throw new Error("Cannot combine a campaign into itself.");
  }

  const sourceLegs = await dbLocal.legs
    .where("campaignId")
    .equals(sourceCampaignId)
    .toArray();

  for (const leg of sourceLegs) {
    await editLeg(uid, {
      ...leg,
      campaignId: targetCampaignId
    });
  }

  await deleteCampaign(uid, sourceCampaignId);
}

export async function syncCampaignDates(uid, campaignId) {
  if (!campaignId) return;

  const legs = await dbLocal.legs
    .where("campaignId")
    .equals(campaignId)
    .toArray();
    
  const activeLegs = legs.filter(l => !l.deleted);
  if (activeLegs.length === 0) return;

  const openDates = activeLegs.map(l => l.openDate).filter(Boolean).sort();
  const closeDates = activeLegs.map(l => l.closeDate).filter(Boolean).sort();

  const startDate = openDates.length > 0 ? openDates[0] : null;
  const isFullyClosed = closeDates.length === activeLegs.length;
  const endDate = isFullyClosed && closeDates.length > 0 
    ? closeDates[closeDates.length - 1] 
    : null;

  await updateCampaign(uid, campaignId, {
    startDate,
    endDate,
    status: isFullyClosed ? "closed" : "open"
  });
}



export async function cleanupDexieTimestamps() {
  await dbLocal.legs.toCollection().modify((leg) => {
    leg.updatedAt = toMillis(leg.updatedAt) ?? Date.now();
    leg.clientUpdatedAt = toMillis(leg.clientUpdatedAt) ?? leg.updatedAt;
    leg.serverUpdatedAt = toMillis(leg.serverUpdatedAt) ?? leg.updatedAt; // 👈 Added
  });

  await dbLocal.campaigns.toCollection().modify((campaign) => {
    campaign.updatedAt = toMillis(campaign.updatedAt) ?? Date.now();
    campaign.clientUpdatedAt = toMillis(campaign.clientUpdatedAt) ?? campaign.updatedAt;
    campaign.serverUpdatedAt = toMillis(campaign.serverUpdatedAt) ?? campaign.updatedAt; // 👈 Added
  });
}