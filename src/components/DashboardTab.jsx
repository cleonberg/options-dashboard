// DashboardTab.jsx
import React, { useState, useMemo } from "react";
import FilterBar from "./FilterBar.jsx";
import {
  fmt,
  fmtWholeDollars,
  cashClass,
  computeLegPL,
  computeDailyCashFlowSeries
} from "../logic/logic.js";
import OpenCampaignTable from "./OpenCampaignTable.jsx";
import ClosedCampaignTable from "./ClosedCampaignTable.jsx";
import PerformanceChart from "./PerformanceChart.jsx";
// import CashFlowChart from "./CashFlowChart.jsx";
import CombinedCashFlowChart from "./CombinedCashFlowChart.jsx";
import WeeklyCashFlowChart from "./WeeklyCashFlowChart.jsx";
import CombineCampaignsModal from "./CombineCampaignsModal.jsx";
import CampaignForm from "./CampaignForm.jsx";
import MarginChart from "./MarginChart.jsx";

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

      {/* Filters */}
      <div className="card">
        <FilterBar
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          startDateFilter={startDateFilter}
          setStartDateFilter={setStartDateFilter}
          endDateFilter={endDateFilter}
          setEndDateFilter={setEndDateFilter}
        />
      </div>

      {/* Metrics */}
      <div style={{ marginBottom: "24px" }}>
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
                  {fmtWholeDollars(displaySummary.netPL)}
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
                  {fmtWholeDollars(displaySummary.netCashFlow)}
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

          {/* Weekly Cash Flow Metrics */}
          <div className="summary-card">
            <div className="summary-card-metrics">
              <div className="summary-metric-item">
                <div className="summary-metric-label">
                  Net Cash Flow / Week
                </div>

                <div
                  className={`summary-metric-val ${cashClass(
                    filteredCashFlowWeekly.weekly
                  )}`}
                >
                  {fmtWholeDollars(filteredCashFlowWeekly.weekly)}
                </div>
              </div>

              <div className="summary-card-divider" />

              <div className="summary-metric-item">
                <div
                  className="summary-metric-label"
                  style={{ color: "#10b981" }}
                >
                  This Week's Cash Flow
                </div>

                <div
                  className={`summary-metric-val ${cashClass(
                    currentWeekPremium
                  )}`}
                >
                  {fmtWholeDollars(currentWeekPremium)}
                </div>
              </div>
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
            onClick={() => setActiveChart("margin")}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: "bold",
              borderRadius: "4px",
              cursor: "pointer",
              border: "1px solid",
              backgroundColor:
                activeChart === "margin"
                  ? "#1e293b"
                  : "transparent",
              borderColor:
                activeChart === "margin"
                  ? "#38bdf8"
                  : "#334155",
              color:
                activeChart === "margin"
                  ? "#38bdf8"
                  : "#94a3b8"
            }}
          >
            Margin
          </button>
        </div>
      </div>

      {activeChart === "cashflow" ? (
        <div className="cash-flow-charts-grid">
          <WeeklyCashFlowChart
            legs={searchFilteredLegs}
            campaigns={searchFilteredCampaigns}
            mode="dashboard"
            startDateFilter={startDateFilter}
            endDateFilter={endDateFilter}
          />

          <CombinedCashFlowChart
            legs={searchFilteredLegs}
            campaigns={searchFilteredCampaigns}
            mode="dashboard"
            startDateFilter={startDateFilter}
            endDateFilter={endDateFilter}
          />
        </div>
      ) : activeChart === "margin" ? (
        <MarginChart
          legs={searchFilteredLegs}
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