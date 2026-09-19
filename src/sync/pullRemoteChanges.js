// src/sync/pullRemoteChanges.js
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { normalizeRemoteDoc, toMillis } from "./utils/firestoreUtils";

/**
 * Pull remote changes since `opts.since` (millis).
 * - Applies LWW rules (Last Write Wins) using Dexie batch operations for maximum speed.
 * - Returns { maxServerUpdatedAt } (millis) for runSync to persist.
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
    const incomingRecords = [];

    for (const docSnap of snaps.docs) {
      const id = docSnap.id;
      const remote = normalizeRemoteDoc(id, docSnap.data());
      
      // FIXED: Only advance maxServerUpdatedAt using actual server timestamps
      const serverTs = remote.serverUpdatedAt ?? remote.updatedAt;
      if (serverTs && serverTs > maxServerUpdatedAt) {
        maxServerUpdatedAt = serverTs;
      }

      incomingRecords.push({
        id,
        remote,
        // Fallback to local time strictly for local comparison if server timestamp is absent
        serverTs: serverTs ?? Date.now(), 
      });
    }

    // 3. Batch Read from Dexie
    const incomingIds = incomingRecords.map(record => record.id);
    const localRecords = await dbLocal[collectionName].bulkGet(incomingIds);

    const recordsToPut = [];

    // 4. Apply LWW Rules in memory
    for (let i = 0; i < incomingRecords.length; i++) {
      const { remote, serverTs } = incomingRecords[i];
      const local = localRecords[i];

      // FIXED: Guarantee clientUpdatedAt is stored as a millisecond number in Dexie
      const preparedRemote = {
        ...remote,
        dirty: false,
        updatedAt: serverTs,
        clientUpdatedAt: toMillis(remote.clientUpdatedAt) ?? serverTs,
      };

      // If local missing -> write remote
      if (!local) {
        recordsToPut.push(preparedRemote);
        continue;
      }

      // FIXED: Use toMillis() on local Dexie timestamps before evaluating LWW rules
      const localUpdatedAt = toMillis(local.updatedAt) ?? 0;
      const localClientUpdatedAt = toMillis(local.clientUpdatedAt) ?? localUpdatedAt;

      // If local not dirty -> accept remote if remote newer
      if (!local.dirty) {
        if (localUpdatedAt < serverTs) {
          recordsToPut.push(preparedRemote);
        }
        continue;
      }

      // Local is dirty -> compare clientUpdatedAt vs serverUpdatedAt
      if (localClientUpdatedAt <= serverTs) {
        // remote is same or newer: accept remote and clear dirty
        recordsToPut.push(preparedRemote);
      }
      // If localClientUpdatedAt > serverTs, local wins: do nothing (skip)
    }

    // 5. Batch Write to Dexie
    if (recordsToPut.length > 0) {
      await dbLocal[collectionName].bulkPut(recordsToPut);
    }
  }

  // Pull campaigns then legs
  await pullCollection("campaigns");
  await pullCollection("legs");

  return { maxServerUpdatedAt };
}