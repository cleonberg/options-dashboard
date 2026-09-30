// DashboardTab.jsx
import React, { lazy, Suspense, useState, useMemo } from "react";
import FilterBar from "./FilterBar.jsx";
import {
  fmtWholeDollars,
  cashClass,
  computeLegPL,
  computeDailyCashFlowSeries,
  computeMarginHistorySeries,
  computeCampaignProjectedPL,
  computeMarginEstimate,
  computeAROM,
  getCampaignDuration
} from "../logic/logic.js";

import OpenCampaignTable from "./OpenCampaignTable.jsx";
import ClosedCampaignTable from "./ClosedCampaignTable.jsx";
import PerformanceChart from "./PerformanceChart.jsx";
import CombinedCashFlowChart from "./CombinedCashFlowChart.jsx";
import WeeklyCashFlowChart from "./WeeklyCashFlowChart.jsx";
import CombineCampaignsModal from "./CombineCampaignsModal.jsx";
import CampaignForm from "./CampaignForm.jsx";
const MarginChart = lazy(() => import("./MarginChart.jsx"));

function normalizeId(id) {
  return id == null ? null : String(id).trim().toLowerCase();
}

function isSameId(idA, idB) {
  const normalizedA = normalizeId(idA);
  return normalizedA !== null && normalizedA === normalizeId(idB);
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

  const legsByCampaign = useMemo(() => {
    const map = new Map();

    for (const leg of legs) {
      const campaignId = normalizeId(leg.campaignId);
      if (campaignId === null) continue;

      const campaignLegs = map.get(campaignId);
      if (campaignLegs) {
        campaignLegs.push(leg);
      } else {
        map.set(campaignId, [leg]);
      }
    }

    return map;
  }, [legs]);

  // Search filter only. Date filters are applied to transaction dates below.
  const searchFilteredCampaigns = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return campaigns;
  
    return campaigns.filter((campaign) => {
      const matchesCampaign = [campaign.name, campaign.ticker]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
  
      if (matchesCampaign) return true;
  
      const campaignId = normalizeId(campaign.id);
      if (campaignId === null) return false;
  
      const campaignLegs = legsByCampaign.get(campaignId) || [];
      return campaignLegs.some((leg) =>
        [leg.symbol, leg.notes, leg.description]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      );
    });
  }, [campaigns, legsByCampaign, searchTerm]);

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

  const peakMarginByCampaign = useMemo(() => {
    const peaks = new Map();

    for (const day of computeMarginHistorySeries(legs)) {
      for (const [campaignId, margin] of Object.entries(day.byCampaign)) {
        const value = Number(margin);
        if (!Number.isFinite(value)) continue;

        peaks.set(
          String(campaignId),
          Math.max(peaks.get(String(campaignId)) ?? 0, value)
        );
      }
    }

    return peaks;
  }, [legs]);

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

  const dashboardDailyCashFlowSeries = useMemo(
    () =>
      computeDailyCashFlowSeries(
        searchFilteredLegs,
        searchFilteredCampaigns
      ),
    [searchFilteredLegs, searchFilteredCampaigns]
  );

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
    return dashboardDailyCashFlowSeries
      .filter((day) => {
        if (startDateFilter && day.date < startDateFilter) return false;
        if (endDateFilter && day.date > endDateFilter) return false;
        return true;
      })
      .reduce(
        (sum, day) => sum + Number(day.netCashFlow || 0),
        0
      );
  }, [dashboardDailyCashFlowSeries, startDateFilter, endDateFilter]);

  const topMetrics = useMemo(() => {
    const openCampaignIds = new Set(
      open.map((campaign) => normalizeId(campaign.id))
    );
  
    const openLegs = legs.filter(
      (leg) => leg.isOpen && openCampaignIds.has(normalizeId(leg.campaignId))
    );
  
    const totalMargin = computeMarginEstimate(openLegs).total;
    const unrealizedPL = computeCampaignProjectedPL(openLegs);
  
    let weightedAromTotal = 0;
    let aromMarginTotal = 0;
  
    for (const campaign of open) {
      const campaignId = String(campaign.id);
      const campaignLegs = legsByCampaign.get(normalizeId(campaign.id)) || [];
      const margin = peakMarginByCampaign.get(campaignId) ?? 0;
      const projectedPL = computeCampaignProjectedPL(campaignLegs, campaign);
      const durationDays = getCampaignDuration(campaignLegs, campaign);
      const arom = computeAROM(projectedPL, margin, durationDays);
  
      if (arom != null && margin > 0) {
        weightedAromTotal += arom * margin;
        aromMarginTotal += margin;
      }
    }
  
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const today = toISODateStr(new Date());
  
    const realizedPLYTD = searchFilteredLegs.reduce((total, leg) => {
      if (leg.isOpen) return total;
  
      const closeDate = getDateOnly(leg.closeDate);
      if (!closeDate || closeDate < yearStart || closeDate > today) {
        return total;
      }
  
      return total + (computeLegPL(leg) ?? 0);
    }, 0);
  
    return {
      totalMargin,
      unrealizedPL,
      weightedArom:
        aromMarginTotal > 0 ? weightedAromTotal / aromMarginTotal : null,
      realizedPLYTD
    };
  }, [
    open,
    legs,
    legsByCampaign,
    peakMarginByCampaign,
    searchFilteredLegs
  ]);

  const displaySummary = useMemo(() => {
    const filteredCampaignIds = new Set(
      filteredCampaigns
        .map((campaign) => normalizeId(campaign.id))
        .filter((campaignId) => campaignId !== null)
    );

    const filteredLegs = legs.filter((leg) => {
      const campaignId = normalizeId(leg.campaignId);
      return campaignId !== null && filteredCampaignIds.has(campaignId);
    });

    return {
      netPL: filteredNetPL,
      netCashFlow: filteredNetCashFlow,
      openLegCount: filteredLegs.filter((leg) => leg.isOpen).length,
      closedLegCount: filteredLegs.filter((leg) => !leg.isOpen).length,
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

  const campaignPnlTotal =
    displaySummary.netPL + topMetrics.unrealizedPL; 

  // Net Cash Flow / Week.
  const filteredCashFlowWeekly = useMemo(() => {
    const filteredDays = dashboardDailyCashFlowSeries.filter((day) => {
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
    dashboardDailyCashFlowSeries,
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
      <div className="card filter-card">
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
          <div className="summary-card">
            <h3 className="summary-card-title">Campaign P&amp;L</h3>
            <div className="summary-card-metrics summary-card-metrics--three">
              <div className="summary-metric-item">
                <div className="summary-metric-label">Realized P&amp;L</div>
                <div className={`summary-metric-val ${cashClass(displaySummary.netPL)}`}>
                  {fmtWholeDollars(displaySummary.netPL)}
                </div>
              </div>
              <div className="summary-card-divider" />
              <div className="summary-metric-item">
                <div className="summary-metric-label">Projected Open P&amp;L</div>
                <div className={`summary-metric-val ${cashClass(topMetrics.unrealizedPL)}`}>
                  {fmtWholeDollars(topMetrics.unrealizedPL)}
                </div>
              </div>
              <div className="summary-card-divider" />
              <div className="summary-metric-item">
                <div className="summary-metric-label">Combined</div>
                <div className={`summary-metric-val ${cashClass(campaignPnlTotal)}`}>
                  {fmtWholeDollars(campaignPnlTotal)}
                </div>
              </div>
            </div>
          </div>

          <div className="summary-card">
            <h3 className="summary-card-title">Capital Efficiency</h3>
            <div className="summary-card-metrics summary-card-metrics--three">
              <div className="summary-metric-item">
                <div className="summary-metric-label">Total Margin</div>
                <div className="summary-metric-val">
                  {fmtWholeDollars(topMetrics.totalMargin)}
                </div>
              </div>
              <div className="summary-card-divider" />
              <div className="summary-metric-item">
                <div className="summary-metric-label">Weighted AROM</div>
                <div className="summary-metric-val">
                  {topMetrics.weightedArom == null
                    ? "—"
                    : `${topMetrics.weightedArom.toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}%`}
                </div>
              </div>
              <div className="summary-card-divider" />
              <div className="summary-metric-item">
                <div className="summary-metric-label">This Week</div>
                <div className={`summary-metric-val ${cashClass(currentWeekPremium)}`}>
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
          <CombinedCashFlowChart
            legs={searchFilteredLegs}
            campaigns={searchFilteredCampaigns}
            dailySeries={dashboardDailyCashFlowSeries}
            mode="dashboard"
            startDateFilter={startDateFilter}
            endDateFilter={endDateFilter}
          />
          <WeeklyCashFlowChart
            legs={searchFilteredLegs}
            campaigns={searchFilteredCampaigns}
            dailySeries={dashboardDailyCashFlowSeries}
            mode="dashboard"
            startDateFilter={startDateFilter}
            endDateFilter={endDateFilter}
          />
        </div>
      ) : activeChart === "margin" ? (
        <Suspense fallback={<div className="card">Loading margin chart...</div>}>
          <MarginChart
            legs={searchFilteredLegs}
            startDateFilter={startDateFilter}
            endDateFilter={endDateFilter}
          />
        </Suspense>
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
          <h3 className="summary-card-title">Active Campaigns</h3>

          <div className="summary-card-metrics summary-card-metrics--two">
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
          peakMarginByCampaign={peakMarginByCampaign}
          onSelect={onSelectCampaign}
        />
      </section>

      {/* Closed Campaigns */}
      <section>
        <div className="summary-card">
          <h3 className="summary-card-title">
            Closed Campaigns
          </h3>

          <div className="summary-card-metrics summary-card-metrics--two">
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
          peakMarginByCampaign={peakMarginByCampaign}
          onSelect={onSelectCampaign}
        />
      </section>
    </div>
  );
}