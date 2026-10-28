// LegTable.jsx
import { useState, useMemo } from "react";
import LegRow from "./LegRow.jsx";
import LegGroupRow from "./LegGroupRow.jsx";
import { computeLegPL } from "../logic/logic.js";

export default function LegTable({
  legs,
  campaigns = [],
  uid,
  reloadAll,
  collapseClosedLegs = false,
}) {
  // Default sort: Open Date (ascending / oldest first)
  const [sortConfig, setSortConfig] = useState({ field: "openDate", direction: "asc" });
  const [expandedLegId, setExpandedLegId] = useState(null);
  const [expandedGroupKey, setExpandedGroupKey] = useState(null);
  const [closedLegsExpanded, setClosedLegsExpanded] = useState(false);

  // Handle dropdown or toggle changes
  const handleFieldChange = (e) => {
    setSortConfig((prev) => ({
      field: e.target.value,
      direction: prev.direction,
    }));
  };

  const toggleDirection = () => {
    setSortConfig((prev) => ({
      ...prev,
      direction: prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const displayItems = useMemo(() => {
    const positionKey = (leg) => {
      if (!leg.isOpen) return null;
      const expiry = leg.expiry
        ? leg.expiry instanceof Date
          ? leg.expiry.toISOString().slice(0, 10)
          : String(leg.expiry).slice(0, 10)
        : "";
      return JSON.stringify([
        leg.campaignId ?? null,
        String(leg.ticker ?? "").toLowerCase(),
        String(leg.type ?? "").toLowerCase(),
        leg.strike == null || leg.strike === "" ? null : Number(leg.strike),
        expiry,
        leg.term || "short-term",
      ]);
    };

    const groupedLegs = new Map();
    legs.forEach((leg) => {
      const key = positionKey(leg);
      if (!key) return;
      const group = groupedLegs.get(key) || [];
      group.push(leg);
      groupedLegs.set(key, group);
    });

    const items = [];
    const addedGroups = new Set();
    legs.forEach((leg) => {
      const key = positionKey(leg);
      const matchingLegs = key ? groupedLegs.get(key) : null;
      if (matchingLegs?.length > 1) {
        if (!addedGroups.has(key)) {
          items.push({ type: "group", id: key, legs: matchingLegs });
          addedGroups.add(key);
        }
      } else {
        items.push({ type: "leg", id: leg.id, leg });
      }
    });

    const sortValue = (item) => {
      const itemLegs = item.type === "group" ? item.legs : [item.leg];
      if (sortConfig.field === "qty") {
        return itemLegs.reduce((sum, leg) => sum + Number(leg.qty || 0), 0);
      }
      if (sortConfig.field === "pl") {
        const values = itemLegs.map(computeLegPL).filter((value) => value != null);
        return values.length ? values.reduce((sum, value) => sum + value, 0) : -Infinity;
      }
      if (sortConfig.field === "openDate" || sortConfig.field === "expiry" || sortConfig.field === "closeDate") {
        const dates = itemLegs
          .map((leg) => leg[sortConfig.field] ? new Date(leg[sortConfig.field]).getTime() : 0)
          .filter((value) => Number.isFinite(value));
        return sortConfig.field === "openDate" && item.type === "group"
          ? Math.min(...dates)
          : dates[0] ?? 0;
      }
      if (sortConfig.field === "strike") return itemLegs[0].strike ?? 0;
      return itemLegs[0][sortConfig.field] || "";
    };

    return items.sort((a, b) => {
      const aVal = sortValue(a);
      const bVal = sortValue(b);
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortConfig.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [legs, sortConfig]);

  const openItems = collapseClosedLegs
    ? displayItems.filter((item) => item.type === "group" || item.leg.isOpen)
    : displayItems;
  const closedItems = collapseClosedLegs
    ? displayItems.filter((item) => item.type === "leg" && !item.leg.isOpen)
    : [];

  const handleActionComplete = () => {
    setExpandedLegId(null);
    setExpandedGroupKey(null);
  };

  const renderItem = (item) => item.type === "group" ? (
    <LegGroupRow
      key={item.id}
      legs={item.legs}
      campaigns={campaigns}
      allLegs={legs}
      uid={uid}
      reloadAll={reloadAll}
      expanded={expandedGroupKey === item.id}
      onToggle={() =>
        setExpandedGroupKey((currentKey) => currentKey === item.id ? null : item.id)
      }
      expandedLegId={expandedLegId}
      onToggleLeg={(legId) =>
        setExpandedLegId((currentId) => currentId === legId ? null : legId)
      }
      onActionComplete={handleActionComplete}
    />
  ) : (
    <LegRow
      key={item.leg.id}
      leg={item.leg}
      campaigns={campaigns}
      allLegs={legs}
      uid={uid}
      reloadAll={reloadAll}
      expanded={expandedLegId === item.leg.id}
      onToggle={() =>
        setExpandedLegId((currentId) =>
          currentId === item.leg.id ? null : item.leg.id
        )
      }
      onActionComplete={handleActionComplete}
    />
  );

  return ( 
    <div className="leg-table-container"> 

      {/* --- Sort Control Toolbar --- */}
      <div 
        className="leg-sort-bar" 
        style={{ 
          display: "flex", 
          gap: "10px", 
          alignItems: "center", 
          justifyContent: "flex-end",
          marginBottom: "12px", 
          fontSize: "13px", 
          color: "#94a3b8" 
        }}
      >
        <span>Sort by:</span>

        <select
          value={sortConfig.field}
          onChange={handleFieldChange}
          style={{
            padding: "4px 8px",
            borderRadius: "4px",
            backgroundColor: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid #334155",
            cursor: "pointer"
          }}
        >
          <option value="openDate">Open Date</option>
          <option value="expiry">Expiry Date</option>
          <option value="closeDate">Close Date</option>
          <option value="pl">P/L</option>
          <option value="type">Leg Type</option>
          <option value="strike">Strike Price</option>
        </select>

        <button
          onClick={toggleDirection}
          title="Toggle sort direction"
          style={{
            padding: "4px 10px",
            borderRadius: "4px",
            backgroundColor: "#1e293b",
            color: "#38bdf8",
            border: "1px solid #334155",
            cursor: "pointer"
          }}
        >
          {sortConfig.direction === "asc" ? "▲ Ascending" : "▼ Descending"}
        </button>
      </div>

      {/* --- Render Sorted List --- */}
      <div className="leg-list"> 
        {openItems.map(renderItem)}
      </div> 

      {closedItems.length > 0 && (
        <section className="closed-leg-section">
          <button
            type="button"
            className="closed-leg-toggle"
            aria-expanded={closedLegsExpanded}
            onClick={() => setClosedLegsExpanded((expanded) => !expanded)}
          >
            <span>{closedLegsExpanded ? "▼" : "▶"} Closed legs ({closedItems.length})</span>
            <span>{closedLegsExpanded ? "Hide" : "Show"}</span>
          </button>
          {closedLegsExpanded && (
            <div className="leg-list closed-leg-list">
              {closedItems.map(renderItem)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}