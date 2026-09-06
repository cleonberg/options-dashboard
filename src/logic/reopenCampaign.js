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

  // 1) Restore local campaign tombstone
  const updated = await dbLocal.campaigns.update(id, {
    deleted: false,
    deletedAt: null,
    dirty: true,
    updatedAt: now
  });
  if (!updated) throw new Error("local campaign not found");

  // 2) Restore local legs for that campaign (use safe query)
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

  // 3) Push restored campaign and legs to server
  const campaign = await dbLocal.campaigns.get(id);
  if (campaign) {
    await pushCampaign(uid, campaign);
  } else {
    throw new Error("local campaign missing after update; cannot push");
  }

  // push legs using the same safe query (avoid direct .where without guard)
  const updatedLegs = await safeWhereEquals(dbLocal.legs, "campaignId", id);
  await Promise.all(updatedLegs.map(l => pushLeg(uid, l)));

  return { ok: true };
}
