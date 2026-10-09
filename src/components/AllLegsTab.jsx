// AllLegsTab.jsx
import React, { useState, useMemo } from "react";
import LegTable from "./LegTable.jsx";
import {
  computeLegPL,
  fmtWholeDollars,
  cashClass
} from "../logic/logic.js";

export default function AllLegsTab({
  campaigns = [],
  legs = [],
  defaultAccountId = "",
  reloadAll,
  uid,
  searchTerm = "",
  startDateFilter = "",
  endDateFilter = "",
  selectedAccountId = "all",
}) {
  const [filterTicker, setFilterTicker] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("openDateDesc");

  const campaignById = useMemo(
    () =>
      new Map(
        campaigns.map((campaign) => [
          String(campaign.id).trim().toLowerCase(),
          campaign,
        ])
      ),
    [campaigns]
  );

  const filteredLegs = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return legs.filter((l) => {
      if (selectedAccountId !== "all") {
        const campaign = campaignById.get(
          String(l.campaignId || "").trim().toLowerCase()
        );
        const campaignAccountId = campaign?.accountId || defaultAccountId;
        if (
          !campaign ||
          String(campaignAccountId || "").trim().toLowerCase() !==
            String(selectedAccountId).trim().toLowerCase()
        ) {
          return false;
        }
      }

      if (filterTicker && l.ticker !== filterTicker) return false;
      if (filterType !== "all" && l.type !== filterType) return false;

      if (filterStatus !== "all") {
        const isOpen = !!l.isOpen;
        if (filterStatus === "open" && !isOpen) return false;
        if (filterStatus === "closed" && isOpen) return false;
      }

      // Date filter
      if (startDateFilter || endDateFilter) {
        const openDate = getDateOnly(l.openDate);
        const closeDate = getDateOnly(l.closeDate);

        const matchesOpen =
          openDate &&
          (!startDateFilter || openDate >= startDateFilter) &&
          (!endDateFilter || openDate <= endDateFilter);

        const matchesClose =
          closeDate &&
          (!startDateFilter || closeDate >= startDateFilter) &&
          (!endDateFilter || closeDate <= endDateFilter);

        // Keep the leg if either its open OR close date
        // falls within the selected range.
        if (!matchesOpen && !matchesClose) {
          return false;
        }
      }

      if (!q) return true;

      if (l.ticker?.toLowerCase().includes(q)) return true;
      if (l.notes?.toLowerCase().includes(q)) return true;
      if (String(l.campaignId).includes(q)) return true;
      if (l.type?.toLowerCase().includes(q)) return true;

      return false;
    });
  }, [
    campaignById,
    legs,
    defaultAccountId,
    selectedAccountId,
    searchTerm,
    filterTicker,
    filterType,
    filterStatus,
    startDateFilter,
    endDateFilter,
  ]);

  const totalFiltered = filteredLegs.length;
  const totalOpen = filteredLegs.filter(l => l.isOpen).length;
  const totalClosed = filteredLegs.filter(l => !l.isOpen).length;
  const realizedResults = filteredLegs
    .filter((leg) => !leg.isOpen)
    .map((leg) => computeLegPL(leg))
    .filter((pl) => Number.isFinite(pl));

  const realizedPL = realizedResults.reduce((sum, pl) => sum + pl, 0);
  const winningLegs = realizedResults.filter((pl) => pl > 0).length;
  const losingLegs = realizedResults.filter((pl) => pl < 0).length;  // Sort the filtered legs before passing them to the table

  const sortedLegs = [...filteredLegs].sort((a, b) => {
    // Helper for safe string comparison (ignores capitalization)
    const safeString = (val) => (val || "").toString().toLowerCase();

    switch (sortBy) {
      // Open Date
      case "openDateDesc":
        return new Date(b.openDate || 0) - new Date(a.openDate || 0);
      case "openDateAsc":
        return new Date(a.openDate || "9999-12-31") - new Date(b.openDate || "9999-12-31");

      // Close Date
      case "closeDateDesc":
        return new Date(b.closeDate || 0) - new Date(a.closeDate || 0);
      case "closeDateAsc":
        return new Date(a.closeDate || "9999-12-31") - new Date(b.closeDate || "9999-12-31");

      // Expiration Date
      case "expiryAsc": // Usually you want soonest expiring first
        return new Date(a.expiry || "9999-12-31") - new Date(b.expiry || "9999-12-31");
      case "expiryDesc":
        return new Date(b.expiry || 0) - new Date(a.expiry || 0);

      // Ticker
      case "tickerAsc":
        return safeString(a.ticker).localeCompare(safeString(b.ticker));
      case "tickerDesc":
        return safeString(b.ticker).localeCompare(safeString(a.ticker));

      // Open Price (Handy for finding your most expensive/cheapest trades)
      case "openPriceDesc":
        return (Number(b.openPrice) || 0) - (Number(a.openPrice) || 0);
      case "openPriceAsc":
        return (Number(a.openPrice) || 0) - (Number(b.openPrice) || 0);

      default:
        return 0;
    }
  });

  function getDateOnly(value) {
    if (value == null || value === "") return "";

    if (value instanceof Date) {
      return isNaN(value.getTime())
        ? ""
        : value.toISOString().slice(0, 10);
    }

    const str = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      return str.slice(0, 10);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    return "";
  }

  return (
    <>
      {/* Summary Card */}
      <div className="summary-grid-cards">
        <div className="summary-card">
          <h3 className="summary-card-title">Leg Activity</h3>
          <div className="summary-card-metrics summary-card-metrics--three">
            <div className="summary-metric-item">
              <div className="summary-metric-label">Filtered Legs</div>
              <div className="summary-metric-val">{totalFiltered}</div>
            </div>
            <div className="summary-card-divider" />
            <div className="summary-metric-item">
              <div className="summary-metric-label">Open</div>
              <div className="summary-metric-val">{totalOpen}</div>
            </div>
            <div className="summary-card-divider" />
            <div className="summary-metric-item">
              <div className="summary-metric-label">Closed</div>
              <div className="summary-metric-val">{totalClosed}</div>
            </div>
          </div>
        </div>
      
        <div className="summary-card">
          <h3 className="summary-card-title">Realized Results</h3>
          <div className="summary-card-metrics summary-card-metrics--three">
            <div className="summary-metric-item">
              <div className="summary-metric-label">Realized P/L</div>
              <div className={`summary-metric-val ${cashClass(realizedPL)}`}>
                {fmtWholeDollars(realizedPL)}
              </div>
            </div>
            <div className="summary-card-divider" />
            <div className="summary-metric-item">
              <div className="summary-metric-label">Winning Legs</div>
              <div className="summary-metric-val">{winningLegs}</div>
            </div>
            <div className="summary-card-divider" />
            <div className="summary-metric-item">
              <div className="summary-metric-label">Losing Legs</div>
              <div className="summary-metric-val">{losingLegs}</div>
            </div>
          </div>
        </div>
      </div>    

      {/* Table Card */}
      <div className="card">
        <LegTable
          legs={sortedLegs}
          campaigns={campaigns}
          uid={uid}
          reloadAll={reloadAll}
          enableSort={true}
          enablePaging={true}
          enableFilters={false}
          enableCampaignColumn={true}
        />
      </div>
    </>
  );
}