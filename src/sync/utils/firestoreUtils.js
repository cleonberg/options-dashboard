import { Timestamp } from "firebase/firestore";

export function toMillis(tsOrNumber) {
  if (!tsOrNumber) return null;
  if (typeof tsOrNumber === "number") return tsOrNumber;
  if (tsOrNumber instanceof Timestamp) return tsOrNumber.toMillis();
  // Handles plain serialized objects from Firestore/Dexie
  if (tsOrNumber && typeof tsOrNumber.seconds === "number") {
    return tsOrNumber.seconds * 1000 + Math.floor((tsOrNumber.nanoseconds || 0) / 1e6);
  }
  return null;
}

export function normalizeRemoteDoc(id, data) {
  const updatedAt = toMillis(data.updatedAt) ?? toMillis(data.serverUpdatedAt) ?? Date.now();
  const serverUpdatedAt = toMillis(data.serverUpdatedAt) ?? toMillis(data.updatedAt) ?? null;
  // 💡 Explicitly normalize clientUpdatedAt to prevent raw object injection
  const clientUpdatedAt = toMillis(data.clientUpdatedAt) ?? updatedAt;

  return {
    id,
    ...data,
    updatedAt,
    serverUpdatedAt,
    clientUpdatedAt,
    deleted: !!data.deleted,
    dirty: false
  };
}