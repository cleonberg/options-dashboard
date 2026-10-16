import React, { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  computeAccountMarginHistorySeries,
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

const formatCompactDollars = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value);

export default function MarginChart({
  legs = [],
  accountSnapshots = [],
  accountIdByCampaign = new Map(),
  accountTypeByCampaign = new Map(),
  accounts = [],
  cashTransactions = [],
  startDateFilter = "",
  endDateFilter = "",
}) {
  const data = useMemo(
    () =>
      computeAccountMarginHistorySeries(legs, accountSnapshots, {
        startDate: startDateFilter,
        endDate: endDateFilter,
        accountIdByCampaign,
        accountTypeByCampaign,
        accounts,
        cashTransactions,
      }),
    [
      legs,
      accountSnapshots,
      accountIdByCampaign,
      accountTypeByCampaign,
      accounts,
      cashTransactions,
      startDateFilter,
      endDateFilter,
    ]
  );
  const labelInterval = Math.max(1, Math.ceil(data.length / 8));
  const labeledData = data.map((point, index) => {
    const shouldLabel =
      index === 0 ||
      index === data.length - 1 ||
      index % labelInterval === 0;
    const label = (value) =>
      shouldLabel && Number.isFinite(value)
        ? formatCompactDollars(value)
        : "";
    return {
      ...point,
      marginLabel: label(point.total),
      accountValueLabel: label(point.accountValue),
      marginEquityLabel: label(point.marginEquity),
      excessMarginLabel: label(point.excessMargin),
    };
  });

  if (data.length === 0) {
    return (
      <div className="card">
        No saved account mark snapshots are available for this date range.
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ color: "#9fb3ff", marginTop: 0 }}>
        Margin, Account Value, Margin Equity &amp; Excess Margin Over Time
      </h3>
      {data.some(
        (point) =>
          !point.complete ||
          !point.accountValueComplete ||
          !point.marginEquityComplete
      ) && (
        <p style={{ color: "#94a3b8", fontSize: "12px" }}>
          Dates with missing marks, prices, or account cash history are omitted
          from affected lines.
        </p>
      )}

      <div className="account-margin-history-plot">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={labeledData}>
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
            <Legend />
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

                    {[
                      ["Estimated Margin", total, "#f59e0b"],
                      ["Account Value", payload[0].payload.accountValue, "#34d399"],
                      ["Margin Equity", payload[0].payload.marginEquity, "#a78bfa"],
                      ["Excess Margin", payload[0].payload.excessMargin, "#60a5fa"],
                    ].map(([label, value, color]) => (
                      <div
                        key={label}
                        style={{ fontSize: "12px", color, marginTop: "2px" }}
                      >
                        {label}: {value == null ? "Incomplete" : fmtWholeDollars(value)}
                      </div>
                    ))}
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
              dot={false}
              activeDot={{ r: 5 }}
            >
              <LabelList
                dataKey="marginLabel"
                position="bottom"
                fill="#fde68a"
                fontSize={11}
              />
            </Line>
            <Line
              type="stepAfter"
              dataKey="marginEquity"
              name="Margin equity"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            >
              <LabelList
                dataKey="marginEquityLabel"
                position="top"
                fill="#ddd6fe"
                fontSize={11}
              />
            </Line>
            <Line
              type="stepAfter"
              dataKey="accountValue"
              name="Account value"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            >
              <LabelList
                dataKey="accountValueLabel"
                position="top"
                fill="#a7f3d0"
                fontSize={11}
              />
            </Line>
            <Line
              type="stepAfter"
              dataKey="excessMargin"
              name="Excess margin"
              stroke="#60a5fa"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            >
              <LabelList
                dataKey="excessMarginLabel"
                position="top"
                fill="#dbeafe"
                fontSize={11}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}