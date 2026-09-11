import React, { useState, useMemo } from "react";
import { fmt, cashClass, computeCampaignSummary, fmtCampaignDaysLeft, detectStrategy } from "../logic/logic.js";
import DaysLeftProgressBar from "./DaysLeftProgressBar.jsx";
import LegRatioBadge from "./LegRatioBadge.jsx";

export default function OpenCampaignTable({ campaigns, legs, onSelect }) {
  const [sortConfig, setSortConfig] = useState({ field: "daysLeft", direction: "asc" });

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

      if (sortConfig.field === "daysLeft") {
        aVal = fmtCampaignDaysLeft(a, legs);
        bVal = fmtCampaignDaysLeft(b, legs);
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
          <th>Legs Ratio</th>
          <th onClick={() => handleSort("daysLeft")} style={{ cursor: "pointer", userSelect: "none" }}>
            Time Remaining{getSortIndicator("daysLeft")}
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
          const daysLeft = fmtCampaignDaysLeft(c, legs);
          const strategy = detectStrategy(legsForCampaign);

          return (
            <tr key={c.id} onClick={() => onSelect(c.id)}>
              <td>
                <span style={{ fontWeight: "bold" }}>{c.ticker}</span>
                <span className="strategy-badge">{strategy}</span>
              </td>
              <td>
                <LegRatioBadge legs={legsForCampaign} />
              </td>
              <td>
                <DaysLeftProgressBar daysLeft={daysLeft} />
              </td>
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