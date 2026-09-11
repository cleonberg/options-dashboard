// src/sync/pullRemoteChanges.js
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { normalizeRemoteDoc, toMillis } from "./utils/firestoreUtils";

/**
 * Pull remote changes since `opts.since` (millis).
 * - If Firestore supports querying on serverUpdatedAt, uses that; otherwise fetches all and filters.
 * - Applies LWW rules:
 *   - If local missing -> write remote (dirty:false)
 *   - If local not dirty and remote newer -> write remote
 *   - If local dirty and local.clientUpdatedAt > remote.serverUpdatedAt -> keep local (skip)
 *   - If local dirty and remote.serverUpdatedAt >= local.clientUpdatedAt -> accept remote (overwrite)
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

    // Try to query by serverUpdatedAt if possible
    try {
      if (since > 0) {
        const ts = Timestamp.fromMillis(since);
        const q = query(ref, where("serverUpdatedAt", ">", ts));
        snaps = await getDocs(q);
      } else {
        snaps = await getDocs(ref);
      }
    } catch (err) {
      // Fallback: fetch all and filter client-side
      console.warn("[pullRemoteChanges] query by serverUpdatedAt failed, falling back to full fetch", err);
      snaps = await getDocs(ref);
    }

    for (const docSnap of snaps.docs) {
      const id = docSnap.id;
      const raw = docSnap.data();
      const remote = normalizeRemoteDoc(id, raw);
      const serverTs = remote.serverUpdatedAt ?? remote.updatedAt ?? Date.now();
      if (serverTs > maxServerUpdatedAt) maxServerUpdatedAt = serverTs;

      // Load local
      const local = await dbLocal[collectionName].get(id);

      // If local missing -> write remote
      if (!local) {
        await dbLocal[collectionName].put({
          ...remote,
          dirty: false,
          updatedAt: serverTs
        });
        continue;
      }

      // If local not dirty -> accept remote if remote newer
      if (!local.dirty) {
        if ((local.updatedAt || 0) < serverTs) {
          await dbLocal[collectionName].put({
            ...remote,
            dirty: false,
            updatedAt: serverTs
          });
        }
        continue;
      }

      // Local is dirty -> compare clientUpdatedAt vs serverUpdatedAt
      const clientUpdatedAt = local.clientUpdatedAt ?? local.updatedAt ?? 0;
      if (clientUpdatedAt > serverTs) {
        // local wins: keep local and let uploadDirty re-send later
        continue;
      } else {
        // remote is same or newer: accept remote and clear dirty
        await dbLocal[collectionName].put({
          ...remote,
          dirty: false,
          updatedAt: serverTs
        });
      }
    }
  }

  // Pull campaigns then legs
  await pullCollection("campaigns");
  await pullCollection("legs");

  return { maxServerUpdatedAt };
}
