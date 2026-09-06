// src/sync/pushDelete.js
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

function classifyError(err) {
  const code = (err?.code || err?.message || "").toString().toLowerCase();
  if (!navigator.onLine) return { type: "network", transient: true, reason: "offline" };
  if (code.includes("permission-denied")) return { type: "permission", transient: false, reason: "permission-denied" };
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return { type: "network", transient: true, reason: "unavailable" };
  if (code.includes("not-found") || code.includes("404")) return { type: "not-found", transient: false, reason: "not-found" };
  if (code.includes("blocked_by_client") || code.includes("err_blocked_by_client")) return { type: "network", transient: true, reason: "blocked_by_client" };
  return { type: "unknown", transient: false, reason: code || "unknown" };
}

export async function pushDelete(uid, collectionName, id) {
  if (!uid) throw new Error("pushDelete requires uid");
  const startedAt = new Date().toISOString();
  console.log("[pushDelete] attempt", { startedAt, uid, collectionName, id });

  const ref = doc(db, "users", uid, collectionName, id);
  try {
    await deleteDoc(ref);
    console.log("[pushDelete] success", { uid, collectionName, id, finishedAt: new Date().toISOString() });
    return { ok: true };
  } catch (err) {
    const classification = classifyError(err);
    err._classification = classification;

    // Treat remote-missing as success (idempotent)
    if (classification.type === "not-found") {
      console.log("[pushDelete] remote already missing (treat as success)", { uid, collectionName, id });
      return { ok: true };
    }

    console.error("[pushDelete] failed", { uid, collectionName, id, classification, err });
    throw err;
  }
}
