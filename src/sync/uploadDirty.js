// src/sync/uploadDirty.js
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { normalizeRemoteDoc } from "./utils/firestoreUtils";
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

  async function uploadRow(collectionName, row) {
    const ref = doc(db, "users", uid, collectionName, row.id);
    
    // Safely extract primitive timestamp
    const trackingTimestamp = normalizeTime(row.updatedAt);

    const payload = {
      ...row,
      dirty: false, // Ensure we don't poison Firestore
      clientUpdatedAt: trackingTimestamp,
      serverUpdatedAt: serverTimestamp()
    };

    try {
      await setDoc(ref, payload, { merge: true });

      const snap = await getDoc(ref);
      if (!snap.exists()) {
        throw new Error(`Uploaded document missing on remote readback inside ${collectionName}`);
      }
      
      const remote = normalizeRemoteDoc(snap.id, snap.data());
      const finalServerTs = remote.serverUpdatedAt ?? remote.updatedAt ?? Date.now();

      await dbLocal.transaction('rw', dbLocal.campaigns, dbLocal.legs, async () => {
        const liveLocal = await dbLocal[collectionName].get(row.id);

        if (!liveLocal) return;

        // Safely extract primitive timestamp for comparison
        const liveLocalTime = normalizeTime(liveLocal.updatedAt);

        // Bulletproof numeric comparison
        if (liveLocalTime === trackingTimestamp) {
          await dbLocal[collectionName].put({
            ...remote,
            dirty: false,
            updatedAt: finalServerTs 
          });
        } else {
          console.log(`[uploadDirty] Mid-flight modification detected on ${collectionName}/${row.id}. Keeping local dirty status.`);
        }
      });

      return { ok: true, remote };
    } catch (err) {
      throw wrapError(err, `[uploadRow Failure on ${collectionName}] `);
    }
  }

  // --- Process Dirty Campaigns ---
  const dirtyCampaigns = await dbLocal.campaigns.filter(c => c.dirty === true).toArray();
  for (const c of dirtyCampaigns) {
    try {
      await uploadRow("campaigns", c);
      result.uploaded.campaigns++;
    } catch (err) {
      console.warn("[uploadDirty] Campaign upload failed:", c.id, err);
    }
  }

  // --- Process Dirty Legs ---
  const dirtyLegs = await dbLocal.legs.filter(l => l.dirty === true).toArray();
  for (const l of dirtyLegs) {
    try {
      await uploadRow("legs", l);
      result.uploaded.legs++;
    } catch (err) {
      console.warn("[uploadDirty] Leg upload failed:", l.id, err);
    }
  }

  return result;
}