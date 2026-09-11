import React, { useState, useMemo } from "react";
import { fmt, cashClass, computeCampaignSummary } from "../logic/logic.js";
import OpenCampaignTable from "./OpenCampaignTable.jsx";
import ClosedCampaignTable from "./ClosedCampaignTable.jsx";
import PerformanceChart from "./PerformanceChart.jsx";

export default function DashboardTab({ campaigns, legs, summary, onSelectCampaign }) {
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
    if (!searchTerm.trim()) return summary;

    const filteredIds = new Set(filteredCampaigns.map(c => c.id));
    const filteredLegs = legs.filter(l => filteredIds.has(l.campaignId));

    const totalPL = filteredCampaigns.reduce((acc, c) => {
      const cLegs = legs.filter(l => l.campaignId === c.id);
      return acc + (computeCampaignSummary(c, cLegs).totalPL || 0);
    }, 0);

    const startDates = filteredCampaigns.map(c => c.startDate).filter(Boolean).sort();
    const endDates = filteredCampaigns.map(c => c.endDate).filter(Boolean).sort();

    return {
      netCredit: totalPL,
      openLegCount: filteredLegs.filter(l => l.isOpen).length,
      closedLegCount: filteredLegs.filter(l => !l.isOpen).length,
      activeCampaigns: open.length,
      closedCampaigns: closed.length,
    };
  }, [searchTerm, summary, filteredCampaigns, legs, open.length, closed.length]);

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
            width: "250px"
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
            <div className={`${cashClass(displaySummary.netCredit)} summary-card-value`}>
              {fmt(displaySummary.netCredit)}
            </div>
          </div>

          {/* Card 2: Active Summary */}
          <div className="summary-card">
            <div className="summary-card-title">Active Summary</div>
            <div className="summary-card-metrics">
              <div className="summary-metric-item">
                <div className="summary-metric-label">Open Campaigns</div>
                <div className="summary-metric-val">{displaySummary.activeCampaigns}</div>
              </div>
              <div className="summary-card-divider" />
              <div className="summary-metric-item">
                <div className="summary-metric-label">Open Legs</div>
                <div className="summary-metric-val">{displaySummary.openLegCount}</div>
              </div>
            </div>
          </div>

          {/* Card 3: Closed Summary */}
          <div className="summary-card">
            <div className="summary-card-title">Closed Summary</div>
            <div className="summary-card-metrics">
              <div className="summary-metric-item">
                <div className="summary-metric-label">Closed Campaigns</div>
                <div className="summary-metric-val">{displaySummary.closedCampaigns}</div>
              </div>
              <div className="summary-card-divider" />
              <div className="summary-metric-item">
                <div className="summary-metric-label">Closed Legs</div>
                <div className="summary-metric-val">{displaySummary.closedLegCount}</div>
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
        <OpenCampaignTable campaigns={open} legs={legs} onSelect={onSelectCampaign} />
      </section>

      {/* Closed Campaigns */}
      <section>
        <h3 style={{ color: "#9fb3ff" }}>Closed Campaigns ({closed.length})</h3>
        <ClosedCampaignTable campaigns={closed} legs={legs} onSelect={onSelectCampaign} />
      </section>
    </div>
  );
}