import React, { useEffect, useMemo, useState } from "react";
import {
  computeAccountMarginEstimate,
  fmtWholeDollars,
} from "../logic/logic.js";
import {
  createAccount,
  deleteAccount,
  deleteCashTransaction,
  saveAccountRecord,
  setDefaultAccount,
} from "../sync/sync.js";

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

  return {
    cashBalance,
    marginableSecurities,
    houseRequirement,
    netHouseSurplus:
      marginableSecurities != null && houseRequirement != null
        ? marginableSecurities - houseRequirement
        : null,
    totalAccountValue,
    activeLegs,
    missingMarks,
    marginEstimate,
    marginDown,
    marginUp,
    unsupportedPositions,
    unsupportedCashFlows,
    unsupportedMargin: !marginEstimate.complete,
  };
}

function displayMoney(value) {
  return value == null ? "Incomplete" : fmtWholeDollars(value);
}

export default function AccountTab({
  uid,
  accounts = [],
  defaultAccountId = "",
  campaigns = [],
  legs = [],
  cashTransactions = [],
  accountSnapshots = [],
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccountId || "all"
  );
  const [markDate, setMarkDate] = useState(today());
  const [positionMarks, setPositionMarks] = useState({});
  const [name, setName] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [openingCashDate, setOpeningCashDate] = useState(today());
  const [editingCashTransaction, setEditingCashTransaction] = useState(null);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [showAccountEdit, setShowAccountEdit] = useState(false);
  const [showCashAdjustment, setShowCashAdjustment] = useState(false);

  const [underlyingPrices, setUnderlyingPrices] = useState({});
  const [scenarioShockPct, setScenarioShockPct] = useState(10);

  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId
  );
  const visibleAccounts =
    selectedAccountId === "all"
      ? accounts
      : accounts.filter((account) => account.id === selectedAccountId);

  const activeCashTransactions = cashTransactions.filter((item) => !item.deleted);

  useEffect(() => {
    if (
      selectedAccountId !== "all" &&
      !accounts.some((account) => account.id === selectedAccountId)
    ) {
      setSelectedAccountId(defaultAccountId || "all");
    }
  }, [accounts, defaultAccountId, selectedAccountId]);

  useEffect(() => {
    setName(selectedAccount?.name ?? "");
    setOpeningCash(
      selectedAccount?.openingCash == null
        ? ""
        : String(selectedAccount.openingCash)
    );
    setOpeningCashDate(selectedAccount?.openingCashDate ?? today());
  }, [
    selectedAccount?.id,
    selectedAccount?.name,
    selectedAccount?.openingCash,
    selectedAccount?.openingCashDate,
  ]);

  useEffect(() => {
    const visibleIds = new Set(visibleAccounts.map((account) => account.id));
    const marks = {};
    const prices = {};

    for (const snapshot of accountSnapshots) {
      if (!visibleIds.has(snapshot.accountId) || snapshot.date !== markDate) {
        continue;
      }
      Object.assign(marks, snapshot.positionMarks || {});
      Object.assign(prices, snapshot.underlyingPrices || {});
    }

    setPositionMarks(marks);
    setUnderlyingPrices(prices);
  }, [accountSnapshots, markDate, selectedAccountId, accounts]);

  const legsByAccount = useMemo(() => {
    const campaignsById = new Map(
      campaigns.map((campaign) => [String(campaign.id), campaign])
    );
    const grouped = new Map(accounts.map((account) => [account.id, []]));

    for (const leg of legs) {
      const campaign = campaignsById.get(String(leg.campaignId));
      const accountId = campaign?.accountId || defaultAccountId;
      if (grouped.has(accountId)) grouped.get(accountId).push(leg);
    }

    return grouped;
  }, [accounts, campaigns, defaultAccountId, legs]);

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
    setSelectedAccountId(id);
    setShowAddAccount(false);
  }

  async function handleSaveAccount(event) {
    event.preventDefault();
    if (!uid || !selectedAccount) return;

    await saveAccountRecord(uid, "accounts", {
      ...selectedAccount,
      name: name.trim(),
      currency: selectedAccount.currency || "USD",
      openingCash: Number(openingCash),
      openingCashDate,
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
      setSelectedAccountId(defaultAccountId || "all");
    } catch (error) {
      window.alert(error.message || "Could not delete the account.");
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
            value={selectedAccountId}
            onChange={(event) => {
              setSelectedAccountId(event.target.value);
              setShowAccountEdit(false);
              setEditingCashTransaction(null);
              setShowCashAdjustment(false);
            }}
          >
            <option value="all">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name || "Unnamed account"}
                {account.isDefault ? " (Default)" : ""}
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
        <form className="card" onSubmit={handleSaveAccount}>
          <h3>{selectedAccount.name || "Account details"}</h3>
          <div className="form-row">
            <input
              className="input"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Account name"
            />
            <input
              className="input"
              required
              type="number"
              step="0.01"
              value={openingCash}
              onChange={(event) => setOpeningCash(event.target.value)}
              placeholder="Opening cash"
            />
            <input
              className="input"
              required
              type="date"
              value={openingCashDate}
              onChange={(event) => setOpeningCashDate(event.target.value)}
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
        {[
          ["Cash balance", "cashBalance"],
          ["Account value", "totalAccountValue"],
          ["Marginable securities", "marginableSecurities"],
          ["House requirement", "houseRequirement"],
          ["Net surplus", "netHouseSurplus"],
        ].map(([label, key]) => (
          <div className="summary-card" key={key}>
            <h3 className="summary-card-title">{label}</h3>
            <div className="account-summary-value">
              {displayMoney(aggregateMetric(key))}
            </div>
          </div>
        ))}
      </div>

      <div className="account-overview-list">
        {accountRows.map(({ account, metrics }) => (
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

            <div className="account-position-list">
              <div className="account-position-header">
                <span>Position</span>
                <span>Margin requirement</span>
              </div>

              {metrics.marginEstimate.positions.map((item) => {
                const leg = metrics.activeLegs.find(
                  (candidate) => String(candidate.id) === item.legId
                );
                if (!leg) return null;

                return (
                  <div
                    className={`account-position-row`}
                    key={item.legId}
                  >
                    <span>
                      {leg.ticker} {leg.type} {leg.qty}
                      {leg.strike ? ` @ ${leg.strike}` : ""}
                    </span>
                    <strong>{displayMoney(item.requiredMargin)}</strong>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

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
                    setSelectedAccountId(item.accountId);
                    setEditingCashTransaction(item);
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
                    setPositionMarks((current) => ({
                      ...current,
                      [String(leg.id)]: event.target.value,
                    }))
                  }
                  placeholder={info.isOption ? "Option mark per share" : "Stock price per share"}
                />
              ) : (
                <span>Unsupported leg type; record assignment as stock legs.</span>
              )}
            </div>
          ))
        )}
        {optionTickers.map((ticker) => (
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
                setUnderlyingPrices((current) => ({
                  ...current,
                  [ticker]: event.target.value,
                }))
              }
            />
          </div>
        ))}

        <div className="form-row">
          <label htmlFor="scenario-shock">Stock-price scenario (%)</label>
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