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
    <div className="table-container">
      <table className="summary-table">
        <thead>
          <tr>
            <th onClick={() => handleSort("ticker")} style={{ cursor: "pointer", userSelect: "none" }}>
              Ticker & Strategy{getSortIndicator("ticker")}
            </th>
            {/* Hidden on small screens */}
            <th 
              className="hide-mobile" 
              onClick={() => handleSort("startDate")} 
              style={{ cursor: "pointer", userSelect: "none" }}
            >
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

            // 🛠️ Generate multiline tooltip text for the legs in this campaign
            const tooltipText = legsForCampaign.length > 0 
              ? `Campaign Legs (${legsForCampaign.length}):\n` + legsForCampaign.map(l => {
                  const status = l.isOpen ? "🟢 Open" : "🔴 Closed";
                  const strikeStr = l.strike ? ` @ ${l.strike}` : "";
                  const expStr = l.expiry ? ` (Exp: ${l.expiry})` : "";
                  return `${status} | ${l.qty} ${l.type}${strikeStr}${expStr}`;
                }).join("\n")
              : "No legs in this campaign";

            return (
              <tr 
                key={c.id} 
                onClick={() => onSelect(c.id)}
                title={tooltipText} // <-- Native Tooltip added to the entire row
                style={{ cursor: "pointer" }}
              >
                <td>
                  <span style={{ fontWeight: "bold" }}>{c.ticker}</span>
                  <span className="strategy-badge">{strategy}</span>
                </td>
                <td className="hide-mobile">{c.startDate || "-"}</td>
                <td>{c.endDate || "-"}</td>
                <td className={cashClass(summary.totalPL)}>
                  {fmt(summary.totalPL)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}