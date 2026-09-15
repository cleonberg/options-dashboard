// AllLegsTab.jsx
import React, { useState, useMemo } from "react";
import LegTable from "./LegTable.jsx";
import { computeLegPL } from "../logic/logic.js";

export default function AllLegsTab({
  campaigns = [], // ⭐ NEW: Accept campaigns from App.jsx
  legs = [],
  setLegs,
  reloadAll,
  uid
}) {
  const [query, setQuery] = useState("");
  const [filterTicker, setFilterTicker] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("openDateDesc");

  const tickers = useMemo(() => {
    const s = new Set();
    for (const l of legs) if (l.ticker) s.add(l.ticker);
    return Array.from(s).sort();
  }, [legs]);

  const filteredLegs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return legs.filter(l => {
      if (filterTicker && l.ticker !== filterTicker) return false;
      if (filterType !== "all" && l.type !== filterType) return false;

      if (filterStatus !== "all") {
        const isOpen = !!l.isOpen;
        if (filterStatus === "open" && !isOpen) return false;
        if (filterStatus === "closed" && isOpen) return false;
      }

      if (!q) return true;

      if (l.ticker?.toLowerCase().includes(q)) return true;
      if (l.notes?.toLowerCase().includes(q)) return true;
      if (String(l.campaignId).includes(q)) return true;
      if (l.type?.toLowerCase().includes(q)) return true;

      return false;
    });
  }, [legs, query, filterTicker, filterType, filterStatus]);

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

  return (
    <div className="card">
      <h3>All Legs (Activity)</h3>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <input
          className="input"
          placeholder="Search ticker, notes, campaign id, type..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />

        <select className="input" value={filterTicker} onChange={e => setFilterTicker(e.target.value)}>
          <option value="">All tickers</option>
          {tickers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          <option value="call">call</option>
          <option value="put">put</option>
          <option value="stock">stock</option>
        </select>

        <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>

        <select 
          value={sortBy} 
          onChange={(e) => setSortBy(e.target.value)} 
          className="input"
        >
          <optgroup label="Open Date">
            <option value="openDateDesc">Newest First</option>
            <option value="openDateAsc">Oldest First</option>
          </optgroup>
          
          <optgroup label="Close Date">
            <option value="closeDateDesc">Recently Closed</option>
            <option value="closeDateAsc">Oldest Closed</option>
          </optgroup>

          <optgroup label="Expiration">
            <option value="expiryAsc">Expiring Soonest</option>
            <option value="expiryDesc">Expiring Latest</option>
          </optgroup>

          <optgroup label="Ticker">
            <option value="tickerAsc">A to Z</option>
            <option value="tickerDesc">Z to A</option>
          </optgroup>

          <optgroup label="Open Price">
            <option value="openPriceDesc">Highest to Lowest</option>
            <option value="openPriceAsc">Lowest to Highest</option>
          </optgroup>
        </select>

        <button
          className="secondary"
          onClick={() => {
            setQuery("");
            setFilterTicker("");
            setFilterType("all");
            setFilterStatus("all");
            setSortBy("newest");
          }}
        >
          Reset
        </button>
      </div>

      {/* Summary */}
      <div className="summary-grid" style={{ marginBottom: 12 }}>
        <div>
          <div className="summary-label">Total Legs</div>
          <div>{legs.length}</div>
        </div>
        <div>
          <div className="summary-label">Filtered</div>
          <div>{totalFiltered}</div>
        </div>
        <div>
          <div className="summary-label">Open</div>
          <div>{totalOpen}</div>
        </div>
        <div>
          <div className="summary-label">Closed</div>
          <div>{totalClosed}</div>
        </div>
      </div>

      <LegTable
        legs={sortedLegs}
        campaigns={campaigns} // ⭐ FIX: Pass the campaigns down to LegTable
        uid={uid}
        reloadAll={reloadAll}
        enableSort={true}
        enablePaging={true}
        enableFilters={false}
        enableCampaignColumn={true}
      />
    </div>
  );
}