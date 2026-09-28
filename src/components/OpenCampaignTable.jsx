import React, { useState, useMemo } from "react";
import {
  fmtWholeDollars,
  cashClass,
  computeCampaignSummary,
  computeMarginEstimate,
  fmtCampaignDaysLeft,
  getCampaignDuration
} from "../logic/logic.js";
import DaysLeftProgressBar from "./DaysLeftProgressBar.jsx";

function toSortableNumber(value, fallback = Number.POSITIVE_INFINITY) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

export default function OpenCampaignTable({ campaigns, legs, onSelect }) {
  const [sortConfig, setSortConfig] = useState({
    field: "daysLeft",
    direction: "asc"
  });

  const handleSort = (field) => {
    setSortConfig((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const campaignLegsMap = useMemo(() => {
    const map = new Map();

    for (let i = 0; i < campaigns.length; i += 1) {
      map.set(String(campaigns[i].id), []);
    }

    for (let i = 0; i < legs.length; i += 1) {
      const leg = legs[i];
      const key = String(leg.campaignId);
      const arr = map.get(key);
      if (arr) arr.push(leg);
    }

    return map;
  }, [campaigns, legs]);

  const campaignMetricsMap = useMemo(() => {
    const map = new Map();

    for (let i = 0; i < campaigns.length; i += 1) {
      const campaign = campaigns[i];
      const campaignId = String(campaign.id);
      const legsForCampaign = campaignLegsMap.get(campaignId) || [];

      const summary = computeCampaignSummary(campaign, legsForCampaign);
      const daysLeft = fmtCampaignDaysLeft(campaign, legsForCampaign);
      const durationDays = getCampaignDuration(legsForCampaign);

      const tooltipText =
        legsForCampaign.length > 0
          ? "Campaign Legs (" +
            String(legsForCampaign.length) +
            "):\n" +
            legsForCampaign
              .map((l) => {
                const status = l.isOpen ? "🟢 Open" : "🔴 Closed";
                const strikeStr = l.strike ? " @ " + String(l.strike) : "";
                const expStr = l.expiry ? " (Exp: " + String(l.expiry) + ")" : "";
                return (
                  status +
                  " | " +
                  String(l.qty) +
                  " " +
                  String(l.type) +
                  strikeStr +
                  expStr
                );
              })
              .join("\n")
          : "No legs in this campaign";

      map.set(campaignId, {
        legsForCampaign,
        summary,
        daysLeft,
        durationDays,
        tooltipText
      });
    }

    return map;
  }, [campaigns, campaignLegsMap, legs]);

  const maxDurationDays = Math.max(
    1,
    ...campaigns.map(
      (campaign) =>
        campaignMetricsMap.get(String(campaign.id))?.durationDays ?? 0
    )
  );

  const sortedCampaigns = useMemo(() => {
    const directionMult = sortConfig.direction === "asc" ? 1 : -1;

    return [...campaigns].sort((a, b) => {
      const aMetrics = campaignMetricsMap.get(String(a.id));
      const bMetrics = campaignMetricsMap.get(String(b.id));

      if (sortConfig.field === "name") {
        const aName = a.name || "";
        const bName = b.name || "";
        return directionMult * aName.localeCompare(bName);
      }

      if (sortConfig.field === "daysLeft") {
        const aVal = toSortableNumber(aMetrics?.daysLeft);
        const bVal = toSortableNumber(bMetrics?.daysLeft);
        return directionMult * (aVal - bVal);
      }

      if (sortConfig.field === "duration") {
        const aVal = toSortableNumber(aMetrics?.durationDays, 0);
        const bVal = toSortableNumber(bMetrics?.durationDays, 0);
        return directionMult * (aVal - bVal);
      }

      if (sortConfig.field === "netCredit") {
        const aVal = toSortableNumber(aMetrics?.summary?.netCredit, 0);
        const bVal = toSortableNumber(bMetrics?.summary?.netCredit, 0);
        return directionMult * (aVal - bVal);
      }

      return 0;
    });
  }, [campaigns, campaignMetricsMap, sortConfig]);

  const getSortIndicator = (field) => {
    if (sortConfig.field !== field) return " ↕";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  const openLegs = useMemo(
    () => legs.filter((leg) => leg.isOpen),
    [legs]
  );

  const marginByCampaign = useMemo(
    () => computeMarginEstimate(openLegs).byCampaign,
    [openLegs]
  );

  return (
    <div className="open-campaigns-container">
      <div className="table-container">
        <table className="summary-table campaign-table campaign-table-open">
          <colgroup>
            <col style={{ width: "24%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "20.67%" }} />
            <col style={{ width: "20.67%" }} />
            <col style={{ width: "20.66%" }} />
          </colgroup>
          <thead>
            <tr>
              <th
                onClick={() => handleSort("name")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Campaign{getSortIndicator("name")}
              </th>
              <th
                onClick={() => handleSort("duration")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Duration / Legs{getSortIndicator("duration")}
              </th>
              <th
                onClick={() => handleSort("daysLeft")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Time Remaining{getSortIndicator("daysLeft")}
              </th>
              <th
                onClick={() => handleSort("netCredit")}
                style={{ cursor: "pointer", userSelect: "none" }}
                className="numeric-column"
              >
                Max Credit{getSortIndicator("netCredit")}
              </th>
              <th className="numeric-column">Est. Margin</th>
            </tr>
          </thead>
          <tbody>
            {sortedCampaigns.map((c) => {
              const metrics = campaignMetricsMap.get(String(c.id));
              const legsForCampaign = metrics?.legsForCampaign || [];
              const summary = metrics?.summary || { netCredit: 0 };
              const daysLeft = metrics?.daysLeft ?? null;
              const durationDays = metrics?.durationDays ?? 0;
              const legCount = legsForCampaign.length;
              const durationPercent = Math.max(
                5,
                (durationDays / maxDurationDays) * 100
              );
              const tooltipText = metrics?.tooltipText || "No legs in this campaign";
              const estimatedMargin = marginByCampaign[String(c.id)] ?? 0;

              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  title={tooltipText}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      <span style={{ fontWeight: "bold" }}>{c.name}</span>
                    </div>
                  </td>

                  <td>
                    <div className="campaign-duration">
                      <div className="campaign-duration-labels">
                        <span>{durationDays}d</span>
                        <span className="campaign-leg-count">
                          {legCount} {legCount === 1 ? "leg" : "legs"}
                        </span>
                      </div>
                      <div className="campaign-duration-track">
                        <div
                          className="campaign-duration-fill"
                          style={{ width: `${durationPercent}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  <td>
                    <DaysLeftProgressBar daysLeft={daysLeft} />
                  </td>

                  <td className={`numeric-column ${cashClass(summary.netCredit)}`}>
                    {fmtWholeDollars(summary.netCredit)}
                  </td>

                  <td className="numeric-column">{fmtWholeDollars(estimatedMargin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}