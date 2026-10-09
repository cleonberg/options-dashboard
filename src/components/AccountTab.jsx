import { useState } from "react";
import {
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
import AccountRiskChart from "./AccountRiskChart.jsx";

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
}) {
  return Array.from({ length: 15 }, (_, index) => -50 + index * 5).map(
    (shockPercent) => {
      const multiplier = 1 + shockPercent / 100;
      let netPositionValue = 0;
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

        netPositionValue +=
          (info.isBuy ? 1 : -1) * scenarioMark * quantity * info.multiplier;
      }

      const marginEstimate = computeAccountMarginEstimate(legs, {
        asOfDate: date,
        positionMarks: marks,
        underlyingPrices,
        shockPercent,
      });

      if (!marginEstimate.complete || marginEstimate.total == null) {
        complete = false;
      }

      return {
        shockPercent,
        accountValue: complete ? cashBalance + netPositionValue : null,
        houseRequirement:
          marginEstimate.complete && marginEstimate.total != null
            ? marginEstimate.total
            : null,
        excessMargin:
          complete
            ? cashBalance + netPositionValue - marginEstimate.total
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
  });
}

function calculateAccountMetrics({
  account,
  legs,
  cashTransactions,
  underlyingPrices,
  scenarioShockPct,
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

  let longPositionValue = 0;
  let netPositionValue = 0;
  let allLongPositionsMarked = true;

  for (const leg of activeLegs) {
    const info = typeInfo(leg);
    if (!info.supported) continue;

    const mark = currentPositionMark(leg, marks, underlyingPrices);
    if (mark == null) {
      if (info.isBuy) allLongPositionsMarked = false;
      continue;
    }

    const quantity = Math.abs(Number(leg.qty));
    if (!Number.isFinite(quantity)) continue;

    const value = mark * quantity * info.multiplier;
    netPositionValue += info.isBuy ? value : -value;
    if (info.isBuy) longPositionValue += value;
  }

  const marginArgs = {
    asOfDate: date,
    positionMarks: marks,
    underlyingPrices,
  };
  const marginEstimate = computeAccountMarginEstimate(legs, marginArgs);
  const marginDown = computeAccountMarginEstimate(legs, {
    ...marginArgs,
    shockPercent: -scenarioShockPct,
  });
  const marginUp = computeAccountMarginEstimate(legs, {
    ...marginArgs,
    shockPercent: scenarioShockPct,
  });

  const houseRequirement = marginEstimate.total;
  const marginableSecurities =
    cashKnown && allLongPositionsMarked && unsupportedPositions.length === 0
      ? cashBalance + longPositionValue
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
  });

  return {
    cashBalance,
    marginableSecurities,
    houseRequirement,
    netHouseSurplus:
      marginableSecurities != null && houseRequirement != null
        ? marginableSecurities - houseRequirement
        : null,
    totalAccountValue,
    cashFlowsComplete: !unsupportedCashFlows,
    activeLegs,
    missingMarks,
    marginEstimate,
    marginDown,
    marginUp,
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

function AccountRiskWhatIf({
  account,
  legs,
  metrics,
  marks,
  underlyingPrices,
  date,
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
      <button
        type="button"
        className="account-what-if-toggle"
        aria-expanded={showControls}
        onClick={() => setShowControls((visible) => !visible)}
      >
        {showControls ? "Hide what-if controls" : "What if?"}
        {hasChanges ? " (scenario active)" : ""}
      </button>

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

      <AccountRiskChart
        accountName={account.name || "Unnamed account"}
        data={whatIfData}
        baselineData={hasChanges ? metrics.riskScenarios : null}
        complete={complete}
      />

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
  const [editingCashTransaction, setEditingCashTransaction] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAccountEdit, setShowAccountEdit] = useState(false);
  const [showCashAdjustments, setShowCashAdjustments] = useState(false);
  const [showCashAdjustment, setShowCashAdjustment] = useState(false);

  const [scenarioShockPct, setScenarioShockPct] = useState(10);

  const selectedAccountId =
    selectedAccountIdProp === "all" ||
    accounts.some((account) => String(account.id) === selectedAccountIdProp)
      ? selectedAccountIdProp
      : "all";
  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId
  );
  const visibleAccounts =
    selectedAccountId === "all"
      ? accounts
      : accounts.filter((account) => account.id === selectedAccountId);

  const activeCashTransactions = cashTransactions.filter((item) => !item.deleted);

  const snapshotValues = (() => {
    const visibleIds = new Set(visibleAccounts.map((account) => account.id));
    const latestSnapshots = new Map();
    const marks = {};
    const prices = {};

    for (const snapshot of accountSnapshots) {
      if (!visibleIds.has(snapshot.accountId) || snapshot.date > markDate) {
        continue;
      }

      const latestSnapshot = latestSnapshots.get(snapshot.accountId);
      if (!latestSnapshot || snapshot.date > latestSnapshot.date) {
        latestSnapshots.set(snapshot.accountId, snapshot);
      }
    }

    for (const snapshot of latestSnapshots.values()) {
      Object.assign(marks, snapshot.positionMarks || {});
      Object.assign(prices, snapshot.underlyingPrices || {});
    }

    return { positionMarks: marks, underlyingPrices: prices };
  })();
  const markScope = `${selectedAccountId}:${markDate}`;
  const { positionMarks, underlyingPrices } =
    markEdits?.scope === markScope ? markEdits : snapshotValues;

  const campaignsById = new Map(
    campaigns.map((campaign) => [String(campaign.id), campaign])
  );
  const legsByAccount = new Map(accounts.map((account) => [account.id, []]));

  for (const leg of legs) {
    const campaign = campaignsById.get(String(leg.campaignId));
    const accountId = campaign?.accountId || defaultAccountId;
    if (legsByAccount.has(accountId)) legsByAccount.get(accountId).push(leg);
  }

  const accountRows = visibleAccounts.map((account) => {
    const accountLegs = legsByAccount.get(account.id) || [];
    return {
      account,
      legs: accountLegs,
      metrics: calculateAccountMetrics({
        account,
        legs: accountLegs,
        cashTransactions: activeCashTransactions,
        marks: positionMarks,
        underlyingPrices,
        scenarioShockPct,
        date: markDate,
      }),
    };
  });

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

  function aggregateMetric(key) {
    if (!accountRows.length) return null;
    const values = accountRows.map((row) => row.metrics[key]);
    if (values.some((value) => value == null)) return null;
    return values.reduce((sum, value) => sum + value, 0);
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
      currency: "USD",
      openingCash: Number(form.get("openingCash")),
      openingCashDate: String(form.get("openingCashDate")),
    });

    formElement.reset();
    onSelectedAccountChange?.(id);
    setShowAddAccount(false);
  }

  async function handleSaveAccount(event) {
    event.preventDefault();
    if (!uid || !selectedAccount) return;

    const form = new FormData(event.currentTarget);
    await saveAccountRecord(uid, "accounts", {
      ...selectedAccount,
      name: String(form.get("name") || "").trim(),
      currency: selectedAccount.currency || "USD",
      openingCash: Number(form.get("openingCash")),
      openingCashDate: String(form.get("openingCashDate")),
    });
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
        underlyingPrices: {
          ...currentValues.underlyingPrices,
          [ticker]: value,
        },
      };
    });
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
          source: "manual-position-marks",
        });
      })
    );
  }

  const visibleTransactions = activeCashTransactions
    .filter((item) => visibleAccounts.some((account) => account.id === item.accountId))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section>
      <div className="account-toolbar">
        <div>
          <h2>Accounts</h2>
          <label htmlFor="account-select">View account</label>
          <select
            id="account-select"
            className="input account-picker"
            title="An asterisk marks the default account."
            value={selectedAccountId}
            onChange={(event) => {
              onSelectedAccountChange?.(event.target.value);
              setShowAccountEdit(false);
              setEditingCashTransaction(null);
              setShowCashAdjustments(false);
              setShowCashAdjustment(false);
            }}
          >
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name || "Unnamed account"}
                {account.isDefault ? " *" : ""}
              </option>
            ))}
          </select>
        </div>

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

          {selectedAccount && (
            <button
              type="button"
              aria-expanded={showAccountEdit}
              onClick={() => {
                setShowAccountEdit((open) => !open);
                setShowAddAccount(false);
              }}
            >
              {showAccountEdit ? "Close account details" : "Edit account"}
            </button>
          )}
        </div>
      </div>

      {showAddAccount && (
        <form className="card" onSubmit={handleCreateAccount}>
          <h3>Add account</h3>
          <div className="form-row">
            <input className="input" name="name" required placeholder="Account name" />
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


      <div className="summary-grid-cards account-summary-grid">
        <div className="summary-card">
          <h3 className="summary-card-title">Account balances</h3>
          <div className="summary-card-metrics summary-card-metrics--two">
            <div className="summary-metric-item">
              <div className="summary-metric-label">Account value</div>
              <div className="summary-metric-val">
                {displayMoney(aggregateMetric("totalAccountValue"))}
              </div>
            </div>
            <div className="summary-card-divider" />
            <div className="summary-metric-item">
              <div className="summary-metric-label">Cash balance</div>
              <div className="summary-metric-val">
                {displayMoney(aggregateMetric("cashBalance"))}
              </div>
            </div>
          </div>
        </div>

        <div className="summary-card">
          <h3 className="summary-card-title">Net surplus</h3>
          <div className="summary-card-metrics summary-card-metrics--formula">
            <div className="summary-metric-item">
              <div className="summary-metric-label">Marginable securities</div>
              <div className="summary-metric-val">
                {displayMoney(aggregateMetric("marginableSecurities"))}
              </div>
            </div>
            <span className="summary-formula-operator" aria-hidden="true">-</span>
            <div className="summary-metric-item">
              <div className="summary-metric-label">House requirement</div>
              <div className="summary-metric-val">
                {displayMoney(aggregateMetric("houseRequirement"))}
              </div>
            </div>
            <span className="summary-formula-operator" aria-hidden="true">=</span>
            <div className="summary-metric-item">
              <div className="summary-metric-label">Net surplus</div>
              <div className="summary-metric-val">
                {displayMoney(aggregateMetric("netHouseSurplus"))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="account-overview-list">
        {accountRows.map(({ account, legs: accountLegs, metrics }) => (
          <section className="account-overview" key={account.id}>
            <h3>{account.name || "Unnamed account"}</h3>

            <div className="account-stress-summary">
              <span>
                Estimated margin at -{scenarioShockPct}%:{" "}
                {displayMoney(metrics.marginDown.total)}
              </span>
              <span>
                Estimated margin at +{scenarioShockPct}%:{" "}
                {displayMoney(metrics.marginUp.total)}
              </span>
            </div>

            <AccountRiskWhatIf
              account={account}
              legs={accountLegs}
              metrics={metrics}
              marks={positionMarks}
              underlyingPrices={underlyingPrices}
              date={markDate}
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
        </div>

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

        <h4 className="account-mark-section-title">Stock-price scenario</h4>
        <div className="form-row">
          <label htmlFor="scenario-shock">Shock size (%)</label>
          <input
            id="scenario-shock"
            className="input"
            type="number"
            min="0"
            step="1"
            value={scenarioShockPct}
            onChange={(event) =>
              setScenarioShockPct(Number(event.target.value))
            }
          />
        </div>
      </form>
    </section>
  );
}