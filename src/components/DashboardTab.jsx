// DashboardTab.jsx
import React from "react";
import "../styles/summary-table.css";
import { fmt, fmtCampaignDaysLeft } from "../logic/logic.js";

export default function DashboardTab({
  summary,
  campaigns,
  legs,
  setSelectedCampaignId,
  setActiveTab
}) 
  {
  if (!summary) {
    return <div className="card">Loading…</div>;
  }

  function handleSelect(id) {
    setSelectedCampaignId(id);
    setActiveTab("campaigns");   // jump straight to your existing CampaignsTab
  }

  const open = campaigns.filter(c => c.status === "open");
  const closed = campaigns.filter(c => c.status === "closed");

  const sortByDays = list =>
    [...list].sort(
      (a, b) => fmtCampaignDaysLeft(a, legs) - fmtCampaignDaysLeft(b, legs)
    );

  return (
    <div className="card">
      <h3>Dashboard Summary</h3>

      <div className="summary-grid">
        <div>
          <div className="summary-label">Total Net Credit</div>
          <div>{fmt(summary.netCredit)}</div>
        </div>

        <div>
          <div className="summary-label">Open Legs</div>
          <div>{summary.openLegCount}</div>
        </div>

        <div>
          <div className="summary-label">Closed Legs</div>
          <div>{summary.closedLegCount}</div>
        </div>

        <div>
          <div className="summary-label">Active Campaigns</div>
          <div>{summary.activeCampaigns}</div>
        </div>

        <div>
          <div className="summary-label">Closed Campaigns</div>
          <div>{summary.closedCampaigns}</div>
        </div>

        <div>
          <div className="summary-label">Earliest Open</div>
          <div>{summary.earliestOpen || "-"}</div>
        </div>

        <div>
          <div className="summary-label">Latest Close</div>
          <div>{summary.latestClose || "-"}</div>
        </div>
      </div>

      {/* --- NEW: Campaign Summary Table --- */}
      <h3 style={{ marginTop: "24px" }}>Open Campaigns</h3>
      <CampaignTable
        campaigns={sortByDays(open)}
        legs={legs}
        onSelect={handleSelect}
      />

      <details style={{ marginTop: "16px" }}>
        <summary>Closed Campaigns</summary>
        <CampaignTable
          campaigns={sortByDays(closed)}
          onSelect={handleSelect}
        />
      </details>
    </div>
  );
}

function CampaignTable({ campaigns, legs, onSelect }) {
  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Days Left</th>
        </tr>
      </thead>
      <tbody>
        {campaigns.map(c => (
          <tr key={c.id} onClick={() => onSelect(c.id)}>
            <td>{c.ticker}</td>
            <td>{fmtCampaignDaysLeft(c, legs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
