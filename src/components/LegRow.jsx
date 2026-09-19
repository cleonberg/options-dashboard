import React, { useState, useEffect, useMemo } from "react";
import { fmt, cashClass, computeLegPL, getCampaignLabel } from "../logic/logic.js";
import { editLeg, reopenLeg, rollLeg, deleteLeg } from "../sync/sync.js";

// Helper: Get local YYYY-MM-DD date without UTC timezone rollover
const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper: Safely format dates without shifting timezones
const formatDate = (dateVal) => {
  if (!dateVal) return "";
  if (typeof dateVal === "string" && dateVal.length >= 10 && dateVal.includes("-")) {
    return dateVal.slice(0, 10);
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  return getLocalDateStr(d);
};

export default function LegRow({ leg, campaigns = [], allLegs = [], uid, reloadAll }) {
  const [expanded, setExpanded] = useState(false);
  const [activeAction, setActiveAction] = useState(null);

  const todayStr = getLocalDateStr();

  // Close Form State
  const [closeDate, setCloseDate] = useState(todayStr);
  const [closePrice, setClosePrice] = useState("");

  // Roll Form State
  const [rollDate, setRollDate] = useState(todayStr);
  const [rollClosePrice, setRollClosePrice] = useState("");
  const [rollNewQty, setRollNewQty] = useState(leg.qty ?? 1);
  const [rollNewStrike, setRollNewStrike] = useState(leg.strike ?? "");
  const [rollNewExpiry, setRollNewExpiry] = useState(formatDate(leg.expiry));
  const [rollNewOpenPrice, setRollNewOpenPrice] = useState("");

  const pl = computeLegPL(leg);
  const isOption = leg.type ? !leg.type.includes("stock") : true;

  function toggle() {
    setExpanded(!expanded);
  }

  function update(field, value) {
    editLeg(uid, { ...leg, [field]: value });
    if (reloadAll) reloadAll();
  }

  const matchedCampaign = campaigns.find((c) => c.id === leg.campaignId);
  const campaignLabel = getCampaignLabel(matchedCampaign, leg.campaignId);

  const tooltipText = useMemo(() => {
    if (!leg.campaignId || !allLegs.length) return "";
    const relatedLegs = allLegs.filter((l) => l.campaignId === leg.campaignId);
    if (relatedLegs.length === 0) return "";

    const legStrings = relatedLegs.map((l) => {
      const status = l.isOpen ? "🟢 Open" : "🔴 Closed";
      const strikeStr = l.strike ? ` @ ${l.strike}` : "";
      const expStr = l.expiry ? ` (Exp: ${formatDate(l.expiry)})` : "";
      return `${status} | ${l.qty} ${l.type}${strikeStr}${expStr}`;
    });

    return `Campaign Legs (${relatedLegs.length}):\n` + legStrings.join("\n");
  }, [leg.campaignId, allLegs]);

  const campaignOptions = campaigns
    .filter((c) => c.ticker?.toLowerCase() === leg.ticker?.toLowerCase())
    .map((c) => ({
      value: c.id,
      label: `${getCampaignLabel(c)}${c.id === leg.campaignId ? " (Current)" : ""}`,
    }));

  const openDateStr = formatDate(leg.openDate);
  const closeDateStr = formatDate(leg.closeDate);

  const handleOpenCloseForm = () => {
    setCloseDate(getLocalDateStr());
    setClosePrice("");
    setActiveAction("close");
  };

  const handleOpenRollForm = () => {
    setRollDate(getLocalDateStr());
    setRollClosePrice("");
    setRollNewQty(leg.qty ?? 1);
    setRollNewStrike(leg.strike ?? "");
    setRollNewExpiry(formatDate(leg.expiry)); // FIXED: Format expiry for date input
    setRollNewOpenPrice("");
    setActiveAction("roll");
  };

  const handleConfirmClose = async (e) => {
    e.preventDefault();
    await editLeg(uid, {
      ...leg,
      isOpen: false,
      closeDate: closeDate,
      closePrice: closePrice === "" ? null : Number(closePrice),
    });
    setActiveAction(null);
    if (reloadAll) reloadAll();
  };

  const handleConfirmRoll = async (e) => {
    e.preventDefault();
    await rollLeg(uid, leg, {
      closeDate: rollDate,
      closePrice: rollClosePrice === "" ? null : Number(rollClosePrice),
      rollDate: rollDate,
      openPrice: rollNewOpenPrice === "" ? null : Number(rollNewOpenPrice),
      qty: rollNewQty === "" ? leg.qty : Number(rollNewQty),
      strike: isOption && rollNewStrike !== "" ? Number(rollNewStrike) : leg.strike,
      expiry: isOption ? rollNewExpiry : formatDate(leg.expiry),
    });
    setActiveAction(null);
    if (reloadAll) reloadAll();
  };

  return (
    <div className="leg-row">
      <div
        className="leg-summary"
        onClick={toggle}
        style={{
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
        }}
      >
        <div className="leg-summary-info" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {campaignLabel ? (
              <span
                className="strategy-badge"
                title={tooltipText}
                style={{
                  margin: 0,
                  backgroundColor: "#1e293b",
                  borderColor: "#3b4e7e",
                  color: "#38bdf8",
                  cursor: "help",
                }}
              >
                📁 {campaignLabel}
              </span>
            ) : (
              <span className="strategy-badge" style={{ margin: 0, opacity: 0.5 }}>
                Unassigned
              </span>
            )}

            <span>
              <strong>
                {leg.qty} {leg.type}
              </strong>{" "}
              {leg.strike ? `@ ${leg.strike}` : ""}
            </span>

            <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
              {leg.expiry ? `(Exp: ${formatDate(leg.expiry)})` : ""}
            </span>
          </div>

          <div style={{ fontSize: "12px", color: "#94a3b8", display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <span>
              <strong>Price:</strong> {leg.openPrice != null ? fmt(leg.openPrice) : "-"}
              {leg.closePrice != null ? ` ➔ ${fmt(leg.closePrice)}` : ""}
            </span>

            <span>
              <strong>Dates:</strong> {openDateStr || "N/A"}
              {closeDateStr ? ` ➔ ${closeDateStr}` : ""}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className={`leg-summary-pl ${pl == null ? "" : cashClass(pl)}`}>
            {pl == null ? "" : fmt(pl)}
          </div>
          <span style={{ fontSize: "12px" }}>{expanded ? "🔽" : "▶️"}</span>
        </div>
      </div>

      {expanded && (
        <div className="leg-details">
          {campaignOptions.length > 0 && (
            <EditableField
              label="Campaign"
              value={leg.campaignId}
              type="select"
              options={campaignOptions}
              onChange={(v) => update("campaignId", v)}
            />
          )}

          <EditableField label="Ticker" value={leg.ticker} onChange={(v) => update("ticker", v)} />

          <EditableField
            label="Type"
            value={leg.type}
            type="select"
            options={[
              { value: "sell_put", label: "Short Put" },
              { value: "buy_put", label: "Long Put" },
              { value: "sell_call", label: "Short Call" },
              { value: "buy_call", label: "Long Call" },
              { value: "buy_stock", label: "Long Stock" },
              { value: "sell_stock", label: "Short Stock" },
            ]}
            onChange={(v) => update("type", v)}
          />

          <EditableField
            label="Qty"
            value={leg.qty}
            type="number"
            onChange={(v) => update("qty", v === "" ? null : Number(v))}
          />

          {isOption && (
            <>
              <EditableField
                label="Strike"
                value={leg.strike}
                type="number"
                onChange={(v) => update("strike", v === "" ? null : Number(v))}
              />

              <EditableField
                label="Expiry"
                value={formatDate(leg.expiry)} // FIXED: Formatted expiry for input[type="date"]
                type="date"
                onChange={(v) => update("expiry", v)}
              />
            </>
          )}

          <EditableField
            label="Open Date"
            value={formatDate(leg.openDate)}
            type="date"
            onChange={(v) => update("openDate", v)}
          />

          <EditableField
            label="Open Price"
            value={leg.openPrice}
            type="number"
            onChange={(v) => update("openPrice", v === "" ? null : Number(v))}
          />

          {!leg.isOpen && (
            <>
              <EditableField
                label="Close Date"
                value={formatDate(leg.closeDate)}
                type="date"
                onChange={(v) => update("closeDate", v || null)}
              />

              <EditableField
                label="Close Price"
                value={leg.closePrice ?? ""}
                type="number"
                onChange={(v) => update("closePrice", v === "" ? null : Number(v))}
              />
            </>
          )}

          <EditableField label="Notes" value={leg.notes} type="textarea" onChange={(v) => update("notes", v)} />

          {activeAction === "close" && (
            <form onSubmit={handleConfirmClose} className="action-form">
              <h4>Close Leg</h4>
              <div className="action-form-grid">
                <div>
                  <label>Close Date</label>
                  <input
                    type="date"
                    value={closeDate}
                    onChange={(e) => setCloseDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label>Close Price</label>
                  <input
                    type="number"
                    step="any"
                    value={closePrice}
                    onChange={(e) => setClosePrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              <div className="action-form-buttons">
                <button type="submit" className="btn-confirm">
                  Confirm Close
                </button>
                <button type="button" onClick={() => setActiveAction(null)} className="btn-cancel">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {activeAction === "roll" && (
            <form onSubmit={handleConfirmRoll} className="action-form">
              <h4>Roll Leg</h4>
              <div className="action-form-grid">
                <div>
                  <label>Roll / Close Date</label>
                  <input
                    type="date"
                    value={rollDate}
                    onChange={(e) => setRollDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label>Current Leg Close Price</label>
                  <input
                    type="number"
                    step="any"
                    value={rollClosePrice}
                    onChange={(e) => setRollClosePrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label>New Leg Qty</label>
                  <input
                    type="number"
                    value={rollNewQty}
                    onChange={(e) => setRollNewQty(e.target.value)}
                    required
                  />
                </div>
                {isOption && (
                  <>
                    <div>
                      <label>New Strike</label>
                      <input
                        type="number"
                        step="any"
                        value={rollNewStrike}
                        onChange={(e) => setRollNewStrike(e.target.value)}
                        placeholder="Strike"
                      />
                    </div>
                    <div>
                      <label>New Expiry</label>
                      <input
                        type="date"
                        value={rollNewExpiry}
                        onChange={(e) => setRollNewExpiry(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label>New Leg Open Price</label>
                  <input
                    type="number"
                    step="any"
                    value={rollNewOpenPrice}
                    onChange={(e) => setRollNewOpenPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
              <div className="action-form-buttons">
                <button type="submit" className="btn-confirm">
                  Confirm Roll
                </button>
                <button type="button" onClick={() => setActiveAction(null)} className="btn-cancel">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!activeAction && (
            <div className="leg-actions" style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              {leg.isOpen ? (
                <>
                  <button onClick={handleOpenCloseForm}>Close</button>
                  <button onClick={handleOpenRollForm}>Roll</button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    await reopenLeg(uid, leg);
                    if (reloadAll) reloadAll();
                  }}
                  style={{ backgroundColor: "#2b4c7e", borderColor: "#3182ce", color: "#9fb3ff" }}
                >
                  Reopen
                </button>
              )}

              <button
                style={{ backgroundColor: "#5f2424", borderColor: "#8c3636", color: "#ff9f9f", marginLeft: "auto" }}
                onClick={async () => {
                  if (window.confirm("Are you sure you want to delete this leg entirely?")) {
                    await deleteLeg(uid, leg.id);
                    if (reloadAll) reloadAll();
                  }
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditableField({ label, value, type = "text", options = [], onChange }) {
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  function handleBlur() {
    if (localValue !== (value ?? "")) {
      onChange(localValue);
    }
  }

  function handleSelectChange(e) {
    const newVal = e.target.value;
    setLocalValue(newVal);
    if (newVal !== (value ?? "")) {
      onChange(newVal);
    }
  }

  return (
    <div className="detail-row">
      <label>{label}</label>
      {type === "textarea" ? (
        <textarea value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur} />
      ) : type === "select" ? (
        <select value={localValue} onChange={handleSelectChange}>
          {options.map((opt) => {
            const isObj = typeof opt === "object" && opt !== null;
            const optVal = isObj ? opt.value : opt;
            const optLabel = isObj ? opt.label : opt;
            return (
              <option key={optVal} value={optVal}>
                {optLabel}
              </option>
            );
          })}
        </select>
      ) : (
        <input type={type} value={localValue} onChange={(e) => setLocalValue(e.target.value)} onBlur={handleBlur} />
      )}
    </div>
  );
}