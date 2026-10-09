// CampaignForm.jsx
import React, { useEffect, useState } from "react";

export default function CampaignForm({
  initialData,
  onSubmit,
  onCancel,
  accounts = [],
  defaultAccountId = "",
}) {
  const [ticker, setTicker] = useState(initialData?.ticker || "");
  const [accountId, setAccountId] = useState(
    initialData?.accountId || defaultAccountId
  );

  useEffect(() => {
    if (!initialData?.accountId && defaultAccountId) {
      setAccountId(defaultAccountId);
    }
  }, [defaultAccountId, initialData?.accountId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!ticker.trim()) {
      alert("Ticker is required.");
      return;
    }

    // Pass the data back to the parent
    onSubmit({
      ticker: ticker.toUpperCase(),
      accountId,
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
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
            Ticker:
          </label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="e.g. AAPL"
            style={{ padding: "6px", width: "100%", maxWidth: "200px" }}
          />
          <select
            className="input"
            title="An asterisk marks the default account."
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            required
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}{account.isDefault ? " *" : ""}
              </option>
            ))}
          </select>
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