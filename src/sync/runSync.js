// src/sync/runSync.js
import { dbLocal } from "../db/dexie";
import { processDeletionQueue } from "./processDeletionQueue";
import { uploadDirty } from "./uploadDirty";           // implement per earlier guidance
import { pullRemoteChanges } from "./pullRemoteChanges"; // implement per earlier guidance

let _syncLock = false;
let _syncBackoffAttempts = 0;

/**
 * nextBackoffMs for runSync-level retries (exponential + jitter)
 */
function nextBackoffMs(attempts) {
  const base = 1000; // 1s
  const max = 60_000; // 60s
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(max, base * Math.pow(2, attempts)) + jitter;
}

/**
 * Persist lastPulledAt in Dexie (or localStorage). Using Dexie here.
 */
async function getLastPulledAt() {
  try {
    const meta = await dbLocal.meta.get("sync:lastPulledAt");
    return meta?.value ?? 0;
  } catch (err) {
    return 0;
  }
}
async function setLastPulledAt(ts) {
  try {
    await dbLocal.meta.put({ key: "sync:lastPulledAt", value: ts });
  } catch (err) {
    console.warn("[runSync] failed to persist lastPulledAt", err);
  }
}

/**
 * runSync orchestrates deletion -> upload -> pull.
 * - uid: current user id (required)
 * - opts: { forcePull: boolean } optional
 */
export async function runSync(uid, opts = {}) {
  if (!uid) {
    console.warn("[runSync] missing uid, skipping sync");
    return;
  }

  if (_syncLock) {
    console.log("[runSync] sync already running, skipping");
    return;
  }

  _syncLock = true;
  try {
    console.log("[runSync] start", { uid, startedAt: new Date().toISOString() });

    // 1) Process deletion queue first (soft/hard deletes)
    try {
      await processDeletionQueue();
      console.log("[runSync] deletion queue processed");
    } catch (err) {
      console.warn("[runSync] processDeletionQueue failed", err);
      // continue — deletions failing shouldn't block uploads/pulls forever
    }

    // 2) Upload local dirty rows (idempotent upserts)
    try {
      await uploadDirty(uid);
      console.log("[runSync] uploadDirty completed");
    } catch (err) {
      console.warn("[runSync] uploadDirty failed", err);
      // leave dirty rows for next attempt
    }

    // 3) Pull remote changes (deltas since lastPulledAt)
    try {
      const lastPulledAt = await getLastPulledAt();
      const result = await pullRemoteChanges(uid, { since: lastPulledAt, force: !!opts.forcePull });
      // pullRemoteChanges should return { maxServerUpdatedAt } or similar
      if (result?.maxServerUpdatedAt) {
        await setLastPulledAt(result.maxServerUpdatedAt);
      } else {
        // fallback: set now so we don't re-pull everything repeatedly
        await setLastPulledAt(Date.now());
      }
      console.log("[runSync] pullRemoteChanges completed");
    } catch (err) {
      console.warn("[runSync] pullRemoteChanges failed", err);
    }

    // success -> reset run-level backoff attempts
    _syncBackoffAttempts = 0;
    console.log("[runSync] finished", { finishedAt: new Date().toISOString() });
  } catch (err) {
    // top-level error handling: schedule a retry with backoff
    _syncBackoffAttempts++;
    const backoffMs = nextBackoffMs(_syncBackoffAttempts);
    console.error("[runSync] fatal sync error, scheduling retry", { attempts: _syncBackoffAttempts, backoffMs, err });
    setTimeout(() => {
      runSync(uid).catch(console.error);
    }, backoffMs);
  } finally {
    _syncLock = false;
  }
}

/* -------------------------
   Convenience: start/stop sync wiring
   Call startSync(uid) after user signs in; call stopSync() on sign-out.
   These set up online listener and periodic sync.
-------------------------- */

let _periodicHandle = null;
let _onlineHandler = null;

export function startSync(uid, { intervalMs = 1000 * 60 * 2 } = {}) {
  if (!uid) {
    console.warn("[startSync] missing uid");
    return;
  }

  // run immediately
  runSync(uid).catch(console.error);

  // periodic
  if (_periodicHandle) clearInterval(_periodicHandle);
  _periodicHandle = setInterval(() => {
    runSync(uid).catch(console.error);
  }, intervalMs);

  // online event
  _onlineHandler = () => runSync(uid).catch(console.error);
  window.addEventListener("online", _onlineHandler);

  console.log("[startSync] sync started", { uid, intervalMs });
}

export function stopSync() {
  if (_periodicHandle) {
    clearInterval(_periodicHandle);
    _periodicHandle = null;
  }
  if (_onlineHandler) {
    window.removeEventListener("online", _onlineHandler);
    _onlineHandler = null;
  }
  console.log("[stopSync] sync stopped");
}
