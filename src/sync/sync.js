// src/sync.js
import {
  collection,
  query,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch,
  deleteDoc
} from "firebase/firestore";

import { db } from "../firebase";        // if firebase.js is in src/
import { dbLocal } from "../db/dexie";   // FIXED
import { pushDelete } from "./pushDelete"; // FIXED

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

  // We only need to count the rows, not load them into memory
  const campaignCount = await dbLocal.campaigns.count();
  const legCount = await dbLocal.legs.count();

  // If Dexie is completely empty, run the initial pull from Firestore
  if (campaignCount === 0 && legCount === 0) {
    console.log("[TRACE] Dexie empty — running initialSync");
    await initialSync(uid);
  } else {
    console.log("[TRACE] Dexie already has data — skipping initial pull");
  }
}

export function startBackgroundSync(uid) {
  if (!uid) return () => {};

  console.log("[TRACE] Starting background Firebase sync listeners...");
  
  const unsubscribeCampaigns = subscribeToCampaigns(uid);
  const unsubscribeLegs = subscribeToLegs(uid);

  // Return a cleanup function so React can shut off the listeners on logout
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
    // leave dirty=true for forceSync
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
  await updateCampaign(uid, id, { closed: true });
}

export async function reopenCampaign(uid, id) {
  await updateCampaign(uid, id, { closed: false });
}

export async function deleteCampaign(uid, id) {
  const existing = await dbLocal.campaigns.get(id);
  if (!existing) return;

  const tombstone = {
    ...existing,
    deleted: true,
    dirty: true,
    updatedAt: nowMillis(),
  };

  await dbLocal.campaigns.put(tombstone);

  try {
    await pushDelete(uid, "campaigns", id);
    await dbLocal.campaigns.update(id, { dirty: false });
  } catch (err) {
    console.error("[deleteCampaign] remote delete failed", err);
  }
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
    ...legFields,
    openDate: legFields.openDate ?? now,
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
    
    // 👇 Add this so you know it worked instantly!
    console.log(`[editLeg] Successfully saved and synced leg ${updated.id}`);
    
  } catch (err) {
    console.error("[editLeg] push failed", err);
  }
}

export async function closeLeg(uid, leg, closePrice) {
  const now = Date.now();

  const updated = {
    ...leg,
    closePrice: Number(closePrice),
    closeDate: now,
    isOpen: false,
    updatedAt: now,
    dirty: true,
  };

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

  return updated;
}

export async function rollLeg(uid, sourceLeg, rollFields) {
  // close old leg
  await editLeg(uid, {
    ...sourceLeg,
    closed: true,
    closeDate: rollFields.closeDate ?? nowMillis(),
  });

  // create new leg
  await addLeg(uid, {
    ...rollFields,
    campaignId: sourceLeg.campaignId,
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
    if (!latest) {
      console.warn("[forceSync] missing campaign", c.id);
      continue;
    }
    await updateCampaign(uid, c.id, latest);
  }

  for (const l of dirtyLegs) {
    const latest = await dbLocal.legs.get(l.id);
    if (!latest) {
      console.warn("[forceSync] missing leg", l.id);
      continue;
    }
    await editLeg(uid, latest);
  }
}

/* -----------------------
   Delete all remote (utility)
------------------------ */
export async function deleteAllRemote(uid) {
  // Define the collections you need to wipe out
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

      // Firestore limit is 500. We commit at 400 to be perfectly safe.
      if (operationCount === 400) {
        await batch.commit();
        batch = writeBatch(db); // start a fresh batch
        operationCount = 0;
      }
    }

    // Commit any remaining deletes in the final batch
    if (operationCount > 0) {
      await batch.commit();
    }
  }
}