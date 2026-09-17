// src/sync.js
import {
  collection,
  query,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";

import { db } from "../firebase";        // if firebase.js is in src/
import { dbLocal } from "../db/dexie";   // FIXED
import { processDeletionQueue } from "./processDeletionQueue";

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
  };
}

function normalizeLeg(raw) {
  return {
    ...raw,
    deleted: !!raw.deleted,
    dirty: !!raw.dirty,
  };
}

/* -----------------------
   Initial sync
------------------------ */

export async function initialSync(uid) {
  // Pull remote campaigns
  const campaignsSnap = await getDocs(
    collection(db, "users", uid, "campaigns")
  );
  const remoteCampaigns = campaignsSnap.docs.map(d =>
    normalizeCampaign({ id: d.id, ...d.data() })
  );

  // Pull remote legs
  const legsSnap = await getDocs(
    collection(db, "users", uid, "legs")
  );
  const remoteLegs = legsSnap.docs.map(d =>
    normalizeLeg({ id: d.id, ...d.data() })
  );

  // Local state
  const localCampaigns = await dbLocal.campaigns.toArray();
  const localLegs = await dbLocal.legs.toArray();

  const dirtyCampaignIds = new Set(
    localCampaigns.filter(c => c.dirty).map(c => c.id)
  );
  const dirtyLegIds = new Set(
    localLegs.filter(l => l.dirty).map(l => l.id)
  );

  // If Dexie is empty, do a full remote load and STOP
  if (localCampaigns.length === 0 && localLegs.length === 0) {
    const remote = await pullAllFromFirestore(uid);
    await dbLocal.campaigns.bulkPut(remote.campaigns);
    await dbLocal.legs.bulkPut(remote.legs);
    return; // IMPORTANT: prevents double-loading
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
  console.log("[TRACE] pullAllFromFirestore CALLED from:", new Error().stack);
  console.log("[TRACE] uid =", uid);

  const campaignsRef = collection(db, "users", uid, "campaigns");
  const legsRef = collection(db, "users", uid, "legs");

  const campaignsSnap = await getDocs(campaignsRef);
  const legsSnap = await getDocs(legsRef);

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

  console.log("[TRACE] remote campaigns:", campaigns.length);
  console.log("[TRACE] remote legs:", legs.length);

  return { campaigns, legs };
}

/* -----------------------
   Realtime subscriptions
------------------------ */

export function subscribeToCampaigns(uid) {
  const qCampaigns = query(collection(db, "users", uid, "campaigns"));

  return onSnapshot(qCampaigns, async snap => {
    for (const docSnap of snap.docs) {
      const id = docSnap.id;
      
      // 1. Get the absolute latest local state
      const localRecord = await dbLocal.campaigns.get(id);

      // 2. The Golden Rule: Never overwrite a local dirty record
      if (localRecord && localRecord.dirty) {
        console.log(`[Sync] Skipping overwrite of campaign ${id}, local edits pending.`);
        continue; 
      }

      // 3. Safe to overwrite
      const data = normalizeCampaign({ id, ...docSnap.data() });
      await dbLocal.campaigns.put(data);
    }
  });
}

export function subscribeToLegs(uid) {
  const qLegs = query(collection(db, "users", uid, "legs"));

  return onSnapshot(qLegs, async snap => {
    for (const docSnap of snap.docs) {
      const id = docSnap.id;
      
      // 1. Get the absolute latest local state
      const localRecord = await dbLocal.legs.get(id);

      // 2. The Golden Rule: Never overwrite a local dirty record
      if (localRecord && localRecord.dirty) {
        console.log(`[Sync] Skipping overwrite of leg ${id}, local edits pending.`);
        continue; 
      }

      // 3. Safe to overwrite
      const data = normalizeLeg({ id, ...docSnap.data() });
      await dbLocal.legs.put(data);
    }
  });
}

export async function ensureInitialSync(uid) {
  if (!uid) return;

  const campaignCount = await dbLocal.campaigns.count();
  const legCount = await dbLocal.legs.count();

  if (campaignCount === 0 && legCount === 0) {
    console.log("[TRACE] Dexie empty — running initialSync");
    await initialSync(uid);
  } else {
    console.log("[TRACE] Dexie already has data — skipping initial pull");
  }

  processDeletionQueue().catch(console.error);
}

export function startBackgroundSync(uid) {
  if (!uid) return () => {};

  console.log("[TRACE] Starting background Firebase sync listeners...");
  
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
  const now = nowMillis();
  const id = crypto.randomUUID();

  const campaign = normalizeCampaign({
    id,
    uid,
    status: "open",
    ...fields,
    openDate: fields.openDate ?? now,
    updatedAt: now,
    deleted: false,
    dirty: true,
  });

  await dbLocal.campaigns.put(campaign);

  try {
    await setDoc(
      doc(db, "users", uid, "campaigns", id),
      {
        ...campaign,
        dirty: false,
        updatedAt: serverTimestamp(),
      }
    );
    await dbLocal.campaigns.update(id, { dirty: false });
  } catch (err) {
    console.error("[createCampaign] push failed", err);
  }

  return id;
}

export async function updateCampaign(uid, id, fields) {
  const now = nowMillis();
  const existing = await dbLocal.campaigns.get(id);
  if (!existing) {
    console.warn("[updateCampaign] missing campaign", id);
    return;
  }

  const updated = normalizeCampaign({
    ...existing,
    ...fields,
    updatedAt: now,
    dirty: true,
  });

  await dbLocal.campaigns.put(updated);

  try {
    await setDoc(
      doc(db, "users", uid, "campaigns", id),
      {
        ...updated,
        dirty: false,
        updatedAt: serverTimestamp(),
      }
    );
    await dbLocal.campaigns.update(id, { dirty: false });
  } catch (err) {
    console.error("[updateCampaign] push failed", err);
  }
}

export async function closeCampaign(uid, id) {
  await updateCampaign(uid, id, { 
    status: "closed", 
    closed: true,
    endDate: new Date().toISOString().slice(0, 10)
  });
}

export async function reopenCampaign(uid, id) {
  await updateCampaign(uid, id, { 
    status: "open", 
    closed: false,
    endDate: ""
  });
}

export async function deleteCampaign(uid, id) {
  const existing = await dbLocal.campaigns.get(id);
  if (!existing) return;

  // 1. Mark as deleted locally with a tombstone
  const tombstone = {
    ...existing,
    deleted: true,
    dirty: true,
    updatedAt: nowMillis(),
  };

  await dbLocal.campaigns.put(tombstone);

  // 2. Add to local deletion queue so processDeletionQueue() handles it safely in batch
  await dbLocal.deletionJobs.add({
    uid,
    type: "deleteCampaign",
    targetId: id,
    createdAt: Date.now(),
    attempts: 0
  });

  console.log(`[deleteCampaign] Queued campaign ${id} for deletion`);
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
    closed: false,
    ...legFields,
    openDate: legFields?.openDate ?? now,
    updatedAt: now,
    deleted: false,
    dirty: true,
  });

  await dbLocal.legs.put(leg);

  try {
    await setDoc(
      doc(db, "users", uid, "legs", id),
      {
        ...leg,
        dirty: false,
        updatedAt: serverTimestamp(),
      }
    );
    await dbLocal.legs.update(id, { dirty: false });
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
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    await setDoc(
      doc(db, "users", uid, "legs", updated.id),
      {
        ...updated,
        dirty: false,
        updatedAt: serverTimestamp(),
      }
    );
    await dbLocal.legs.update(updated.id, { dirty: false });
    console.log(`[editLeg] Successfully saved and synced leg ${updated.id}`);
  } catch (err) {
    console.error("[editLeg] push failed", err);
  }

  await syncCampaignDates(uid, leg.campaignId);
}

// src/sync/sync.js

export async function closeLeg(uid, leg, closePrice) {
  const now = Date.now();
  const todayStr = new Date().toISOString().slice(0, 10); // Standard YYYY-MM-DD string format

  let finalClosePrice = leg.closePrice; 
  if (closePrice !== undefined && closePrice !== null) {
    finalClosePrice = Number(closePrice);
  }

  const updated = normalizeLeg({
    ...leg,
    closePrice: finalClosePrice, 
    closeDate: leg.closeDate || todayStr, // Use string format instead of Date.now()
    closed: true,  
    isOpen: false, 
    updatedAt: now,
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    await setDoc(
      doc(db, "users", uid, "legs", leg.id),
      {
        ...updated,
        dirty: false,
        updatedAt: serverTimestamp(),
      }
    );
    await dbLocal.legs.update(leg.id, { dirty: false });
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
    closed: false,  
    isOpen: true, 
    updatedAt: now,
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    await setDoc(
      doc(db, "users", uid, "legs", leg.id),
      {
        ...updated,
        dirty: false,
        updatedAt: serverTimestamp(),
      }
    );
    await dbLocal.legs.update(leg.id, { dirty: false });
  } catch (err) {
    console.error("[reopenLeg] push failed", err);
  }

  return updated;
}

export async function deleteLeg(uid, id) {
  const existing = await dbLocal.legs.get(id);
  if (!existing) return;

  // 1. Mark as deleted locally with a tombstone
  const tombstone = {
    ...existing,
    deleted: true,
    dirty: true,
    updatedAt: nowMillis(),
  };

  await dbLocal.legs.put(tombstone);

  // 2. Add to local deletion queue so processDeletionQueue() handles it safely in batch
  await dbLocal.deletionJobs.add({
    uid,
    type: "deleteLeg",
    targetId: id,
    createdAt: Date.now(),
    attempts: 0
  });

  await syncCampaignDates(uid, existing.campaignId);

  console.log(`[deleteLeg] Queued leg ${id} for deletion`);
}

export async function rollLeg(uid, sourceLeg, rollFields = {}) { 
  // 1. Close the current leg
  await editLeg(uid, {
    ...sourceLeg,
    isOpen: false, // Properly flags it as closed
    closeDate: rollFields.closeDate,
    closePrice: rollFields.closePrice,
  });

  // 2. Create the new leg
  await addLeg(uid, {
    ticker: sourceLeg.ticker,
    type: sourceLeg.type,     
    // Use the new values if provided, otherwise fallback to the old leg's values
    qty: rollFields.qty !== undefined ? rollFields.qty : sourceLeg.qty,       
    strike: rollFields.strike !== undefined ? rollFields.strike : sourceLeg.strike, 
    expiry: rollFields.expiry !== undefined ? rollFields.expiry : sourceLeg.expiry, 
    campaignId: sourceLeg.campaignId,
    isOpen: true, // Mark the new leg as open
    openDate: rollFields.rollDate, 
    openPrice: rollFields.openPrice,
  });
}

/* -----------------------
   Force sync
------------------------ */

export async function forceSync(uid) {
  const dirtyCampaigns = await dbLocal.campaigns.filter(campaign => campaign.dirty === true).toArray();
  const dirtyLegs = await dbLocal.legs.filter(leg => leg.dirty === true).toArray();

  for (const c of dirtyCampaigns) {
    const latest = await dbLocal.campaigns.get(c.id);
    if (!latest) continue;
    await updateCampaign(uid, c.id, latest);
  }

  for (const l of dirtyLegs) {
    const latest = await dbLocal.legs.get(l.id);
    if (!latest) continue;
    await editLeg(uid, latest);
  }
}

/* -----------------------
   Delete all remote (utility)
------------------------ */
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

  // 1. Fetch all legs associated with the source campaign
  const sourceLegs = await dbLocal.legs
    .where("campaignId")
    .equals(sourceCampaignId)
    .toArray();

  // 2. Reassign each leg to the target campaign using editLeg for instant sync
  for (const leg of sourceLegs) {
    await editLeg(uid, {
      ...leg,
      campaignId: targetCampaignId
    });
  }

  // 3. Delete or archive the source campaign
  await deleteCampaign(uid, sourceCampaignId);
}

/**
 * Automatically calculates and updates a campaign's start and end dates 
 * based on the open and close dates of its legs.
 */
export async function syncCampaignDates(uid, campaignId) {
  if (!campaignId) return;

  // 1. Fetch all non-deleted legs for this campaign
  const legs = await dbLocal.legs
    .where("campaignId")
    .equals(campaignId)
    .toArray();
    
  const activeLegs = legs.filter(l => !l.deleted);
  if (activeLegs.length === 0) return;

  // 2. Extract and sort the dates
  const openDates = activeLegs.map(l => l.openDate).filter(Boolean).sort();
  const closeDates = activeLegs.map(l => l.closeDate).filter(Boolean).sort();

  // The earliest open date is the start of the campaign
  const startDate = openDates.length > 0 ? openDates[0] : null;

  // The campaign is only fully "ended" if EVERY leg has a closeDate
  const isFullyClosed = closeDates.length === activeLegs.length;
  
  // If fully closed, the end date is the latest closeDate
  const endDate = isFullyClosed && closeDates.length > 0 
    ? closeDates[closeDates.length - 1] 
    : null;

  // 3. Update the campaign (this leverages your existing sync mutator)
  await updateCampaign(uid, campaignId, {
    startDate,
    endDate,
    status: isFullyClosed ? "closed" : "open"
  });
}