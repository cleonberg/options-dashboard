import React from "react";
import { reopenCampaign } from "../sync/reopenCampaign";
import { getDeletedCampaigns } from "../logic/localQueries";

export default function DeletedCampaigns({ onRestored }) {
  const [deleted, setDeleted] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState(null);

  async function load() {
    try {
      const rows = await getDeletedCampaigns();
      setDeleted(Array.isArray(rows) ? [...rows] : []);
    } catch (err) {
      console.error("load failed", err);
      setDeleted([]);
    }
  }

  React.useEffect(() => { load(); }, []);

  async function handleUndelete(id, e) {
    if (e?.stopPropagation) e.stopPropagation();
    try {
      setLoading(true);
      setRestoringId(id);
      await reopenCampaign(id);
      await load();
      if (typeof onRestored === "function") onRestored(id);
    } catch (err) {
      console.error("Undelete failed", err);
      alert("Failed to restore campaign: " + (err.message || err));
    } finally {
      setLoading(false);
      setRestoringId(null);
    }
  }

  return (
    <section className="deleted-campaigns-section">
      <h3>Deleted campaigns</h3>
      <div className="deleted-campaigns-list">
        {(deleted || []).map(c => (
          <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <strong>{c.ticker || c.id}</strong>
              <div style={{ fontSize: 12, color: "#bbb" }}>{c.notes || "No notes"}</div>
            </div>
            <button
              onClick={(e) => handleUndelete(c.id, e)}
              style={{ backgroundColor: "#5cb85c", color: "white", padding: "6px 10px", border: "none", borderRadius: 4 }}
              disabled={loading || restoringId === c.id}
              aria-label={`Undelete ${c.ticker || c.id}`}
            >
              {restoringId === c.id ? "Restoring…" : "Undelete"}
            </button>
          </div>
        ))}
        {(!deleted || deleted.length === 0) && <div style={{ color: "#999", fontSize: 13 }}>No deleted campaigns</div>}
      </div>
    </section>
  );
}
