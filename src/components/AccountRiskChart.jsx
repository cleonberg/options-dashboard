import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtWholeDollars } from "../logic/logic.js";

const formatPercent = (value) => `${value > 0 ? "+" : ""}${value}%`;

const formatCompactDollars = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value);

export default function AccountRiskChart({ accountName, data, complete }) {
  const labeledData = data.map((point) => ({
    ...point,
    marginLabel:
      point.shockPercent % 10 === 0 && Number.isFinite(point.excessMargin)
        ? formatCompactDollars(point.excessMargin)
        : "",
  }));

  return (
    <div className="account-risk-chart">
      <h4>Available excess margin by price scenario</h4>
      {!complete ? (
        <p>
          Risk graph unavailable. Complete account cash, position marks,
          underlying prices, and margin inputs to calculate all scenarios.
        </p>
      ) : (
        <div className="account-risk-chart-plot">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={labeledData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />
              <XAxis
                dataKey="shockPercent"
                type="number"
                domain={[-50, 10]}
                ticks={[-50, -40, -30, -20, -10, 0, 10]}
                tickFormatter={formatPercent}
                stroke="#9fb3ff"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickFormatter={formatCompactDollars}
                stroke="#9fb3ff"
                tick={{ fontSize: 12 }}
                width={72}
              />
              <ReferenceLine y={0} stroke="#a0aec0" strokeDasharray="4 4" />
              <ReferenceLine x={0} stroke="#64748b" strokeDasharray="4 4" />
              <Tooltip
                cursor={false}
                labelFormatter={(value) =>
                  `Price scenario: ${formatPercent(Number(value))}`
                }
                formatter={(value) => [
                  fmtWholeDollars(value),
                  "Available excess margin",
                ]}
                contentStyle={{
                  backgroundColor: "#1b2b4f",
                  border: "1px solid #24345f",
                  borderRadius: "6px",
                  color: "#fff",
                }}
              />
              <Line
                type="monotone"
                dataKey="excessMargin"
                name={`${accountName} available excess margin`}
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              >
                <LabelList
                  dataKey="marginLabel"
                  position="top"
                  fill="#dbeafe"
                  fontSize={11}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
