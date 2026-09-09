// src/sync/reopenCampaign.js
import { updateCampaign } from "../sync/sync";

export async function reopenCampaign(uid, id) {
  return updateCampaign(uid, id, {
    closed: false,
    deleted: false,
    deletedAt: null,
  });
}
