// src/db/dexie.js
import Dexie from "dexie";

// Singleton: ensure Dexie is only created once (even under HMR + StrictMode)
if (!globalThis.__dbLocal) {
  const db = new Dexie("optionsDashboard");

  db.version(5).stores({
    campaigns: "id, uid, accountId, updatedAt, dirty, deleted, clientUpdatedAt, serverUpdatedAt",
    legs: "id, uid, campaignId, updatedAt, dirty, deleted, clientUpdatedAt, serverUpdatedAt",
    deletionJobs: "++id, uid, type, targetId, createdAt, attempts, nextAttemptAt, lastError",
    meta: "key",
    accounts: "id, uid, updatedAt, dirty, clientUpdatedAt, serverUpdatedAt",
    cashTransactions: "id, uid, accountId, date, updatedAt, dirty, clientUpdatedAt, serverUpdatedAt",
    accountSnapshots: "id, uid, accountId, date, updatedAt, dirty, clientUpdatedAt, serverUpdatedAt"
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