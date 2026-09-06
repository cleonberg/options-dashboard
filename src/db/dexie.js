// src/db/dexie.js
import Dexie from "dexie";
const dbLocal = new Dexie("optionsDashboard");

/*
  Versioning:
  - v1: original schema
  - v2: add deletionJobs and ensure deleted fields are present
*/
dbLocal.version(1).stores({
  campaigns: "id, updatedAt, dirty",
  legs: "id, campaignId, updatedAt, dirty"
});

dbLocal.version(2).stores({
  campaigns: "id, updatedAt, dirty, deleted",
  legs: "id, campaignId, updatedAt, dirty, deleted",
  deletionJobs: "++id, type, targetId, createdAt, attempts"
});

/* -------------------------------------------------------
   Helper: generate IDs
------------------------------------------------------- */
function newId() {
  return crypto.randomUUID();
}

/* -------------------------------------------------------
   Dirty helper (required by synclogic.js)
------------------------------------------------------- */
export async function markDirty(table, id, changes) {
  await dbLocal[table].update(id, {
    ...changes,
    dirty: true,
    updatedAt: new Date().toISOString()
  });
}

/* -------------------------------------------------------
   Deletion queue helpers
------------------------------------------------------- */
export async function queueDeletionJob(type, targetId) {
  // when queuing a delete
  await dbLocal.deletionJobs.add({
    type: 'deleteCampaign',
    targetId: campaignId,
    uid: auth.currentUser?.uid,
    createdAt: Date.now(),
    attempts: 0
  });
}

export async function getDeletionJobs() {
  return dbLocal.deletionJobs.toArray();
}

/* -------------------------------------------------------
   Optional hard-delete helper to purge local tombstones
------------------------------------------------------- */
export async function hardDeleteLocalCampaignAndLegs(campaignId) {
  await dbLocal.transaction('rw', dbLocal.campaigns, dbLocal.legs, async () => {
    await dbLocal.legs.where('campaignId').equals(campaignId).delete();
    await dbLocal.campaigns.where('id').equals(campaignId).delete();
  });
}

/* -------------------------------------------------------
   Campaigns
------------------------------------------------------- */
dbLocal.getAllCampaigns = async function () {
  const all = await dbLocal.campaigns.toArray();
  return all.filter(c => !c.deleted);
};

dbLocal.addCampaign = async function (campaign) {
  const id = newId();
  await dbLocal.campaigns.put({
    id,
    updatedAt: new Date().toISOString(),
    dirty: true,
    deleted: false,
    ...campaign
  });
  return id;
};

dbLocal.updateCampaign = async function (id, changes) {
  await dbLocal.campaigns.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
    dirty: true
  });
};

/* -------------------------------------------------------
   Legs
------------------------------------------------------- */
dbLocal.getAllLegs = async function () {
  const all = await dbLocal.legs.toArray();
  return all.filter(l => !l.deleted);
};

dbLocal.addLeg = async function (leg) {
  const id = newId();
  await dbLocal.legs.put({
    id,
    updatedAt: new Date().toISOString(),
    dirty: true,
    deleted: false,
    ...leg
  });
  return id;
};

dbLocal.updateLeg = async function (id, changes) {
  await dbLocal.legs.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
    dirty: true
  });
};

export default dbLocal;
export { dbLocal };
