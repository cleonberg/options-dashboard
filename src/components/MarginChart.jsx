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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

const tooltipFormatter = (value) => [
  fmtWholeDollars(value),
  "Estimated margin",
];

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
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;

                const { date, total } = payload[0].payload;

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
                      Date: {formatDate(date)}
                    </div>

                    <div style={{ fontSize: "12px", color: "#f59e0b" }}>
                      Estimated Margin: {fmtWholeDollars(total)}
                    </div>
                  </div>
                );
              }}
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