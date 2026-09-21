import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { wrapError } from "./errorUtils";
import { toMillis } from "./utils/firestoreUtils";

function normalizeTime(ts) {
  const value = toMillis(ts);
  return value ?? 0;
}

export async function uploadDirty(uid) {
  if (!uid) throw new Error("uploadDirty requires an authenticated uid");

  const dirtyCampaigns = await dbLocal.campaigns.filter((c) => c.dirty === true).toArray();
  const dirtyLegs = await dbLocal.legs.filter((l) => l.dirty === true).toArray();

  const rows = [
    ...dirtyCampaigns.map((row) => ({ collectionName: "campaigns", row })),
    ...dirtyLegs.map((row) => ({ collectionName: "legs", row })),
  ];

  if (!rows.length) {
    return { uploaded: { campaigns: 0, legs: 0 } };
  }

  const result = { uploaded: { campaigns: 0, legs: 0 } };
  const CHUNK_SIZE = 450;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    const tracking = [];

    for (const { collectionName, row } of chunk) {
      const ref = doc(db, "users", uid, collectionName, row.id);
      const clientTs = normalizeTime(row.updatedAt) || Date.now();

      const payload = {
        ...row,
        dirty: false,
        updatedAt: clientTs,
        clientUpdatedAt: clientTs,
        serverUpdatedAt: serverTimestamp(),
      };

      batch.set(ref, payload, { merge: true });

      tracking.push({ collectionName, id: row.id, clientTs });
    }

    try {
      await batch.commit();

      for (const item of chunk) {
        result.uploaded[item.collectionName]++;
      }

      await dbLocal.transaction("rw", dbLocal.campaigns, dbLocal.legs, async () => {
        for (const { collectionName, id, clientTs } of tracking) {
          const liveLocal = await dbLocal[collectionName].get(id);
          if (!liveLocal) continue;

          const currentLocalTs = normalizeTime(liveLocal.updatedAt) || 0;

          if (currentLocalTs === clientTs) {
            await dbLocal[collectionName].update(id, { dirty: false });
          }
        }
      });
    } catch (err) {
      throw wrapError(err, "[uploadDirty] batch upload failed");
    }
  }

  return result;
}