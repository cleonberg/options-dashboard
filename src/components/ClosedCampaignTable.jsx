import React, { useState, useMemo } from "react";
import { 
  fmtWholeDollars,
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

  const campaignLegsMap = useMemo(() => {
    const map = new Map();

    for (const campaign of campaigns) {
      map.set(String(campaign.id), []);
    }

    for (const leg of legs) {
      const campaignLegs = map.get(String(leg.campaignId));
      if (campaignLegs) campaignLegs.push(leg);
    }

    return map;
  }, [campaigns, legs]);

  const campaignMetricsMap = useMemo(() => {
    const map = new Map();

    for (const campaign of campaigns) {
      const campaignId = String(campaign.id);
      const legsForCampaign = campaignLegsMap.get(campaignId) || [];
      const summary = computeCampaignSummary(campaign, legsForCampaign);
      const parsedEndDate = new Date(campaign.endDate || 0).getTime();

      const tooltipText = legsForCampaign.length > 0
        ? `Campaign Legs (${legsForCampaign.length}):\n` +
          legsForCampaign.map((leg) => {
            const status = leg.isOpen ? "🟢 Open" : "🔴 Closed";
            const strike = leg.strike ? ` @ ${leg.strike}` : "";
            const expiry = leg.expiry ? ` (Exp: ${leg.expiry})` : "";
            return `${status} | ${leg.qty} ${leg.type}${strike}${expiry}`;
          }).join("\n")
        : "No legs in this campaign";

      map.set(campaignId, {
        summary,
        strategy: detectStrategy(legsForCampaign),
        durationDays: getCampaignDuration(legsForCampaign),
        endDateTime: Number.isFinite(parsedEndDate) ? parsedEndDate : 0,
        tooltipText
      });
    }

    return map;
  }, [campaigns, campaignLegsMap]);

  const sortedCampaigns = useMemo(() => {
    const direction = sortConfig.direction === "asc" ? 1 : -1;

    return [...campaigns].sort((a, b) => {
      const aMetrics = campaignMetricsMap.get(String(a.id));
      const bMetrics = campaignMetricsMap.get(String(b.id));

      if (sortConfig.field === "ticker") {
        return direction * (a.ticker || "").localeCompare(b.ticker || "");
      }

      let aValue;
      let bValue;

      if (sortConfig.field === "duration") {
        aValue = aMetrics?.durationDays || 0;
        bValue = bMetrics?.durationDays || 0;
      } else if (sortConfig.field === "totalPL") {
        aValue = aMetrics?.summary?.totalPL || 0;
        bValue = bMetrics?.summary?.totalPL || 0;
      } else {
        aValue = aMetrics?.endDateTime || 0;
        bValue = bMetrics?.endDateTime || 0;
      }

      return direction * (aValue - bValue);
    });
  }, [campaigns, campaignMetricsMap, sortConfig]);

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
            const metrics = campaignMetricsMap.get(String(c.id));
            const summary = metrics?.summary;
            const strategy = metrics?.strategy;
            const durationDays = metrics?.durationDays ?? 0;

            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c.id)}
                title={metrics?.tooltipText || "No legs in this campaign"}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontWeight: "bold" }}>{c.name}</span>
                    <span className="strategy-badge">{strategy}</span>
                  </div>
                </td>
                
                {/* Render the Duration Progress Bar here */}
                <td className="hide-mobile">
                  <DurationProgressBar durationDays={durationDays} />
                </td>

                <td>{c.endDate || "-"}</td>
                <td className={cashClass(summary.totalPL)}>
                  {fmtWholeDollars(summary.totalPL)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}