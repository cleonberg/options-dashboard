// DashboardTab.jsx
import React, { useState, useMemo } from "react";
import {
  fmt,
  cashClass,
  computeLegPL,
  computeDailyCashFlowSeries
} from "../logic/logic.js";
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

function getDateOnly(value) {
  if (value == null || value === "") return "";

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  const str = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d+$/.test(str)) {
    const d = new Date(Number(str));
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }

  return "";
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
      start = toISODateStr(
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - now.getDay()
        )
      );
    } else if (preset === "last30") {
      start = toISODateStr(
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 30
        )
      );
    } else if (preset === "thisMonth") {
      start = toISODateStr(
        new Date(now.getFullYear(), now.getMonth(), 1)
      );
    } else if (preset === "ytd") {
      start = toISODateStr(new Date(now.getFullYear(), 0, 1));
    } else if (preset === "all") {
      start = "";
      end = "";
    }

    setStartDateFilter?.(start);
    setEndDateFilter?.(end);
  };

  // Search filter only. Date filters are applied to transaction dates below.
  const searchFilteredCampaigns = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return campaigns;

    return campaigns.filter((c) => {
      if (
        String(c.ticker || "")
          .toLowerCase()
          .includes(term)
      ) {
        return true;
      }

      return legs
        .filter((l) => isSameId(l.campaignId, c.id))
        .some((l) =>
          [l.symbol, l.notes, l.description]
            .filter(Boolean)
            .some((value) =>
              String(value).toLowerCase().includes(term)
            )
        );
    });
  }, [campaigns, legs, searchTerm]);

  // Campaign filtering used by the tables.
  const filteredCampaigns = useMemo(() => {
    return searchFilteredCampaigns.filter((campaign) => {
      const startDate = getDateOnly(campaign.startDate);
      const endDate = getDateOnly(campaign.endDate);

      // No date filter
      if (!startDateFilter && !endDateFilter) {
        return true;
      }

      // Campaign starts after the selected period
      if (endDateFilter && startDate && startDate > endDateFilter) {
        return false;
      }

      // Campaign ended before the selected period
      if (startDateFilter && endDate && endDate < startDateFilter) {
        return false;
      }

      return true;
    });
  }, [
    searchFilteredCampaigns,
    startDateFilter,
    endDateFilter,
  ]);

  const open = useMemo(
    () => filteredCampaigns.filter((c) => c.status === "open"),
    [filteredCampaigns]
  );

  const closed = useMemo(
    () => filteredCampaigns.filter((c) => c.status === "closed"),
    [filteredCampaigns]
  );

  // Legs used for transaction-level metrics. Search applies, campaign
  // startDate does not.
  const searchFilteredLegs = useMemo(() => {
    const filteredIds = new Set(
      searchFilteredCampaigns.map((c) =>
        String(c.id).trim().toLowerCase()
      )
    );

    return legs.filter((leg) =>
      filteredIds.has(
        String(leg.campaignId || "").trim().toLowerCase()
      )
    );
  }, [searchFilteredCampaigns, legs]);

  // Realized P/L = closed-leg P/L based on closeDate.
  const filteredNetPL = useMemo(() => {
    return searchFilteredLegs.reduce((total, leg) => {
      if (leg.isOpen) return total;

      const closeDate = getDateOnly(leg.closeDate);
      if (!closeDate) return total;
      if (startDateFilter && closeDate < startDateFilter) return total;
      if (endDateFilter && closeDate > endDateFilter) return total;

      const pl = computeLegPL(leg);
      return pl == null ? total : total + Number(pl);
    }, 0);
  }, [searchFilteredLegs, startDateFilter, endDateFilter]);

  // Total net cash flow for the selected date range.
  // Uses the same cash-flow engine as the other cash-flow metrics.
  const filteredNetCashFlow = useMemo(() => {
    const dailySeries = computeDailyCashFlowSeries(
      searchFilteredLegs,
      searchFilteredCampaigns
    );

    return dailySeries
      .filter((day) => {
        if (startDateFilter && day.date < startDateFilter) return false;
        if (endDateFilter && day.date > endDateFilter) return false;
        return true;
      })
      .reduce(
        (sum, day) => sum + Number(day.netCashFlow || 0),
        0
      );
  }, [
    searchFilteredLegs,
    searchFilteredCampaigns,
    startDateFilter,
    endDateFilter
  ]);

  const displaySummary = useMemo(() => {
    const filteredLegs = legs.filter((leg) =>
      filteredCampaigns.some((c) =>
        isSameId(leg.campaignId, c.id)
      )
    );

    return {
      netPL: filteredNetPL,
      netCashFlow: filteredNetCashFlow,
      openLegCount: filteredLegs.filter((l) => l.isOpen).length,
      closedLegCount: filteredLegs.filter((l) => !l.isOpen).length,
      activeCampaigns: open.length,
      closedCampaigns: closed.length
    };
  }, [
    legs,
    filteredCampaigns,
    filteredNetPL,
    filteredNetCashFlow,
    open.length,
    closed.length
  ]);

  // Net Cash Flow / Week.
  const filteredCashFlowWeekly = useMemo(() => {
    const dailySeries = computeDailyCashFlowSeries(
      searchFilteredLegs,
      searchFilteredCampaigns
    );

    const filteredDays = dailySeries.filter((day) => {
      if (startDateFilter && day.date < startDateFilter) return false;
      if (endDateFilter && day.date > endDateFilter) return false;
      return true;
    });

    if (!filteredDays.length) {
      return { weekly: 0, total: 0, weeks: 0 };
    }

    const firstDate = startDateFilter || filteredDays[0].date;
    const lastDate =
      endDateFilter ||
      filteredDays[filteredDays.length - 1].date;

    const start = new Date(`${firstDate}T00:00:00`);
    const end = new Date(`${lastDate}T00:00:00`);

    const days = Math.max(
      1,
      Math.round((end - start) / 86400000) + 1
    );

    const weeks = days / 7;

    const total = filteredDays.reduce(
      (sum, day) => sum + Number(day.netCashFlow || 0),
      0
    );

    return {
      weekly: total / weeks,
      total,
      weeks
    };
  }, [
    searchFilteredLegs,
    searchFilteredCampaigns,
    startDateFilter,
    endDateFilter
  ]);

  // This week's net premium.
  const currentWeekPremium = useMemo(() => {
    const now = new Date();

    const startDate = toISODateStr(
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - now.getDay()
      )
    );

    const endDate = toISODateStr(now);

    return computeDailyCashFlowSeries(legs, campaigns)
      .filter(
        (day) =>
          day.date >= startDate &&
          day.date <= endDate
      )
      .reduce(
        (sum, day) => sum + Number(day.netCashFlow || 0),
        0
      );
  }, [legs, campaigns]);

  if (!summary && campaigns.length === 0) {
    return <div className="card">Loading dashboard…</div>;
  }

  const hasActiveFilters = Boolean(
    searchTerm || startDateFilter || endDateFilter
  );

  return (
    <div className="dashboard-tab">

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px"
        }}
      >
        <h3 style={{ margin: 0 }}>Dashboard</h3>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: "20px" }}>
        <div
          className="form-row"
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center"
          }}
        >
          <input
            type="text"
            className="input"
            placeholder="Filter ticker or symbol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              maxWidth: "220px",
              padding: "8px 12px"
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <label
              style={{
                fontSize: "12px",
                color: "#9fb3ff",
                fontWeight: "bold"
              }}
            >
              From:
            </label>

            <input
              type="date"
              className="input"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              style={{ padding: "8px 12px" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <label
              style={{
                fontSize: "12px",
                color: "#9fb3ff",
                fontWeight: "bold"
              }}
            >
              To:
            </label>

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
              style={{
                padding: "8px 12px",
                cursor: "pointer"
              }}
            >
              Clear Filters
            </button>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginTop: "10px",
            flexWrap: "wrap"
          }}
        >
          <span
            style={{
              fontSize: "12px",
              color: "#9fb3ff",
              fontWeight: "bold"
            }}
          >
            Quick Presets:
          </span>

          {[
            ["thisWeek", "This Week"],
            ["last30", "Last 30 Days"],
            ["thisMonth", "This Month"],
            ["ytd", "YTD"],
            ["all", "All Time"]
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="secondary"
              onClick={() => handleQuickFilter(value)}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            fontSize: "12px",
            color: "#9fb3ff",
            marginBottom: "8px",
            fontWeight: "bold"
          }}
        >
          {hasActiveFilters
            ? "Metrics (Filtered):"
            : "All Transactions Metrics:"}
        </div>

        <div className="summary-grid-cards">

          {/* Transaction Summary */}
          <div className="summary-card">
            {/* <div className="summary-card-title">
              Transaction Summary
            </div> */}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginTop: "0px"
              }}
            >
              <div>
                <div
                  className="summary-metric-label"
                  style={{ marginBottom: "4px" }}
                >
                  Realized Net P/L
                </div>

                <div
                  className={`summary-metric-val ${cashClass(
                    displaySummary.netPL
                  )}`}
                >
                  {fmt(displaySummary.netPL)}
                </div>

                {/* <div
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    marginTop: "4px"
                  }}
                >
                  Closed legs
                </div> */}
              </div>

              <div
                style={{
                  borderLeft: "1px solid #334155",
                  paddingLeft: "16px"
                }}
              >
                <div
                  className="summary-metric-label"
                  style={{ marginBottom: "4px" }}
                >
                  Net Cash Flow
                </div>

                <div
                  className={`summary-metric-val ${cashClass(
                    displaySummary.netCashFlow
                  )}`}
                >
                  {fmt(displaySummary.netCashFlow)}
                </div>

                {/* <div
                  style={{
                    fontSize: "10px",
                    color: "#64748b",
                    marginTop: "4px"
                  }}
                >
                  Selected date range
                </div> */}
              </div>
            </div>
          </div>

          {/* Net Cash Flow / Week */}
          <div className="summary-card">
            <div className="summary-card-title">
              Net Cash Flow / Week
            </div>

            <div
              className={`summary-metric-val ${cashClass(
                filteredCashFlowWeekly.weekly
              )}`}
            >
              {fmt(filteredCashFlowWeekly.weekly)}
            </div>
          </div>

          {/* This Week's Net Premium */}
          <div
            className="summary-card"
            style={{
              border: "1px solid #10b981",
              boxShadow: "0 0 8px rgba(16, 185, 129, 0.15)"
            }}
          >
            <div
              className="summary-card-title"
              style={{ color: "#10b981" }}
            >
              This Week's Net Premium
            </div>

            <div
              className={`summary-metric-val ${cashClass(
                currentWeekPremium
              )}`}
            >
              {fmt(currentWeekPremium)}
            </div>
          </div>

        </div>
      </div>

      {/* Performance Overview */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
          marginTop: "24px"
        }}
      >
        <h3 style={{ color: "#9fb3ff", margin: 0 }}>
          Performance Overview
        </h3>

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
              backgroundColor:
                activeChart === "cashflow"
                  ? "#1e293b"
                  : "transparent",
              borderColor:
                activeChart === "cashflow"
                  ? "#38bdf8"
                  : "#334155",
              color:
                activeChart === "cashflow"
                  ? "#38bdf8"
                  : "#94a3b8"
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
              backgroundColor:
                activeChart === "pl"
                  ? "#1e293b"
                  : "transparent",
              borderColor:
                activeChart === "pl"
                  ? "#38bdf8"
                  : "#334155",
              color:
                activeChart === "pl"
                  ? "#38bdf8"
                  : "#94a3b8"
            }}
          >
            Closed P/L
          </button>
        </div>
      </div>

      {activeChart === "cashflow" ? (
        <CashFlowChart
          legs={legs}
          campaigns={campaigns}
          mode="dashboard"
          startDateFilter={startDateFilter}
          endDateFilter={endDateFilter}
        />
      ) : (
        <PerformanceChart
          closedCampaigns={closed}
          legs={legs}
          mode="dashboard"
        />
      )}

      {/* Active Campaigns */}
      <section
        style={{
          marginBottom: "24px",
          marginTop: "24px"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px"
          }}
        >
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => {
                setIsAddingCampaign(!isAddingCampaign);
                if (!isAddingCampaign) {
                  setShowCombineModal(false);
                }
              }}
              style={{
                backgroundColor: isAddingCampaign
                  ? "transparent"
                  : "#3182ce",
                border: isAddingCampaign
                  ? "1px solid #9fb3ff"
                  : "none",
                color: isAddingCampaign
                  ? "#9fb3ff"
                  : "#fff",
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
                if (!showCombineModal) {
                  setIsAddingCampaign(false);
                }
              }}
              style={{
                padding: "6px 12px",
                backgroundColor: showCombineModal
                  ? "transparent"
                  : "#ffc107",
                color: showCombineModal ? "#ffc107" : "#000",
                border: showCombineModal
                  ? "1px solid #ffc107"
                  : "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              {showCombineModal ? "Cancel" : "Combine Campaigns"}
            </button>
          </div>
        </div>

        <div
          className={`add-leg-wrapper ${
            isAddingCampaign ? "open" : ""
          }`}
        >
          <div className="add-leg-content">
            <div style={{ paddingBottom: "24px" }}>
              <CampaignForm
                onSubmit={(campaignData) => {
                  onAddCampaign?.(campaignData);
                  setIsAddingCampaign(false);
                }}
                onCancel={() => setIsAddingCampaign(false)}
              />
            </div>
          </div>
        </div>

        <div
          className={`add-leg-wrapper ${
            showCombineModal ? "open" : ""
          }`}
        >
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

        <div className="summary-card">
          <h3 style={{ color: "#9fb3ff", margin: 0 }}>
            Active Campaigns
          </h3>

          <div className="summary-card-metrics">
            <div className="summary-metric-item">
              <div className="summary-metric-label">
                Open Campaigns
              </div>
              <div className="summary-metric-val">
                {displaySummary.activeCampaigns}
              </div>
            </div>

            <div className="summary-card-divider" />

            <div className="summary-metric-item">
              <div className="summary-metric-label">
                Open Legs
              </div>
              <div className="summary-metric-val">
                {displaySummary.openLegCount}
              </div>
            </div>
          </div>
        </div>

        <OpenCampaignTable
          campaigns={open}
          legs={legs}
          onSelect={onSelectCampaign}
        />
      </section>

      {/* Closed Campaigns */}
      <section>
        <div className="summary-card">
          <h3 style={{ color: "#9fb3ff", margin: 0 }}>
            Closed Campaigns
          </h3>

          <div className="summary-card-metrics">
            <div className="summary-metric-item">
              <div className="summary-metric-label">
                Closed Campaigns
              </div>
              <div className="summary-metric-val">
                {displaySummary.closedCampaigns}
              </div>
            </div>

            <div className="summary-card-divider" />

            <div className="summary-metric-item">
              <div className="summary-metric-label">
                Closed Legs
              </div>
              <div className="summary-metric-val">
                {displaySummary.closedLegCount}
              </div>
            </div>
          </div>
        </div>

        <ClosedCampaignTable
          campaigns={closed}
          legs={legs}
          onSelect={onSelectCampaign}
        />
      </section>
    </div>
  );
}