import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";
import { normalizeRemoteDoc, toMillis, effectiveLocalTs, effectiveRemoteTs } from "./utils/firestoreUtils";

export async function pullRemoteChanges(uid, opts = {}) {
  if (!uid) throw new Error("pullRemoteChanges requires uid");

  const since = Number(opts.since) || 0;
  let maxServerUpdatedAt = since;

  async function pullCollection(collectionName) {
    const ref = collection(db, "users", uid, collectionName);
    let snaps;

    try {
      if (since > 0) {
        const q = query(ref, where("serverUpdatedAt", ">", Timestamp.fromMillis(since)));
        snaps = await getDocs(q);
      } else {
        snaps = await getDocs(ref);
      }
    } catch (err) {
      console.warn("[pullRemoteChanges] query failed, falling back to full fetch", err);
      snaps = await getDocs(ref);
    }

    if (snaps.empty) return;

    const recordsToPut = [];

    for (const docSnap of snaps.docs) {
      const remote = normalizeRemoteDoc(docSnap.id, docSnap.data());
      const serverTs = effectiveRemoteTs(remote);

      if (serverTs > maxServerUpdatedAt) {
        maxServerUpdatedAt = serverTs;
      }

      const local = await dbLocal[collectionName].get(docSnap.id);

      if (!local) {
        recordsToPut.push({
          ...remote,
          dirty: false,
          updatedAt: serverTs,
          clientUpdatedAt: toMillis(remote.clientUpdatedAt) ?? serverTs,
        });
        continue;
      }

      const localTs = effectiveLocalTs(local);

      if (!local.dirty) {
        if (localTs < serverTs) {
          recordsToPut.push({
            ...remote,
            dirty: false,
            updatedAt: serverTs,
            clientUpdatedAt: toMillis(remote.clientUpdatedAt) ?? serverTs,
          });
        }
        continue;
      }

      // If local dirtiness is newer than the remote write, preserve local.
      // Otherwise accept the remote write.
      if (localTs <= serverTs) {
        recordsToPut.push({
          ...remote,
          dirty: false,
          updatedAt: serverTs,
          clientUpdatedAt: toMillis(remote.clientUpdatedAt) ?? serverTs,
        });
      }
    }

    if (recordsToPut.length) {
      await dbLocal[collectionName].bulkPut(recordsToPut);
    }
  }

  await pullCollection("campaigns");
  await pullCollection("legs");

  return { maxServerUpdatedAt };
}