// src/components/PerformanceChart.jsx
import React, { useMemo } from "react";
import { fmt, computeCampaignSummary } from "../logic/logic.js";
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
    if (!timestamp) return "";
    const d = new Date(timestamp);
    return isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const chartData = useMemo(() => {
    const parseTimestamp = (dateStr) => {
      if (!dateStr) return null;
      const t = new Date(dateStr).getTime();
      return isNaN(t) ? null : t;
    };

    // Single Campaign Mode
    if (mode === "single" || campaign) {
      const targetCampaign = campaign || closedCampaigns[0];
      if (!targetCampaign) return [];

      const campaignLegs = legs.filter((l) => l.campaignId === targetCampaign.id);

      const openDate =
        targetCampaign.startDate ||
        (campaignLegs.length > 0
          ? campaignLegs[0].openDate || campaignLegs[0].OpenDate
          : null);

      const openTimestamp = parseTimestamp(openDate) || Date.now();

      // Read stored name directly
      const campaignName = targetCampaign.name || targetCampaign.ticker;

      const timeline = [
        {
          timestamp: openTimestamp,
          dateStr: openDate || "Opened",
          cumulativePL: 0,
          labels: "Baseline",
        },
      ];

      const closedLegs = campaignLegs
        .filter((l) => !l.isOpen && (l.closeDate || l.CloseDate))
        .sort((a, b) => {
          const dateA = new Date(a.closeDate || a.CloseDate);
          const dateB = new Date(b.closeDate || b.CloseDate);
          return dateA - dateB;
        });

      let runningPL = 0;
      const dateGroups = {};

      closedLegs.forEach((leg) => {
        const cDate = leg.closeDate || leg.CloseDate;
        const legPL = computeCampaignSummary(targetCampaign, [leg]).totalPL || 0;
        dateGroups[cDate] = (dateGroups[cDate] || 0) + legPL;
      });

      Object.keys(dateGroups).forEach((dateStr) => {
        runningPL += dateGroups[dateStr];
        const ts = parseTimestamp(dateStr);
        if (ts) {
          timeline.push({
            timestamp: ts,
            dateStr: dateStr,
            cumulativePL: Number(runningPL.toFixed(2)),
            labels: campaignName,
          });
        }
      });

      return timeline;
    }

    // Dashboard Mode (Multi-campaign timeline)
    const sortedClosed = [...closedCampaigns].sort(
      (a, b) => new Date(a.endDate || 0) - new Date(b.endDate || 0)
    );

    let cumulativePL = 0;
    return sortedClosed
      .map((c) => {
        const cLegs = legs.filter((l) => l.campaignId === c.id);
        const pl = computeCampaignSummary(c, cLegs).totalPL || 0;
        cumulativePL += pl;

        const dateStr = c.endDate || c.startDate;
        const ts = parseTimestamp(dateStr);

        // Read stored name directly
        const campaignName = c.name || c.ticker;

        return ts
          ? {
              timestamp: ts,
              dateStr: dateStr,
              labels: campaignName,
              pl: pl,
              cumulativePL: Number(cumulativePL.toFixed(2)),
            }
          : null;
      })
      .filter(Boolean);
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
        {isSingleMode ? "Campaign Realized P/L Trajectory" : "Cumulative Performance"}
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
            <YAxis stroke="#9fb3ff" tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;

                const data = payload[0].payload;
                const dateStr = formatXAxis(data.timestamp) || "Baseline";
                const labelVal = data.labels || "";

                return (
                  <div
                    style={{
                      backgroundColor: "#1b2b4f",
                      border: "1px solid #24345f",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      color: "#fff",
                      maxWidth: "280px",
                    }}
                  >
                    <div style={{ fontWeight: "bold", marginBottom: "4px", fontSize: "13px" }}>
                      Date: {dateStr}
                    </div>

                    <div style={{ fontSize: "12px", marginBottom: "6px", color: "#3182ce" }}>
                      Cumulative P/L: {fmt(data.cumulativePL)}
                    </div>

                    {labelVal && labelVal !== "Baseline" && (
                      <div
                        style={{
                          borderTop: "1px solid #24345f",
                          paddingTop: "6px",
                          marginTop: "4px",
                        }}
                      >
                        <div style={{ fontSize: "10px", color: "#9fb3ff", marginBottom: "2px", fontWeight: "600" }}>
                          Campaign:
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            lineHeight: "1.3",
                            color: "#cbd5e1",
                          }}
                        >
                          • {labelVal}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="cumulativePL"
              stroke="#3182ce"
              fill="#3182ce"
              fillOpacity={0.2}
              dot={isSingleMode ? { r: 4, fill: "#4ade80", stroke: "#3182ce", strokeWidth: 1 } : false}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}