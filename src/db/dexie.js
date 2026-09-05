// src/db/dexie.js
import Dexie from "dexie";

const dbLocal = new Dexie("optionsDashboard");

dbLocal.version(1).stores({
  campaigns: "id, updatedAt, dirty",
  legs: "id, campaignId, updatedAt, dirty",
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
   Campaigns
------------------------------------------------------- */
dbLocal.getAllCampaigns = async function () {
  return await dbLocal.campaigns.toArray();
};

dbLocal.addCampaign = async function (campaign) {
  const id = newId();
  await dbLocal.campaigns.put({
    id,
    updatedAt: new Date().toISOString(),
    dirty: true,
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
  return await dbLocal.legs.toArray();
};

dbLocal.addLeg = async function (leg) {
  const id = newId();
  await dbLocal.legs.put({
    id,
    updatedAt: new Date().toISOString(),
    dirty: true,
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
