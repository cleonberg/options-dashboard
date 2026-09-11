import React, { useState, useEffect } from "react";
import { fmt, cashClass, computeLegPL } from "../logic/logic.js";
import { editLeg, closeLeg, rollLeg, deleteLeg } from "../sync/sync.js";

export default function LegRow({ leg, uid, reloadAll }) {
  const [expanded, setExpanded] = useState(false);

  const pl = computeLegPL(leg);

  function toggle() {
    setExpanded(!expanded);
  }

  function update(field, value) {
    editLeg(uid, { ...leg, [field]: value });
  }

  // Safely handles both Strings and Numbers (timestamps)
  const formatDate = (dateVal) => {
    if (!dateVal) return "";
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  };

  return (
    <div className="leg-row">

      {/* --- Collapsed summary row (mobile-friendly) --- */}
      <div 
        className="leg-summary" 
        onClick={toggle} 
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="leg-summary-info">
          <strong>{leg.qty} {leg.type}</strong> {leg.strike ? `@ ${leg.strike}` : ""} 
          <span style={{ fontSize: "12px", color: "#a1a1aa", marginLeft: "8px" }}>
            {leg.expiry ? `(Exp: ${leg.expiry})` : ""}
          </span>
        </div>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className={`leg-summary-pl ${pl == null ? "" : cashClass(pl)}`}>
            {pl == null ? "" : fmt(pl)}
          </div>
          <span style={{ fontSize: "12px" }}>{expanded ? "🔽" : "▶️"}</span>
        </div>
      </div>

      {/* --- Expanded detail section --- */}
      {expanded && (
        <div className="leg-details">

          {/* Editable fields */}
          <EditableField label="Ticker" value={leg.ticker}
            onChange={v => update("ticker", v)} />

          <EditableField 
            label="Type" 
            value={leg.type}
            type="select"
            options={["Call", "Put", "Stock", "Short Call", "Short Put"]} 
            onChange={v => update("type", v)} 
          />

          <EditableField label="Qty" value={leg.qty}
            type="number"
            onChange={v => update("qty", v === "" ? null : Number(v))} />

          <EditableField label="Strike" value={leg.strike}
            type="number"
            onChange={v => update("strike", v === "" ? null : Number(v))} />

          <EditableField label="Expiry" value={leg.expiry}
            type="date"
            onChange={v => update("expiry", v)} />

          <EditableField label="Open Date" value={formatDate(leg.openDate)}
            type="date"
            onChange={v => update("openDate", v)} />

          <EditableField label="Close Date" value={formatDate(leg.closeDate)}
            type="date"
            onChange={v => update("closeDate", v || null)} />

          <EditableField label="Open Price" value={leg.openPrice}
            type="number"
            onChange={v => update("openPrice", v === "" ? null : Number(v))} />

          <EditableField label="Close Price" value={leg.closePrice ?? ""}
            type="number"
            onChange={v => update("closePrice", v === "" ? null : Number(v))} />

          <EditableField label="Notes" value={leg.notes}
            type="textarea"
            onChange={v => update("notes", v)} />

          {/* Actions */}
          <div className="leg-actions" style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            {leg.isOpen ? (
              <>
                <button onClick={() => closeLeg(uid, leg)}>Close</button>
                <button onClick={() => rollLeg(uid, leg)}>Roll</button>
              </>
            ) : (
              <span className="closed-tag" style={{ padding: "6px 12px", border: "1px solid #a1a1aa", borderRadius: "4px", color: "#a1a1aa" }}>
                Closed
              </span>
            )}
            
            {/* Delete button pushed to the right side */}
            <button 
              style={{ backgroundColor: "#5f2424", borderColor: "#8c3636", color: "#ff9f9f", marginLeft: "auto" }}
              onClick={() => {
                if(window.confirm("Are you sure you want to delete this leg entirely?")) {
                  deleteLeg(uid, leg.id);
                }
              }}
            >
              Delete
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

// --- Upgraded EditableField ---
function EditableField({ label, value, type = "text", options = [], onChange }) {
  // 1. Hold the current typing value in local state
  const [localValue, setLocalValue] = useState(value ?? "");

  // 2. If the database updates externally (sync, roll, etc.), sync the input box
  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  // 3. Only send the update to Dexie/Firestore if the user actually changed it
  function handleBlur() {
    if (localValue !== (value ?? "")) {
      onChange(localValue);
    }
  }

  return (
    <div className="detail-row">
      <label>{label}</label>

      {type === "textarea" ? (
        <textarea
          value={localValue}
          onChange={e => setLocalValue(e.target.value)}
          onBlur={handleBlur}
        />
      ) : type === "select" ? (
        <select
          value={localValue}
          onChange={e => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          style={{ width: "100%", padding: "8px", borderRadius: "4px", backgroundColor: "#2b2b2b", color: "#fff", border: "1px solid #444" }}
        >
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={localValue}
          onChange={e => setLocalValue(e.target.value)}
          onBlur={handleBlur}
        />
      )}
    </div>
  );
}