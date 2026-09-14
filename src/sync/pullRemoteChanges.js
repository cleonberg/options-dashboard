// src/sync/pullRemoteChanges.js
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { normalizeRemoteDoc, toMillis } from "./utils/firestoreUtils";

/**
 * Pull remote changes since `opts.since` (millis).
 * - If Firestore supports querying on serverUpdatedAt, uses that; otherwise fetches all and filters.
 * - Applies LWW rules (Last Write Wins) using Dexie batch operations for maximum speed.
 *
 * Returns { maxServerUpdatedAt } (millis) for runSync to persist.
 */
export async function pullRemoteChanges(uid, opts = {}) {
  if (!uid) throw new Error("pullRemoteChanges requires uid");
  const since = Number(opts.since) || 0;
  let maxServerUpdatedAt = since;

  async function pullCollection(collectionName) {
    const ref = collection(db, "users", uid, collectionName);
    let snaps;

    // 1. Single Network Request (Batched Pull)
    try {
      if (since > 0) {
        const ts = Timestamp.fromMillis(since);
        const q = query(ref, where("serverUpdatedAt", ">", ts));
        snaps = await getDocs(q);
      } else {
        snaps = await getDocs(ref);
      }
    } catch (err) {
      console.warn("[pullRemoteChanges] query by serverUpdatedAt failed, falling back to full fetch", err);
      snaps = await getDocs(ref);
    }

    if (snaps.empty) return;

    // 2. Prepare incoming remote records in memory
    const incomingRecords = snaps.docs.map(docSnap => {
      const id = docSnap.id;
      const remote = normalizeRemoteDoc(id, docSnap.data());
      const serverTs = remote.serverUpdatedAt ?? remote.updatedAt ?? Date.now();
      
      if (serverTs > maxServerUpdatedAt) {
        maxServerUpdatedAt = serverTs;
      }
      
      return { id, remote, serverTs };
    });

    // 3. Batch Read from Dexie (One local DB operation instead of hundreds)
    const incomingIds = incomingRecords.map(record => record.id);
    const localRecords = await dbLocal[collectionName].bulkGet(incomingIds);

    const recordsToPut = [];

    // 4. Apply LWW Rules in memory
    for (let i = 0; i < incomingRecords.length; i++) {
      const { remote, serverTs } = incomingRecords[i];
      const local = localRecords[i];

      // If local missing -> write remote
      if (!local) {
        recordsToPut.push({ ...remote, dirty: false, updatedAt: serverTs });
        continue;
      }

      // If local not dirty -> accept remote if remote newer
      if (!local.dirty) {
        if ((local.updatedAt || 0) < serverTs) {
          recordsToPut.push({ ...remote, dirty: false, updatedAt: serverTs });
        }
        continue;
      }

      // Local is dirty -> compare clientUpdatedAt vs serverUpdatedAt
      const clientUpdatedAt = local.clientUpdatedAt ?? local.updatedAt ?? 0;
      if (clientUpdatedAt <= serverTs) {
        // remote is same or newer: accept remote and clear dirty
        recordsToPut.push({ ...remote, dirty: false, updatedAt: serverTs });
      }
      // If clientUpdatedAt > serverTs, local wins: do nothing (skip)
    }

    // 5. Batch Write to Dexie (One local DB operation instead of hundreds)
    if (recordsToPut.length > 0) {
      await dbLocal[collectionName].bulkPut(recordsToPut);
    }
  }

  // Pull campaigns then legs
  await pullCollection("campaigns");
  await pullCollection("legs");

  return { maxServerUpdatedAt };
}