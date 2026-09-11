// CampaignForm.jsx
import React, { useState } from "react";

export default function CampaignForm({ initialData, onSubmit, onCancel }) {
  // Get today's date formatted as YYYY-MM-DD
  const today = new Date().toISOString().split("T")[0];
  
  // Use initialData if editing, otherwise default to empty/today
  const [ticker, setTicker] = useState(initialData?.ticker || "");
  const [startDate, setStartDate] = useState(initialData?.startDate || today);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!ticker.trim()) {
      alert("Ticker is required.");
      return;
    }

    // Pass the data back to the parent
    onSubmit({
      ticker: ticker.toUpperCase(),
      startDate,
    });
  };

  return (
    <div 
      className="card" 
      style={{ 
        border: "2px solid #007bff", 
        marginTop: "16px",
        marginBottom: "16px",
        padding: "16px" 
      }}
    >
      <h3 style={{ marginTop: 0 }}>
        {initialData ? "Edit Campaign" : "New Campaign"}
      </h3>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
            Ticker:
          </label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="e.g. AAPL"
            autoFocus
            style={{ padding: "6px", width: "100%", maxWidth: "200px" }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
            Start Date:
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: "6px" }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button type="submit" style={{ backgroundColor: "#007bff", color: "white", padding: "6px 12px", border: "none", borderRadius: "4px", cursor: "pointer" }}>
            {initialData ? "Save Changes" : "Create Campaign"}
          </button>
          <button type="button" onClick={onCancel} style={{ padding: "6px 12px", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}