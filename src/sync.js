// src/sync.js
import {
  collection,
  query,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from "firebase/firestore";

import { db } from "./firebase";
import { dbLocal } from "./db/dexie";
import { pushDelete } from "./sync/pushDelete";

/* -------------------------
   Helpers
   ------------------------- */
function toMillis(ts) {
  if (!ts) return 0;
  // Firestore Timestamp has toDate()
  if (typeof ts === "object" && typeof ts.toDate === "function") {
    return ts.toDate().getTime();
  }
  // ISO string or number
  const n = Number(ts);
  if (!Number.isNaN(n)) return n;
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/* -------------------------
   INITIAL SYNC
   ------------------------- */
export async function initialSync(uid) {
  const campaignsSnap = await getDocs(collection(db, "users", uid, "campaigns"));
  const legsSnap = await getDocs(collection(db, "users", uid, "legs"));

  // Sync campaigns
  for (const d of campaignsSnap.docs) {
    const remote = { id: d.id, ...d.data() };
    const local = await dbLocal.campaigns.get(remote.id);

    const remoteUpdated = toMillis(remote.updatedAt);
    const localUpdated = toMillis(local?.updatedAt);
    const localDeletedAt = toMillis(local?.deletedAt);

    // If local tombstone is newer or equal, skip applying remote
    if (local?.deleted && localDeletedAt >= remoteUpdated) {
      console.log("[initialSync] skip remote campaign because local tombstone is newer", remote.id);
      continue;
    }

    if (!local || remoteUpdated > localUpdated) {
      await dbLocal.campaigns.put({ ...remote, dirty: false });
    }
  }

  // Sync legs
  for (const d of legsSnap.docs) {
    const remote = { id: d.id, ...d.data() };
    const local = await dbLocal.legs.get(remote.id);

    const remoteUpdated = toMillis(remote.updatedAt);
    const localUpdated = toMillis(local?.updatedAt);
    const localDeletedAt = toMillis(local?.deletedAt);

    if (local?.deleted && localDeletedAt >= remoteUpdated) {
      console.log("[initialSync] skip remote leg because local tombstone is newer", remote.id);
      continue;
    }

    if (!local || remoteUpdated > localUpdated) {
      await dbLocal.legs.put({ ...remote, dirty: false });
    }
  }
}

/* -------------------------
   REAL-TIME LISTENERS
   ------------------------- */
export function subscribeToCampaigns(uid) {
  const q = query(collection(db, "users", uid, "campaigns"));

  return onSnapshot(q, async (snapshot) => {
    for (const docSnap of snapshot.docs) {
      const remote = { id: docSnap.id, ...docSnap.data() };
      const local = await dbLocal.campaigns.get(remote.id);

      // If local has unsynced changes, prefer local
      if (local?.dirty) continue;

      const remoteUpdated = toMillis(remote.updatedAt);
      const localUpdated = toMillis(local?.updatedAt);
      const localDeletedAt = toMillis(local?.deletedAt);

      if (local?.deleted && localDeletedAt >= remoteUpdated) {
        // local tombstone is newer — skip applying remote
        console.log("[subscribeToCampaigns] skipping remote because local tombstone is newer", remote.id);
        continue;
      }

      if (!local || remoteUpdated > localUpdated) {
        await dbLocal.campaigns.put({ ...remote, dirty: false });
      }
    }
  });
}

export function subscribeToLegs(uid) {
  const q = query(collection(db, "users", uid, "legs"));

  return onSnapshot(q, async (snapshot) => {
    for (const docSnap of snapshot.docs) {
      const remote = { id: docSnap.id, ...docSnap.data() };
      const local = await dbLocal.legs.get(remote.id);

      if (local?.dirty) continue;

      const remoteUpdated = toMillis(remote.updatedAt);
      const localUpdated = toMillis(local?.updatedAt);
      const localDeletedAt = toMillis(local?.deletedAt);

      if (local?.deleted && localDeletedAt >= remoteUpdated) {
        console.log("[subscribeToLegs] skipping remote because local tombstone is newer", remote.id);
        continue;
      }

      if (!local || remoteUpdated > localUpdated) {
        await dbLocal.legs.put({ ...remote, dirty: false });
      }
    }
  });
}

/* -------------------------
   PUSH LOCAL CHANGES
   (tombstone-aware)
   ------------------------- */
export async function pushCampaign(uid, campaign) {
  if (!uid) {
    console.warn('[pushCampaign] no uid, skipping push', campaign?.id);
    return;
  }

  // If this is a tombstone, push a delete instead of upsert
  if (campaign?.deleted) {
    console.log('[pushCampaign] local tombstone detected, calling pushDelete', campaign.id);
    try {
      await pushDelete(uid, 'campaigns', campaign.id);
      await dbLocal.campaigns.update(campaign.id, { dirty: false });
      return;
    } catch (err) {
      console.error('[pushCampaign] pushDelete failed', campaign.id, err);
      await dbLocal.campaigns.update(campaign.id, { dirty: true });
      throw err;
    }
  }

  // Normal upsert path
  const ref = doc(db, "users", uid, "campaigns", campaign.id);
  const payload = { ...campaign, updatedAt: new Date().toISOString() };

  try {
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    await dbLocal.campaigns.update(campaign.id, { dirty: false });
    console.log('[pushCampaign] upsert success', campaign.id);
  } catch (err) {
    console.error('[pushCampaign] upsert failed', campaign.id, err);
    await dbLocal.campaigns.update(campaign.id, { dirty: true });
    throw err;
  }
}

export async function pushLeg(uid, leg) {
  if (!uid) {
    console.warn('[pushLeg] no uid, skipping push', leg?.id);
    return;
  }

  // If this is a tombstone, push a delete instead of upsert
  if (leg?.deleted) {
    console.log('[pushLeg] local tombstone detected, calling pushDelete', leg.id);
    try {
      await pushDelete(uid, 'legs', leg.id);
      await dbLocal.legs.update(leg.id, { dirty: false });
      return;
    } catch (err) {
      console.error('[pushLeg] pushDelete failed', leg.id, err);
      await dbLocal.legs.update(leg.id, { dirty: true });
      throw err;
    }
  }

  // Normal upsert path
  const ref = doc(db, "users", uid, "legs", leg.id);
  const payload = { ...leg, updatedAt: new Date().toISOString() };

  try {
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    await dbLocal.legs.update(leg.id, { dirty: false });
    console.log('[pushLeg] upsert success', leg.id);
  } catch (err) {
    console.error('[pushLeg] upsert failed', leg.id, err);
    await dbLocal.legs.update(leg.id, { dirty: true });
    throw err;
  }
}

/* -------------------------
   FORCE SYNC
   ------------------------- */
export async function forceSync(uid) {
  console.log("Force sync started…");

  const allCampaigns = await dbLocal.campaigns.toArray();
  const allLegs = await dbLocal.legs.toArray();

  const dirtyCampaigns = allCampaigns.filter(c => c.dirty);
  const dirtyLegs = allLegs.filter(l => l.dirty);

  console.log("Dirty campaigns:", dirtyCampaigns.length);
  console.log("Dirty legs:", dirtyLegs.length);

  for (const c of dirtyCampaigns) {
    // always read latest local row before pushing to avoid stale in-memory objects
    const latest = await dbLocal.campaigns.get(c.id);
    await pushCampaign(uid, latest);
  }

  for (const l of dirtyLegs) {
    const latest = await dbLocal.legs.get(l.id);
    await pushLeg(uid, latest);
  }

  console.log("Force sync complete.");
}
