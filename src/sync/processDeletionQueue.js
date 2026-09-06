// src/sync/processDeletionQueue.js
import { dbLocal } from "../db/dexie";
import { pushDelete } from "./pushDelete";

export async function processDeletionQueue() {
  const jobs = await dbLocal.deletionJobs.toArray();
  for (const job of jobs) {
    const uid = job.uid;
    if (!uid) {
      console.warn('[processDeletionQueue] job missing uid, deleting job', job.id);
      await dbLocal.deletionJobs.delete(job.id);
      continue;
    }

    try {
      console.log('[processDeletionQueue] processing job', { id: job.id, type: job.type, targetId: job.targetId, uid });

      if (job.type === 'deleteCampaign') {
        // delete campaign doc in user namespace
        await pushDelete(uid, 'campaigns', job.targetId);

        // delete all legs for that campaign in user namespace
        const legs = await dbLocal.legs.where('campaignId').equals(job.targetId).toArray();
        for (const l of legs) {
          await pushDelete(uid, 'legs', l.id);
        }

        // Optionally hard-delete local tombstones here after successful remote delete:
        // await dbLocal.campaigns.delete(job.targetId);
        // await dbLocal.legs.where('campaignId').equals(job.targetId).delete();
      } else if (job.type === 'deleteLeg') {
        await pushDelete(uid, 'legs', job.targetId);
        // Optionally hard-delete local tombstone:
        // await dbLocal.legs.delete(job.targetId);
      } else {
        console.warn('[processDeletionQueue] unknown job type, deleting job', job);
      }

      // remove job only after successful remote deletes
      await dbLocal.deletionJobs.delete(job.id);
      console.log('[processDeletionQueue] job completed and removed', job.id);
    } catch (err) {
      const prevAttempts = job.attempts || 0;
      const attempts = prevAttempts + 1;
      await dbLocal.deletionJobs.update(job.id, { attempts });
      console.warn('[processDeletionQueue] job failed, incremented attempts', { jobId: job.id, attempts, err });

      // If classification says not-found treat as success (defensive)
      const cls = err?._classification;
      if (cls && cls.type === 'not-found') {
        console.log('[processDeletionQueue] remote already missing, removing job', job.id);
        await dbLocal.deletionJobs.delete(job.id);
        continue;
      }

      // Give up after N attempts
      if (attempts >= 5) {
        console.error('[processDeletionQueue] job exceeded max attempts, deleting job', job.id);
        await dbLocal.deletionJobs.delete(job.id);
      }
    }
  }
}

// ensure this runs on reconnect
window.addEventListener('online', () => processDeletionQueue().catch(console.error));
