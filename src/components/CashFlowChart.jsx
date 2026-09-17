// src/components/CashFlowChart.jsx
import React, { useMemo } from "react";
import { fmt, computeDailyCashFlowSeries } from "../logic/logic.js";
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

export default function CashFlowChart({
  legs = [],
  campaigns = [],
  campaign = null,
  mode = "dashboard",
  startDateFilter = "",
  endDateFilter = "",
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
      : d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
  };

  const chartData = useMemo(() => {
    let targetLegs = [];
    if (mode === "single" || campaign) {
      targetLegs = legs.filter((l) => l.campaignId === campaign?.id);
    } else {
      targetLegs = legs;
    }

    // Pass campaigns array to logic helper so it can map campaign tickers
    const targetCampaigns = campaign ? [campaign] : campaigns;
    const fullSeries = computeDailyCashFlowSeries(targetLegs, targetCampaigns);

    const filteredSeries = fullSeries.filter((day) => {
      if (startDateFilter && day.date < startDateFilter) return false;
      if (endDateFilter && day.date > endDateFilter) return false;
      return true;
    });

    if (filteredSeries.length === 0) return [];

    const firstDisplayedIndex = fullSeries.findIndex(
      (day) => day.date === filteredSeries[0].date
    );

    const baselinePL =
      firstDisplayedIndex > 0
        ? fullSeries[firstDisplayedIndex - 1].cumulativeCashFlow
        : 0;

    const firstDayDate = new Date(`${filteredSeries[0].date}T00:00:00`);
    const baselineTimestamp = firstDayDate.getTime() - 86400000;

    const timeline = [
      {
        timestamp: baselineTimestamp,
        dateStr: "Start",
        netCashFlow: 0,
        cumulativeCashFlow: baselinePL,
        labels: "Baseline",
      },
    ];

    filteredSeries.forEach((day) => {
      const timestamp = new Date(`${day.date}T00:00:00`).getTime();
      timeline.push({
        ...day,
        timestamp,
        dateStr: day.date,
      });
    });

    return timeline;
  }, [legs, campaigns, campaign, mode, startDateFilter, endDateFilter]);

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
        No cash flow events found within the selected date range.
      </div>
    );
  }

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
        Cumulative Net Premium & Cash Flow
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
              domain={["auto", "auto"]}
              padding={{ top: 5, bottom: 5 }}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;

                const data = payload[0].payload;
                const dateStr = formatXAxis(data.timestamp) || "Baseline";
                
                // Split comma-separated labels into an array (if any exist)
                const labelList = data.labels && data.labels !== "Baseline" 
                  ? data.labels.split(", ") 
                  : [];

                return (
                  <div
                    style={{
                      backgroundColor: "#1b2b4f",
                      border: "1px solid #24345f",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      color: "#fff",
                      maxWidth: "280px", // Prevents the tooltip from growing too wide
                    }}
                  >
                    {/* Header Date */}
                    <div style={{ fontWeight: "bold", marginBottom: "4px", fontSize: "13px" }}>
                      Date: {dateStr}
                    </div>

                    {/* Cumulative Cash Flow */}
                    <div style={{ fontSize: "12px", marginBottom: "3px", color: "#10b981" }}>
                      Cumulative Net: {fmt(data.cumulativeCashFlow)}
                    </div>

                    {/* Daily Net Cash Flow */}
                    <div
                      style={{
                        fontSize: "12px",
                        marginBottom: "6px",
                        color: data.netCashFlow >= 0 ? "#10b981" : "#f87171",
                      }}
                    >
                      Daily Net: {fmt(data.netCashFlow)}
                    </div>

                    {/* Small Ticker / Campaign Contributor Labels */}
                    {labelList.length > 0 && (
                      <div
                        style={{
                          borderTop: "1px solid #24345f",
                          paddingTop: "6px",
                          marginTop: "4px",
                        }}
                      >
                        <div style={{ fontSize: "10px", color: "#9fb3ff", marginBottom: "2px", fontWeight: "600" }}>
                          Contributors:
                        </div>
                        <div
                          style={{
                            fontSize: "11px",        // Smaller font size for tickers
                            lineHeight: "1.3",
                            color: "#cbd5e1",
                            maxHeight: "120px",      // Scrollable if there are many transactions
                            overflowY: "auto",
                          }}
                        >
                          {labelList.map((item, idx) => (
                            <div key={idx} style={{ marginBottom: "2px" }}>
                              • {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />

            <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="3 3" />

            <Area
              type="stepAfter"
              dataKey="cumulativeCashFlow"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.2}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}