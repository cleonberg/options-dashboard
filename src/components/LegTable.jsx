// LegTable.jsx
import React, { useState, useMemo } from "react"; 
import LegRow from "./LegRow.jsx";
import { computeLegPL } from "../logic/logic.js";

export default function LegTable({ legs, campaigns = [], uid, reloadAll }) { 
  // Default sort: Open Date (ascending / oldest first)
  const [sortConfig, setSortConfig] = useState({ field: "openDate", direction: "asc" });

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

  // Memoized sorting logic
  const sortedLegs = useMemo(() => {
    return [...legs].sort((a, b) => {
      let aVal, bVal;

      // Date fields sorting
      if (sortConfig.field === "openDate" || sortConfig.field === "expiry" || sortConfig.field === "closeDate") {
        aVal = a[sortConfig.field] ? new Date(a[sortConfig.field]).getTime() : 0;
        bVal = b[sortConfig.field] ? new Date(b[sortConfig.field]).getTime() : 0;
      } 
      // Calculated P/L sorting
      else if (sortConfig.field === "pl") {
        aVal = computeLegPL(a) ?? -Infinity;
        bVal = computeLegPL(b) ?? -Infinity;
      } 
      // Numeric fields
      else if (sortConfig.field === "strike" || sortConfig.field === "qty") {
        aVal = a[sortConfig.field] ?? 0;
        bVal = b[sortConfig.field] ?? 0;
      } 
      // Text fields (type, ticker, etc.)
      else {
        aVal = a[sortConfig.field] || "";
        bVal = b[sortConfig.field] || "";
        return sortConfig.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [legs, sortConfig]);

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
        {sortedLegs.map(leg => ( 
          <LegRow 
            key={leg.id} 
            leg={leg} 
            campaigns={campaigns}
            allLegs={legs} 
            uid={uid} 
            reloadAll={reloadAll} 
          /> 
        ))} 
      </div> 
    </div> 
  ); 
}