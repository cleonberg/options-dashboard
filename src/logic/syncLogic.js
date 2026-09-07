import { dbLocal } from "../db/dexie";
import { queueDeletionJob } from "../db/dexie";
import { pushCampaign, pushLeg } from "../sync";
import { auth } from "../auth";
import { pushDelete } from "../sync/pushDelete";

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

// ---------- LEGS ----------


export async function deleteLeg(legId) {
  const uid = auth.currentUser?.uid;
  const now = new Date().toISOString();

  // Tombstone locally
  await dbLocal.legs.update(legId, {
    deleted: true,
    deletedAt: now,
    dirty: true,
    updatedAt: now
  });

  try {
    if (uid) await pushDelete('legs', legId);
    // Optionally hard-delete local row here
    // await dbLocal.legs.delete(legId);
    return { ok: true };
  } catch (err) {
    await queueDeletionJob('deleteLeg', legId);
    return { ok: false, queued: true, error: err };
  }
}