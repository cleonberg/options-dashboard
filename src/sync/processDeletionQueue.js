// src/sync/processDeletionQueue.js
import { writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { dbLocal } from "../db/dexie";

let _processingLock = false;

function nextBackoffMs(attempts) {
  const base = 1000;
  const max = 60_000;
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(max, base * Math.pow(2, attempts)) + jitter;
}

const MAX_ATTEMPTS = 6;

/**
 * Process deletionJobs queue safely and efficiently using writeBatch.
 * Handles campaign expansion (deleting a campaign deletes all its legs).
 */
export async function processDeletionQueue({ hardLocalCleanup = true } = {}) {
  if (_processingLock) {
    console.log("[processDeletionQueue] already running, skipping");
    return;
  }
  _processingLock = true;

  try {
    const now = Date.now();
    
    // Fetch jobs that are due
    const jobs = await dbLocal.deletionJobs
      .filter(job => !job.nextAttemptAt || job.nextAttemptAt <= now)
      .toArray();

    if (!jobs.length) return;

    // 1. Expand all jobs into a flat list of operations
    const operations = [];
    const jobsToProcess = [];

    for (const job of jobs) {
      const uid = job.uid;
      if (!uid) {
         await dbLocal.deletionJobs.delete(job.id);
         continue;
      }

      jobsToProcess.push(job);

      if (job.type === "deleteCampaign") {
        operations.push({ action: 'soft', col: 'campaigns', id: job.targetId, uid });
        const legs = await dbLocal.legs.where("campaignId").equals(job.targetId).toArray();
        for (const l of legs) operations.push({ action: 'soft', col: 'legs', id: l.id, uid });
        
      } else if (job.type === "deleteLeg") {
         operations.push({ action: 'soft', col: 'legs', id: job.targetId, uid });
         
      } else if (job.type === "hardDeleteCampaign") {
         operations.push({ action: 'hard', col: 'campaigns', id: job.targetId, uid });
        const legs = await dbLocal.legs.where("campaignId").equals(job.targetId).toArray();
        for (const l of legs) operations.push({ action: 'hard', col: 'legs', id: l.id, uid });
        
      } else if (job.type === "hardDeleteLeg") {
         operations.push({ action: 'hard', col: 'legs', id: job.targetId, uid });
      }
    }

    if (operations.length === 0) {
       // All jobs expanded to nothing (local data already gone), so just clear the jobs
       const jobIds = jobsToProcess.map(j => j.id);
       await dbLocal.deletionJobs.bulkDelete(jobIds);
       return;
    }

    // 2. Process operations in chunks (Firebase limit is 500)
    const CHUNK_SIZE = 450;
    let allChunksSucceeded = true;
    let lastError = null;

    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const chunk = operations.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const op of chunk) {
        const ref = doc(db, "users", op.uid, op.col, op.id);
        
        if (op.action === 'soft') {
          batch.set(ref, {
            deleted: true,
            clientDeletedAt: Date.now(),
            serverUpdatedAt: serverTimestamp()
          }, { merge: true });
        } else {
          batch.delete(ref);
        }
      }

      try {
        // Send up to 450 deletions in ONE network request
        await batch.commit();

        // 3. Instantly clean up local Dexie records for this chunk
        if (hardLocalCleanup) {
          const campaignsToDelete = chunk.filter(op => op.col === 'campaigns').map(op => op.id);
          const legsToDelete = chunk.filter(op => op.col === 'legs').map(op => op.id);

          await dbLocal.transaction('rw', dbLocal.campaigns, dbLocal.legs, async () => {
            if (campaignsToDelete.length > 0) await dbLocal.campaigns.bulkDelete(campaignsToDelete);
            if (legsToDelete.length > 0) await dbLocal.legs.bulkDelete(legsToDelete);
          });
        }
      } catch (err) {
        console.error("[processDeletionQueue] Batch chunk failed", err);
        allChunksSucceeded = false;
        lastError = err;
        break; // Stop processing further chunks, we will retry the remaining set later
      }
    }

    // 4. Handle Job Queue Updates based on overall success
    if (allChunksSucceeded) {
       // Wipes out the completed jobs in one local DB operation
       const jobIds = jobsToProcess.map(j => j.id);
       await dbLocal.deletionJobs.bulkDelete(jobIds);
       console.log("[processDeletionQueue] All deletions successful and jobs removed");
    } else {
       // If a batch failed (e.g. offline), apply backoff to the jobs so they retry later
       for (const job of jobsToProcess) {
         const attempts = (job.attempts || 0) + 1;
         const backoffMs = nextBackoffMs(attempts);

         if (attempts >= MAX_ATTEMPTS) {
           await dbLocal.deletionJobs.delete(job.id); // Give up
         } else {
           await dbLocal.deletionJobs.update(job.id, {
             attempts,
             nextAttemptAt: Date.now() + backoffMs,
             lastError: lastError?.message || "Batch failure",
             lastErrorAt: Date.now()
           });
         }
       }
    }

  } catch (err) {
    console.error("[processDeletionQueue] Fatal error", err);
  } finally {
    _processingLock = false;
  }
}

// ensure this runs on reconnect
window.addEventListener("online", () => processDeletionQueue().catch(console.error));