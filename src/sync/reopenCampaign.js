// src/sync/reopenCampaign.js
import { dbLocal } from "../db/dexie";
import { auth } from "../auth";
import { pushCampaign, pushLeg } from "../sync";

/**
 * Safe helper to query a table by an index if it exists, otherwise fall back to filter.
 * Returns an array.
 */
async function safeWhereEquals(table, indexName, value) {
  if (value === undefined || value === null) return [];
  try {
    const schema = table?.schema;
    const hasIndex = Array.isArray(schema?.indexes)
      ? schema.indexes.some(ix => ix.name === indexName)
      : false;

    if (hasIndex) {
      return await table.where(indexName).equals(value).toArray();
    } else {
      // fallback scan
      return await table.filter(item => item[indexName] === value).toArray();
    }
  } catch (err) {
    console.error("[safeWhereEquals] IndexedDB query failed", { indexName, value, err });
    // return empty array on failure to avoid throwing DataError up the stack
    return [];
  }
}

export async function reopenCampaign(id) {
  if (!id) throw new Error("reopenCampaign requires id");
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("not signed in");

  const now = new Date().toISOString();

  // Use a transaction so campaign + legs updates are atomic and fire change events together
  try {
    await dbLocal.transaction('rw', dbLocal.campaigns, dbLocal.legs, async () => {
      console.debug('[reopenCampaign] starting local updates', id, now);

      const updated = await dbLocal.campaigns.update(id, {
        deleted: false,
        deletedAt: null,
        dirty: true,
        updatedAt: now
      });
      if (!updated) throw new Error("local campaign not found");

      const legs = await safeWhereEquals(dbLocal.legs, "campaignId", id);
      await Promise.all(
        legs.map(l =>
          dbLocal.legs.update(l.id, {
            deleted: false,
            deletedAt: null,
            dirty: true,
            updatedAt: now
          })
        )
      );

      console.debug('[reopenCampaign] local updates applied', { id, updated, legsCount: legs.length });
    });
  } catch (err) {
    console.error('[reopenCampaign] transaction failed', err);
    throw err;
  }

  // Push restored campaign and legs to server (fire-and-forget)
  const campaign = await dbLocal.campaigns.get(id);
  if (campaign) {
    pushCampaign(uid, campaign).catch(err => console.warn("pushCampaign failed", err));
  } else {
    throw new Error("local campaign missing after update; cannot push");
  }

  const updatedLegs = await safeWhereEquals(dbLocal.legs, "campaignId", id);
  updatedLegs.forEach(l => pushLeg(uid, l).catch(err => console.warn("pushLeg failed", err)));

  const refreshed = await dbLocal.campaigns.get(id);
  console.debug('[reopenCampaign] returning refreshed', refreshed);
  return refreshed;
}
