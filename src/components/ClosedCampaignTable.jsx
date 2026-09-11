import React, { useState, useMemo } from "react";
import { fmt, cashClass, computeCampaignSummary, detectStrategy } from "../logic/logic.js";

export default function ClosedCampaignTable({ campaigns, legs, onSelect }) {
  const [sortConfig, setSortConfig] = useState({ field: "endDate", direction: "desc" });

  const handleSort = (field) => {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      let aVal, bVal;

      if (sortConfig.field === "ticker") {
        aVal = a.ticker || "";
        bVal = b.ticker || "";
        return sortConfig.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (sortConfig.field === "startDate" || sortConfig.field === "endDate") {
        aVal = new Date(a[sortConfig.field] || 0).getTime();
        bVal = new Date(b[sortConfig.field] || 0).getTime();
      } else if (sortConfig.field === "totalPL") {
        const legsA = legs.filter(l => l.campaignId === a.id);
        const legsB = legs.filter(l => l.campaignId === b.id);
        aVal = computeCampaignSummary(a, legsA).totalPL || 0;
        bVal = computeCampaignSummary(b, legsB).totalPL || 0;
      }

      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [campaigns, legs, sortConfig]);

  const getSortIndicator = (field) => {
    if (sortConfig.field !== field) return " ↕";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  return (
    <table className="summary-table">
      <thead>
        <tr>
          <th onClick={() => handleSort("ticker")} style={{ cursor: "pointer", userSelect: "none" }}>
            Ticker & Strategy{getSortIndicator("ticker")}
          </th>
          <th onClick={() => handleSort("startDate")} style={{ cursor: "pointer", userSelect: "none" }}>
            Opened{getSortIndicator("startDate")}
          </th>
          <th onClick={() => handleSort("endDate")} style={{ cursor: "pointer", userSelect: "none" }}>
            Closed{getSortIndicator("endDate")}
          </th>
          <th onClick={() => handleSort("totalPL")} style={{ cursor: "pointer", userSelect: "none" }}>
            Total P/L{getSortIndicator("totalPL")}
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedCampaigns.map(c => {
          const legsForCampaign = legs.filter(l => l.campaignId === c.id);
          const summary = computeCampaignSummary(c, legsForCampaign);
          const strategy = detectStrategy(legsForCampaign);

          return (
            <tr key={c.id} onClick={() => onSelect(c.id)}>
              <td>
                <span style={{ fontWeight: "bold" }}>{c.ticker}</span>
                <span className="strategy-badge">{strategy}</span>
              </td>
              <td>{c.startDate || "-"}</td>
              <td>{c.endDate || "-"}</td>
              <td className={cashClass(summary.totalPL)}>
                {fmt(summary.totalPL)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}