import {
  CartesianGrid,
  Legend,
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

export default function AccountRiskChart({
  accountName,
  data,
  baselineData,
  complete,
}) {
  const comparing = Array.isArray(baselineData);
  const baselineByShock = new Map(
    (baselineData || []).map((point) => [point.shockPercent, point])
  );
  const labeledData = data.map((point) => {
    const baselinePoint = baselineByShock.get(point.shockPercent);
    const label = (value) =>
      point.shockPercent % 10 === 0 && Number.isFinite(value)
        ? formatCompactDollars(value)
        : "";
    return {
      ...point,
      baselineAccountValue: baselinePoint?.accountValue,
      baselineHouseRequirement: baselinePoint?.houseRequirement,
      baselineExcessMargin: baselinePoint?.excessMargin,
      accountValueLabel: label(point.accountValue),
      houseRequirementLabel: label(point.houseRequirement),
      marginLabel: label(point.excessMargin),
    };
  });

  return (
    <div className="account-risk-chart">
      <h4>
        {comparing ? "Current vs. what-if " : ""}
        account value, house requirement, and excess margin by price scenario
      </h4>
      {comparing && <p className="account-risk-chart-comparison-note">Dashed lines show current positions.</p>}
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
                domain={[-50, 20]}
                ticks={[-50, -40, -30, -20, -10, 0, 10, 20]}
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
              <Legend />
              <Tooltip
                cursor={false}
                wrapperStyle={{ maxWidth: "calc(100vw - 24px)" }}
                labelFormatter={(value) =>
                  `Price scenario: ${formatPercent(Number(value))}`
                }
                formatter={(value, name) => [
                  fmtWholeDollars(value),
                  name,
                ]}
                contentStyle={{
                  backgroundColor: "rgba(27, 43, 79, 0.8)",
                  border: "1px solid #24345f",
                  borderRadius: "6px",
                  color: "#fff",
                  boxSizing: "border-box",
                  maxWidth: "calc(100vw - 24px)",
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                }}
              />
              {comparing && (
                <>
                  <Line
                    type="monotone"
                    dataKey="baselineAccountValue"
                    name="Current account value"
                    stroke="#34d399"
                    strokeOpacity={0.55}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="baselineHouseRequirement"
                    name="Current house requirement"
                    stroke="#fbbf24"
                    strokeOpacity={0.55}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="baselineExcessMargin"
                    name={`${accountName} current excess margin`}
                    stroke="#60a5fa"
                    strokeOpacity={0.55}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </>
              )}
              <Line
                type="monotone"
                dataKey="accountValue"
                name={comparing ? "What-if account value" : "Account value"}
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
                type="monotone"
                dataKey="houseRequirement"
                name={comparing ? "What-if house requirement" : "House requirement"}
                stroke="#fbbf24"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              >
                <LabelList
                  dataKey="houseRequirementLabel"
                  position="bottom"
                  fill="#fde68a"
                  fontSize={11}
                />
              </Line>
              <Line
                type="monotone"
                dataKey="excessMargin"
                name={
                  comparing
                    ? "What-if available excess margin"
                    : `${accountName} available excess margin`
                }
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
