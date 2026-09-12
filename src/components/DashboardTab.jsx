import React, { useState, useMemo, useEffect } from "react";
import { fmt, cashClass, computeCampaignSummary } from "../logic/logic.js";
import { createCampaign } from "../sync/sync.js";
import OpenCampaignTable from "./OpenCampaignTable.jsx";
import ClosedCampaignTable from "./ClosedCampaignTable.jsx";
import PerformanceChart from "./PerformanceChart.jsx";

export default function DashboardTab({ uid, campaigns = [], legs = [], summary, onSelectCampaign }) {
  const [searchTerm, setSearchTerm] = useState("");

  // Filter campaigns by search term
  const filteredCampaigns = useMemo(() => {
    if (!searchTerm.trim()) return campaigns;
    const term = searchTerm.toLowerCase().trim();
    return campaigns.filter(c => c.ticker?.toLowerCase().includes(term));
  }, [campaigns, searchTerm]);

  const open = useMemo(() => filteredCampaigns.filter(c => c.status === "open"), [filteredCampaigns]);
  const closed = useMemo(() => filteredCampaigns.filter(c => c.status === "closed"), [filteredCampaigns]);

  // Dynamic summary calculation
  const displaySummary = useMemo(() => {
    if (!searchTerm.trim()) return summary || { netCredit: 0, openLegCount: 0, closedLegCount: 0, activeCampaigns: 0, closedCampaigns: 0 };

    const filteredIds = new Set(filteredCampaigns.map(c => c.id));
    const filteredLegs = legs.filter(l => filteredIds.has(l.campaignId));

    const totalPL = filteredCampaigns.reduce((acc, c) => {
      const cLegs = legs.filter(l => l.campaignId === c.id);
      return acc + (computeCampaignSummary(c, cLegs).totalPL || 0);
    }, 0);

    return {
      netCredit: totalPL,
      openLegCount: filteredLegs.filter(l => l.isOpen).length,
      closedLegCount: filteredLegs.filter(l => !l.isOpen).length,
      activeCampaigns: open.length,
      closedCampaigns: closed.length,
    };
  }, [searchTerm, summary, filteredCampaigns, legs, open.length, closed.length]);

  // Initial loading fallback
  if (!summary && campaigns.length === 0) {
    return <div className="card">Loading dashboard…</div>;
  }

  // Add this right above your component:
  function isSameId(idA, idB) {
    if (idA == null || idB == null) return false;
    return String(idA).trim().toLowerCase() === String(idB).trim().toLowerCase();
  }

  // Add temporarily in DashboardTab.jsx to inspect your state:
  useEffect(() => {
    campaigns.forEach((c) => {
      const matched = legs.filter((l) => isSameId(l.campaignId, c.id));
      console.log(`Campaign ${c.ticker} (ID: ${c.id}, Type: ${typeof c.id}): Found ${matched.length} legs`);
      
      if (matched.length === 0 && legs.length > 0) {
        console.warn(`Mismatch sample leg campaignId:`, legs[0]?.campaignId, `Type:`, typeof legs[0]?.campaignId);
      }
    });
  }, [campaigns, legs]);

  return (
    <div className="dashboard-tab">
      {/* Search Input */}
      <div style={{ marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="Filter by ticker..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #24345f",
            background: "#111f3f",
            color: "#fff",
            width: "100%",
            maxWidth: "250px",
            boxSizing: "border-box"
          }}
        />
      </div>

      {/* Top Metrics Grid */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "12px", color: "#9fb3ff", marginBottom: "8px", fontWeight: "bold" }}>
          {searchTerm ? `Metrics filtered by "${searchTerm.toUpperCase()}":` : "All Campaigns Metrics:"}
        </div>

        <div className="summary-grid-cards">
          {/* Card 1: Net Credit */}
          <div className="summary-card">
            <div className="summary-card-title">Total Net Credit</div>
            <div className={`${cashClass(displaySummary?.netCredit)} summary-card-value`}>
              {fmt(displaySummary?.netCredit || 0)}
            </div>
          </div>

          {/* Card 2: Active Summary */}
          <div className="summary-card">
            <div className="summary-card-title">Active Summary</div>
            <div className="summary-card-metrics">
              <div className="summary-metric-item">
                <div className="summary-metric-label">Open Campaigns</div>
                <div className="summary-metric-val">{displaySummary?.activeCampaigns || 0}</div>
              </div>
              <div className="summary-card-divider" />
              <div className="summary-metric-item">
                <div className="summary-metric-label">Open Legs</div>
                <div className="summary-metric-val">{displaySummary?.openLegCount || 0}</div>
              </div>
            </div>
          </div>

          {/* Card 3: Closed Summary */}
          <div className="summary-card">
            <div className="summary-card-title">Closed Summary</div>
            <div className="summary-card-metrics">
              <div className="summary-metric-item">
                <div className="summary-metric-label">Closed Campaigns</div>
                <div className="summary-metric-val">{displaySummary?.closedCampaigns || 0}</div>
              </div>
              <div className="summary-card-divider" />
              <div className="summary-metric-item">
                <div className="summary-metric-label">Closed Legs</div>
                <div className="summary-metric-val">{displaySummary?.closedLegCount || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Standalone Performance Chart */}
      <PerformanceChart closedCampaigns={closed} legs={legs} />

      {/* Open Campaigns */}
      <section style={{ marginBottom: "24px" }}>
        <h3 style={{ color: "#9fb3ff" }}>Active Campaigns ({open.length})</h3>
        <OpenCampaignTable campaigns={open} legs={legs} onSelect={onSelectCampaign} onAddCampaign={(newCampaignData) => {createCampaign(uid, newCampaignData);}}/>
      </section>

      {/* Closed Campaigns */}
      <section>
        <h3 style={{ color: "#9fb3ff" }}>Closed Campaigns ({closed.length})</h3>
        <ClosedCampaignTable campaigns={closed} legs={legs} onSelect={onSelectCampaign} />
      </section>
    </div>
  );
}