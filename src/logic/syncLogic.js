import { dbLocal } from "../db/dexie";
import { queueDeletionJob } from "../db/dexie";
import { pushCampaign, pushLeg } from "../sync";
import { auth } from "../auth";
import { pushDelete } from "../sync/pushDelete";
import { pushTombstone } from "../sync/pushTombstone";

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
  const uid = auth.currentUser?.uid;
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
      await Promise.all(legs.map(l => pushTombstone(uid, 'legs', l.id)));
    }
    return { ok: true };
  } catch (err) {
    const cls = err._classification || { type: 'unknown', transient: false };
    if (cls.transient) {
      await dbLocal.deletionJobs.add({ type: 'deleteCampaign', targetId: id, createdAt: Date.now(), attempts: 0 });
      return { ok: false, queued: true, error: err, classification: cls };
    }
    return { ok: false, queued: false, error: err, classification: cls };
  }
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