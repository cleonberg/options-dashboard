// src/components/CashFlowChart.jsx
import React, { useMemo } from "react";
import { 
  fmtWholeDollars, 
  computeDailyCashFlowSeries,
  computeWeeklyCashFlowSeries 
} from "../logic/logic.js";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  Rectangle,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export default function WeeklyCashFlowChart({
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

    const chartData = useMemo(() => {
    const targetLegs =
      mode === "single" || campaign
        ? legs.filter((leg) => leg.campaignId === campaign?.id)
        : legs;

    const targetCampaigns = campaign ? [campaign] : campaigns;

    const dailySeries = computeDailyCashFlowSeries(
      targetLegs,
      targetCampaigns
    ).filter((day) => {
      if (startDateFilter && day.date < startDateFilter) return false;
      if (endDateFilter && day.date > endDateFilter) return false;
      return true;
    });

    return computeWeeklyCashFlowSeries(dailySeries).map((entry) => ({
      ...entry,
      annualizedCashFlow: entry.netCashFlow * 52,
    }));
  }, [
    legs,
    campaigns,
    campaign,
    mode,
    startDateFilter,
    endDateFilter,
  ]);

  const formatWeekStart = (weekStart) => {
    const [year, month, day] = weekStart.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatAnnualized = (value) =>
    `${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 0,
    }).format(value)}/year`;    

  const monthlyTickKeys = chartData
    .filter((entry, index, data) => {
      const monthKey = entry.weekStart.slice(0, 7);
      const previousMonthKey =
        index > 0 ? data[index - 1].weekStart.slice(0, 7) : null;

      return monthKey !== previousMonthKey;
    })
    .map((entry) => entry.weekStart);

  const [minWeekly, maxWeekly] = useMemo(() => {
    const values = chartData.map((d) => d.netCashFlow);
    return [Math.min(0, ...values)*1.05, Math.max(0, ...values)*1.05];
  }, [chartData]);

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
        No weekly cash flow events found within the selected date range.
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ color: "#9fb3ff", marginTop: 0, marginBottom: "16px" }}>
        Weekly Net Cash Flow
      </h3>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />

            <XAxis
              dataKey="weekStart"
              type="category"
              ticks={monthlyTickKeys}
              tickFormatter={formatWeekStart}
              stroke="#9fb3ff"
              tick={{ fontSize: 12 }}
              interval="preserveStartEnd"
            />

            <YAxis
              yAxisId="weekly"
              stroke="#9fb3ff"
              tickFormatter={formatYAxis}
              tick={{ fontSize: 12 }}
              domain={["auto", "auto"]}
            />
            
            <YAxis
              yAxisId="annualized"
              orientation="right"
              width={90}
              stroke="#60a5fa"
              tickFormatter={formatAnnualized}
              tick={{ fontSize: 12 }}
              domain={["auto", "auto"]}
              // tickCount={6}
              includeHidden
            />            
            <Line
              yAxisId="annualized"
              dataKey="annualizedCashFlow"
              stroke="none"
              dot={false}
              activeDot={false}
              hide
            />

            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
            
                const data = payload[0].payload;
                const isPositive = data.netCashFlow >= 0;
            
                return (
                  <div
                    style={{
                      backgroundColor: "#1b2b4f",
                      border: "1px solid #24345f",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      color: "#fff",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                        marginBottom: "4px",
                        fontSize: "13px",
                      }}
                    >
                      Week of: {formatWeekStart(data.weekStart)}
                    </div>
            
                    <div
                      style={{
                        fontSize: "12px",
                        color: isPositive ? "#10b981" : "#f87171",
                      }}
                    >
                      Weekly Net: {fmtWholeDollars(data.netCashFlow)}
                    </div>
                  </div>
                );
              }}
            />            

            <Bar
              yAxisId="weekly"
              dataKey="netCashFlow"
              barCategoryGap="20%"
              radius={[3, 3, 0, 0]}
              shape={(props) => (
                <Rectangle
                  {...props}
                  fill={props.payload.netCashFlow >= 0 ? "#10b981" : "#f87171"}
                />
              )}
            />       

            <ReferenceLine
              yAxisId="annualized"
              y={0}
              stroke="#f8f8fa"
              strokeDasharray="3 3"
            />

            <ReferenceLine
              yAxisId="annualized"
              y={80000}
              stroke="#11f5a9"
              strokeDasharray="6 4"
            />

            <ReferenceLine
              yAxisId="annualized"
              y={160000}
              stroke="#11f5a9"
              strokeDasharray="6 4"
            />  
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}