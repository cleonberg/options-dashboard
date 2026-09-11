// src/sync/processDeletionQueue.js
import { dbLocal } from "../db/dexie";
import { pushDelete } from "./pushDelete";
import { pushTombstone } from "./pushTombstone";

let _processingLock = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nextBackoffMs(attempts) {
  const base = 1000; // 1s base
  const max = 60_000; // cap at 60s
  const jitter = Math.floor(Math.random() * 500); // up to 500ms jitter
  const backoff = Math.min(max, base * Math.pow(2, attempts));
  return backoff + jitter;
}

const MAX_ATTEMPTS = 6;

/**
 * Process deletionJobs queue.
 * Job shape expected: { id, uid, type, targetId, createdAt, attempts, nextAttemptAt? }
 *
 * Behavior:
 * - Uses a lock to avoid concurrent runs
 * - Processes jobs with limited concurrency
 * - Uses pushTombstone (soft-delete) for user-visible tombstones
 * - Falls back to pushDelete for hard deletes when requested
 * - Schedules retries with exponential backoff for transient errors
 * - Treats not-found as success (idempotent)
 * - Optionally hard-deletes local tombstones after remote success
 */
export async function processDeletionQueue({ maxParallel = 3, hardLocalCleanup = true } = {}) {
  if (_processingLock) {
    console.log("[processDeletionQueue] already running, skipping");
    return;
  }
  _processingLock = true;

  try {
    const now = Date.now();
    // fetch jobs that are due (nextAttemptAt not set or in the past)
    const jobs = await dbLocal.deletionJobs
      .filter(job => !job.nextAttemptAt || job.nextAttemptAt <= now)
      .toArray();

    if (!jobs.length) {
      console.log("[processDeletionQueue] no jobs to process");
      return;
    }

    // process with limited concurrency
    const queue = jobs.slice();
    const workers = new Array(Math.min(maxParallel, queue.length)).fill(null).map(async () => {
      while (queue.length) {
        const job = queue.shift();
        if (!job) break;

        const uid = job.uid;
        if (!uid) {
          console.warn("[processDeletionQueue] job missing uid, deleting job", job.id);
          await dbLocal.deletionJobs.delete(job.id);
          continue;
        }

        try {
          console.log("[processDeletionQueue] processing job", { id: job.id, type: job.type, targetId: job.targetId, uid });

          if (job.type === "deleteCampaign") {
            // Soft-delete campaign (tombstone) remotely
            const res = await pushTombstone(uid, "campaigns", job.targetId);
            if (!res || !res.ok) throw new Error("pushTombstone failed for campaign");

            // Soft-delete legs for that campaign remotely
            const legs = await dbLocal.legs.where("campaignId").equals(job.targetId).toArray();
            for (const l of legs) {
              try {
                const r = await pushTombstone(uid, "legs", l.id);
                if (!r || !r.ok) throw new Error("pushTombstone failed for leg " + l.id);
              } catch (legErr) {
                // If a leg tombstone fails, create a separate deletion job for it and continue
                console.warn("[processDeletionQueue] failed to push tombstone for leg, creating separate job", l.id, legErr);
                await dbLocal.deletionJobs.add({
                  uid,
                  type: "deleteLeg",
                  targetId: l.id,
                  createdAt: Date.now(),
                  attempts: 0
                });
              }
            }

            // Optionally hard-delete local tombstones after remote success
            if (hardLocalCleanup) {
              await dbLocal.campaigns.delete(job.targetId);
              await dbLocal.legs.where("campaignId").equals(job.targetId).delete();
            }
          } else if (job.type === "deleteLeg") {
            // Soft-delete leg remotely
            const res = await pushTombstone(uid, "legs", job.targetId);
            if (!res || !res.ok) throw new Error("pushTombstone failed for leg");

            if (hardLocalCleanup) {
              await dbLocal.legs.delete(job.targetId);
            }
          } else if (job.type === "hardDeleteCampaign") {
            // explicit hard remote delete requested
            const res = await pushDelete(uid, "campaigns", job.targetId);
            if (!res || !res.ok) throw new Error("pushDelete failed for campaign");
            // cleanup local
            if (hardLocalCleanup) {
              await dbLocal.campaigns.delete(job.targetId);
              await dbLocal.legs.where("campaignId").equals(job.targetId).delete();
            }
          } else if (job.type === "hardDeleteLeg") {
            const res = await pushDelete(uid, "legs", job.targetId);
            if (!res || !res.ok) throw new Error("pushDelete failed for leg");
            if (hardLocalCleanup) {
              await dbLocal.legs.delete(job.targetId);
            }
          } else {
            console.warn("[processDeletionQueue] unknown job type, deleting job", job);
          }

          // remove job only after successful remote deletes
          await dbLocal.deletionJobs.delete(job.id);
          console.log("[processDeletionQueue] job completed and removed", job.id);
        } catch (err) {
          // unwrap classification if present (pushTombstone/pushDelete wrap errors with .classification)
          const classification = err?.classification || err?._classification || null;
          const prevAttempts = job.attempts || 0;
          const attempts = prevAttempts + 1;

          // If classification says not-found treat as success
          if (classification && classification.type === "not-found") {
            console.log("[processDeletionQueue] remote already missing, removing job", job.id);
            await dbLocal.deletionJobs.delete(job.id);
            continue;
          }

          // If permission error, surface and stop retrying (do not delete job)
          if (classification && classification.type === "permission") {
            console.error("[processDeletionQueue] permission error for job, will not retry automatically", { jobId: job.id, classification });
            // update attempts and store lastError for UI visibility
            await dbLocal.deletionJobs.update(job.id, {
              attempts,
              lastError: classification.reason,
              lastErrorAt: Date.now()
            });
            continue;
          }

          // Transient network errors or unknown errors -> schedule retry with backoff
          const backoffMs = nextBackoffMs(attempts);
          const nextAttemptAt = Date.now() + backoffMs;

          await dbLocal.deletionJobs.update(job.id, {
            attempts,
            nextAttemptAt,
            lastError: classification?.reason ?? (err && err.message) ?? "unknown",
            lastErrorAt: Date.now()
          });

          console.warn("[processDeletionQueue] job failed, scheduled retry", { jobId: job.id, attempts, nextAttemptAt, err });

          // Give up after MAX_ATTEMPTS
          if (attempts >= MAX_ATTEMPTS) {
            console.error("[processDeletionQueue] job exceeded max attempts, deleting job", job.id);
            await dbLocal.deletionJobs.delete(job.id);
          }
        }
      }
    });

    await Promise.all(workers);
  } finally {
    _processingLock = false;
  }
}

// ensure this runs on reconnect
window.addEventListener("online", () => processDeletionQueue().catch(console.error));
