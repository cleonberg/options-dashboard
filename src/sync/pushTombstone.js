// src/sync/pushTombstone.js
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { classifyError } from "./errorUtils";

/**
 * Push a soft-delete tombstone to Firestore.
 * Returns { ok: true, soft: true } on success.
 * Throws a wrapped error with .classification on failure.
 */
export async function pushTombstone(uid, collectionName, id) {
  if (!uid) throw new Error("pushTombstone requires uid");
  const ref = doc(db, "users", uid, collectionName, id);

  const payload = {
    deleted: true,
    clientDeletedAt: Date.now(),
    serverUpdatedAt: serverTimestamp()
  };

  try {
    await setDoc(ref, payload, { merge: true });
    return { ok: true, soft: true };
  } catch (err) {
    const classification = classifyError(err);

    // Treat remote-missing as success for idempotency
    if (classification.type === "not-found") {
      return { ok: true, soft: true, note: "remote-missing" };
    }

    const wrapped = new Error(`[pushTombstone] failed: ${classification.reason}`);
    wrapped.original = err;
    wrapped.classification = classification;
    throw wrapped;
  }
}
