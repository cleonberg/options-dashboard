// src/sync.js
import {
  collection,
  query,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";

import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { processDeletionQueue } from "./processDeletionQueue";
import { 
  toMillis,
  effectiveLocalTs,
  effectiveRemoteTs,
  normalizeRemoteDoc,
  chooseWinningRecord,
} from "./utils/firestoreUtils";

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
    updatedAt: toMillis(raw.updatedAt) ?? Date.now(),
    clientUpdatedAt: toMillis(raw.clientUpdatedAt) ?? toMillis(raw.updatedAt) ?? Date.now(),
    serverUpdatedAt: toMillis(raw.serverUpdatedAt) ?? null,
  };
}

function normalizeLeg(raw) {
  return {
    ...raw,
    deleted: !!raw.deleted,
    dirty: !!raw.dirty,
    updatedAt: toMillis(raw.updatedAt) ?? Date.now(),
    clientUpdatedAt: toMillis(raw.clientUpdatedAt) ?? toMillis(raw.updatedAt) ?? Date.now(),
    serverUpdatedAt: toMillis(raw.serverUpdatedAt) ?? null,
  };
}

async function guardAgainstStaleRemoteWrite(uid, collectionName, localRecord) {
  if (!uid || !localRecord?.id) return false;

  try {
    const remoteSnap = await getDoc(doc(db, "users", uid, collectionName, localRecord.id));
    if (!remoteSnap.exists()) return false;

    const remote = normalizeRemoteDoc(remoteSnap.id, remoteSnap.data());
    const localTs = effectiveLocalTs(localRecord);
    const remoteTs = effectiveRemoteTs(remote);

    if (localTs < remoteTs) {
      const winner = chooseWinningRecord(localRecord, remote);
      await dbLocal[collectionName].put({ ...winner, dirty: false });
      return true;
    }
  } catch (err) {
    console.warn("[sync] stale write check failed", err);
  }

  return false;
}

/* -----------------------
   Initial sync
------------------------ */

export async function initialSync(uid) {
  const [campaignsSnap, legsSnap] = await Promise.all([
    getDocs(collection(db, "users", uid, "campaigns")),
    getDocs(collection(db, "users", uid, "legs")),
  ]);

  const [localCampaigns, localLegs] = await Promise.all([
    dbLocal.campaigns.toArray(),
    dbLocal.legs.toArray(),
  ]);

  const remoteCampaigns = campaignsSnap.docs.map((d) =>
    normalizeCampaign({ id: d.id, ...d.data() })
  );
  const remoteLegs = legsSnap.docs.map((d) =>
    normalizeLeg({ id: d.id, ...d.data() })
  );

  const dirtyCampaignIds = new Set(
    localCampaigns.filter((campaign) => campaign.dirty).map((campaign) => campaign.id)
  );
  const dirtyLegIds = new Set(
    localLegs.filter((leg) => leg.dirty).map((leg) => leg.id)
  );

  const campaignsToPut = remoteCampaigns.filter(
    (campaign) => !dirtyCampaignIds.has(campaign.id)
  );
  const legsToPut = remoteLegs.filter(
    (leg) => !dirtyLegIds.has(leg.id)
  );

  await dbLocal.transaction(
    "rw",
    dbLocal.campaigns,
    dbLocal.legs,
    async () => {
      if (campaignsToPut.length > 0) {
        await dbLocal.campaigns.bulkPut(campaignsToPut);
      }
      if (legsToPut.length > 0) {
        await dbLocal.legs.bulkPut(legsToPut);
      }
    }
  );
}

/* -----------------------
   Realtime subscriptions
------------------------ */

export function subscribeToCampaigns(uid) {
  const qCampaigns = query(collection(db, "users", uid, "campaigns"));

  return onSnapshot(
    qCampaigns,
    async (snap) => {
      const changes = snap.docChanges();
      if (changes.length === 0) return;

      await dbLocal.transaction("rw", dbLocal.campaigns, async () => {
        const ids = changes.map((change) => change.doc.id);
        const localRecords = await dbLocal.campaigns.bulkGet(ids);
        const recordsToPut = [];
        const idsToDelete = [];

        changes.forEach((change, index) => {
          const id = change.doc.id;
          if (localRecords[index]?.dirty) return;

          if (change.type === "added" || change.type === "modified") {
            recordsToPut.push(
              normalizeCampaign({
                ...change.doc.data(),
                id,
                dirty: false,
              })
            );
          } else if (change.type === "removed") {
            idsToDelete.push(id);
          }
        });

        if (recordsToPut.length > 0) {
          await dbLocal.campaigns.bulkPut(recordsToPut);
        }
        if (idsToDelete.length > 0) {
          await dbLocal.campaigns.bulkDelete(idsToDelete);
        }
      });
    },
    (err) => {
      console.error("[subscribeToCampaigns] listener error", err);
    }
  );
}

export function subscribeToLegs(uid) {
  const qLegs = query(collection(db, "users", uid, "legs"));

  return onSnapshot(
    qLegs,
    async (snap) => {
      const changes = snap.docChanges();

      await dbLocal.transaction("rw", dbLocal.legs, async () => {
        const ids = changes.map((change) => change.doc.id);
        const localRecords = await dbLocal.legs.bulkGet(ids);
        const recordsToPut = [];
        const idsToDelete = [];

        changes.forEach((change, index) => {
          const id = change.doc.id;
          const localRecord = localRecords[index];

          // Never overwrite local edits that have not synced yet.
          if (localRecord?.dirty) return;

          if (change.type === "added" || change.type === "modified") {
            const raw = change.doc.data();

            recordsToPut.push(
              normalizeLeg({
                ...raw,
                id,
                dirty: false,
                updatedAt: toMillis(raw.updatedAt) ?? Date.now(),
                serverUpdatedAt: toMillis(raw.serverUpdatedAt) ?? null,
                clientUpdatedAt:
                  toMillis(raw.clientUpdatedAt) ??
                  toMillis(raw.updatedAt) ??
                  Date.now(),
              })
            );
          } else if (change.type === "removed") {
            idsToDelete.push(id);
          }
        });

        if (recordsToPut.length > 0) {
          await dbLocal.legs.bulkPut(recordsToPut);
        }

        if (idsToDelete.length > 0) {
          await dbLocal.legs.bulkDelete(idsToDelete);
        }
      });
    },
    (err) => {
      console.error("[subscribeToLegs] listener error", err);
    }
  );
}

export async function ensureInitialSync(uid) {
  if (!uid) return;

  const campaignCount = await dbLocal.campaigns.count();
  const legCount = await dbLocal.legs.count();

  if (campaignCount === 0 && legCount === 0) {
    await initialSync(uid);
  }
}

export async function syncPendingChanges(uid) {
  if (!uid) return;

  await ensureInitialSync(uid);
  await forceSync(uid);
  await processDeletionQueue();
}

export function startBackgroundSync(uid) {
  if (!uid) return () => {};

  const unsubscribeCampaigns = subscribeToCampaigns(uid);
  const unsubscribeLegs = subscribeToLegs(uid);

  const syncOnReconnect = async () => {
    try {
      await syncPendingChanges(uid);
    } catch (err) {
      console.error("[sync] reconnect sync failed", err);
    }
  };

  window.addEventListener("online", syncOnReconnect);

  return () => {
    unsubscribeCampaigns();
    unsubscribeLegs();
    window.removeEventListener("online", syncOnReconnect);
  };
}

/* -----------------------
   Campaign mutators
------------------------ */

export async function createCampaign(uid, fields) {
  if (!uid) {
    console.error("❌ [createCampaign] Aborted: User ID (uid) is missing!");
    return null;
  }

  const now = Date.now();
  const id = fields.id || crypto.randomUUID();

  const count = await dbLocal.campaigns.count();
  const autoName = (fields.name && fields.name.trim())
    ? fields.name
    : `${fields.ticker || "UNKNOWN"} #${count + 1}`;

  const campaign = normalizeCampaign({
    id,
    uid,
    status: "open",
    ...fields,
    name: autoName,
    openDate: fields.openDate ?? now,
    updatedAt: now,
    clientUpdatedAt: now,
    serverUpdatedAt: null,
    deleted: false,
    dirty: true,
  });

  await dbLocal.campaigns.put(campaign);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "campaigns", campaign);
    if (remoteWon) return id;

    await setDoc(doc(db, "users", uid, "campaigns", id), {
      ...campaign,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.campaigns.update(id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.warn("⚠️ Saved to local IndexedDB, but remote sync failed (offline or network error):", err);
  }

  return id;
}

export async function updateCampaign(uid, id, fields) {
  const existing = await dbLocal.campaigns.get(id);
  if (!existing) {
    console.warn(`[updateCampaign] Local campaign not found: ${id}`);
    return;
  }

  const now = Date.now();

  const updated = normalizeCampaign({
    ...existing,
    ...fields,
    updatedAt: now,
    clientUpdatedAt: now,
    dirty: true,
  });

  await dbLocal.campaigns.put(updated);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "campaigns", updated);
    if (remoteWon) return;

    await setDoc(doc(db, "users", uid, "campaigns", id), {
      ...updated,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.campaigns.update(id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[updateCampaign] push failed", err);
  }
}

export async function closeCampaign(uid, id) {
  await updateCampaign(uid, id, { 
    status: "closed", 
    endDate: new Date().toISOString().slice(0, 10)
  });
}

export async function reopenCampaign(uid, id) {
  await updateCampaign(uid, id, { 
    status: "open", 
    deleted: false,
    deletedAt: null,
    endDate: ""
  });
}

export async function deleteCampaign(uid, id) {
  const existing = await dbLocal.campaigns.get(id);
  if (!existing) return;

  const now = nowMillis();

  const tombstone = {
    ...existing,
    deleted: true,
    dirty: true,
    updatedAt: now,
  };

  // Also tombstone child legs immediately so live queries (e.g. dashboard
  // totals) reflect the deletion right away, instead of waiting for the
  // deletion queue to reach the server (which requires connectivity).
  const legs = await dbLocal.legs.where("campaignId").equals(id).toArray();
  const legTombstones = legs.map((leg) => ({
    ...leg,
    deleted: true,
    dirty: true,
    updatedAt: now,
  }));

  await dbLocal.transaction("rw", dbLocal.campaigns, dbLocal.legs, async () => {
    await dbLocal.campaigns.put(tombstone);
    if (legTombstones.length) await dbLocal.legs.bulkPut(legTombstones);
  });

  await dbLocal.deletionJobs.add({
    uid,
    type: "deleteCampaign",
    targetId: id,
    createdAt: Date.now(),
    attempts: 0
  });
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
    isOpen: true,
    ...legFields,
    openDate: legFields?.openDate ?? now,
    closeDate: null,
    closePrice: null,
    updatedAt: now,
    clientUpdatedAt: now,
    serverUpdatedAt: null,
    deleted: false,
    dirty: true,
  });

  await dbLocal.legs.put(leg);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "legs", leg);
    if (remoteWon) return id;

    await setDoc(doc(db, "users", uid, "legs", id), {
      ...leg,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.legs.update(id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[addLeg] push failed", err);
  }

  await syncCampaignDates(uid, legFields.campaignId);
  return id;
}

export async function editLeg(uid, leg) {
  const now = nowMillis();

  const updated = normalizeLeg({
    ...leg,
    updatedAt: now,
    clientUpdatedAt: now,
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "legs", updated);
    if (remoteWon) return;

    await setDoc(doc(db, "users", uid, "legs", updated.id), {
      ...updated,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.legs.update(updated.id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[editLeg] push failed", err);
  }

  await syncCampaignDates(uid, leg.campaignId);
}

export async function closeLeg(uid, leg, closePrice) {
  const now = Date.now();

  const d = new Date();
  const localYear = d.getFullYear();
  const localMonth = String(d.getMonth() + 1).padStart(2, "0");
  const localDay = String(d.getDate()).padStart(2, "0");
  const todayStr = `${localYear}-${localMonth}-${localDay}`;

  let finalClosePrice = leg.closePrice;
  if (closePrice !== undefined && closePrice !== null) {
    finalClosePrice = Number(closePrice);
  }

  const updated = normalizeLeg({
    ...leg,
    closePrice: finalClosePrice,
    closeDate: leg.closeDate || todayStr,
    isOpen: false,
    updatedAt: now,
    clientUpdatedAt: now,
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "legs", updated);
    if (remoteWon) return updated;

    await setDoc(doc(db, "users", uid, "legs", leg.id), {
      ...updated,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.legs.update(leg.id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[closeLeg] push failed", err);
  }

  await syncCampaignDates(uid, leg.campaignId);
  return updated;
}

export async function reopenLeg(uid, leg) {
  const now = Date.now();

  const updated = normalizeLeg({
    ...leg,
    closePrice: null,
    closeDate: null,
    isOpen: true,
    updatedAt: now,
    clientUpdatedAt: now,
    dirty: true,
  });

  await dbLocal.legs.put(updated);

  try {
    const remoteWon = await guardAgainstStaleRemoteWrite(uid, "legs", updated);
    if (remoteWon) return updated;

    await setDoc(doc(db, "users", uid, "legs", leg.id), {
      ...updated,
      dirty: false,
      updatedAt: serverTimestamp(),
      serverUpdatedAt: serverTimestamp(),
    });

    await dbLocal.legs.update(leg.id, {
      dirty: false,
      serverUpdatedAt: Date.now(),
    });
  } catch (err) {
    console.error("[reopenLeg] push failed", err);
  }

  return updated;
}

export async function deleteLeg(uid, id) {
  const existing = await dbLocal.legs.get(id);
  if (!existing) return;

  const tombstone = {
    ...existing,
    deleted: true,
    dirty: true,
    updatedAt: nowMillis(),
  };

  await dbLocal.legs.put(tombstone);

  await dbLocal.deletionJobs.add({
    uid,
    type: "deleteLeg",
    targetId: id,
    createdAt: Date.now(),
    attempts: 0
  });

  await syncCampaignDates(uid, existing.campaignId);
}

export async function rollLeg(uid, sourceLeg, rollFields = {}) { 
  await editLeg(uid, {
    ...sourceLeg,
    isOpen: false,
    closeDate: rollFields.closeDate,
    closePrice: rollFields.closePrice,
  });

  await addLeg(uid, {
    ticker: sourceLeg.ticker,
    type: sourceLeg.type,     
    qty: rollFields.qty !== undefined ? rollFields.qty : sourceLeg.qty,       
    strike: rollFields.strike !== undefined ? rollFields.strike : sourceLeg.strike, 
    expiry: rollFields.expiry !== undefined ? rollFields.expiry : sourceLeg.expiry, 
    campaignId: sourceLeg.campaignId,
    isOpen: true,
    openDate: rollFields.rollDate, 
    openPrice: rollFields.openPrice,
  });
}

/* -----------------------
   Force sync & Utilities
------------------------ */

async function flushDirtyBatch(uid, collectionName, rows) {
  if (!rows.length) return;

  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = rows.slice(i, i + 400);

    let mutationCount = 0;

    for (const row of chunk) {
      const remoteWon = await guardAgainstStaleRemoteWrite(uid, collectionName, row);
      if (remoteWon) continue;

      const ref = doc(db, "users", uid, collectionName, row.id);

      batch.set(
        ref,
        {
          ...row,
          dirty: false,
          updatedAt: serverTimestamp(),
          serverUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      mutationCount++;
    }

    if (mutationCount > 0) {
      await batch.commit();
    }

    for (const row of chunk) {
      const latest = await dbLocal[collectionName].get(row.id);
      if (latest && latest.dirty) {
        await dbLocal[collectionName].update(row.id, {
          dirty: false,
          serverUpdatedAt: Date.now(),
        });
      }
    }
  }
}

export async function forceSync(uid) {
  if (!uid) return;

  const dirtyCampaigns = await dbLocal.campaigns
    .filter((c) => c.dirty === true)
    .toArray();

  const dirtyLegs = await dbLocal.legs
    .filter((l) => l.dirty === true)
    .toArray();

  await flushDirtyBatch(uid, "campaigns", dirtyCampaigns);
  await flushDirtyBatch(uid, "legs", dirtyLegs);
}

export async function deleteAllRemote(uid) {
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

      if (operationCount === 400) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }
  }
}

export async function combineCampaigns(uid, sourceCampaignId, targetCampaignId) {
  if (sourceCampaignId === targetCampaignId) {
    throw new Error("Cannot combine a campaign into itself.");
  }

  const now = nowMillis();

  await dbLocal.transaction(
    "rw",
    dbLocal.campaigns,
    dbLocal.legs,
    dbLocal.deletionJobs,
    async () => {
      const [sourceCampaign, targetCampaign] = await Promise.all([
        dbLocal.campaigns.get(sourceCampaignId),
        dbLocal.campaigns.get(targetCampaignId),
      ]);

      if (!sourceCampaign || !targetCampaign) {
        throw new Error("Source or target campaign was not found locally.");
      }

      const sourceLegs = await dbLocal.legs
        .where("campaignId")
        .equals(sourceCampaignId)
        .toArray();

      await dbLocal.legs.bulkPut(
        sourceLegs.map((leg) =>
          normalizeLeg({
            ...leg,
            campaignId: targetCampaignId,
            updatedAt: now,
            clientUpdatedAt: now,
            dirty: true,
          })
        )
      );

      const targetLegs = (await dbLocal.legs
        .where("campaignId")
        .equals(targetCampaignId)
        .toArray()
      ).filter((leg) => !leg.deleted);

      if (targetLegs.length > 0) {
        const openDates = targetLegs
          .map((leg) => leg.openDate)
          .filter(Boolean)
          .sort();
        const closeDates = targetLegs
          .map((leg) => leg.closeDate)
          .filter(Boolean)
          .sort();

        const isFullyClosed = closeDates.length === targetLegs.length;

        await dbLocal.campaigns.put(
          normalizeCampaign({
            ...targetCampaign,
            startDate: openDates[0] ?? null,
            endDate:
              isFullyClosed && closeDates.length > 0
                ? closeDates[closeDates.length - 1]
                : null,
            status: isFullyClosed ? "closed" : "open",
            updatedAt: now,
            clientUpdatedAt: now,
            dirty: true,
          })
        );
      }

      await dbLocal.campaigns.put(
        normalizeCampaign({
          ...sourceCampaign,
          deleted: true,
          updatedAt: now,
          clientUpdatedAt: now,
          dirty: true,
        })
      );

      await dbLocal.deletionJobs.add({
        uid,
        type: "deleteCampaign",
        targetId: sourceCampaignId,
        createdAt: now,
        attempts: 0,
      });
    }
  );
}

export async function syncCampaignDates(uid, campaignId) {
  if (!campaignId) return;

  const legs = await dbLocal.legs
    .where("campaignId")
    .equals(campaignId)
    .toArray();
    
  const activeLegs = legs.filter(l => !l.deleted);
  if (activeLegs.length === 0) return;

  const openDates = activeLegs.map(l => l.openDate).filter(Boolean).sort();
  const closeDates = activeLegs.map(l => l.closeDate).filter(Boolean).sort();

  const startDate = openDates.length > 0 ? openDates[0] : null;
  const isFullyClosed = closeDates.length === activeLegs.length;
  const endDate = isFullyClosed && closeDates.length > 0 
    ? closeDates[closeDates.length - 1] 
    : null;

  await updateCampaign(uid, campaignId, {
    startDate,
    endDate,
    status: isFullyClosed ? "closed" : "open"
  });
}



export async function cleanupDexieTimestamps() {
  await dbLocal.legs.toCollection().modify((leg) => {
    leg.updatedAt = toMillis(leg.updatedAt) ?? Date.now();
    leg.clientUpdatedAt = toMillis(leg.clientUpdatedAt) ?? leg.updatedAt;
    leg.serverUpdatedAt = toMillis(leg.serverUpdatedAt) ?? leg.updatedAt; // 👈 Added
  });

  await dbLocal.campaigns.toCollection().modify((campaign) => {
    campaign.updatedAt = toMillis(campaign.updatedAt) ?? Date.now();
    campaign.clientUpdatedAt = toMillis(campaign.clientUpdatedAt) ?? campaign.updatedAt;
    campaign.serverUpdatedAt = toMillis(campaign.serverUpdatedAt) ?? campaign.updatedAt; // 👈 Added
  });
}