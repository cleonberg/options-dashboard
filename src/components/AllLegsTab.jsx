// AllLegsTab.jsx
import React, { useState, useMemo } from "react";
import LegTable from "./LegTable.jsx";
import FilterBar from "./FilterBar.jsx";
import { computeLegPL } from "../logic/logic.js";

export default function AllLegsTab({
  campaigns = [], // ⭐ NEW: Accept campaigns from App.jsx
  legs = [],
  reloadAll,
  uid
}) {
  const [query, setQuery] = useState("");
  const [filterTicker, setFilterTicker] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("openDateDesc");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const filteredLegs = useMemo(() => {
    const q = query.trim().toLowerCase();

    return legs.filter((l) => {
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
    legs,
    query,
    filterTicker,
    filterType,
    filterStatus,
    startDateFilter,
    endDateFilter,
  ]);

  const totalFiltered = filteredLegs.length;
  const totalOpen = filteredLegs.filter(l => l.isOpen).length;
  const totalClosed = filteredLegs.filter(l => !l.isOpen).length;

  // Sort the filtered legs before passing them to the table
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
      {/* Filter Card */}
      <div className="card">
        <FilterBar
          searchTerm={query}
          setSearchTerm={setQuery}
          startDateFilter={startDateFilter}
          setStartDateFilter={setStartDateFilter}
          endDateFilter={endDateFilter}
          setEndDateFilter={setEndDateFilter}
        />
      </div>

      {/* Summary Card */}
      <div className="summary-grid-cards">
        <div className="summary-card">
          <div className="summary-card-title">Total Legs</div>
          <div className="summary-card-value">{legs.length}</div>
        </div>

        <div className="summary-card">
          <div className="summary-card-title">Filtered</div>
          <div className="summary-card-value">{totalFiltered}</div>
        </div>

        <div className="summary-card">
          <div className="summary-card-title">Open</div>
          <div className="summary-card-value">{totalOpen}</div>
        </div>

        <div className="summary-card">
          <div className="summary-card-title">Closed</div>
          <div className="summary-card-value">{totalClosed}</div>
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