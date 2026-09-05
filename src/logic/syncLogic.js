import { dbLocal } from "../db/dexie";
import { markDirty } from "../db/dexie";
import { pushCampaign, pushLeg } from "../sync";
import { auth } from "../auth";

// ---------- CAMPAIGNS ----------
export async function updateCampaign(id, changes) {
  const uid = auth.currentUser?.uid;

  // Check if campaign exists
  const existing = await dbLocal.campaigns.get(id);

  if (!existing) {
    // INSERT new campaign
    await dbLocal.campaigns.put({
      id,
      updatedAt: new Date().toISOString(),
      dirty: true,
      ...changes
    });
  } else {
    // UPDATE existing campaign
    await dbLocal.campaigns.update(id, {
      ...changes,
      updatedAt: new Date().toISOString(),
      dirty: true
    });
  }

  // UI should update NOW
  const updated = await dbLocal.campaigns.get(id);

  // Fire-and-forget push
  if (uid) {
    pushCampaign(uid, updated).catch(err => {
      console.log("Offline push failed (expected):", err);
    });
  }

  return updated;
}

export async function deleteCampaign(id) {
  // Delete from Dexie
  await db.campaigns.delete(id);

  // Mark for sync (Firestore delete)
  await pushDelete("campaigns", id);
}


// ---------- LEGS ----------
export async function updateLeg(id, changes) {
  const uid = auth.currentUser?.uid;

  // Check if leg exists
  const existing = await dbLocal.legs.get(id);

  if (!existing) {
    // INSERT new leg
    await dbLocal.legs.put({
      id,
      updatedAt: new Date().toISOString(),
      dirty: true,
      ...changes
    });
  } else {
    // UPDATE existing leg
    await dbLocal.legs.update(id, {
      ...changes,
      updatedAt: new Date().toISOString(),
      dirty: true
    });
  }

  // Dexie now has the updated record
  const updated = await dbLocal.legs.get(id);

  // Fire-and-forget push (never block UI)
  if (uid) {
    pushLeg(uid, updated).catch(err => {
      console.log("Offline pushLeg failed (expected when offline):", err);
    });
  }

  // UI updates immediately
  return updated;
}

