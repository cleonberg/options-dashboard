import React, { useState } from "react";
import { fmt, cashClass, computeLegPL } from "../logic/logic.js";
import { editLeg, closeLeg, rollLeg } from "../sync/sync.js";

export default function LegRow({ leg, uid, reloadAll }) {
  const [expanded, setExpanded] = useState(false);

  const pl = computeLegPL(leg);

  function toggle() {
    setExpanded(!expanded);
  }

  function update(field, value) {
    editLeg(uid, { ...leg, [field]: value });
    // reloadAll(uid);
  }

  return (
    <div className="leg-row">

      {/* --- Collapsed summary row (mobile-friendly) --- */}
      <div className="leg-summary" onClick={toggle}>
        <div className="leg-summary-type">{leg.type}</div>
        <div className="leg-summary-qty">{leg.qty}</div>
        <div className={`leg-summary-pl ${pl == null ? "" : cashClass(pl)}`}>
          {pl == null ? "" : fmt(pl)}
        </div>
      </div>

      {/* --- Expanded detail section --- */}
      {expanded && (
        <div className="leg-details">

          {/* Editable fields */}
          <EditableField label="Ticker" value={leg.ticker}
            onChange={v => update("ticker", v)} />

          <EditableField label="Type" value={leg.type}
            onChange={v => update("type", v)} />

          <EditableField label="Qty" value={leg.qty}
            type="number"
            onChange={v => update("qty", Number(v))} />

          <EditableField label="Strike" value={leg.strike}
            type="number"
            onChange={v => update("strike", Number(v))} />

          <EditableField label="Expiry" value={leg.expiry}
            type="date"
            onChange={v => update("expiry", v)} />

          <EditableField label="Open Date" value={leg.openDate?.slice(0,10)}
            type="date"
            onChange={v => update("openDate", v)} />

          <EditableField label="Close Date" value={leg.closeDate?.slice(0,10) || ""}
            type="date"
            onChange={v => update("closeDate", v || null)} />

          <EditableField label="Open Price" value={leg.openPrice}
            type="number"
            onChange={v => update("openPrice", Number(v))} />

          <EditableField label="Close Price" value={leg.closePrice ?? ""}
            type="number"
            onChange={v => update("closePrice", Number(v))} />

          <EditableField label="Notes" value={leg.notes}
            type="textarea"
            onChange={v => update("notes", v)} />

          {/* Actions */}
          <div className="leg-actions">
            {leg.isOpen ? (
              <>
                <button onClick={() => closeLeg(uid, leg)}>Close</button>
                <button onClick={() => rollLeg(uid, leg)}>Roll</button>
              </>
            ) : (
              <span className="closed-tag">Closed</span>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function EditableField({ label, value, type = "text", onChange }) {
  return (
    <div className="detail-row">
      <label>{label}</label>

      {type === "textarea" ? (
        <textarea
          defaultValue={value}
          onBlur={e => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type}
          defaultValue={value}
          onBlur={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
