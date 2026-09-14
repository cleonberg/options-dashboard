// src/sync/uploadDirty.js
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { wrapError } from "./errorUtils";

/**
 * Normalizes any timestamp format into primitive milliseconds for safe comparison.
 */
function normalizeTime(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts === "string") return new Date(ts).getTime();
  if (ts instanceof Date) return ts.getTime();
  if (ts.seconds) return ts.seconds * 1000; // Handle raw Firebase timestamps
  return 0;
}

export async function uploadDirty(uid) {
  if (!uid) throw new Error("uploadDirty requires an authenticated uid");

  const result = { uploaded: { campaigns: 0, legs: 0 } };

  // 1. Fetch all dirty rows at once
  const dirtyCampaigns = await dbLocal.campaigns.filter(c => c.dirty === true).toArray();
  const dirtyLegs = await dbLocal.legs.filter(l => l.dirty === true).toArray();

  if (dirtyCampaigns.length === 0 && dirtyLegs.length === 0) {
    return result; // Nothing to do
  }

  // 2. Combine them into a single array for processing
  const itemsToUpload = [
    ...dirtyCampaigns.map(c => ({ collectionName: "campaigns", row: c })),
    ...dirtyLegs.map(l => ({ collectionName: "legs", row: l }))
  ];

  // 3. Process in chunks (Firebase batch limit is 500)
  const CHUNK_SIZE = 450; 
  
  for (let i = 0; i < itemsToUpload.length; i += CHUNK_SIZE) {
    const chunk = itemsToUpload.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    
    // We keep track of this chunk's info so we can clean up Dexie afterward
    const trackingList = [];

    // Stage all writes in the batch
    for (const item of chunk) {
      const { collectionName, row } = item;
      const ref = doc(db, "users", uid, collectionName, row.id);
      const trackingTimestamp = normalizeTime(row.updatedAt);

      const payload = {
        ...row,
        dirty: false,
        clientUpdatedAt: trackingTimestamp,
        serverUpdatedAt: serverTimestamp() // Let Firebase set this on the server
      };

      batch.set(ref, payload, { merge: true });
      
      trackingList.push({ collectionName, id: row.id, trackingTimestamp });
    }

    try {
      // 4. Send the entire batch in ONE network request
      await batch.commit();

      // Update counters
      for (const item of chunk) {
        result.uploaded[item.collectionName]++;
      }

      // 5. Update local database to mark as clean (protecting against mid-flight edits)
      await dbLocal.transaction('rw', dbLocal.campaigns, dbLocal.legs, async () => {
        for (const item of trackingList) {
          const { collectionName, id, trackingTimestamp } = item;
          const liveLocal = await dbLocal[collectionName].get(id);

          if (liveLocal) {
            const liveLocalTime = normalizeTime(liveLocal.updatedAt);
            
            // Bulletproof numeric comparison
            if (liveLocalTime === trackingTimestamp) {
              // Note: We do NOT set the local timestamp here. 
              // We let pullRemoteChanges (which runs next) pull the exact server time.
              await dbLocal[collectionName].update(id, { dirty: false });
            } else {
              console.log(`[uploadDirty] Mid-flight modification detected on ${collectionName}/${id}. Keeping local dirty status.`);
            }
          }
        }
      });

    } catch (err) {
      throw wrapError(err, `[uploadDirty] Batch upload failed during chunk processing`);
    }
  }

  return result;
}