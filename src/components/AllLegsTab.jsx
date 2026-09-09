// AllLegsTab.jsx
import React, { useState, useMemo } from "react";

import LegTable from "./LegTable.jsx";
import { computeLegPL } from "../logic/logic.js";

export default function AllLegsTab({
  legs = [],
  setLegs,
  reloadAll,
  uid
}) {
  // -----------------------------
  // UI State
  // -----------------------------
  const [query, setQuery] = useState("");
  const [filterTicker, setFilterTicker] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // -----------------------------
  // Ticker list
  // -----------------------------
  const tickers = useMemo(() => {
    const s = new Set();
    for (const l of legs) if (l.ticker) s.add(l.ticker);
    return Array.from(s).sort();
  }, [legs]);

  // -----------------------------
  // Filtering + Search
  // -----------------------------
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

  // -----------------------------
  // Summary counts
  // -----------------------------
  const totalFiltered = filteredLegs.length;
  const totalOpen = filteredLegs.filter(l => l.isOpen).length;
  const totalClosed = filteredLegs.filter(l => !l.isOpen).length;

  // -----------------------------
  // Render
  // -----------------------------
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

        <button
          className="secondary"
          onClick={() => {
            setQuery("");
            setFilterTicker("");
            setFilterType("all");
            setFilterStatus("all");
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

      {/* ⭐ NEW: Reusable LegTable */}
      <LegTable
        legs={filteredLegs}
        campaigns={[]}          // optional, not needed for All Legs
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
