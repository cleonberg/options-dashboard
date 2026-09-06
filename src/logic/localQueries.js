// src/logic/localQueries.js
import { dbLocal } from "../db/dexie";

export async function getDeletedCampaigns() {
  try {
    // If 'deleted' is indexed, this is fine and fast:
    if (dbLocal.campaigns.schema.indexes.some(ix => ix.name === 'deleted')) {
      return dbLocal.campaigns.where('deleted').equals(true).toArray();
    }
    // Otherwise fall back to filter (scans table)
    return dbLocal.campaigns.filter(c => !!c.deleted).toArray();
  } catch (err) {
    console.error('getDeletedCampaigns failed', err);
    return [];
  }
}
