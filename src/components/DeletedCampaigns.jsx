// src/components/DeletedCampaigns.jsx
import React, { useEffect, useState } from "react";
import { getDeletedCampaigns } from "../logic/localQueries";
import { reopenCampaign } from "../logic/reopenCampaign";

export default function DeletedCampaigns({ onRestored }) {
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const rows = await getDeletedCampaigns();
    setDeleted(rows);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleUndelete(id) {
    try {
      setLoading(true);
      await reopenCampaign(id);
      // refresh local list
      await load();
      if (typeof onRestored === "function") onRestored(id);
      alert("Campaign restored and pushed to server.");
    } catch (err) {
      console.error("Undelete failed", err);
      alert("Failed to restore campaign: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  if (deleted.length === 0) return null;

  return (
    <section>
      <h3>Deleted campaigns</h3>
      if (!deleted.length) return <div style={{color:'#666'}}>No deleted campaigns</div>;

      <div>
        {deleted.map(c => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <strong>{c.ticker || c.id}</strong>
              <div style={{ fontSize: 12, color: "#666" }}>{c.notes || "No notes"}</div>
            </div>
            <button
              onClick={() => handleUndelete(c.id)}
              style={{ backgroundColor: "#5cb85c", color: "white", padding: "6px 10px", border: "none", borderRadius: 4 }}
              disabled={loading}
            >
              Undelete
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
