import React, { useState, useMemo } from "react";
import { 
  fmt, 
  cashClass, 
  computeCampaignSummary, 
  detectStrategy,
  getCampaignDuration 
} from "../logic/logic.js";
import DurationProgressBar from "./DurationProgressBar.jsx"; // <-- Import here

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

      const legsA = legs.filter((l) => String(l.campaignId) === String(a.id));
      const legsB = legs.filter((l) => String(l.campaignId) === String(b.id));

      if (sortConfig.field === "ticker") {
        aVal = a.ticker || "";
        bVal = b.ticker || "";
        return sortConfig.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (sortConfig.field === "endDate") {
        aVal = new Date(a.endDate || 0).getTime();
        bVal = new Date(b.endDate || 0).getTime();
      } else if (sortConfig.field === "duration") {
        aVal = getCampaignDuration(legsA);
        bVal = getCampaignDuration(legsB);
      } else if (sortConfig.field === "totalPL") {
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
              onClick={() => handleSort("duration")} 
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              Duration{getSortIndicator("duration")}
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
            const legsForCampaign = legs.filter(l => String(l.campaignId) === String(c.id));
            const summary = computeCampaignSummary(c, legsForCampaign);
            const strategy = detectStrategy(legsForCampaign);
            const durationDays = getCampaignDuration(legsForCampaign);

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
                title={tooltipText}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontWeight: "bold" }}>{c.ticker}</span>
                    <span className="strategy-badge">{strategy}</span>
                  </div>
                </td>
                
                {/* Render the Duration Progress Bar here */}
                <td className="hide-mobile">
                  <DurationProgressBar durationDays={durationDays} />
                </td>

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