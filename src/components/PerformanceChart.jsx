import React, { useMemo } from "react";
import { fmt, computeCampaignSummary } from "../logic/logic.js";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

export default function PerformanceChart({ closedCampaigns, legs }) {
  // Compute cumulative P/L timeline data from closed campaigns
  const chartData = useMemo(() => {
    const sortedClosed = [...closedCampaigns].sort(
      (a, b) => new Date(a.endDate || 0) - new Date(b.endDate || 0)
    );

    let cumulativePL = 0;
    return sortedClosed.map((c) => {
      const cLegs = legs.filter((l) => l.campaignId === c.id);
      const pl = computeCampaignSummary(c, cLegs).totalPL || 0;
      cumulativePL += pl;

      return {
        date: c.endDate || "N/A",
        ticker: c.ticker,
        pl: pl,
        cumulativePL: cumulativePL,
      };
    });
  }, [closedCampaigns, legs]);

  const formatYAxis = (val) => 
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 0
  }).format(val);

  if (chartData.length === 0) {
    return (
      <div style={{ background: "#111f3f", padding: "16px", borderRadius: "8px", border: "1px solid #24345f", marginBottom: "24px", color: "#a0aec0", textAlign: "center" }}>
        No closed campaign data available for this selection.
      </div>
    );
  }

  return (
    <div style={{ background: "#111f3f", padding: "16px", borderRadius: "8px", border: "1px solid #24345f", marginBottom: "24px" }}>
      <h3 style={{ color: "#9fb3ff", marginTop: 0, marginBottom: "16px" }}>Cumulative Performance</h3>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />
            <XAxis dataKey="date" stroke="#9fb3ff" />
            
            {/* Formats Y-Axis numbers with commas using fmt() */}
            <YAxis 
              stroke="#9fb3ff" 
              tickFormatter={formatYAxis} 
            />
            
            <Tooltip
              contentStyle={{ backgroundColor: "#1b2b4f", borderColor: "#24345f", color: "#fff" }}
              formatter={(val) => [fmt(val), "Cumulative P/L"]}
            />
            <Area type="monotone" dataKey="cumulativePL" stroke="#3182ce" fill="#3182ce" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}