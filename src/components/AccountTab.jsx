import React, { useEffect, useMemo, useState } from "react";
import { fmtWholeDollars } from "../logic/logic.js";
import {
  createAccount,
  deleteAccount,
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

export default function AccountTab({
  uid,
  accounts = [],
  defaultAccountId = "",
  cashTransactions = [],
  accountSnapshots = [],
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccountId || "all"
  );
  const [name, setName] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [openingCashDate, setOpeningCashDate] = useState(today());

  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId
  );
  const showingAll = selectedAccountId === "all";

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

  const visibleAccounts = showingAll
    ? accounts
    : accounts.filter((account) => account.id === selectedAccountId);

  const visibleAccountIds = new Set(
    visibleAccounts.map((account) => account.id)
  );

  const visibleTransactions = cashTransactions
    .filter((item) => visibleAccountIds.has(item.accountId))
    .sort((a, b) => b.date.localeCompare(a.date));

  const visibleSnapshots = accountSnapshots
    .filter((item) => visibleAccountIds.has(item.accountId))
    .sort((a, b) => b.date.localeCompare(a.date));

  const cashByAccount = useMemo(
    () =>
      visibleAccounts.map((account) => {
        const openingDate = account.openingCashDate || "";
        const openingBalance =
          openingDate && openingDate <= today()
            ? Number(account.openingCash) || 0
            : 0;

        const adjustments = cashTransactions
          .filter(
            (item) =>
              item.accountId === account.id &&
              item.date >= openingDate &&
              item.date <= today()
          )
          .reduce((sum, item) => sum + Number(item.amount || 0), 0);

        return {
          account,
          balance: openingBalance + adjustments,
        };
      }),
    [visibleAccounts, cashTransactions]
  );

  const totalEstimatedCash = cashByAccount.reduce(
    (sum, item) => sum + item.balance,
    0
  );

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
  }

  async function handleDeleteAccount() {
    if (!uid || !selectedAccount) return;

    const accountName = selectedAccount.name || "this account";
    if (!window.confirm(
        `Delete ${accountName}, its cash adjustments, and its snapshots?`
    )) {
        return;
    }

    try {
        await deleteAccount(uid, selectedAccount.id);
        setSelectedAccountId(defaultAccountId || "all");
    } catch (error) {
        window.alert(error.message || "Could not delete the account.");
    }
    }

  async function handleAddCashTransaction(event) {
    event.preventDefault();
    if (!uid || !selectedAccount) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const type = String(form.get("type"));
    const amount = Math.abs(Number(form.get("amount")));

    await saveAccountRecord(uid, "cashTransactions", {
      accountId: selectedAccount.id,
      date: String(form.get("date")),
      type,
      amount: type === "withdrawal" ? -amount : amount,
      note: String(form.get("note") || ""),
    });

    formElement.reset();
  }

  async function handleAddSnapshot(event) {
    event.preventDefault();
    if (!uid || !selectedAccount) return;

    const form = new FormData(event.currentTarget);
    const date = String(form.get("date"));

    await saveAccountRecord(uid, "accountSnapshots", {
      id: `${selectedAccount.id}_${date}`,
      accountId: selectedAccount.id,
      date,
      netLiquidationValue: Number(form.get("netLiquidationValue")),
      excessMargin: Number(form.get("excessMargin")),
      marginUsed: Number(form.get("marginUsed")),
      source: "manual",
    });
  }

  return (
    <section>
      <div className="form-row card">
        <label htmlFor="account-select">View</label>
        <select
          id="account-select"
          className="input"
          value={selectedAccountId}
          onChange={(event) => setSelectedAccountId(event.target.value)}
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

      {selectedAccount && (
        <>
            <form className="card" onSubmit={handleSaveAccount}>
                <h3>{selectedAccount.name || "Account details"}</h3>
                <div className="form-row">
                <input
                    className="input"
                    required
                    placeholder="Account name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                />
                <input
                    className="input"
                    required
                    type="number"
                    step="0.01"
                    placeholder="Opening cash"
                    value={openingCash}
                    onChange={(event) => setOpeningCash(event.target.value)}
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
                    <button
                        type="button"
                        onClick={() => setDefaultAccount(uid, selectedAccount.id)}
                    >
                        Make default
                    </button>
                )}
                {accounts.length > 1 && !selectedAccount.isDefault && (
                    <button
                        type="button"
                        onClick={handleDeleteAccount}
                        style={{ backgroundColor: "var(--color-negative)" }}
                    >
                        Delete account
                    </button>
                )}
                </div>
            </form>

          <form className="card" onSubmit={handleAddCashTransaction}>
            <h3>Add cash adjustment</h3>
            <div className="form-row">
              <select className="input" name="type">
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
                placeholder="Amount"
              />
              <input
                className="input"
                name="date"
                required
                type="date"
                defaultValue={today()}
              />
              <input className="input" name="note" placeholder="Note" />
              <button type="submit" disabled={!uid}>Add</button>
            </div>
          </form>

          <form className="card" onSubmit={handleAddSnapshot}>
            <h3>Record Fidelity snapshot</h3>
            <div className="form-row">
              <input
                className="input"
                name="date"
                required
                type="date"
                defaultValue={today()}
              />
              <input
                className="input"
                name="netLiquidationValue"
                required
                type="number"
                step="0.01"
                placeholder="Net liquidation value"
              />
              <input
                className="input"
                name="excessMargin"
                required
                type="number"
                step="0.01"
                placeholder="Excess margin"
              />
              <input
                className="input"
                name="marginUsed"
                required
                type="number"
                step="0.01"
                placeholder="Margin used"
              />
              <button type="submit" disabled={!uid}>Save snapshot</button>
            </div>
          </form>
        </>
      )}

      <div className="summary-card">
        <h3 className="summary-card-title">Estimated cash</h3>
        <div className="summary-metric-val">
          {fmtWholeDollars(totalEstimatedCash)}
        </div>
        <div className="summary-metric-label">
          Opening cash plus external adjustments; excludes trade settlement.
        </div>
        {cashByAccount.map(({ account, balance }) => (
          <div key={account.id}>
            {account.name}: {fmtWholeDollars(balance)}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Cash adjustments</h3>
        {visibleTransactions.map((item) => (
          <div key={item.id}>
            {accounts.find((account) => account.id === item.accountId)?.name}
            {" · "}{item.date} · {item.note || item.type} ·{" "}
            {fmtWholeDollars(item.amount)}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Account snapshots</h3>
        {visibleSnapshots.map((item) => (
          <div key={item.id}>
            {accounts.find((account) => account.id === item.accountId)?.name}
            {" · "}{item.date} · Equity {fmtWholeDollars(item.netLiquidationValue)}
            · Excess margin {fmtWholeDollars(item.excessMargin)}
            · Margin used {fmtWholeDollars(item.marginUsed)}
          </div>
        ))}
      </div>
    </section>
  );
}