// src/components/CashFlowChart.jsx
import React, { useMemo } from "react";
import { fmt } from "../logic/logic.js";
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
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const chartData = useMemo(() => {
    const parseTimestamp = (dateVal) => {
      if (!dateVal) return null;
      const t = new Date(dateVal).getTime();
      return isNaN(t) ? null : t;
    };

    // Safely handles strings, Dates, and timestamps
    const isWithinRange = (dateVal) => {
      if (!dateVal) return false;
      
      let cleanDate;
      if (typeof dateVal === "string") {
        cleanDate = dateVal.slice(0, 10);
      } else {
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return false;
        
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        cleanDate = `${year}-${month}-${day}`;
      }

      if (startDateFilter && cleanDate < startDateFilter) return false;
      if (endDateFilter && cleanDate > endDateFilter) return false;
      return true;
    };

    let targetLegs = [];
    if (mode === "single" || campaign) {
      targetLegs = legs.filter((l) => l.campaignId === campaign.id);
    } else {
      targetLegs = legs;
    }

    const events = [];

    targetLegs.forEach((leg) => {
      const typeStr = String(leg.type || "").toLowerCase();
      const isStock = typeStr.includes("stock");
      const multiplier = isStock ? 1 : 100;
      const isSell = typeStr.includes("sell") || typeStr.includes("short");

      // Open Event
      if (leg.openDate && leg.openPrice != null && isWithinRange(leg.openDate)) {
        const openVal = Number(leg.openPrice) * Number(leg.qty || 1) * multiplier;
        const cashFlow = isSell ? openVal : -openVal;
        const ts = parseTimestamp(leg.openDate);
        if (ts) events.push({ timestamp: ts, dateStr: String(leg.openDate), amount: cashFlow });
      }

      // Close Event
      if (leg.closeDate && leg.closePrice != null && !leg.isOpen && isWithinRange(leg.closeDate)) {
        const closeVal = Number(leg.closePrice) * Number(leg.qty || 1) * multiplier;
        const cashFlow = isSell ? -closeVal : closeVal;
        const ts = parseTimestamp(leg.closeDate);
        if (ts) events.push({ timestamp: ts, dateStr: String(leg.closeDate), amount: cashFlow });
      }
    });

    if (events.length === 0) return [];

    const dateGroups = {};
    events.forEach((ev) => {
      if (!dateGroups[ev.timestamp]) {
        dateGroups[ev.timestamp] = { amount: 0, dateStr: ev.dateStr };
      }
      dateGroups[ev.timestamp].amount += ev.amount;
    });

    const sortedTimestamps = Object.keys(dateGroups).map(Number).sort((a, b) => a - b);
    const timeline = [];
    let cumulativePL = 0;

    if (sortedTimestamps.length > 0) {
      timeline.push({
        timestamp: sortedTimestamps[0] - 86400000, 
        dateStr: "Start",
        cumulativePL: 0,
      });
    }

    sortedTimestamps.forEach((ts) => {
      cumulativePL += dateGroups[ts].amount;
      timeline.push({
        timestamp: ts,
        dateStr: dateGroups[ts].dateStr,
        cumulativePL: Number(cumulativePL.toFixed(2)),
      });
    });

    return timeline;
  }, [legs, campaign, mode, startDateFilter, endDateFilter]);

  if (chartData.length === 0) {
    return (
      <div style={{ background: "#111f3f", padding: "16px", borderRadius: "8px", border: "1px solid #24345f", marginBottom: "24px", color: "#a0aec0", textAlign: "center" }}>
        No cash flow events found within the selected date range.
      </div>
    );
  }

  return (
    <div style={{ background: "#111f3f", padding: "16px", borderRadius: "8px", border: "1px solid #24345f", marginBottom: "24px" }}>
      <h3 style={{ color: "#9fb3ff", marginTop: 0, marginBottom: "16px" }}>Cumulative Net Premium & Cash Flow</h3>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />
            <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} tickFormatter={formatXAxis} stroke="#9fb3ff" tick={{ fontSize: 12 }} />
            <YAxis stroke="#9fb3ff" tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: "#1b2b4f", borderColor: "#24345f", color: "#fff", borderRadius: "6px" }} formatter={(val) => [fmt(val), "Net Cash Flow"]} labelFormatter={(ts) => `Date: ${formatXAxis(ts) || "Baseline"}`} />
            <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="3 3" />
            <Area type="stepAfter" dataKey="cumulativePL" stroke="#10b981" fill="#10b981" fillOpacity={0.2} activeDot={{ r: 6 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}