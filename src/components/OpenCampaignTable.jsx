import React, { useState, useMemo } from "react";
import { fmt, cashClass, computeCampaignSummary, fmtCampaignDaysLeft, detectStrategy } from "../logic/logic.js";
import DaysLeftProgressBar from "./DaysLeftProgressBar.jsx";
import LegRatioBadge from "./LegRatioBadge.jsx";
import CampaignForm from "./CampaignForm.jsx";

export default function OpenCampaignTable({ campaigns, legs, onSelect, onAddCampaign }) {
  const [sortConfig, setSortConfig] = useState({ field: "daysLeft", direction: "asc" });
  const [isAddingCampaign, setIsAddingCampaign] = useState(false);

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
    <div className="open-campaigns-container">
      
      {/* Header & Toggle Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ color: "#9fb3ff", margin: 0 }}>Open Campaigns</h3>
        <button 
          onClick={() => setIsAddingCampaign(!isAddingCampaign)}
          style={{ 
            backgroundColor: isAddingCampaign ? "transparent" : "#3182ce",
            border: isAddingCampaign ? "1px solid #9fb3ff" : "none",
            color: isAddingCampaign ? "#9fb3ff" : "#fff",
            padding: "6px 12px",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          {isAddingCampaign ? "Cancel" : "+ Add Campaign"}
        </button>
      </div>

      {/* Animated Expandable Wrapper */}
      <div className={`add-leg-wrapper ${isAddingCampaign ? "open" : ""}`}>
        <div className="add-leg-content">
          <div style={{ paddingBottom: "24px" }}>
            <CampaignForm 
              onSubmit={(campaignData) => {
                if (onAddCampaign) onAddCampaign(campaignData);
                setIsAddingCampaign(false); 
              }}
              onCancel={() => setIsAddingCampaign(false)}
            />
          </div>
        </div>
      </div>

      {/* Responsive Table Wrapper */}
      <div className="table-container">
        <table className="summary-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("ticker")} style={{ cursor: "pointer", userSelect: "none" }}>
                Ticker & Strategy{getSortIndicator("ticker")}
              </th>
              {/* Hidden on small screens */}
              <th className="hide-mobile">Legs Ratio</th>
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
                  {/* Hidden on small screens */}
                  <td className="hide-mobile">
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
      </div>
    </div>
  );
}