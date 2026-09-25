import React, { useMemo } from "react";
import {
  computeCampaignSummary,
  computeDailyCashFlowSeries,
  fmtWholeDollars,
} from "../logic/logic.js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function toDateKey(value) {
  if (!value) return null;

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function todayKey() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function timestampFor(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

function addDays(dateKey, count) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + count);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function CombinedCashFlowChart({
  legs = [],
  campaigns = [],
  campaign = null,
  startDateFilter = "",
  endDateFilter = "",
}) {
  const chartData = useMemo(() => {
    const targetLegs = campaign
      ? legs.filter((leg) => leg.campaignId === campaign.id)
      : legs;

    const targetCampaigns = campaign
      ? [campaign]
      : campaigns.filter((item) => item.status === "closed");

    const cashFlowByDate = new Map(
      computeDailyCashFlowSeries(targetLegs, campaigns).map((day) => [
        day.date,
        day,
      ])
    );

    const performanceByDate = new Map();

    targetCampaigns.forEach((item) => {
      const campaignLegs = targetLegs.filter(
        (leg) => leg.campaignId === item.id
      );
      const summary = computeCampaignSummary(item, campaignLegs);
      const date = toDateKey(item.endDate || summary.endDate || item.startDate);

      if (!date) return;

      const group = performanceByDate.get(date) || {
        impact: 0,
        campaigns: [],
      };

      group.impact += summary.totalPL || 0;
      group.campaigns.push({
        name: item.name || item.ticker || "Campaign",
        pl: summary.totalPL || 0,
      });
      performanceByDate.set(date, group);
    });

    const lastDate =
      endDateFilter && endDateFilter < todayKey()
        ? endDateFilter
        : todayKey();

    const eventDates = new Set([
      ...cashFlowByDate.keys(),
      ...performanceByDate.keys(),
    ]);

    const dates = [...eventDates]
      .filter((date) => date <= lastDate)
      .sort();

    if (dates.length === 0) return [];

    const rows = [];
    let cumulativeCashFlow = 0;
    let cumulativePL = 0;

    dates.forEach((date) => {
      const cashFlow = cashFlowByDate.get(date);
      const performance = performanceByDate.get(date);

      if (cashFlow) {
        cumulativeCashFlow = cashFlow.cumulativeCashFlow;
      }
      if (performance) {
        cumulativePL += performance.impact;
      }

      rows.push({
        date,
        timestamp: timestampFor(date),
        netCashFlow: cashFlow?.netCashFlow || 0,
        cumulativeCashFlow,
        dailyPLImpact: performance?.impact || 0,
        cumulativePL,
        campaigns: performance?.campaigns || [],
        labels: cashFlow?.labels || "",
      });
    });

    // Carry both cumulative series forward through the selected end date.
    let date = addDays(rows[rows.length - 1].date, 1);
    while (date <= lastDate) {
      rows.push({
        date,
        timestamp: timestampFor(date),
        netCashFlow: 0,
        cumulativeCashFlow,
        dailyPLImpact: 0,
        cumulativePL,
        campaigns: [],
        labels: "",
      });
      date = addDays(date, 1);
    }

    const filteredRows = rows.filter(
      (row) =>
        (!startDateFilter || row.date >= startDateFilter) &&
        (!endDateFilter || row.date <= endDateFilter)
    );

    if (filteredRows.length === 0) return [];

    const firstDate = filteredRows[0].date;
    const priorRow = [...rows]
      .reverse()
      .find((row) => row.date < firstDate);

    return [
      {
        date: addDays(firstDate, -1),
        timestamp: timestampFor(addDays(firstDate, -1)),
        netCashFlow: 0,
        cumulativeCashFlow: priorRow?.cumulativeCashFlow || 0,
        dailyPLImpact: 0,
        cumulativePL: priorRow?.cumulativePL || 0,
        campaigns: [],
        labels: "Baseline",
      },
      ...filteredRows,
    ];
  }, [legs, campaigns, campaign, startDateFilter, endDateFilter]);

  const formatDate = (timestamp) =>
    new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  const formatYAxis = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 0,
    }).format(value);

  if (chartData.length === 0) {
    return (
      <div className="card">
        No cash flow or closed-campaign performance data found in this date range.
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ color: "#9fb3ff", marginTop: 0, marginBottom: "16px" }}>
        Cumulative Cash Flow & Realized Campaign P/L
      </h3>

      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatDate}
              stroke="#9fb3ff"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              stroke="#9fb3ff"
              tickFormatter={formatYAxis}
              tick={{ fontSize: 12 }}
            />
            <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="3 3" />
            {/* <Legend /> */}

            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
            
                const data = payload[0].payload;
                const dateLabel = formatDate(data.timestamp) || "Baseline";
                const legEvents =
                  data.labels && data.labels !== "Baseline"
                    ? data.labels.split(", ")
                    : [];
                const campaignImpacts = data.campaigns || [];
            
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
                    <div style={{ fontWeight: "bold", marginBottom: "6px" }}>
                      {dateLabel}
                    </div>
                        <div
                            style={{
                                borderTop: "1px solid #24345f",
                                marginTop: "6px",
                                paddingTop: "6px",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    color: "#10b981",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    borderBottom: "1px solid #10b981",
                                    paddingBottom: "4px",
                                    marginBottom: "6px",
                                }}
                                >
                                <span>Cash Flow</span>
                                <span>{fmtWholeDollars(data.cumulativeCashFlow)}</span>
                            </div>

                            <div
                                style={{
                                color: data.netCashFlow >= 0 ? "#10b981" : "#f87171",
                                fontSize: "12px",
                                marginTop: "3px",
                                }}
                            >
                                Daily net: {fmtWholeDollars(data.netCashFlow)}
                            </div>

                            {legEvents.length > 0 && (
                                <div
                                style={{
                                    fontSize: "11px",
                                    lineHeight: "1.4",
                                    color: "#cbd5e1",
                                }}
                                >
                                {legEvents.map((item, index) => (
                                    <div key={`${item}-${index}`}>{item}</div>
                                ))}
                                </div>
                            )}
                            </div>

                            <div
                            style={{
                                borderTop: "1px solid #24345f",
                                marginTop: "6px",
                                paddingTop: "6px",
                            }}
                            >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                color: "#60a5fa",
                                fontSize: "12px",
                                fontWeight: 700,
                                borderBottom: "1px solid #60a5fa",
                                paddingBottom: "4px",
                                marginBottom: "6px",
                              }}
                            >
                              <span>Campaign P/L</span>
                              <span>{fmtWholeDollars(data.cumulativePL)}</span>
                            </div>                            
                            
                            {campaignImpacts.length > 0 && (
                                <div>
                                <div style={{
                                    color: "#60a5fa",
                                    fontSize: "12px",
                                    marginTop: "3px",
                                }}>
                                    Daily net: {fmtWholeDollars(data.dailyPLImpact)}
                                </div>

                                {campaignImpacts.map((item, index) => (
                                    <div
                                        key={`${item.name}-${index}`}
                                        style={{
                                            fontSize: "11px",
                                            lineHeight: "1.4",
                                            color: "#cbd5e1",
                                            maxHeight: "220px",
                                            overflowY: "auto",
                                        }}
                                        >
                                        {item.name}: {fmtWholeDollars(item.pl)}
                                    </div>
                                ))}
                                </div>
                            )}
                        </div>
                  </div>
                );
              }}
            />
            
            <Area
              type="stepAfter"
              dataKey="cumulativeCashFlow"
              name="Cumulative cash flow"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.12}
              activeDot={{ r: 5 }}
            />
            <Area
              type="stepAfter"
              dataKey="cumulativePL"
              name="Cumulative realized P/L"
              stroke="#60a5fa"
              fill="#60a5fa"
              fillOpacity={0.08}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}