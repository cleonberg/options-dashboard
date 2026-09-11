// src/sync/utils/firestoreUtils.js
import { Timestamp } from "firebase/firestore";

export function toMillis(tsOrNumber) {
  if (!tsOrNumber) return null;
  if (typeof tsOrNumber === "number") return tsOrNumber;
  if (tsOrNumber instanceof Timestamp) return tsOrNumber.toMillis();
  // Firestore sometimes returns plain objects in some environments; try to read .seconds
  if (tsOrNumber && typeof tsOrNumber.seconds === "number") {
    return tsOrNumber.seconds * 1000 + Math.floor((tsOrNumber.nanoseconds || 0) / 1e6);
  }
  return null;
}

export function normalizeRemoteDoc(id, data) {
  const updatedAt = toMillis(data.updatedAt) ?? toMillis(data.serverUpdatedAt) ?? Date.now();
  const serverUpdatedAt = toMillis(data.serverUpdatedAt) ?? toMillis(data.updatedAt) ?? null;
  return {
    id,
    ...data,
    updatedAt,
    serverUpdatedAt,
    deleted: !!data.deleted,
    dirty: false
  };
}
