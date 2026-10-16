import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ACCOUNT_TYPE_OPTIONS,
  computeAccountMarginEstimate,
  fmtWholeDollars,
  optionIntrinsic,
} from "../logic/logic.js";
import {
  createAccount,
  deleteAccount,
  deleteCashTransaction,
  saveAccountRecord,
  setDefaultAccount,
} from "../sync/sync.js";
import { refreshAccountMarks } from "../marketData.js";
import AccountRiskChart from "./AccountRiskChart.jsx";
import MarginChart from "./MarginChart.jsx";

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function typeInfo(leg) {
  const type = String(leg.type || "").toLowerCase();
  const isOption = type.endsWith("_call") || type.endsWith("_put");
  const isStock = type.endsWith("_stock");
  const isBuy = type.startsWith("buy_");
  const isSell = type.startsWith("sell_");

  return {
    type,
    isOption,
    isStock,
    isBuy,
    isSell,
    supported: (isBuy || isSell) && (isStock || isOption),
    multiplier: isOption ? 100 : 1,
  };
}

function parseMarginRequirementOverrides(form) {
  const tickers = form.getAll("marginOverrideTicker");
  const stockLongRates = form.getAll("marginOverrideStockLong");
  const stockShortRates = form.getAll("marginOverrideStockShort");
  const optionRates = form.getAll("marginOverrideOption");
  const overrides = {};

  for (let index = 0; index < tickers.length; index += 1) {
    const ticker = String(tickers[index] || "").trim().toUpperCase();
    const values = {
      stockLong: stockLongRates[index],
      stockShort: stockShortRates[index],
      option: optionRates[index],
    };
    const hasRate = Object.values(values).some(
      (value) => value != null && String(value).trim() !== ""
    );
    if (!ticker && !hasRate) continue;
    if (!ticker) throw new Error("Enter a ticker for each margin override.");
    if (overrides[ticker]) {
      throw new Error(`Only one margin override row is allowed for ${ticker}.`);
    }

    const normalized = {};
    for (const [key, value] of Object.entries(values)) {
      if (value == null || String(value).trim() === "") continue;
      const percent = Number(value);
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        throw new Error("Margin override percentages must be greater than 0 and at most 100.");
      }
      normalized[key] = percent;
    }
    if (Object.keys(normalized).length) overrides[ticker] = normalized;
  }

  return overrides;
}

function MarginRequirementOverridesEditor({ overrides = {} }) {
  const [rows, setRows] = useState(() =>
    Object.entries(overrides || {}).map(([ticker, rates]) => ({
      ticker,
      stockLong: rates.stockLong == null ? "" : String(rates.stockLong),
      stockShort: rates.stockShort == null ? "" : String(rates.stockShort),
      option: rates.option == null ? "" : String(rates.option),
    }))
  );

  function updateRow(index, key, value) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      )
    );
  }

  return (
    <fieldset className="margin-requirement-overrides">
      <legend>Margin rate overrides</legend>
      <p>
        Baseline rates: options 25%, long stocks 30%, short stocks 35% (SOXL
        retains its existing 60% fallback). Enter effective Fidelity rates,
        including any concentration adjustment. Option rates still use the
        option premium and 10% minimum floor; blank fields use the baseline.
      </p>
      {rows.map((row, index) => (
        <div className="form-row" key={index}>
          <input
            className="input"
            name="marginOverrideTicker"
            value={row.ticker}
            aria-label="Margin override ticker"
            placeholder="Ticker"
            onChange={(event) =>
              updateRow(index, "ticker", event.target.value)
            }
          />
          <input
            className="input"
            name="marginOverrideStockLong"
            type="number"
            min="0.1"
            max="100"
            step="0.1"
            value={row.stockLong}
            aria-label={`${row.ticker || "Ticker"} long stock rate percent`}
            placeholder="Long stock %"
            onChange={(event) =>
              updateRow(index, "stockLong", event.target.value)
            }
          />
          <input
            className="input"
            name="marginOverrideStockShort"
            type="number"
            min="0.1"
            max="100"
            step="0.1"
            value={row.stockShort}
            aria-label={`${row.ticker || "Ticker"} short stock rate percent`}
            placeholder="Short stock %"
            onChange={(event) =>
              updateRow(index, "stockShort", event.target.value)
            }
          />
          <input
            className="input"
            name="marginOverrideOption"
            type="number"
            min="0.1"
            max="100"
            step="0.1"
            value={row.option}
            aria-label={`${row.ticker || "Ticker"} option rate percent`}
            placeholder="Option %"
            onChange={(event) =>
              updateRow(index, "option", event.target.value)
            }
          />
          <button
            type="button"
            onClick={() =>
              setRows((current) =>
                current.filter((_, rowIndex) => rowIndex !== index)
              )
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setRows((current) => [
            ...current,
            { ticker: "", stockLong: "", stockShort: "", option: "" },
          ])
        }
      >
        Add ticker override
      </button>
    </fieldset>
  );
}

function currentPositionMark(leg, marks, underlyingPrices) {
  const enteredMark = numberOrNull(marks[String(leg.id)]);
  if (enteredMark != null && enteredMark >= 0) return enteredMark;

  const info = typeInfo(leg);
  if (!info.isOption) return null;

  const ticker = String(leg.ticker || "").trim().toUpperCase();
  const spot = numberOrNull(underlyingPrices[ticker]);
  const strike = numberOrNull(leg.strike);
  if (spot == null || strike == null || strike <= 0) return null;

  if (info.type.endsWith("_put")) return Math.max(strike - spot, 0);
  return Math.max(spot - strike, 0);
}

function isActiveOnDate(leg, date) {
  if (leg.openDate && leg.openDate > date) return false;
  if (leg.closeDate && leg.closeDate <= date) return false;
  if (leg.isOpen === false && !leg.closeDate) return false;

  const expiry = leg.expiry || leg.expiration;
  if (expiry && expiry < date) return false;

  return true;
}

function calculateAccountRiskScenarios({
  cashBalance,
  cashFlowsComplete,
  legs,
  activeLegs,
  marks,
  underlyingPrices,
  date,
  accountType = "taxable",
  marginRequirementOverrides = {},
}) {
  return Array.from({ length: 15 }, (_, index) => -50 + index * 5).map(
    (shockPercent) => {
      const multiplier = 1 + shockPercent / 100;
      let netPositionValue = 0;
      let marginEquityPositionValue = 0;
      let complete = cashBalance != null && cashFlowsComplete;

      for (const leg of activeLegs) {
        const info = typeInfo(leg);
        const quantity = Math.abs(Number(leg.qty));
        const mark = currentPositionMark(leg, marks, underlyingPrices);
        if (
          !info.supported ||
          !Number.isFinite(quantity) ||
          mark == null
        ) {
          complete = false;
          break;
        }

        let scenarioMark;
        if (info.isStock) {
          scenarioMark = mark * multiplier;
        } else {
          const ticker = String(leg.ticker || "").trim().toUpperCase();
          const spot = numberOrNull(underlyingPrices[ticker]);
          const strike = numberOrNull(leg.strike);
          if (spot == null || strike == null || strike <= 0) {
            complete = false;
            break;
          }

          const scenarioSpot = spot * multiplier;
          const currentIntrinsic = optionIntrinsic(
            info.type.endsWith("_put") ? "put" : "call",
            spot,
            strike
          );
          const extrinsic = Math.max(0, mark - currentIntrinsic);
          scenarioMark =
            optionIntrinsic(
              info.type.endsWith("_put") ? "put" : "call",
              scenarioSpot,
              strike
            ) + extrinsic;
        }

        const positionValue = scenarioMark * quantity * info.multiplier;
        netPositionValue += info.isBuy ? positionValue : -positionValue;
        if (info.isBuy || !info.isOption) {
          marginEquityPositionValue +=
            info.isBuy ? positionValue : -positionValue;
        }
      }

      const marginEstimate = computeAccountMarginEstimate(legs, {
        asOfDate: date,
        positionMarks: marks,
        underlyingPrices,
        shockPercent,
        accountType,
        marginRequirementOverrides,
      });

      if (!marginEstimate.complete || marginEstimate.total == null) {
        complete = false;
      }

      return {
        shockPercent,
        accountValue: complete ? cashBalance + netPositionValue : null,
        marginEquity: complete
          ? cashBalance + marginEquityPositionValue
          : null,
        houseRequirement:
          marginEstimate.complete && marginEstimate.total != null
            ? marginEstimate.total
            : null,
        excessMargin:
          complete
            ? cashBalance + marginEquityPositionValue - marginEstimate.total
            : null,
      };
    }
  );
}

function calculateWhatIfRiskScenarios({
  accountId,
  cashBalance,
  cashFlowsComplete,
  legs,
  closedLegIds,
  hypotheticalPosition,
  marks,
  underlyingPrices,
  date,
  accountType = "taxable",
  marginRequirementOverrides = {},
}) {
  let whatIfCashBalance = cashBalance;
  const closedIds = new Set(closedLegIds);

  for (const leg of legs) {
    if (!closedIds.has(String(leg.id))) continue;
    const info = typeInfo(leg);
    const mark = currentPositionMark(leg, marks, underlyingPrices);
    const quantity = Math.abs(Number(leg.qty));
    if (!info.supported || mark == null || !Number.isFinite(quantity)) continue;

    if (whatIfCashBalance != null) {
      whatIfCashBalance +=
        (info.isBuy ? 1 : -1) * mark * quantity * info.multiplier;
    }
  }

  const simulatedLegs = legs.filter(
    (leg) => !closedIds.has(String(leg.id))
  );
  const simulatedMarks = { ...marks };
  const simulatedUnderlyingPrices = { ...underlyingPrices };

  if (hypotheticalPosition) {
    const id = `what-if-${accountId}-${hypotheticalPosition.id}`;
    const hypotheticalLeg = {
      id,
      campaignId: id,
      type: hypotheticalPosition.type,
      ticker: hypotheticalPosition.ticker,
      qty: hypotheticalPosition.qty,
      strike: hypotheticalPosition.strike,
      expiry: hypotheticalPosition.expiry,
      openDate: date,
      openPrice: hypotheticalPosition.mark,
      isOpen: true,
    };
    const info = typeInfo(hypotheticalLeg);

    simulatedLegs.push(hypotheticalLeg);
    simulatedMarks[id] = hypotheticalPosition.mark;
    if (hypotheticalPosition.underlyingPrice != null) {
      simulatedUnderlyingPrices[hypotheticalPosition.ticker] =
        hypotheticalPosition.underlyingPrice;
    }
    if (whatIfCashBalance != null) {
      whatIfCashBalance +=
        (info.isBuy ? -1 : 1) *
        hypotheticalPosition.mark *
        hypotheticalPosition.qty *
        info.multiplier;
    }
  }

  return calculateAccountRiskScenarios({
    cashBalance: whatIfCashBalance,
    cashFlowsComplete,
    legs: simulatedLegs,
    activeLegs: simulatedLegs.filter((leg) => isActiveOnDate(leg, date)),
    marks: simulatedMarks,
    underlyingPrices: simulatedUnderlyingPrices,
    date,
    accountType,
    marginRequirementOverrides,
  });
}

function calculateAccountMetrics({
  account,
  legs,
  cashTransactions,
  underlyingPrices,
  marks,
  date,
}) {
  const openingDate = account.openingCashDate || "";
  const openingCash = numberOrNull(account.openingCash);
  const cashKnown = Boolean(openingDate && openingDate <= date && openingCash != null);

  let cashBalance = cashKnown ? openingCash : null;
  let unsupportedCashFlows = false;

  if (cashKnown) {
    for (const transaction of cashTransactions) {
      if (
        transaction.accountId === account.id &&
        transaction.date >= openingDate &&
        transaction.date <= date
      ) {
        cashBalance += Number(transaction.amount || 0);
      }
    }

    for (const leg of legs) {
      const info = typeInfo(leg);

      if (!info.supported) {
        if (
          leg.type?.startsWith("assignment_") &&
          ((leg.openDate >= openingDate && leg.openDate <= date) ||
            (leg.closeDate >= openingDate && leg.closeDate <= date))
        ) {
          unsupportedCashFlows = true;
        }
        continue;
      }

      const quantity = Math.abs(Number(leg.qty));
      if (!Number.isFinite(quantity)) continue;

      const openPrice = numberOrNull(leg.openPrice);
      if (
        openPrice != null &&
        leg.openDate >= openingDate &&
        leg.openDate <= date
      ) {
        const direction = info.isSell ? 1 : -1;
        cashBalance += direction * openPrice * quantity * info.multiplier;
      }

      const closePrice = numberOrNull(leg.closePrice);
      if (
        closePrice != null &&
        !leg.isOpen &&
        leg.closeDate >= openingDate &&
        leg.closeDate <= date
      ) {
        const direction = info.isSell ? -1 : 1;
        cashBalance += direction * closePrice * quantity * info.multiplier;
      }
    }
  }

  const activeLegs = legs.filter((leg) => isActiveOnDate(leg, date));
  const unsupportedPositions = activeLegs.filter(
    (leg) => !typeInfo(leg).supported
  );
  const missingMarks = activeLegs.filter(
    (leg) =>
      typeInfo(leg).supported &&
      currentPositionMark(leg, marks, underlyingPrices) == null
  );

  let marginEquityPositionValue = 0;
  let netPositionValue = 0;
  let allMarginEquityPositionsMarked = true;
  const positionValues = [];

  for (const leg of activeLegs) {
    const info = typeInfo(leg);
    if (!info.supported) continue;

    const mark = currentPositionMark(leg, marks, underlyingPrices);
    if (mark == null) {
      if (info.isBuy || !info.isOption) {
        allMarginEquityPositionsMarked = false;
      }
      continue;
    }

    const quantity = Math.abs(Number(leg.qty));
    if (!Number.isFinite(quantity)) continue;

    const value = mark * quantity * info.multiplier;
    netPositionValue += info.isBuy ? value : -value;
    if (info.isBuy || !info.isOption) {
      marginEquityPositionValue += info.isBuy ? value : -value;
    }
    positionValues.push({
      id: String(leg.id),
      label: positionDescription(leg),
      value: info.isBuy ? value : -value,
    });
  }

  const marginArgs = {
    asOfDate: date,
    positionMarks: marks,
    underlyingPrices,
    accountType: account.accountType || "taxable",
    marginRequirementOverrides:
      account.marginRequirementOverrides || {},
  };
  const marginEstimate = computeAccountMarginEstimate(legs, marginArgs);

  const houseRequirement = marginEstimate.total;
  const marginEquity =
    cashKnown &&
    !unsupportedCashFlows &&
    allMarginEquityPositionsMarked &&
    unsupportedPositions.length === 0
      ? cashBalance + marginEquityPositionValue
      : null;
  const totalAccountValue =
    cashKnown &&
    missingMarks.length === 0 &&
    unsupportedPositions.length === 0
      ? cashBalance + netPositionValue
      : null;
  const riskScenarios = calculateAccountRiskScenarios({
    cashBalance,
    cashFlowsComplete: !unsupportedCashFlows,
    legs,
    activeLegs,
    marks,
    underlyingPrices,
    date,
    accountType: account.accountType || "taxable",
    marginRequirementOverrides:
      account.marginRequirementOverrides || {},
  });

  return {
    cashBalance,
    marginEquity,
    houseRequirement,
    excessMargin:
      marginEquity != null && houseRequirement != null
        ? marginEquity - houseRequirement
        : null,
    totalAccountValue,
    cashFlowsComplete: !unsupportedCashFlows,
    activeLegs,
    positionValues,
    missingMarks,
    marginEstimate,
    riskScenarios,
    riskScenariosComplete: riskScenarios.every((point) =>
      Number.isFinite(point.excessMargin)
    ),
    unsupportedPositions,
    unsupportedCashFlows,
    unsupportedMargin: !marginEstimate.complete,
  };
}

function displayMoney(value) {
  return value == null ? "Incomplete" : fmtWholeDollars(value);
}

function positionDescription(leg) {
  const quantity = Math.abs(Number(leg.qty));
  const side = String(leg.type || "").startsWith("buy_") ? "Long" : "Short";
  const type = String(leg.type || "").replace(/^(buy|sell)_/, "");
  return `${side} ${quantity} ${leg.ticker || ""} ${type}${
    leg.strike ? ` ${leg.strike}` : ""
  }${leg.expiry ? ` exp ${leg.expiry}` : ""}`.trim();
}

function formatCompactDollars(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value);
}

function AccountPositionBreakdownChart({
  accountRows,
  selectedAccountId,
  onSelectAccount,
}) {
  const positionColors = [
    "#34d399",
    "#38bdf8",
    "#a78bfa",
    "#f59e0b",
    "#f472b6",
    "#22d3ee",
    "#84cc16",
    "#fb7185",
  ];
  const positionSeries = [];

  for (const { account, metrics } of accountRows) {
    for (const position of metrics.positionValues || []) {
      positionSeries.push({
        key: `positionValue${positionSeries.length}`,
        accountId: String(account.id),
        label: position.label,
        value: position.value,
      });
    }
  }

  const data = accountRows.map(({ account, metrics }) => {
    const accountId = String(account.id);
    const values = Object.fromEntries(
      positionSeries.map((series) => [
        series.key,
        series.accountId === accountId ? series.value : 0,
      ])
    );
    return {
      accountId,
      name: account.name || "Unnamed account",
      cashValue: metrics.cashBalance,
      accountValue: metrics.totalAccountValue,
      marginEquity: metrics.marginEquity,
      ...values,
    };
  });

  if (data.length === 0) return null;

  const chartHeight = Math.max(240, data.length * 76 + 76);
  const hasIncompleteValues = accountRows.some(
    ({ metrics }) =>
      metrics.cashBalance == null ||
      metrics.totalAccountValue == null ||
      metrics.marginEquity == null ||
      metrics.missingMarks.length > 0
  );

  function selectFromPayload(payload) {
    const row = payload?.payload || payload;
    if (row?.accountId != null) onSelectAccount(row.accountId);
  }

  return (
    <div className="card account-summary-chart">
      <h3 className="account-summary-chart-title">Position values</h3>
      <p className="account-summary-chart-note">
        Cash and long positions extend right; short positions extend left.
        White dots mark net account value and purple dots mark margin equity.
        Hover segments for details.
      </p>
      {hasIncompleteValues && (
        <p className="account-summary-chart-note">
          Unknown cash and unmarked positions are omitted; incomplete account
          values have no markers.
        </p>
      )}
      <div
        className="account-summary-chart-plot"
        style={{ height: chartHeight }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            stackOffset="sign"
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />
            <XAxis
              type="number"
              tickFormatter={formatCompactDollars}
              stroke="#9fb3ff"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="accountId"
              width={130}
              interval={0}
              axisLine={{ stroke: "#24345f" }}
              tickLine={false}
              tick={({ x, y, payload }) => {
                const row = data.find(
                  (item) => item.accountId === String(payload.value)
                );
                if (!row) return null;

                const selected = row.accountId === selectedAccountId;
                const accountLabel =
                  row.name.length > 15
                    ? `${row.name.slice(0, 14)}…`
                    : row.name;
                const select = () => onSelectAccount(row.accountId);

                return (
                  <g
                    transform={`translate(${x},${y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${row.name} for position values`}
                    aria-pressed={selected}
                    style={{ cursor: "pointer" }}
                    onClick={select}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        select();
                      }
                    }}
                  >
                    <text
                      x={-8}
                      y={4}
                      textAnchor="end"
                      fill={selected ? "#38bdf8" : "#9fb3ff"}
                      fontSize={13}
                      fontWeight={selected ? 700 : 500}
                    >
                      {accountLabel}
                    </text>
                  </g>
                );
              }}
            />
            <ReferenceLine x={0} stroke="#94a3b8" />
            <Tooltip
              cursor={{ fill: "rgba(56, 189, 248, 0.08)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload;
                const items = payload.filter(
                  (item) =>
                    item.value != null &&
                    Number.isFinite(Number(item.value)) &&
                    Number(item.value) !== 0
                );

                return (
                  <div className="account-summary-chart-tooltip">
                    <strong>{row.name}</strong>
                    <span>Net account value: {displayMoney(row.accountValue)}</span>
                    <span>Margin equity: {displayMoney(row.marginEquity)}</span>
                    {items.map((item) => (
                      <span key={item.dataKey} style={{ color: item.color }}>
                        {item.name}: {fmtWholeDollars(item.value)}
                      </span>
                    ))}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="cashValue"
              name="Cash"
              stackId="positions"
              fill="#64748b"
              onClick={selectFromPayload}
            />
            {positionSeries.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                stackId="positions"
                fill={positionColors[index % positionColors.length]}
                onClick={selectFromPayload}
              />
            ))}
            {data
              .filter((row) => Number.isFinite(row.marginEquity))
              .map((row) => (
                <ReferenceDot
                  key={`margin-${row.accountId}`}
                  x={row.marginEquity}
                  y={row.accountId}
                  r={6}
                  fill="#a78bfa"
                  stroke="#1e293b"
                  strokeWidth={2}
                />
              ))}
            {data
              .filter((row) => Number.isFinite(row.accountValue))
              .map((row) => (
                <ReferenceDot
                  key={`account-${row.accountId}`}
                  x={row.accountValue}
                  y={row.accountId}
                  r={4}
                  fill="#fff"
                  stroke="#1e293b"
                  strokeWidth={2}
                />
              ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AccountSummaryChart({
  accountRows,
  selectedAccountId,
  onSelectAccount,
}) {
  const data = accountRows.map(({ account, metrics }) => ({
    accountId: String(account.id),
    name: account.name || "Unnamed account",
    accountValue: metrics.totalAccountValue,
    marginEquity: metrics.marginEquity,
    houseRequirement: metrics.houseRequirement,
    marginAvailable: metrics.excessMargin,
  }));

  if (data.length === 0) return null;

  const chartHeight = Math.max(240, data.length * 76 + 76);

  function selectFromPayload(payload) {
    const row = payload?.payload || payload;
    if (row?.accountId != null) onSelectAccount(row.accountId);
  }

  return (
    <div className="card account-summary-chart">
      <h3 className="account-summary-chart-title">Account margin</h3>
      <p className="account-summary-chart-note">
        Click a bar or account label to view its details.
      </p>
      <div
        className="account-summary-chart-plot"
        style={{ height: chartHeight }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#24345f" />
            <XAxis
              type="number"
              tickFormatter={formatCompactDollars}
              stroke="#9fb3ff"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="accountId"
              width={190}
              interval={0}
              axisLine={{ stroke: "#24345f" }}
              tickLine={false}
              tick={({ x, y, payload }) => {
                const row = data.find(
                  (item) => item.accountId === String(payload.value)
                );
                if (!row) return null;

                const selected = row.accountId === selectedAccountId;
                const accountLabel =
                  row.name.length > 22
                    ? `${row.name.slice(0, 21)}…`
                    : row.name;
                const totalLabel =
                  row.accountValue == null
                    ? "Total value incomplete"
                    : `Total ${fmtWholeDollars(row.accountValue)}`;
                const select = () => onSelectAccount(row.accountId);

                return (
                  <g
                    transform={`translate(${x},${y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${row.name}, account value ${totalLabel}`}
                    aria-pressed={selected}
                    style={{ cursor: "pointer" }}
                    onClick={select}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        select();
                      }
                    }}
                  >
                    <text
                      x={-8}
                      y={-4}
                      textAnchor="end"
                      fill={selected ? "#38bdf8" : "#9fb3ff"}
                      fontSize={13}
                      fontWeight={selected ? 700 : 500}
                    >
                      {accountLabel}
                    </text>
                    <text
                      x={-8}
                      y={13}
                      textAnchor="end"
                      fill="#34d399"
                      fontSize={11}
                    >
                      {totalLabel}
                    </text>
                  </g>
                );
              }}
            />
            <Tooltip
              cursor={{ fill: "rgba(56, 189, 248, 0.08)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload;

                return (
                  <div className="account-summary-chart-tooltip">
                    <strong>{row.name}</strong>
                    <span>
                      Margin required: {displayMoney(row.houseRequirement)}
                    </span>
                    <span>
                      Margin available: {displayMoney(row.marginAvailable)}
                    </span>
                    <span>
                      Margin equity: {displayMoney(row.marginEquity)}
                    </span>
                    <span>
                      Account value: {displayMoney(row.accountValue)}
                    </span>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ color: "#9fb3ff" }} />
            <Bar
              dataKey="houseRequirement"
              name="Margin required"
              stackId="margin"
              fill="#fbbf24"
              onClick={selectFromPayload}
            />
            <Bar
              dataKey="marginAvailable"
              name="Margin available"
              stackId="margin"
              fill="#60a5fa"
              onClick={selectFromPayload}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AccountRiskWhatIf({
  account,
  legs,
  metrics,
  marks,
  underlyingPrices,
  date,
  accountSnapshots,
  accountIdByCampaign,
  accountTypeByCampaign,
  cashTransactions,
  showAddAccount,
  showAccountEdit,
  onToggleAddAccount,
  onToggleAccountEdit,
}) {
  const [showControls, setShowControls] = useState(false);
  const [closedLegIds, setClosedLegIds] = useState([]);
  const [hypotheticalPosition, setHypotheticalPosition] = useState(null);
  const [positionType, setPositionType] = useState("buy_call");
  const [formValues, setFormValues] = useState({
    ticker: "",
    qty: "1",
    mark: "",
    strike: "",
    expiry: "",
    underlyingPrice: "",
  });
  const [formError, setFormError] = useState("");
  const isOption = positionType.endsWith("_call") || positionType.endsWith("_put");
  const hasChanges = closedLegIds.length > 0 || hypotheticalPosition != null;
  const whatIfData = hasChanges
    ? calculateWhatIfRiskScenarios({
        accountId: account.id,
        cashBalance: metrics.cashBalance,
        cashFlowsComplete: metrics.cashFlowsComplete,
        legs,
        closedLegIds,
        hypotheticalPosition,
        marks,
        underlyingPrices,
        date,
        accountType: account.accountType || "taxable",
        marginRequirementOverrides:
          account.marginRequirementOverrides || {},
      })
    : metrics.riskScenarios;
  const complete = whatIfData.every((point) =>
    Number.isFinite(point.excessMargin)
  );

  function updateFormValue(name, value) {
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  function handleAddHypotheticalPosition(event) {
    event.preventDefault();
    const ticker = formValues.ticker.trim().toUpperCase();
    const quantity = Number(formValues.qty);
    const mark = Number(formValues.mark);
    const strike = isOption ? Number(formValues.strike) : null;
    const underlyingPrice = isOption
      ? Number(formValues.underlyingPrice)
      : null;

    if (
      !ticker ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(mark) ||
      mark < 0 ||
      (isOption &&
        (!Number.isFinite(strike) ||
          strike <= 0 ||
          !formValues.expiry ||
          formValues.expiry < date ||
          !Number.isFinite(underlyingPrice) ||
          underlyingPrice <= 0))
    ) {
      setFormError("Enter valid position details before adding the what-if.");
      return;
    }

    setHypotheticalPosition({
      id: Date.now(),
      type: positionType,
      ticker,
      qty: quantity,
      mark,
      strike,
      expiry: isOption ? formValues.expiry : "",
      underlyingPrice,
    });
    setFormError("");
  }

  function toggleClosedPosition(leg) {
    const id = String(leg.id);
    setClosedLegIds((current) =>
      current.includes(id)
        ? current.filter((closedId) => closedId !== id)
        : [...current, id]
    );
  }

  function handleReset() {
    setClosedLegIds([]);
    setHypotheticalPosition(null);
    setFormError("");
  }

  return (
    <div className="account-risk-what-if">
      <div className="account-what-if-actions">
        <button
          type="button"
          className="account-what-if-toggle"
          aria-expanded={showControls}
          onClick={() => setShowControls((visible) => !visible)}
        >
          {showControls ? "Hide what-if controls" : "What if?"}
          {hasChanges ? " (scenario active)" : ""}
        </button>
        <div className="account-toolbar-actions">
          <button
            type="button"
            aria-expanded={showAddAccount}
            onClick={onToggleAddAccount}
          >
            {showAddAccount ? "Cancel" : "Add account"}
          </button>
          <button
            type="button"
            aria-expanded={showAccountEdit}
            onClick={onToggleAccountEdit}
          >
            {showAccountEdit ? "Close account details" : "Edit account"}
          </button>
        </div>
      </div>

      {showControls && (
        <div className="account-what-if-panel">
          <p>
            Changes are temporary. A hypothetical position is assumed opened
            at the price entered below. Use the position table to test closes.
          </p>

          <form
            className="account-what-if-form"
            onSubmit={handleAddHypotheticalPosition}
          >
            <h4>
              {hypotheticalPosition
                ? "Replace hypothetical position"
                : "Open a hypothetical position"}
            </h4>
            <div className="form-row">
              <label>
                Position
                <select
                  className="input"
                  value={positionType}
                  onChange={(event) => setPositionType(event.target.value)}
                >
                  <option value="buy_stock">Buy stock</option>
                  <option value="sell_stock">Sell stock</option>
                  <option value="buy_call">Buy call</option>
                  <option value="sell_call">Sell call</option>
                  <option value="buy_put">Buy put</option>
                  <option value="sell_put">Sell put</option>
                </select>
              </label>
              <label>
                Ticker
                <input
                  className="input"
                  required
                  value={formValues.ticker}
                  onChange={(event) => {
                    const ticker = event.target.value;
                    updateFormValue("ticker", ticker);
                    if (isOption) {
                      updateFormValue(
                        "underlyingPrice",
                        underlyingPrices[ticker.trim().toUpperCase()] ?? ""
                      );
                    }
                  }}
                />
              </label>
              <label>
                Quantity
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={formValues.qty}
                  onChange={(event) => updateFormValue("qty", event.target.value)}
                />
              </label>
              <label>
                Price / premium per share
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={formValues.mark}
                  onChange={(event) => updateFormValue("mark", event.target.value)}
                />
              </label>
              {isOption && (
                <>
                  <label>
                    Strike
                    <input
                      className="input"
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      value={formValues.strike}
                      onChange={(event) =>
                        updateFormValue("strike", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Expiration
                    <input
                      className="input"
                      type="date"
                      min={date}
                      required
                      value={formValues.expiry}
                      onChange={(event) =>
                        updateFormValue("expiry", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Underlying price
                    <input
                      className="input"
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      value={formValues.underlyingPrice}
                      onChange={(event) =>
                        updateFormValue("underlyingPrice", event.target.value)
                      }
                    />
                  </label>
                </>
              )}
            </div>
            {formError && <p role="alert">{formError}</p>}
            <button type="submit">
              {hypotheticalPosition ? "Update hypothetical position" : "Add position"}
            </button>
            {hypotheticalPosition && (
              <button
                type="button"
                onClick={() => setHypotheticalPosition(null)}
              >
                Remove hypothetical position
              </button>
            )}
            {hasChanges && (
              <button type="button" onClick={handleReset}>
                Reset what-if
              </button>
            )}
          </form>
        </div>
      )}

      <div className="account-risk-chart-pair">
        <MarginChart
          legs={legs}
          accountSnapshots={accountSnapshots}
          accountIdByCampaign={accountIdByCampaign}
          accountTypeByCampaign={accountTypeByCampaign}
          accounts={[account]}
          cashTransactions={cashTransactions}
        />
        <AccountRiskChart
          accountName={account.name || "Unnamed account"}
          data={whatIfData}
          baselineData={hasChanges ? metrics.riskScenarios : null}
          complete={complete}
        />
      </div>

      <div className="account-position-list">
        <div className="account-position-header">
          <span>Close in what-if</span>
          <span>Position</span>
          <span>Margin requirement</span>
        </div>

        {metrics.marginEstimate.positions.map((item) => {
          const leg = metrics.activeLegs.find(
            (candidate) => String(candidate.id) === item.legId
          );
          if (!leg) return null;

          const canClose =
            typeInfo(leg).supported &&
            currentPositionMark(leg, marks, underlyingPrices) != null;
          const checked = closedLegIds.includes(String(leg.id));

          return (
            <div className="account-position-row" key={item.legId}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!canClose}
                aria-label={`Close ${positionDescription(leg)} in what-if`}
                title={
                  canClose
                    ? "Exclude this position from the what-if"
                    : "A current mark is required to simulate closing this position"
                }
                onChange={() => toggleClosedPosition(leg)}
              />
              <span>
                {leg.ticker} {leg.type} {leg.qty}
                {leg.strike ? ` @ ${leg.strike}` : ""}
              </span>
              <strong>{displayMoney(item.requiredMargin)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AccountTab({
  uid,
  accounts = [],
  defaultAccountId = "",
  campaigns = [],
  legs = [],
  cashTransactions = [],
  accountSnapshots = [],
  selectedAccountId: selectedAccountIdProp = "all",
  onSelectedAccountChange,
}) {
  const [markDate, setMarkDate] = useState(today());
  const [markEdits, setMarkEdits] = useState(null);
  const [refreshingMarks, setRefreshingMarks] = useState(false);
  const [markRefreshMessage, setMarkRefreshMessage] = useState("");
  const [editingCashTransaction, setEditingCashTransaction] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAccountEdit, setShowAccountEdit] = useState(false);
  const [accountFormError, setAccountFormError] = useState("");
  const [showCashAdjustments, setShowCashAdjustments] = useState(false);
  const [showCashAdjustment, setShowCashAdjustment] = useState(false);

  const selectedAccount =
    accounts.find(
      (account) =>
        selectedAccountIdProp !== "all" &&
        String(account.id) === String(selectedAccountIdProp)
    ) ||
    accounts.find(
      (account) => String(account.id) === String(defaultAccountId)
    ) ||
    accounts[0] ||
    null;
  const selectedAccountId = selectedAccount ? String(selectedAccount.id) : "";
  const visibleAccounts = selectedAccount ? [selectedAccount] : [];

  const activeCashTransactions = cashTransactions.filter((item) => !item.deleted);

  const accountIds = new Set(accounts.map((account) => String(account.id)));
  const latestSnapshotByAccount = new Map();
  for (const snapshot of accountSnapshots) {
    const accountId = String(snapshot.accountId);
    if (!accountIds.has(accountId) || snapshot.date > markDate) continue;

    const previous = latestSnapshotByAccount.get(accountId);
    if (!previous || snapshot.date > previous.date) {
      latestSnapshotByAccount.set(accountId, snapshot);
    }
  }
  const selectedSnapshot = latestSnapshotByAccount.get(selectedAccountId);
  const snapshotValues = {
    positionMarks: selectedSnapshot?.positionMarks || {},
    underlyingPrices: selectedSnapshot?.underlyingPrices || {},
  };
  const markScope = `${selectedAccountId}:${markDate}`;
  const { positionMarks, underlyingPrices } =
    markEdits?.scope === markScope ? markEdits : snapshotValues;

  const campaignsById = new Map(
    campaigns.map((campaign) => [String(campaign.id), campaign])
  );
  const accountById = new Map(
    accounts.map((account) => [String(account.id), account])
  );
  const accountIdByCampaign = new Map();
  const accountTypeByCampaign = new Map();
  const legsByAccount = new Map(accounts.map((account) => [account.id, []]));

  for (const campaign of campaigns) {
    const campaignId = String(campaign.id);
    const accountId = campaign.accountId || defaultAccountId;
    accountIdByCampaign.set(campaignId, accountId);
    accountTypeByCampaign.set(
      campaignId,
      accountById.get(String(accountId))?.accountType || "taxable"
    );
  }

  for (const leg of legs) {
    const campaign = campaignsById.get(String(leg.campaignId));
    const accountId = campaign?.accountId || defaultAccountId;
    if (legsByAccount.has(accountId)) legsByAccount.get(accountId).push(leg);
  }

  const allAccountRows = accounts.map((account) => {
    const accountLegs = legsByAccount.get(account.id) || [];
    const accountSnapshot = latestSnapshotByAccount.get(String(account.id));
    const isSelected = String(account.id) === selectedAccountId;
    return {
      account,
      legs: accountLegs,
      metrics: calculateAccountMetrics({
        account,
        legs: accountLegs,
        cashTransactions: activeCashTransactions,
        marks: isSelected
          ? positionMarks
          : accountSnapshot?.positionMarks || {},
        underlyingPrices: isSelected
          ? underlyingPrices
          : accountSnapshot?.underlyingPrices || {},
        date: markDate,
      }),
    };
  });
  const accountRows = allAccountRows.filter(
    ({ account }) => String(account.id) === selectedAccountId
  );
  const positionRows = accountRows.flatMap(({ account, legs: accountLegs }) =>
    accountLegs
      .filter((leg) => isActiveOnDate(leg, markDate))
      .map((leg) => ({
        account,
        leg,
        campaign: campaigns.find(
          (campaign) => String(campaign.id) === String(leg.campaignId)
        ),
        info: typeInfo(leg),
      }))
  );

  const optionTickers = [
    ...new Set(
      positionRows
        .filter(({ info }) => info.isOption)
        .map(({ leg }) => String(leg.ticker || "").trim().toUpperCase())
        .filter(Boolean)
    ),
  ];  

  function handleAccountSelect(accountId) {
    onSelectedAccountChange?.(String(accountId));
    setShowAccountEdit(false);
    setEditingCashTransaction(null);
    setShowCashAdjustments(false);
    setShowCashAdjustment(false);
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    if (!uid) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const accountName = String(form.get("name") || "").trim();
    if (!accountName) return;

    const id = await createAccount(uid, {
      name: accountName,
      accountType: String(form.get("accountType") || "taxable"),
      currency: "USD",
      openingCash: Number(form.get("openingCash")),
      openingCashDate: String(form.get("openingCashDate")),
      marginRequirementOverrides: {},
    });

    formElement.reset();
    onSelectedAccountChange?.(id);
    setShowAddAccount(false);
  }

  async function handleSaveAccount(event) {
    event.preventDefault();
    if (!uid || !selectedAccount) return;

    const form = new FormData(event.currentTarget);
    let marginRequirementOverrides;
    try {
      marginRequirementOverrides = parseMarginRequirementOverrides(form);
    } catch (error) {
      setAccountFormError(error.message);
      return;
    }

    await saveAccountRecord(uid, "accounts", {
      ...selectedAccount,
      name: String(form.get("name") || "").trim(),
      accountType: String(form.get("accountType") || "taxable"),
      currency: selectedAccount.currency || "USD",
      openingCash: Number(form.get("openingCash")),
      openingCashDate: String(form.get("openingCashDate")),
      marginRequirementOverrides,
    });
    setAccountFormError("");
    setShowAccountEdit(false);
  }

  async function handleDeleteAccount() {
    if (!uid || !selectedAccount) return;

    if (!window.confirm(
      `Delete ${selectedAccount.name || "this account"}, its cash adjustments, and its snapshots?`
    )) return;

    try {
      await deleteAccount(uid, selectedAccount.id);
      onSelectedAccountChange?.("all");
    } catch (error) {
      window.alert(error.message || "Could not delete the account.");
    }
  }

  function updatePositionMark(legId, value) {
    setMarkEdits((current) => {
      const currentValues =
        current?.scope === markScope
          ? current
          : { scope: markScope, ...snapshotValues };
      return {
        ...currentValues,
        source: "manual-position-marks",
        positionMarks: {
          ...currentValues.positionMarks,
          [legId]: value,
        },
      };
    });
  }

  function updateUnderlyingPrice(ticker, value) {
    setMarkEdits((current) => {
      const currentValues =
        current?.scope === markScope
          ? current
          : { scope: markScope, ...snapshotValues };
      return {
        ...currentValues,
        source: "manual-position-marks",
        underlyingPrices: {
          ...currentValues.underlyingPrices,
          [ticker]: value,
        },
      };
    });
  }

  async function handleRefreshMarks() {
    if (!uid || refreshingMarks) return;
    if (markDate !== today()) {
      setMarkRefreshMessage("Automatic quotes are available for today only.");
      return;
    }

    const positions = [];
    let skippedCount = 0;

    for (const { leg, info } of positionRows) {
      if (!info.supported) continue;

      const ticker = String(leg.ticker || "").trim().toUpperCase();
      if (!ticker) {
        skippedCount += 1;
        continue;
      }

      if (info.isStock) {
        positions.push({
          id: String(leg.id),
          ticker,
          kind: "stock",
        });
        continue;
      }

      const strike = numberOrNull(leg.strike);
      const expiry = String(leg.expiry || leg.expiration || "").slice(0, 10);
      if (
        strike == null ||
        strike <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(expiry)
      ) {
        skippedCount += 1;
        continue;
      }

      positions.push({
        id: String(leg.id),
        ticker,
        kind: "option",
        right: info.type.endsWith("_call") ? "call" : "put",
        strike,
        expiry,
      });
    }

    if (positions.length === 0) {
      setMarkRefreshMessage(
        "No supported positions with complete quote details are available to refresh."
      );
      return;
    }

    setRefreshingMarks(true);
    setMarkRefreshMessage("");

    try {
      const result = await refreshAccountMarks(positions);
      const currentValues =
        markEdits?.scope === markScope
          ? markEdits
          : { scope: markScope, ...snapshotValues };
      const refreshedCount = Object.keys(result.positionMarks || {}).length;
      const missingCount = (result.missingPositionIds || []).length;
      const underlyingCount = Object.keys(result.underlyingPrices || {}).length;
      const missingUnderlyingCount =
        (result.missingUnderlyingTickers || []).length;

      setMarkEdits({
        ...currentValues,
        source: "alpaca-market-data",
        positionMarks: {
          ...currentValues.positionMarks,
          ...(result.positionMarks || {}),
        },
        underlyingPrices: {
          ...currentValues.underlyingPrices,
          ...(result.underlyingPrices || {}),
        },
      });

      const messages = [
        `Refreshed ${refreshedCount} position mark${refreshedCount === 1 ? "" : "s"}`,
        `${underlyingCount} underlying price${underlyingCount === 1 ? "" : "s"}`,
      ];
      if (missingCount) {
        messages.push(`${missingCount} position quote${missingCount === 1 ? "" : "s"} unavailable`);
      }
      if (missingUnderlyingCount) {
        messages.push(
          `${missingUnderlyingCount} underlying quote${missingUnderlyingCount === 1 ? "" : "s"} unavailable`
        );
      }
      if (skippedCount) {
        messages.push(`${skippedCount} position${skippedCount === 1 ? "" : "s"} skipped (missing details)`);
      }
      setMarkRefreshMessage(`${messages.join("; ")}. Options use indicative quotes; stocks use IEX.`);
    } catch (error) {
      console.error("Could not refresh account marks from Alpaca.", error);
      setMarkRefreshMessage(
        `Quote refresh failed: ${error.message || "Unable to retrieve market data."}`
      );
    } finally {
      setRefreshingMarks(false);
    }
  }

  async function handleSaveCashTransaction(event) {
    event.preventDefault();
    if (!uid || !selectedAccount) return;
  
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type"));
    const amount = Math.abs(Number(form.get("amount")));
    if (!Number.isFinite(amount) || amount <= 0) return;
  
    await saveAccountRecord(uid, "cashTransactions", {
      ...(editingCashTransaction
        ? { id: editingCashTransaction.id }
        : {}),
      accountId: selectedAccount.id,
      date: String(form.get("date")),
      type,
      amount: type === "withdrawal" ? -amount : amount,
      note: String(form.get("note") || ""),
    });
  
    setEditingCashTransaction(null);
    setShowCashAdjustment(false);
  }
  
  async function handleDeleteCashTransaction(item) {
    if (!window.confirm("Delete this cash adjustment?")) return;
  
    try {
      await deleteCashTransaction(uid, item.id);
      if (editingCashTransaction?.id === item.id) {
        setEditingCashTransaction(null);
      }
    } catch (error) {
      window.alert(error.message || "Could not delete the cash adjustment.");
    }
  }

  async function handleSaveMarks(event) {
    event.preventDefault();
    if (!uid) return;

    await Promise.all(
      accountRows.map(({ account, metrics }) => {
        const accountMarks = Object.fromEntries(
          metrics.activeLegs
            .map((leg) => [String(leg.id), numberOrNull(positionMarks[String(leg.id)])])
            .filter(([, mark]) => mark != null)
        );
        
        const tickers = [
          ...new Set(
            metrics.activeLegs
              .filter((leg) => typeInfo(leg).isOption)
              .map((leg) => String(leg.ticker || "").trim().toUpperCase())
              .filter(Boolean)
          ),
        ];
        const savedUnderlyingPrices = Object.fromEntries(
          tickers
            .map((ticker) => [
              ticker,
              numberOrNull(underlyingPrices[ticker]),
            ])
            .filter(([, price]) => price != null)
        );

        return saveAccountRecord(uid, "accountSnapshots", {
          id: `${account.id}_${markDate}`,
          accountId: account.id,
          date: markDate,
          positionMarks: accountMarks,
          underlyingPrices: savedUnderlyingPrices,
          source:
            markEdits?.scope === markScope && markEdits.source
              ? markEdits.source
              : "manual-position-marks",
        });
      })
    );
  }

  const visibleTransactions = activeCashTransactions
    .filter((item) => visibleAccounts.some((account) => account.id === item.accountId))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section>
      {!selectedAccount && (
        <div className="account-toolbar">
          <div className="account-toolbar-actions">
            <button
              type="button"
              aria-expanded={showAddAccount}
              onClick={() => {
                setShowAddAccount((open) => !open);
                setShowAccountEdit(false);
              }}
            >
              {showAddAccount ? "Cancel" : "Add account"}
            </button>
          </div>
        </div>
      )}

      <div className="account-summary-chart-pair">
        <AccountPositionBreakdownChart
          accountRows={allAccountRows}
          selectedAccountId={selectedAccountId}
          onSelectAccount={handleAccountSelect}
        />
        <AccountSummaryChart
          accountRows={allAccountRows}
          selectedAccountId={selectedAccountId}
          onSelectAccount={handleAccountSelect}
        />
      </div>

      {showAddAccount && (
        <form className="card" onSubmit={handleCreateAccount}>
          <h3>Add account</h3>
          <div className="form-row">
            <input className="input" name="name" required placeholder="Account name" />
            <select
              className="input"
              name="accountType"
              aria-label="Account type"
              defaultValue="taxable"
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              name="openingCash"
              required
              type="number"
              step="0.01"
              placeholder="Opening cash"
            />
            <input
              className="input"
              name="openingCashDate"
              required
              type="date"
              defaultValue={today()}
            />
            <button type="submit" disabled={!uid}>Create account</button>
          </div>
        </form>
      )}

      {showAccountEdit && selectedAccount && (
        <form
          key={selectedAccount.id}
          className="card"
          onSubmit={handleSaveAccount}
        >
          <h3>{selectedAccount.name || "Account details"}</h3>
          <div className="form-row">
            <input
              className="input"
              name="name"
              required
              defaultValue={selectedAccount.name ?? ""}
              placeholder="Account name"
            />
            <select
              className="input"
              name="accountType"
              aria-label="Account type"
              defaultValue={selectedAccount.accountType || "taxable"}
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              name="openingCash"
              required
              type="number"
              step="0.01"
              defaultValue={selectedAccount.openingCash ?? ""}
              placeholder="Opening cash"
            />
            <input
              className="input"
              name="openingCashDate"
              required
              type="date"
              defaultValue={selectedAccount.openingCashDate ?? today()}
            />
            <MarginRequirementOverridesEditor
              overrides={selectedAccount.marginRequirementOverrides}
            />
            {accountFormError && <p role="alert">{accountFormError}</p>}
            <button type="submit" disabled={!uid}>Save account</button>
            {!selectedAccount.isDefault && (
              <>
                <button
                  type="button"
                  onClick={() => setDefaultAccount(uid, selectedAccount.id)}
                >
                  Make default
                </button>
                {accounts.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    style={{ backgroundColor: "var(--color-negative)" }}
                  >
                    Delete account
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      )}


      <div className="account-overview-list">
        {accountRows.map(({ account, legs: accountLegs, metrics }) => (
          <section className="account-overview" key={account.id}>
            <h3>{account.name || "Unnamed account"}</h3>

            <AccountRiskWhatIf
              account={account}
              legs={accountLegs}
              metrics={metrics}
              marks={positionMarks}
              underlyingPrices={underlyingPrices}
              date={markDate}
              accountSnapshots={accountSnapshots}
              accountIdByCampaign={accountIdByCampaign}
              accountTypeByCampaign={accountTypeByCampaign}
              cashTransactions={activeCashTransactions}
              showAddAccount={showAddAccount}
              showAccountEdit={showAccountEdit}
              onToggleAddAccount={() => {
                setShowAddAccount((open) => !open);
                setShowAccountEdit(false);
              }}
              onToggleAccountEdit={() => {
                setShowAccountEdit((open) => !open);
                setAccountFormError("");
                setShowAddAccount(false);
              }}
            />
          </section>
        ))}
      </div>

      <div className="cash-adjustments-section">
        <button
          type="button"
          className="cash-adjustments-toggle"
          aria-expanded={showCashAdjustments}
          onClick={() => {
            if (showCashAdjustments) {
              setEditingCashTransaction(null);
              setShowCashAdjustment(false);
            }
            setShowCashAdjustments((open) => !open);
          }}
        >
          {showCashAdjustments ? "Hide cash adjustments" : "View/add cash adjustments"}
        </button>

        {showCashAdjustments && (
          <div className="card cash-adjustments">
        <div className="cash-adjustments-header">
          <h3>Cash adjustments</h3>
      
          {selectedAccount && (
            <button
              type="button"
              aria-expanded={showCashAdjustment}
              onClick={() => {
                if (showCashAdjustment) setEditingCashTransaction(null);
                setShowCashAdjustment((open) => !open);
              }}
            >
              {showCashAdjustment ? "Cancel" : "Add cash adjustment"}
            </button>
          )}
        </div>
      
        {selectedAccount && showCashAdjustment && (
          <form
            key={editingCashTransaction?.id || "new-cash-transaction"}
            className="cash-adjustment-form"
            onSubmit={handleSaveCashTransaction}
          >
            <h4>{editingCashTransaction ? "Edit cash adjustment" : "Add cash adjustment"}</h4>
      
            <div className="form-row">
              <select
                className="input"
                name="type"
                defaultValue={editingCashTransaction?.type || "deposit"}
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
      
              <input
                className="input"
                name="amount"
                required
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={
                  editingCashTransaction
                    ? Math.abs(Number(editingCashTransaction.amount))
                    : ""
                }
                placeholder="Amount"
              />
      
              <input
                className="input"
                name="date"
                required
                type="date"
                defaultValue={editingCashTransaction?.date || today()}
              />
      
              <input
                className="input"
                name="note"
                defaultValue={editingCashTransaction?.note || ""}
                placeholder="Note"
              />
      
              <button type="submit" disabled={!uid}>
                {editingCashTransaction ? "Save changes" : "Add"}
              </button>
      
              {editingCashTransaction && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCashTransaction(null);
                    setShowCashAdjustment(false);
                  }}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        )}
      
        <div className="cash-adjustment-list">
          {visibleTransactions.length === 0 ? (
            <p>No cash adjustments for this view.</p>
          ) : (
            visibleTransactions.map((item) => (
              <div className="cash-adjustment-row" key={item.id}>
                <span>
                  {accounts.find((account) => account.id === item.accountId)?.name}
                  {" · "}{item.date} · {item.note || item.type}
                </span>
                <strong>{fmtWholeDollars(item.amount)}</strong>
                <button
                  type="button"
                  onClick={() => {
                    onSelectedAccountChange?.(item.accountId);
                    setEditingCashTransaction(item);
                    setShowCashAdjustments(true);
                    setShowCashAdjustment(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteCashTransaction(item)}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
        )}
      </div>

      <form className="card" onSubmit={handleSaveMarks}>
        <h3>Position marks</h3>
        <div className="form-row">
          <label htmlFor="mark-date">As of</label>
          <input id="mark-date" className="input" type="date"
            value={markDate} onChange={(event) => setMarkDate(event.target.value)} />
          <button type="submit" disabled={!uid || !accountRows.length}>
            Save marks
          </button>
          <button
            type="button"
            onClick={handleRefreshMarks}
            disabled={
              !uid ||
              refreshingMarks ||
              markDate !== today() ||
              !positionRows.some(({ info }) => info.supported)
            }
          >
            {refreshingMarks ? "Refreshing quotes…" : "Refresh current quotes"}
          </button>
        </div>
        <p className="muted" role="status" aria-live="polite">
          {markRefreshMessage ||
            "Alpaca options quotes are indicative; stock quotes use the IEX feed. Review marks before saving."}
        </p>

        <h4 className="account-mark-section-title">Marks</h4>
        {positionRows.length === 0 ? (
          <p>No positions are open on this date.</p>
        ) : (
          positionRows.map(({ account, leg, campaign, info }) => (
            <div className="form-row" key={leg.id}>
              <label htmlFor={`mark-${leg.id}`}>
                {selectedAccountId === "all" ? `${account.name} · ` : ""}
                {campaign?.name || campaign?.ticker || leg.ticker || "Position"}
                {" · "}{leg.type} · {leg.qty}
              </label>
              {info.supported ? (
                <input
                  id={`mark-${leg.id}`}
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={positionMarks[String(leg.id)] ?? ""}
                  onChange={(event) =>
                    updatePositionMark(String(leg.id), event.target.value)
                  }
                  placeholder={info.isOption ? "Option mark per share" : "Stock price per share"}
                />
              ) : (
                <span>Unsupported leg type; record assignment as stock legs.</span>
              )}
            </div>
          ))
        )}

        <h4 className="account-mark-section-title">Underlying prices</h4>
        {optionTickers.length === 0 ? (
          <p>No open options require an underlying price.</p>
        ) : (
          optionTickers.map((ticker) => (
            <div className="form-row" key={`underlying-${ticker}`}>
              <label htmlFor={`underlying-${ticker}`}>
                {ticker} underlying stock price
              </label>
              <input
                id={`underlying-${ticker}`}
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={underlyingPrices[ticker] ?? ""}
                onChange={(event) =>
                  updateUnderlyingPrice(ticker, event.target.value)
                }
              />
            </div>
          ))
        )}

      </form>
    </section>
  );
}