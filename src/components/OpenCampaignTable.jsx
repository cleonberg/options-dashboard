import React, { useState, useMemo } from "react";
import {
  fmt,
  fmtWholeDollars,
  cashClass,
  computeCampaignSummary,
  computeMarginEstimate,
  fmtCampaignDaysLeft,
  detectStrategy,
  getCampaignDuration
} from "../logic/logic.js";
import DaysLeftProgressBar from "./DaysLeftProgressBar.jsx";
import DurationProgressBar from "./DurationProgressBar.jsx";
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

      const legsA = legs.filter((l) => String(l.campaignId) === String(a.id));
      const legsB = legs.filter((l) => String(l.campaignId) === String(b.id));

      if (sortConfig.field === "name") {
        aVal = a.name || "";
        bVal = b.name || "";
        return sortConfig.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (sortConfig.field === "daysLeft") {
        aVal = fmtCampaignDaysLeft(a, legs);
        bVal = fmtCampaignDaysLeft(b, legs);
      } else if (sortConfig.field === "duration") {
        aVal = getCampaignDuration(legsA);
        bVal = getCampaignDuration(legsB);
      } else if (sortConfig.field === "netCredit") {
        aVal = computeCampaignSummary(a, legsA).netCredit || 0;
        bVal = computeCampaignSummary(b, legsB).netCredit || 0;
      }

      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [campaigns, legs, sortConfig]);

  const marginByCampaign = useMemo(
    () => computeMarginEstimate(legs).byCampaign,
    [legs]
  );

  const getSortIndicator = (field) => {
    if (sortConfig.field !== field) return " ↕";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  return (
    <div className="open-campaigns-container">
      <div className="table-container">
        <table className="summary-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("name")} style={{ cursor: "pointer", userSelect: "none" }}>
                Campaign{getSortIndicator("name")}
              </th>
              {/* Hidden on small screens */}
              <th className="hide-mobile">Legs Ratio</th>
              <th onClick={() => handleSort("duration")} style={{ cursor: "pointer", userSelect: "none" }}>
                Duration{getSortIndicator("duration")}
              </th>
              <th onClick={() => handleSort("daysLeft")} style={{ cursor: "pointer", userSelect: "none" }}>
                Time Remaining{getSortIndicator("daysLeft")}
              </th>
              <th onClick={() => handleSort("netCredit")} style={{ cursor: "pointer", userSelect: "none" }}>
                Max Credit{getSortIndicator("netCredit")}
              </th>
              <th>Est. Margin</th>
            </tr>
          </thead>
          <tbody>
            {sortedCampaigns.map((c) => {
              const legsForCampaign = legs.filter((l) => String(l.campaignId) === String(c.id));
              const summary = computeCampaignSummary(c, legsForCampaign);
              const daysLeft = fmtCampaignDaysLeft(c, legs);
              const strategy = detectStrategy(legsForCampaign);
              const durationDays = getCampaignDuration(legsForCampaign);
              const estimatedMargin = marginByCampaign[String(c.id)] || 0;

              const tooltipText =
                legsForCampaign.length > 0
                  ? `Campaign Legs (${legsForCampaign.length}):\n` +
                    legsForCampaign
                      .map((l) => {
                        const status = l.isOpen ? "🟢 Open" : "🔴 Closed";
                        const strikeStr = l.strike ? ` @ ${l.strike}` : "";
                        const expStr = l.expiry ? ` (Exp: ${l.expiry})` : "";
                        return `${status} | ${l.qty} ${l.type}${strikeStr}${expStr}`;
                      })
                      .join("\n")
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
                      <span style={{ fontWeight: "bold" }}>{c.name}</span>
                      <span className="strategy-badge">{strategy}</span>
                    </div>
                  </td>
                  {/* Hidden on small screens */}
                  <td className="hide-mobile">
                    <LegRatioBadge legs={legsForCampaign} />
                  </td>
                  
                  {/* Render the Duration Progress Bar here */}
                  <td>
                    <DurationProgressBar durationDays={durationDays} />
                  </td>

                  <td>
                    <DaysLeftProgressBar daysLeft={daysLeft} />
                  </td>
                  <td className={cashClass(summary.netCredit)}>
                    {fmtWholeDollars(summary.netCredit)}
                  </td>
                  <td>{fmtWholeDollars(estimatedMargin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}