// DashboardTab.jsx
import React, { useState } from "react";
import "../styles/summary-table.css";
import { fmt, fmtCampaignDaysLeft, computeCampaignSummary, cashClass } from "../logic/logic.js";
import { createCampaign } from "../sync/sync.js"; // <-- Import your sync function

import DeletedCampaigns from "../components/DeletedCampaigns";
import CampaignForm from "./CampaignForm"; // <-- Import the new form

export default function DashboardTab({
  summary,
  campaigns,
  legs,
  setSelectedCampaignId,
  setActiveTab,
  reloadAll,
  uid // <-- Make sure this is being passed from App.js!
}) {
  const [showAddForm, setShowAddForm] = useState(false); // <-- Track form visibility

  if (!summary) {
    return <div className="card">Loading…</div>;
  }

  function handleSelect(id) {
    setSelectedCampaignId(id);
    setActiveTab("campaigns");
  }

  async function handleCreateCampaign(data) {
    if (!uid) {
      alert("Error: User ID not found.");
      return;
    }
    
    // Add the missing status property before saving!
    const campaignData = {
      ...data,
      status: "open" 
    };

    // Save to database
    await createCampaign(uid, campaignData);
    
    // Close form and optionally reload
    setShowAddForm(false);
    // if (typeof reloadAll === "function") {
    //   await reloadAll();
    // }
  }

  const open = campaigns.filter(c => c.status === "open");
  const closed = campaigns.filter(c => c.status === "closed");

  const sortByDays = list =>
    [...list].sort(
      (a, b) => fmtCampaignDaysLeft(a, legs) - fmtCampaignDaysLeft(b, legs)
    );

  return (
    <div className="card">
      {/* Header with New Campaign button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Dashboard Summary</h3>
        {!showAddForm && (
          <button 
            onClick={() => setShowAddForm(true)}
            style={{ padding: "6px 12px", cursor: "pointer" }}
          >
            + New Campaign
          </button>
        )}
      </div>

      {/* The new form conditionally renders here */}
      {showAddForm && (
        <CampaignForm 
          onSubmit={handleCreateCampaign} 
          onCancel={() => setShowAddForm(false)} 
        />
      )}

      <div className="summary-grid" style={{ marginTop: "16px" }}>
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

      {/* --- Campaign Summary Table --- */}
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
          legs={legs}
          onSelect={handleSelect}
        />
      </details>

      {/* --- Deleted campaigns section --- */}
      <section
        className="deleted-campaigns-section"
        style={{
          marginTop: 24,
          borderTop: "1px solid #e6e6e6",
          paddingTop: 16,
          background: "#fafafa"
        }}
      >
        <h4 style={{ marginTop: 0 }}>Deleted campaigns</h4>
        <p style={{
          marginTop: 0,
          marginBottom: 12,
          color: "#666",
          fontSize: 13
        }}>
          Deleted campaigns are local tombstones. Click Undelete to restore and push to the server.
        </p>

        <DeletedCampaigns
          onRestored={async (id) => {
            if (typeof reloadAll === "function") {
              try {
                await reloadAll();
              } catch (err) {
                console.warn("reloadAll failed after restore", err);
              }
            }
            if (typeof setSelectedCampaignId === "function") {
              setSelectedCampaignId(id);
              setActiveTab("campaigns");
            }
          }}
        />
      </section>
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
          <th>Total P/L</th>
        </tr>
      </thead>

      <tbody>
        {campaigns.map(c => {
          const legsForCampaign = legs.filter(l => l.campaignId === c.id);
          const summary = computeCampaignSummary(c, legsForCampaign);

          return (
            <tr key={c.id} onClick={() => onSelect(c.id)}>
              <td>{c.ticker}</td>
              <td>{fmtCampaignDaysLeft(c, legs)}</td>

              <td className={cashClass(summary.totalPL)}>
                {fmt(summary.totalPL)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}