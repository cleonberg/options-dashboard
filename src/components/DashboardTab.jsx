// DashboardTab.jsx
import React, { useState, useMemo } from "react";
import { fmt, cashClass, computeCampaignSummary } from "../logic/logic.js";
import OpenCampaignTable from "./OpenCampaignTable.jsx";
import ClosedCampaignTable from "./ClosedCampaignTable.jsx";
import PerformanceChart from "./PerformanceChart.jsx";
import CashFlowChart from "./CashFlowChart.jsx";
import CombineCampaignsModal from "./CombineCampaignsModal.jsx";
import CampaignForm from "./CampaignForm.jsx";

function isSameId(idA, idB) {
  if (idA == null || idB == null) return false;
  return String(idA).trim().toLowerCase() === String(idB).trim().toLowerCase();
}

function toISODateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DashboardTab({
  uid,
  campaigns = [],
  legs = [],
  summary,
  onSelectCampaign,
  onAddCampaign,
  searchTerm = "",
  setSearchTerm,
  startDateFilter = "",
  setStartDateFilter,
  endDateFilter = "",
  setEndDateFilter
}) {
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [isAddingCampaign, setIsAddingCampaign] = useState(false);
  const [activeChart, setActiveChart] = useState("cashflow");

  const handleQuickFilter = (preset) => {
    const now = new Date();
    let start = "";
    let end = toISODateStr(now);

    if (preset === "thisWeek") {
      const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      start = toISODateStr(sunday);
    } else if (preset === "last30") {
      const d30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      start = toISODateStr(d30);
    } else if (preset === "thisMonth") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      start = toISODateStr(monthStart);
    } else if (preset === "ytd") {
      const ytdStart = new Date(now.getFullYear(), 0, 1);
      start = toISODateStr(ytdStart);
    } else if (preset === "all") {
      start = "";
      end = "";
    }

    if (setStartDateFilter) setStartDateFilter(start);
    if (setEndDateFilter) setEndDateFilter(end);
  };

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesTicker = String(c.ticker || "").toLowerCase().includes(term);

        const associatedLegs = legs.filter((l) => isSameId(l.campaignId, c.id));
        const matchesLeg = associatedLegs.some(
          (l) =>
            String(l.symbol || "").toLowerCase().includes(term) ||
            String(l.notes || "").toLowerCase().includes(term)
        );

        if (!matchesTicker && !matchesLeg) return false;
      }

      if (startDateFilter && c.startDate && c.startDate < startDateFilter) {
        return false;
      }
      if (endDateFilter && c.startDate && c.startDate > endDateFilter) {
        return false;
      }

      return true;
    });
  }, [campaigns, legs, searchTerm, startDateFilter, endDateFilter]);

  const open = useMemo(
    () => filteredCampaigns.filter((c) => c.status === "open"),
    [filteredCampaigns]
  );
  const closed = useMemo(
    () => filteredCampaigns.filter((c) => c.status === "closed"),
    [filteredCampaigns]
  );

  const displaySummary = useMemo(() => {
    if (!searchTerm.trim() && !startDateFilter && !endDateFilter) {
      return (
        summary || {
          netCredit: 0,
          openLegCount: 0,
          closedLegCount: 0,
          activeCampaigns: 0,
          closedCampaigns: 0,
        }
      );
    }

    const filteredIds = new Set(filteredCampaigns.map((c) => String(c.id).trim().toLowerCase()));
    const filteredLegs = legs.filter((l) =>
      filteredIds.has(String(l.campaignId).trim().toLowerCase())
    );

    const totalPL = filteredCampaigns.reduce((acc, c) => {
      const cLegs = legs.filter((l) => isSameId(l.campaignId, c.id));
      return acc + (computeCampaignSummary(c, cLegs).totalPL || 0);
    }, 0);

    return {
      netCredit: totalPL,
      openLegCount: filteredLegs.filter((l) => l.isOpen).length,
      closedLegCount: filteredLegs.filter((l) => !l.isOpen).length,
      activeCampaigns: open.length,
      closedCampaigns: closed.length,
    };
  }, [
    searchTerm,
    startDateFilter,
    endDateFilter,
    summary,
    filteredCampaigns,
    legs,
    open.length,
    closed.length,
  ]);

  const currentWeekPremium = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    
    let weekTotal = 0;

    legs.forEach((leg) => {
      const typeStr = String(leg.type || "").toLowerCase();
      const isStock = typeStr.includes("stock");
      const multiplier = isStock ? 1 : 100;
      const isSell = typeStr.includes("sell") || typeStr.includes("short");

      if (leg.openDate && leg.openPrice != null) {
        const oDate = new Date(leg.openDate);
        if (oDate >= startOfWeek) {
          const openVal = Number(leg.openPrice) * Number(leg.qty || 1) * multiplier;
          weekTotal += isSell ? openVal : -openVal;
        }
      }

      if (leg.closeDate && leg.closePrice != null && !leg.isOpen) {
        const cDate = new Date(leg.closeDate);
        if (cDate >= startOfWeek) {
          const closeVal = Number(leg.closePrice) * Number(leg.qty || 1) * multiplier;
          weekTotal += isSell ? -closeVal : closeVal;
        }
      }
    });

    return weekTotal;
  }, [legs]);

  if (!summary && campaigns.length === 0) {
    return <div className="card">Loading dashboard…</div>;
  }

  const hasActiveFilters = Boolean(searchTerm || startDateFilter || endDateFilter);

  return (
    <div className="dashboard-tab">
      
      {/* Top Action Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0 }}>Dashboard</h3>
      </div>

      {/* Search & Date Filter Bar */}
      <div style={{ marginBottom: "20px" }}>
        <div className="form-row" style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            className="input"
            placeholder="Filter ticker or symbol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: "100%", maxWidth: "220px", padding: "8px 12px" }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <label style={{ fontSize: "12px", color: "#9fb3ff", fontWeight: "bold" }}>From:</label>
            <input
              type="date"
              className="input"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              style={{ padding: "8px 12px" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <label style={{ fontSize: "12px", color: "#9fb3ff", fontWeight: "bold" }}>To:</label>
            <input
              type="date"
              className="input"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              style={{ padding: "8px 12px" }}
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="secondary"
              onClick={() => handleQuickFilter("all")}
              style={{ padding: "8px 12px", cursor: "pointer" }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Quick Presets */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "#9fb3ff", fontWeight: "bold" }}>Quick Presets:</span>
          <button type="button" className="secondary" onClick={() => handleQuickFilter("thisWeek")} style={{ padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>This Week</button>
          <button type="button" className="secondary" onClick={() => handleQuickFilter("last30")} style={{ padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>Last 30 Days</button>
          <button type="button" className="secondary" onClick={() => handleQuickFilter("thisMonth")} style={{ padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>This Month</button>
          <button type="button" className="secondary" onClick={() => handleQuickFilter("ytd")} style={{ padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>YTD</button>
          <button type="button" className="secondary" onClick={() => handleQuickFilter("all")} style={{ padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>All Time</button>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "12px", color: "#9fb3ff", marginBottom: "8px", fontWeight: "bold" }}>
          {hasActiveFilters ? "Metrics (Filtered):" : "All Campaigns Metrics:"}
        </div>

        <div className="summary-grid-cards">
          <div className="summary-card">
            <div className="summary-card-title">Net P&L</div>
            <div className={`summary-metric-val ${cashClass(displaySummary.netCredit)}`}>
              {fmt(displaySummary.netCredit)}
            </div>
          </div>

          <div className="summary-card" style={{ border: "1px solid #10b981", boxShadow: "0 0 8px rgba(16, 185, 129, 0.15)" }}>
            <div className="summary-card-title" style={{ color: "#10b981" }}>This Week's Net Premium</div>
            <div className={`summary-metric-val ${cashClass(currentWeekPremium)}`}>
              {fmt(currentWeekPremium)}
            </div>
          </div>

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

      {/* Performance Overview Chart Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", marginTop: "24px" }}>
        <h3 style={{ color: "#9fb3ff", margin: 0 }}>Performance Overview</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setActiveChart("cashflow")}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: "bold",
              borderRadius: "4px",
              cursor: "pointer",
              border: "1px solid",
              backgroundColor: activeChart === "cashflow" ? "#1e293b" : "transparent",
              borderColor: activeChart === "cashflow" ? "#38bdf8" : "#334155",
              color: activeChart === "cashflow" ? "#38bdf8" : "#94a3b8",
            }}
          >
            Net Premium (Live)
          </button>
          
          <button
            onClick={() => setActiveChart("pl")}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: "bold",
              borderRadius: "4px",
              cursor: "pointer",
              border: "1px solid",
              backgroundColor: activeChart === "pl" ? "#1e293b" : "transparent",
              borderColor: activeChart === "pl" ? "#38bdf8" : "#334155",
              color: activeChart === "pl" ? "#38bdf8" : "#94a3b8",
            }}
          >
            Closed P/L
          </button>
        </div>
      </div>

      {activeChart === "cashflow" ? (
        <CashFlowChart
          legs={legs}
          mode="dashboard"
          startDateFilter={startDateFilter}
          endDateFilter={endDateFilter}
        />
      ) : (
        <PerformanceChart closedCampaigns={closed} legs={legs} mode="dashboard" />
      )}

      {/* Active Campaigns Section */}
      <section style={{ marginBottom: "24px", marginTop: "24px" }}>
        
        {/* Section Header with Action Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ color: "#9fb3ff", margin: 0 }}>Active Campaigns ({open.length})</h3>
          
          <div style={{ display: "flex", gap: "12px" }}>
            <button 
              onClick={() => {
                setIsAddingCampaign(!isAddingCampaign);
                if (!isAddingCampaign) setShowCombineModal(false); // Close combine if open
              }}
              style={{ 
                backgroundColor: isAddingCampaign ? "transparent" : "#3182ce",
                border: isAddingCampaign ? "1px solid #9fb3ff" : "none",
                color: isAddingCampaign ? "#9fb3ff" : "#fff",
                padding: "6px 12px",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              {isAddingCampaign ? "Cancel" : "+ Add Campaign"}
            </button>

            <button
              onClick={() => {
                setShowCombineModal(!showCombineModal);
                if (!showCombineModal) setIsAddingCampaign(false); // Close add campaign if open
              }}
              style={{ 
                padding: "6px 12px", 
                backgroundColor: showCombineModal ? "transparent" : "#ffc107", 
                color: showCombineModal ? "#ffc107" : "#000", 
                border: showCombineModal ? "1px solid #ffc107" : "none", 
                borderRadius: "4px", 
                cursor: "pointer", 
                fontWeight: "bold" 
              }}
            >
              {showCombineModal ? "Cancel" : "Combine Campaigns"}
            </button>
          </div>
        </div>

        {/* Animated Expandable Add Campaign Form */}
        <div className={`add-leg-wrapper ${isAddingCampaign ? "open" : ""}`}>
          <div className="add-leg-content">
            <div style={{ paddingBottom: "24px" }}>
              <CampaignForm 
                onSubmit={(campaignData) => {
                  if (onAddCampaign) onAddCampaign(campaignData); 
                  setIsAddingCampaign(false); 
                }}
                onCancel={() => setIsAddingCampaign(false)}
              />
            </div>
          </div>
        </div>

        {/* Animated Expandable Combine Campaigns Modal */}
        <div className={`add-leg-wrapper ${showCombineModal ? "open" : ""}`}>
          <div className="add-leg-content">
            <div style={{ paddingBottom: "24px" }}>
              <CombineCampaignsModal
                campaigns={campaigns}
                uid={uid}
                onClose={() => setShowCombineModal(false)}
              />
            </div>
          </div>
        </div>

        <OpenCampaignTable campaigns={open} legs={legs} onSelect={onSelectCampaign} />
      </section>

      {/* Closed Campaigns Section */}
      <section>
        <h3 style={{ color: "#9fb3ff" }}>Closed Campaigns ({closed.length})</h3>
        <ClosedCampaignTable campaigns={closed} legs={legs} onSelect={onSelectCampaign} />
      </section>
    </div>
  );
}