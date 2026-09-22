// src/db/dexie.js
import Dexie from "dexie";

// Singleton: ensure Dexie is only created once (even under HMR + StrictMode)
if (!globalThis.__dbLocal) {
  const db = new Dexie("optionsDashboard");

  db.version(3).stores({
    campaigns: "id, updatedAt, dirty, deleted, clientUpdatedAt, serverUpdatedAt",
    legs: "id, campaignId, updatedAt, dirty, deleted, clientUpdatedAt, serverUpdatedAt",
    deletionJobs: "++id, uid, type, targetId, createdAt, attempts, nextAttemptAt, lastError",
    meta: "key"
  });

  db.on('populate', () => {
    console.log("[TRACE] Dexie POPULATE triggered");
  });

  db.on('ready', () => {
    console.log("[TRACE] Dexie READY triggered");
  });

  globalThis.__dbLocal = db;
}

const dbLocal = globalThis.__dbLocal;

// Campaigns
dbLocal.getAllCampaigns = async function () {
  const all = await dbLocal.campaigns.toArray();
  return all.filter(c => !c.deleted);
};

// Legs
dbLocal.getAllLegs = async function () {
  const all = await dbLocal.legs.toArray();
  return all.filter(l => !l.deleted);
};

export default dbLocal;
export { dbLocal };