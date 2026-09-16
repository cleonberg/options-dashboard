import React, { useState, useMemo } from "react";
import { combineCampaigns } from "../sync/sync.js";
import { getCampaignLabel } from "../logic/logic.js"; // <-- 1. Import the function

export default function CombineCampaignsModal({ campaigns, uid, onClose }) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [loading, setLoading] = useState(false);

  // Sort campaigns by Ticker (A-Z), then by Start Date (Newest First)
  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      // 1. Primary Sort: Ticker alphabetically
      const tickerA = a.ticker || "";
      const tickerB = b.ticker || "";
      const tickerCompare = tickerA.localeCompare(tickerB);
      
      if (tickerCompare !== 0) {
        return tickerCompare;
      }

      // 2. Secondary Sort: Date (descending / newest first)
      const dateA = new Date(a.startDate || 0).getTime();
      const dateB = new Date(b.startDate || 0).getTime();
      return dateB - dateA;
    });
  }, [campaigns]);

  const handleCombine = async (e) => {
    e.preventDefault();
    if (!sourceId || !targetId) {
      alert("Please select both a source and target campaign.");
      return;
    }
    if (sourceId === targetId) {
      alert("Source and target campaigns must be different.");
      return;
    }

    if (!window.confirm("Are you sure? This will move all legs to the target campaign and delete the source campaign.")) {
      return;
    }

    try {
      setLoading(true);
      await combineCampaigns(uid, sourceId, targetId);
      onClose(); // Close modal on success
    } catch (err) {
      console.error("Failed to combine campaigns:", err);
      alert("Error combining campaigns.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ border: "2px solid #ffc107", marginTop: "1rem", marginBottom: "1.5rem" }}>
      <h3>Combine Campaigns</h3>
      <form onSubmit={handleCombine}>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Source Campaign (To Be Merged & Deleted):
          </label>
          <select 
            value={sourceId} 
            onChange={(e) => setSourceId(e.target.value)} 
            required
            style={{ width: "100%", padding: "8px", background: "#111f3f", color: "#fff", border: "1px solid #24345f", borderRadius: "4px" }}
          >
            <option value="">-- Select Campaign --</option>
            {sortedCampaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {/* 2. Use the helper function here */}
                {getCampaignLabel(c, c.id)} - {c.status}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Target Campaign (Destination):
          </label>
          <select 
            value={targetId} 
            onChange={(e) => setTargetId(e.target.value)} 
            required
            style={{ width: "100%", padding: "8px", background: "#111f3f", color: "#fff", border: "1px solid #24345f", borderRadius: "4px" }}
          >
            <option value="">-- Select Campaign --</option>
            {sortedCampaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {/* 3. Use the helper function here too */}
                {getCampaignLabel(c, c.id)} - {c.status}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" disabled={loading} style={{ backgroundColor: "#ffc107", color: "#000", fontWeight: "bold", padding: "8px 16px", border: "none", borderRadius: "4px", cursor: "pointer" }}>
            {loading ? "Combining..." : "Confirm Combine"}
          </button>
          <button type="button" onClick={onClose} style={{ backgroundColor: "transparent", color: "#9fb3ff", border: "1px solid #9fb3ff", padding: "8px 16px", borderRadius: "4px", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}