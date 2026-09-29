import React, { useState, useMemo } from "react";
import {
  fmtWholeDollars,
  cashClass,
  computeCampaignProjectedPL,
  computeMarginEstimate,
  fmtCampaignDaysLeft,
  getCalendarDay,
  computeAROM,
  getCampaignDuration,
} from "../logic/logic.js";
import DaysLeftProgressBar from "./DaysLeftProgressBar.jsx";

function toSortableNumber(value, fallback = Number.POSITIVE_INFINITY) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

export default function OpenCampaignTable({ 
  campaigns, legs, peakMarginByCampaign, onSelect 
}) {

  const [sortConfig, setSortConfig] = useState({
    field: "daysLeft",
    direction: "asc"
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
      const daysLeft = fmtCampaignDaysLeft(campaign, legsForCampaign);
      const projectedPL = computeCampaignProjectedPL(
        legsForCampaign,
        campaign
      );

      const startDate =
        getCalendarDay(campaign.startDate) ||
        legsForCampaign
          .map((leg) => getCalendarDay(leg.openDate))
          .filter(Boolean)
          .sort()[0] ||
        "";

      const durationDays = getCampaignDuration(legsForCampaign);
      const peakMargin = peakMarginByCampaign.get(campaignId) ?? 0;
      const arom = computeAROM(projectedPL, peakMargin, durationDays);

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
        legsForCampaign,
        legCount: legsForCampaign.length,
        startDate,
        daysLeft,
        projectedPL,
        arom,
        durationDays,
        tooltipText
      });
    }

    return map;
  }, [campaigns, campaignLegsMap, peakMarginByCampaign]);

  const openLegs = useMemo(
    () => legs.filter((leg) => leg.isOpen),
    [legs]
  );

  const marginByCampaign = useMemo(
    () => computeMarginEstimate(openLegs).byCampaign,
    [openLegs]
  );

  const sortedCampaigns = useMemo(() => {
    const direction = sortConfig.direction === "asc" ? 1 : -1;

    return [...campaigns].sort((a, b) => {
      const aMetrics = campaignMetricsMap.get(String(a.id));
      const bMetrics = campaignMetricsMap.get(String(b.id));

      if (sortConfig.field === "name") {
        return direction * (a.name || "").localeCompare(b.name || "");
      }

      if (sortConfig.field === "startDate") {
        const aDate = aMetrics?.startDate || "";
        const bDate = bMetrics?.startDate || "";

        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;

        return direction * aDate.localeCompare(bDate);
      }

      let aValue;
      let bValue;

      switch (sortConfig.field) {
        case "margin":
          aValue = toSortableNumber(marginByCampaign[String(a.id)], 0);
          bValue = toSortableNumber(marginByCampaign[String(b.id)], 0);
          break;
        case "projectedPL":
          aValue = toSortableNumber(aMetrics?.projectedPL, 0);
          bValue = toSortableNumber(bMetrics?.projectedPL, 0);
          break;
        case "daysLeft":
          aValue = toSortableNumber(aMetrics?.daysLeft);
          bValue = toSortableNumber(bMetrics?.daysLeft);
          break;
        case "legs":
          aValue = toSortableNumber(aMetrics?.legCount, 0);
          bValue = toSortableNumber(bMetrics?.legCount, 0);
          break;
        default:
          return 0;
      }

      return direction * (aValue - bValue);
    });
  }, [campaigns, campaignMetricsMap, marginByCampaign, sortConfig]);

  const getSortIndicator = (field) => {
    if (sortConfig.field !== field) return " ↕";
    return sortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  return (
    <div className="open-campaigns-container">
      <div className="table-container">
        <table className="summary-table campaign-table campaign-table-open">
        <colgroup>
          <col style={{ width: "18%" }} />
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
                onClick={() => handleSort("startDate")}
                style={{ cursor: "pointer", userSelect: "none" }}
                className="numeric-column"
              >
                Opened{getSortIndicator("startDate")}
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
                onClick={() => handleSort("projectedPL")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Projected P&amp;L{getSortIndicator("projectedPL")}
              </th>
              <th
                onClick={() => handleSort("daysLeft")}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Timeline (DTE){getSortIndicator("daysLeft")}
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
              const estimatedMargin =
                marginByCampaign[String(campaign.id)] ?? 0;
              const daysLeft = metrics?.daysLeft ?? null;
              const projectedPL = metrics?.projectedPL ?? 0;
              const legCount = metrics?.legCount ?? 0;

              return (
                <tr
                  key={campaign.id}
                  onClick={() => onSelect(campaign.id)}
                  title={metrics?.tooltipText || "No legs in this campaign"}
                  style={{ cursor: "pointer" }}
                >
                  <td className="campaign-name-cell">
                    <span style={{ fontWeight: "bold" }}>
                      {campaign.name}
                    </span>
                  </td>
                  <td className="numeric-column">{metrics?.startDate || "-"}</td>
                  <td className="numeric-column">
                    {fmtWholeDollars(estimatedMargin)}
                  </td>
                  <td
                    className={`numeric-column ${cashClass(projectedPL)}`}
                  >
                    {fmtWholeDollars(projectedPL)}
                  </td>
                  <td>
                    <DaysLeftProgressBar daysLeft={daysLeft} />
                  </td>
                  <td className="numeric-column">
                    {metrics?.arom == null ? "—" : `${metrics.arom.toFixed(1)}%`}
                  </td>
                  <td className="numeric-column">{legCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}