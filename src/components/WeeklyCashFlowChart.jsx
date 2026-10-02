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
  LabelList,
} from "recharts";

export default function WeeklyCashFlowChart({
  legs = [],
  campaigns = [],
  dailySeries: providedDailySeries = null,
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
      maximumFractionDigits: 2,
    }).format(val);

  const chartData = useMemo(() => {
    const targetLegs =
      mode === "single" || campaign
        ? legs.filter((leg) => leg.campaignId === campaign?.id)
        : legs;

    const targetCampaigns = campaign ? [campaign] : campaigns;

    const sourceDailySeries =
      providedDailySeries && mode !== "single" && !campaign
        ? providedDailySeries
        : computeDailyCashFlowSeries(targetLegs, targetCampaigns);

    const getWeekBoundary = (dateString, endOfWeek = false) => {
      const [year, month, day] = dateString.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      const daysFromMonday = (date.getDay() + 6) % 7;
    
      date.setDate(
        date.getDate() + (endOfWeek ? 6 - daysFromMonday : -daysFromMonday)
      );
    
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
    };
    
    const effectiveStartDate = startDateFilter
      ? getWeekBoundary(startDateFilter)
      : "";
    const effectiveEndDate = endDateFilter
      ? getWeekBoundary(endDateFilter, true)
      : "";
    
    const filteredDailySeries = sourceDailySeries.filter((day) => {
      if (effectiveStartDate && day.date < effectiveStartDate) return false;
      if (effectiveEndDate && day.date > effectiveEndDate) return false;
      return true;
    });

    return computeWeeklyCashFlowSeries(filteredDailySeries).map((entry) => ({
      ...entry,
      annualizedCashFlow: entry.netCashFlow * 52,
    }));
  }, [
    legs,
    campaigns,
    providedDailySeries,
    campaign,
    mode,
    startDateFilter,
    endDateFilter,
  ]);

  const weeklyTicks = useMemo(() => {
    const values = chartData.map((entry) => entry.netCashFlow);
    let min = Math.round(Math.min(0, ...values)*1.05/1000)*1000;
    let max = Math.round(Math.max(0, ...values)*1.05/1000)*1000;
  
    if (min === max) {
      min -= 1;
      max += 1;
    }
  
    const step = (max - min) / 5;
    return Array.from({ length: 6 }, (_, index) => min + step * index);
  }, [chartData]);
  
  const annualizedTicks = weeklyTicks.map((value) => value * 52);

  const averageWeekly = chartData.length
    ? chartData.reduce((sum, entry) => sum + entry.netCashFlow, 0) / chartData.length
    : 0;

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
              tickFormatter={formatWeekStart}
              stroke="#9fb3ff"
              tick={{ fontSize: 12 }}
              // interval={0}
            />

            <YAxis
              yAxisId="weekly"
              stroke="#9fb3ff"
              tickFormatter={formatYAxis}
              tick={{ fontSize: 12 }}
              // domain={["auto", "auto"]}
              domain={[weeklyTicks[0], weeklyTicks[5]]}
              ticks={weeklyTicks}
            />
            
            <YAxis
              yAxisId="annualized"
              orientation="right"
              width={90}
              stroke="#60a5fa"
              tickFormatter={formatAnnualized}
              tick={{ fontSize: 12 }}
              // domain={["auto", "auto"]}
              // tickCount={6}
              domain={[annualizedTicks[0], annualizedTicks[5]]}
              ticks={annualizedTicks}
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
              cursor={{ fill: "#ffffff", fillOpacity: 0.08, stroke: "none" }}
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
            >

              <LabelList
                dataKey="netCashFlow"
                content={({ x, y, width, height, value }) => {
                  const label = fmtWholeDollars(value);
                  const fits = height >= 26 && width >= label.length * 7 + 12;

                  if (!fits) return null;

                  return (
                    <text
                      x={x + width / 2}
                      y={y + height / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#ffffff8c"
                      fontSize={12}
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {label}
                    </text>
                  );
                }}
              />
            </Bar>       
            
            <ReferenceLine
              yAxisId="annualized"
              y={0}
              stroke="#f8f8fa"
              // strokeDasharray="3 3"
            />
{/* 
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
            />   */}

            <ReferenceLine
              yAxisId="weekly"
              y={averageWeekly}
              stroke="#ffffffa8"
              strokeWidth={3}
              strokeOpacity={0.75}
              // strokeDasharray="6 4"
              label={{
                value: `Average: ${fmtWholeDollars(averageWeekly)}/week | ${fmtWholeDollars(averageWeekly * 52)}/year`,
                position: "insideBottomLeft",
                fill: "#ffffffa8",
                fontSize: 16,
                fontWeight: "bold",
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}