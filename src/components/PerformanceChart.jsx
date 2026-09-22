// src/components/PerformanceChart.jsx
import React, { useMemo } from "react";
import { fmt, fmtWholeDollars, computeCampaignSummary } from "../logic/logic.js";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export default function PerformanceChart({
  closedCampaigns = [],
  legs = [],
  campaign = null,
  mode = "dashboard",
}) {
  const formatYAxis = (val) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 0,
    }).format(val);

  const formatXAxis = (timestamp) => {
    if (timestamp == null) return "";

    const d = new Date(timestamp);
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
  };

  const chartData = useMemo(() => {
    /*
     * IMPORTANT:
     * Treat YYYY-MM-DD values as calendar dates in the user's local
     * timezone. new Date("YYYY-MM-DD") treats them as UTC, which can
     * display one day early in US time zones.
     */
    const parseTimestamp = (dateStr) => {
      if (!dateStr) return null;

      const value = String(dateStr).trim();

      // Calendar date: create local midnight.
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const [, year, month, day] = match.map(Number);
        const timestamp = new Date(year, month - 1, day).getTime();
        return isNaN(timestamp) ? null : timestamp;
      }

      // Timestamp/date-time values retain their normal JS parsing behavior.
      const timestamp = new Date(value).getTime();
      return isNaN(timestamp) ? null : timestamp;
    };

    /*
     * Normalize a date to a YYYY-MM-DD calendar-date key.
     * This is used for grouping so that there can only be ONE chart
     * point for each calendar day.
     */
    const getDateKey = (dateStr) => {
      if (!dateStr) return null;

      const value = String(dateStr).trim();

      // For stored calendar dates, don't run them through UTC conversion.
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
      }

      const timestamp = new Date(value).getTime();
      if (isNaN(timestamp)) return null;

      const d = new Date(timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    /*
     * SINGLE CAMPAIGN MODE
     *
     * There is only one campaign, so group its closed legs by close date.
     * This guarantees one point per day even when multiple legs close on
     * the same day.
     */
    if (mode === "single" || campaign) {
      const targetCampaign = campaign || closedCampaigns[0];
      if (!targetCampaign) return [];

      const campaignLegs = legs.filter(
        (l) => l.campaignId === targetCampaign.id
      );

      const openDate =
        targetCampaign.startDate ||
        (campaignLegs.length > 0
          ? campaignLegs[0].openDate || campaignLegs[0].OpenDate
          : null);

      const openTimestamp = parseTimestamp(openDate) || Date.now();
      const campaignName = targetCampaign.name || targetCampaign.ticker;

      const timeline = [
        {
          timestamp: openTimestamp,
          dateStr: openDate || "Opened",
          pl: 0,
          cumulativePL: 0,
          labels: "Baseline",
          campaigns: [],
        },
      ];

      const dailyGroups = {};

      campaignLegs
        .filter((l) => !l.isOpen && (l.closeDate || l.CloseDate))
        .forEach((leg) => {
          const closeDate = leg.closeDate || leg.CloseDate;
          const dateKey = getDateKey(closeDate);
          if (!dateKey) return;

          const legPL =
            computeCampaignSummary(targetCampaign, [leg]).totalPL || 0;

          if (!dailyGroups[dateKey]) {
            dailyGroups[dateKey] = {
              pl: 0,
              campaigns: [],
            };
          }

          dailyGroups[dateKey].pl += legPL;

          dailyGroups[dateKey].campaigns.push({
            name: campaignName,
            pl: legPL,
          });
        });

      let runningPL = 0;

      Object.keys(dailyGroups)
        .sort()
        .forEach((dateKey) => {
          const group = dailyGroups[dateKey];
          runningPL += group.pl;

          timeline.push({
            timestamp: parseTimestamp(dateKey),
            dateStr: dateKey,
            pl: Number(group.pl.toFixed(2)),
            cumulativePL: Number(runningPL.toFixed(2)),
            labels: campaignName,
            campaigns: group.campaigns,
          });
        });

      return timeline;
    }

    /*
     * DASHBOARD MODE
     *
     * Group ALL campaigns by calendar end date first. This is the critical
     * fix for the vertical-line problem: two campaigns closing on the same
     * day become ONE chart point instead of two points at the same X value.
     */
    const dailyGroups = {};

    closedCampaigns.forEach((c) => {
      const dateStr = c.endDate || c.startDate;
      const dateKey = getDateKey(dateStr);
      if (!dateKey) return;

      const cLegs = legs.filter((l) => l.campaignId === c.id);
      const pl = computeCampaignSummary(c, cLegs).totalPL || 0;
      const campaignName = c.name || c.ticker;

      if (!dailyGroups[dateKey]) {
        dailyGroups[dateKey] = {
          pl: 0,
          campaigns: [],
        };
      }

      dailyGroups[dateKey].pl += pl;

      dailyGroups[dateKey].campaigns.push({
        name: campaignName,
        pl,
      });
    });

    let cumulativePL = 0;

    return Object.keys(dailyGroups)
      .sort()
      .map((dateKey) => {
        const group = dailyGroups[dateKey];
        cumulativePL += group.pl;

        return {
          timestamp: parseTimestamp(dateKey),
          dateStr: dateKey,
          labels: group.campaigns.map((c) => c.name).join(", "),
          pl: Number(group.pl.toFixed(2)),
          cumulativePL: Number(cumulativePL.toFixed(2)),
          campaigns: group.campaigns,
        };
      });
  }, [closedCampaigns, legs, campaign, mode]);

  if (chartData.length === 0) {
    return (
      <div
        style={{
          background: "#111f3f",
          padding: "16px",
          borderRadius: "8px",
          border: "1px solid #24345f",
          marginBottom: "24px",
          color: "#a0aec0",
          textAlign: "center",
        }}
      >
        No closed performance data available for this chart.
      </div>
    );
  }

  const isSingleMode = mode === "single" || Boolean(campaign);

  return (
    <div
      style={{
        background: "#111f3f",
        padding: "16px",
        borderRadius: "8px",
        border: "1px solid #24345f",
        marginBottom: "24px",
      }}
    >
      <h3 style={{ color: "#9fb3ff", marginTop: 0, marginBottom: "16px" }}>
        {isSingleMode
          ? "Campaign Realized P/L Trajectory"
          : "Cumulative Performance"}
      </h3>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />

            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatXAxis}
              stroke="#9fb3ff"
              tick={{ fontSize: 12 }}
            />

            <YAxis
              stroke="#9fb3ff"
              tickFormatter={formatYAxis}
              tick={{ fontSize: 12 }}
            />

            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;

                const data = payload[0].payload;
                const dateStr = formatXAxis(data.timestamp) || "Baseline";

                return (
                  <div
                    style={{
                      backgroundColor: "#1b2b4f",
                      border: "1px solid #24345f",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      color: "#fff",
                      maxWidth: "300px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                        marginBottom: "4px",
                        fontSize: "13px",
                      }}
                    >
                      Date: {dateStr}
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        marginBottom: "6px",
                        color: "#3182ce",
                      }}
                    >
                      Cumulative P/L: {fmtWholeDollars(data.cumulativePL)}
                    </div>

                    {data.campaigns && data.campaigns.length > 0 && (
                      <div
                        style={{
                          borderTop: "1px solid #24345f",
                          paddingTop: "6px",
                          marginTop: "4px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#9fb3ff",
                            marginBottom: "4px",
                            fontWeight: "600",
                          }}
                        >
                          Campaign Impact:
                        </div>

                        {data.campaigns.map((item, index) => (
                          <div
                            key={`${item.name}-${index}`}
                            style={{
                              fontSize: "11px",
                              lineHeight: "1.4",
                              color: "#cbd5e1",
                            }}
                          >
                            • {item.name}:{" "}
                            <span
                              style={{
                                color:
                                  item.pl >= 0 ? "#10b981" : "#ef4444",
                                fontWeight: "bold",
                              }}
                            >
                              {fmtWholeDollars(item.pl)}
                            </span>
                          </div>
                        ))}

                        <div
                          style={{
                            borderTop: "1px solid #24345f",
                            marginTop: "5px",
                            paddingTop: "5px",
                            fontSize: "11px",
                            fontWeight: "bold",
                          }}
                        >
                          Daily Net P/L: {fmtWholeDollars(data.pl)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            <ReferenceLine
              y={0}
              stroke="#4a5568"
              strokeDasharray="3 3"
            />

            <Area
              type="monotone"
              dataKey="cumulativePL"
              stroke="#3182ce"
              fill="#3182ce"
              fillOpacity={0.2}
              dot={
                isSingleMode
                  ? {
                      r: 4,
                      fill: "#4ade80",
                      stroke: "#3182ce",
                      strokeWidth: 1,
                    }
                  : false
              }
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
