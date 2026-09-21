import { Timestamp } from "firebase/firestore";

export function toMillis(tsOrNumber) {
  if (tsOrNumber == null) return null;
  if (typeof tsOrNumber === "number") return tsOrNumber;
  if (tsOrNumber instanceof Timestamp) return tsOrNumber.toMillis();

  if (typeof tsOrNumber === "string") {
    const n = Date.parse(tsOrNumber);
    return Number.isNaN(n) ? null : n;
  }

  if (typeof tsOrNumber === "object") {
    if ("seconds" in tsOrNumber) {
      const sec = Number(tsOrNumber.seconds ?? 0);
      const nanos = Number(tsOrNumber.nanoseconds ?? 0);
      return sec * 1000 + Math.floor(nanos / 1_000_000);
    }
  }

  return null;
}

export function normalizeRemoteDoc(id, data) {
  const updatedAt = toMillis(data.updatedAt) ?? toMillis(data.serverUpdatedAt) ?? Date.now();
  const serverUpdatedAt = toMillis(data.serverUpdatedAt) ?? toMillis(data.updatedAt) ?? updatedAt;
  const clientUpdatedAt = toMillis(data.clientUpdatedAt) ?? updatedAt;

  return {
    id,
    ...data,
    updatedAt,
    serverUpdatedAt,
    clientUpdatedAt,
    deleted: !!data.deleted,
    dirty: false,
  };
}

export function effectiveLocalTs(local) {
  if (!local) return 0;
  return Math.max(toMillis(local.clientUpdatedAt) ?? 0, toMillis(local.updatedAt) ?? 0);
}

export function effectiveRemoteTs(remote) {
  if (!remote) return 0;
  return Math.max(toMillis(remote.serverUpdatedAt) ?? 0, toMillis(remote.updatedAt) ?? 0);
}

export function chooseWinningRecord(local, remote) {
  const localTs = effectiveLocalTs(local);
  const remoteTs = effectiveRemoteTs(remote);

  if (localTs === remoteTs) {
    return local ?? remote;
  }

  return localTs > remoteTs ? local : remote;
}