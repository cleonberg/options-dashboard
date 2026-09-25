import React, { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  computeMarginHistorySeries,
  fmtWholeDollars,
} from "../logic/logic.js";

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export default function MarginChart({
  legs = [],
  startDateFilter = "",
  endDateFilter = "",
}) {
  const data = useMemo(
    () =>
      computeMarginHistorySeries(legs, {
        startDate: startDateFilter,
        endDate: endDateFilter,
      }),
    [legs, startDateFilter, endDateFilter]
  );

  if (data.length === 0) {
    return (
      <div className="card">
        No margin history is available for this date range.
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ color: "#9fb3ff", marginTop: 0 }}>
        Estimated Margin Over Time
      </h3>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#9fb3ff"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              tickFormatter={fmtWholeDollars}
              stroke="#9fb3ff"
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              labelFormatter={formatDate}
              formatter={(value) => [
                fmtWholeDollars(value),
                "Estimated margin",
              ]}
            />
            <Line
              type="stepAfter"
              dataKey="total"
              name="Estimated margin"
              stroke="#f59e0b"
              strokeWidth={2}
              dot
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}