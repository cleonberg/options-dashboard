import React, { useState, useMemo } from "react";
import {
  fmtWholeDollars,
  cashClass,
  computeCampaignSummary,
  computeMarginHistorySeries,
  getCalendarDay,
  computeAROM,
} from "../logic/logic.js";

function toSortableNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function formatShortDate(value) {
  const date = getCalendarDay(value);
  if (!date) return "-";

  const [year, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}/${year.slice(-2)}`;
}

export default function ClosedCampaignTable({ campaigns, legs, peakMarginByCampaign, onSelect }) {
  const [sortConfig, setSortConfig] = useState({
    field: "endDate",
    direction: "desc"
  });

  const handleSort = (field) => {
    setSortConfig((previous) => ({
      field,
      direction:
        previous.field === field && previous.direction === "asc"
          ? "desc"
          : "asc"
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

      const legOpenDays = legsForCampaign
        .map((leg) => getCalendarDay(leg.openDate))
        .filter(Boolean)
        .sort();

      const legCloseDays = legsForCampaign
        .map((leg) => getCalendarDay(leg.closeDate))
        .filter(Boolean)
        .sort();

      const startDay =
        getCalendarDay(campaign.startDate) || legOpenDays[0] || null;
      const endDay =
        getCalendarDay(campaign.endDate) ||
        legCloseDays[legCloseDays.length - 1] ||
        null;

      const durationDays =
        startDay && endDay
          ? Math.max(
              0,
              Math.round(
                (new Date(`${endDay}T00:00:00`) -
                  new Date(`${startDay}T00:00:00`)) /
                  86400000
              )
            )
          : 0;

      const endDateTime = endDay
        ? new Date(`${endDay}T00:00:00`).getTime()
        : 0;

      const margin = peakMarginByCampaign.get(campaignId) ?? 0;
      const realizedPL = summary.realizedPL ?? 0;

      const tooltipText = legsForCampaign.length
        ? `Campaign Legs (${legsForCampaign.length}):\n` +
          legsForCampaign
            .map((leg) => {
              const status = leg.isOpen ? "🟢 Open" : "🔴 Closed";
              const strike = leg.strike ? ` @ ${leg.strike}` : "";
              const expiry = leg.expiry ? ` (Exp: ${leg.expiry})` : "";
              return `${status} | ${leg.qty} ${leg.type}${strike}${expiry}`;
            })
            .join("\n")
        : "No legs in this campaign";

      map.set(campaignId, {
        realizedPL,
        margin,
        arom: computeAROM(realizedPL, margin, durationDays),
        durationDays,
        legCount: legsForCampaign.length,
        endDateTime,
        tooltipText
      });
    }

    return map;
  }, [campaigns, campaignLegsMap, peakMarginByCampaign]);

  const maxDurationDays = Math.max(
    1,
    ...campaigns.map(
      (campaign) =>
        campaignMetricsMap.get(String(campaign.id))?.durationDays ?? 0
    )
  );

  const sortedCampaigns = useMemo(() => {
    const direction = sortConfig.direction === "asc" ? 1 : -1;

    return [...campaigns].sort((a, b) => {
      const aMetrics = campaignMetricsMap.get(String(a.id));
      const bMetrics = campaignMetricsMap.get(String(b.id));

      if (sortConfig.field === "name") {
        return direction * (a.name || "").localeCompare(b.name || "");
      }

      let aValue;
      let bValue;

      switch (sortConfig.field) {
        case "margin":
          aValue = toSortableNumber(aMetrics?.margin);
          bValue = toSortableNumber(bMetrics?.margin);
          break;
        case "realizedPL":
          aValue = toSortableNumber(aMetrics?.realizedPL);
          bValue = toSortableNumber(bMetrics?.realizedPL);
          break;
        case "duration":
          aValue = toSortableNumber(aMetrics?.durationDays);
          bValue = toSortableNumber(bMetrics?.durationDays);
          break;
        case "legs":
          aValue = toSortableNumber(aMetrics?.legCount);
          bValue = toSortableNumber(bMetrics?.legCount);
          break;
        case "endDate":
          aValue = toSortableNumber(aMetrics?.endDateTime);
          bValue = toSortableNumber(bMetrics?.endDateTime);
          break;
        default:
          return 0;
      }

      return direction * (aValue - bValue);
    });
  }, [campaigns, campaignMetricsMap, sortConfig]);

  const getSortIndicator = (field) => {
    if (sortConfig.field !== field) return "";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  return (
    <div className="table-container">
      <table className="summary-table campaign-table">
        <colgroup>
          <col style={{ width: "14%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "10%" }} />
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
              onClick={() => handleSort("endDate")}
              style={{ cursor: "pointer", userSelect: "none" }}
              className="numeric-column"
            >
              Closed{getSortIndicator("endDate")}
            </th>
            <th
              className="numeric-column"
              onClick={() => handleSort("margin")}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              Margin{getSortIndicator("margin")}
            </th>
            <th
              className="numeric-column"
              onClick={() => handleSort("realizedPL")}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              Realized P&amp;L{getSortIndicator("realizedPL")}
            </th>
            <th
              onClick={() => handleSort("duration")}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              Days{getSortIndicator("duration")}
            </th>
            <th className="numeric-column">AROM</th>
            <th
              className="numeric-column"
              onClick={() => handleSort("legs")}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              Legs{getSortIndicator("legs")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedCampaigns.map((campaign) => {
            const metrics = campaignMetricsMap.get(String(campaign.id));
            const durationDays = metrics?.durationDays ?? 0;
            const durationPercent = Math.max(
              5,
              (durationDays / maxDurationDays) * 100
            );
            const realizedPL = metrics?.realizedPL ?? 0;

            return (
              <tr
                key={campaign.id}
                onClick={() => onSelect(campaign.id)}
                title={metrics?.tooltipText || "No legs in this campaign"}
                style={{ cursor: "pointer" }}
              >
                <td className="campaign-name-cell">
                  <span style={{ fontWeight: "bold" }}>
                    {campaign.name || campaign.ticker || "Unnamed"}
                  </span>
                </td>
                <td className="numeric-column">
                  <span className="campaign-date-full">{campaign.endDate || "-"}</span>
                  <span className="campaign-date-short">
                    {formatShortDate(campaign.endDate)}
                  </span>
                </td>
                <td className="numeric-column">
                  {fmtWholeDollars(metrics?.margin ?? 0)}
                </td>
                <td className={`numeric-column ${cashClass(realizedPL)}`}>
                  {fmtWholeDollars(realizedPL)}
                </td>
                <td>
                <div className="progress-container">
                  <div className="progress-bar-wrapper">
                    <div
                      className="progress-bar-fill progress-normal"
                      style={{ width: `${durationPercent}%` }}
                    />
                  </div>
                  <span style={{ fontSize: "12px", minWidth: "12px", fontWeight: 500 }}>
                    {durationDays}d
                  </span>
                </div>
              </td>
                <td className="numeric-column">
                  {metrics?.arom == null ? "—" : `${metrics.arom.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`}
                </td>
                <td className="numeric-column">
                  {metrics?.legCount ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}