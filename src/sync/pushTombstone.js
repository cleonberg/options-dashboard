// src/sync/pushTombstone.js
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export async function pushTombstone(uid, collectionName, id) {
  if (!uid) throw new Error("pushTombstone requires uid");
  const ref = doc(db, "users", uid, collectionName, id);
  const payload = {
    deleted: true,
    deletedAt: new Date().toISOString(),
    updatedAt: serverTimestamp()
  };
  // merge so we don't wipe other fields
  await setDoc(ref, payload, { merge: true });
  return { ok: true };
}
