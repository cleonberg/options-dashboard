// src/logic/localQueries.js
import { dbLocal } from "../db/dexie";

export async function getDeletedCampaigns() {
  try {
    // Tolerant filter: accepts boolean, numeric, or string tombstones.
    const rows = await dbLocal.campaigns
      .filter(c => c && (c.deleted === true || c.deleted === 1 || c.deleted === "true"))
      .toArray();

    // Always return a new array reference so React sees changes.
    return Array.isArray(rows) ? [...rows] : [];
  } catch (err) {
    console.error("getDeletedCampaigns failed", err);
    return [];
  }
}
