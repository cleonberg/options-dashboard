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

// ---------- INITIAL SYNC ----------
export async function initialSync(uid) {
  const campaignsSnap = await getDocs(collection(db, "users", uid, "campaigns"));
  const legsSnap = await getDocs(collection(db, "users", uid, "legs"));

  // Sync campaigns
  for (const d of campaignsSnap.docs) {
    const remote = { id: d.id, ...d.data() };
    const local = await dbLocal.campaigns.get(remote.id);

    if (!local || remote.updatedAt > local.updatedAt) {
      await dbLocal.campaigns.put({ ...remote, dirty: false });
    }
  }

  // Sync legs
  for (const d of legsSnap.docs) {
    const remote = { id: d.id, ...d.data() };
    const local = await dbLocal.legs.get(remote.id);

    if (!local || remote.updatedAt > local.updatedAt) {
      await dbLocal.legs.put({ ...remote, dirty: false });
    }
  }
}

// ---------- REAL-TIME LISTENERS ----------
export function subscribeToCampaigns(uid) {
  const q = query(collection(db, "users", uid, "campaigns"));

  return onSnapshot(q, async (snapshot) => {
    for (const docSnap of snapshot.docs) {
      const remote = { id: docSnap.id, ...docSnap.data() };
      const local = await dbLocal.campaigns.get(remote.id);

      if (local?.dirty) continue; // local wins
      if (!local || remote.updatedAt > local.updatedAt) {
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
      if (!local || remote.updatedAt > local.updatedAt) {
        await dbLocal.legs.put({ ...remote, dirty: false });
      }
    }
  });
}

// ---------- PUSH LOCAL CHANGES ----------
export async function pushCampaign(uid, campaign) {
  const ref = doc(db, "users", uid, "campaigns", campaign.id);

  const payload = {
    ...campaign,
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    await dbLocal.campaigns.update(campaign.id, { dirty: false });
  } catch (err) {
    console.error("Push campaign failed:", err);
    await dbLocal.campaigns.update(campaign.id, { dirty: true });
  }
}

export async function pushLeg(uid, leg) {
  const ref = doc(db, "users", uid, "legs", leg.id);

  const payload = {
    ...leg,
    updatedAt: new Date().toISOString()
  };

  try {
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    await dbLocal.legs.update(leg.id, { dirty: false });
  } catch (err) {
    console.error("Push leg failed:", err);
    await dbLocal.legs.update(leg.id, { dirty: true });
  }
}

export async function forceSync(uid) {
  console.log("Force sync started…");

  const allCampaigns = await dbLocal.campaigns.toArray();
  const allLegs = await dbLocal.legs.toArray();

  const dirtyCampaigns = allCampaigns.filter(c => c.dirty);
  const dirtyLegs = allLegs.filter(l => l.dirty);

  console.log("Dirty campaigns:", dirtyCampaigns.length);
  console.log("Dirty legs:", dirtyLegs.length);

  for (const c of dirtyCampaigns) {
    await pushCampaign(uid, c);
  }

  for (const l of dirtyLegs) {
    await pushLeg(uid, l);
  }

  console.log("Force sync complete.");
}
