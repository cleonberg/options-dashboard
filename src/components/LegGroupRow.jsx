import { useState } from "react";
import { fmt, getCampaignLabel } from "../logic/logic.js";
import { rollLegGroup } from "../sync/sync.js";
import LegRow from "./LegRow.jsx";

const getLocalDateStr = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const formatDate = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

export default function LegGroupRow({
  legs,
  campaigns,
  allLegs,
  uid,
  reloadAll,
  expanded,
  onToggle,
  expandedLegId,
  onToggleLeg,
  onActionComplete,
}) {
  const [activeAction, setActiveAction] = useState(null);
  const [rollDate, setRollDate] = useState(getLocalDateStr);
  const [rollClosePrice, setRollClosePrice] = useState("");
  const [rollQty, setRollQty] = useState("");
  const [rollCampaignId, setRollCampaignId] = useState("");
  const [rollNewQty, setRollNewQty] = useState("");
  const [rollNewStrike, setRollNewStrike] = useState("");
  const [rollNewExpiry, setRollNewExpiry] = useState("");
  const [rollNewOpenPrice, setRollNewOpenPrice] = useState("");
  const [rollError, setRollError] = useState("");

  const totalQty = legs.reduce((total, leg) => total + Number(leg.qty || 0), 0);
  const firstLeg = legs[0];
  const isOption = firstLeg.type ? !firstLeg.type.includes("stock") : true;
  const weightedOpenPrice = legs.every((leg) =>
    leg.openPrice != null && leg.openPrice !== "" && Number.isFinite(Number(leg.openPrice))
  )
    ? legs.reduce((total, leg) => total + Number(leg.openPrice) * Number(leg.qty), 0) / totalQty
    : null;
  const campaign = campaigns.find((item) => item.id === firstLeg.campaignId);
  const campaignLabel = getCampaignLabel(campaign, firstLeg.campaignId);
  const campaignOptions = campaigns
    .filter((item) =>
      item.ticker?.toLowerCase() === firstLeg.ticker?.toLowerCase() &&
      (!campaign?.accountId || item.accountId === campaign.accountId)
    )
    .map((item) => ({
      value: item.id,
      label: `${getCampaignLabel(item)}${item.id === firstLeg.campaignId ? " (Current)" : ""}`,
    }));

  const openRollForm = (event) => {
    event.stopPropagation();
    const today = getLocalDateStr();
    setRollDate(today);
    setRollClosePrice("");
    setRollQty(totalQty);
    setRollCampaignId(firstLeg.campaignId ?? "");
    setRollNewQty(totalQty);
    setRollNewStrike(firstLeg.strike ?? "");
    setRollNewExpiry(formatDate(firstLeg.expiry));
    setRollNewOpenPrice("");
    setRollError("");
    setActiveAction("roll");
  };

  const handleConfirmRoll = async (event) => {
    event.preventDefault();
    setRollError("");
    try {
      await rollLegGroup(uid, legs, {
        closeDate: rollDate,
        closePrice: rollClosePrice === "" ? null : Number(rollClosePrice),
        rollDate,
        rollQty: Number(rollQty),
        campaignId: rollCampaignId || null,
        openPrice: rollNewOpenPrice === "" ? null : Number(rollNewOpenPrice),
        qty: rollNewQty === "" ? Number(rollQty) : Number(rollNewQty),
        strike: isOption && rollNewStrike !== "" ? Number(rollNewStrike) : firstLeg.strike,
        expiry: isOption ? rollNewExpiry : formatDate(firstLeg.expiry),
      });
      setActiveAction(null);
      if (onActionComplete) onActionComplete();
      if (reloadAll) reloadAll();
    } catch (error) {
      console.error("[LegGroupRow] group roll failed", error);
      setRollError(error.message || "Unable to roll this position.");
    }
  };

  return (
    <div className="leg-row leg-group-row">
      <div
        className="leg-summary"
        onClick={onToggle}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}
      >
        <div className="leg-summary-info" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span className="strategy-badge" title="Grouped open lots for the same contract">
              📦 {campaignLabel}
            </span>
            <strong>
              {firstLeg.ticker} · {totalQty} {firstLeg.type}
              {firstLeg.strike != null ? ` @ ${firstLeg.strike}` : ""}
            </strong>
            <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
              {firstLeg.expiry ? `(Exp: ${formatDate(firstLeg.expiry)})` : ""}
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>
            {legs.length} lots · Avg open price: {weightedOpenPrice == null ? "-" : fmt(weightedOpenPrice)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {!activeAction && (
            <button type="button" onClick={openRollForm}>
              Roll Group
            </button>
          )}
          <span style={{ fontSize: "12px" }}>{expanded ? "🔽" : "▶️"}</span>
        </div>
      </div>

      {activeAction === "roll" && (
        <form onSubmit={handleConfirmRoll} className="action-form roll-action-form" style={{ margin: "0 16px 16px" }}>
          <h4>Roll Group</h4>
          <p>Partial group rolls allocate quantity to the oldest lots first.</p>
          <div className="action-form-grid">
            <div>
              <label>Roll / Close Date</label>
              <input type="date" value={rollDate} onChange={(event) => setRollDate(event.target.value)} required />
            </div>
            <div>
              <label>Current Leg Close Price</label>
              <input
                type="number"
                step="any"
                value={rollClosePrice}
                onChange={(event) => setRollClosePrice(event.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label>Destination Campaign</label>
              <select
                value={rollCampaignId}
                onChange={(event) => setRollCampaignId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {campaignOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Quantity to Roll</label>
              <input
                type="number"
                min={isOption ? 1 : "0.00000001"}
                max={totalQty}
                step={isOption ? 1 : "any"}
                value={rollQty}
                onChange={(event) => {
                  const nextQty = event.target.value;
                  const newQtyMatchesRollQty = Number(rollNewQty) === Number(rollQty);
                  setRollQty(nextQty);
                  if (newQtyMatchesRollQty) setRollNewQty(nextQty);
                }}
                required
              />
            </div>
            <div>
              <label>New Leg Qty</label>
              <input
                type="number"
                min={isOption ? 1 : "0.00000001"}
                step={isOption ? 1 : "any"}
                value={rollNewQty}
                onChange={(event) => setRollNewQty(event.target.value)}
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
                    onChange={(event) => setRollNewStrike(event.target.value)}
                    placeholder="Strike"
                  />
                </div>
                <div>
                  <label>New Expiry</label>
                  <input
                    type="date"
                    value={rollNewExpiry}
                    onChange={(event) => setRollNewExpiry(event.target.value)}
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
                onChange={(event) => setRollNewOpenPrice(event.target.value)}
                placeholder="0.00"
                required
              />
            </div>
          </div>
          {rollError && <p role="alert">{rollError}</p>}
          <div className="action-form-buttons">
            <button type="submit" className="btn-confirm">Confirm Roll</button>
            <button type="button" onClick={() => setActiveAction(null)} className="btn-cancel">Cancel</button>
          </div>
        </form>
      )}

      {expanded && (
        <div className="leg-details leg-group-lots">
          <strong>Individual lots</strong>
          {legs.map((leg) => (
            <LegRow
              key={leg.id}
              leg={leg}
              campaigns={campaigns}
              allLegs={allLegs}
              uid={uid}
              reloadAll={reloadAll}
              expanded={expandedLegId === leg.id}
              onToggle={() => onToggleLeg(leg.id)}
              onActionComplete={onActionComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
