// LegRow.jsx
import React, { useState, useEffect, useMemo } from "react";
import { fmt, cashClass, computeLegPL, getCampaignLabel } from "../logic/logic.js";
import { editLeg, closeLeg, reopenLeg, rollLeg, deleteLeg } from "../sync/sync.js";

export default function LegRow({ leg, campaigns = [], uid, reloadAll }) {
  const [expanded, setExpanded] = useState(false);

  const pl = computeLegPL(leg);
  const isOption = leg.type ? !leg.type.includes("stock") : true;

  function toggle() {
    setExpanded(!expanded);
  }

  function update(field, value) {
    editLeg(uid, { ...leg, [field]: value });
    if (reloadAll) reloadAll();
  }

  const formatDate = (dateVal) => {
    if (!dateVal) return "";
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  };

  // 🔍 Match campaign for collapsed badge display
  const matchedCampaign = campaigns.find((c) => c.id === leg.campaignId);
  const campaignLabel = getCampaignLabel(matchedCampaign, leg.campaignId);

  // Calculate dropdown options for reassigning campaigns in expanded view
  const campaignOptions = campaigns
    .filter((c) => c.ticker?.toLowerCase() === leg.ticker?.toLowerCase())
    .map((c) => ({
      value: c.id,
      label: `${getCampaignLabel(c)}${c.id === leg.campaignId ? ' (Current)' : ''}`
    }));

  return (
    <div className="leg-row">

      {/* --- Collapsed summary row --- */}
      <div 
        className="leg-summary" 
        onClick={toggle} 
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="leg-summary-info" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          
          {/* 📁 Campaign Badge */}
          {campaignLabel ? (
            <span className="strategy-badge" style={{ margin: 0, backgroundColor: "#1e293b", borderColor: "#3b4e7e", color: "#38bdf8" }}>
              📁 {campaignLabel}
            </span>
          ) : (
            <span className="strategy-badge" style={{ margin: 0, opacity: 0.5 }}>
              Unassigned
            </span>
          )}

          <span>
            <strong>{leg.qty} {leg.type}</strong> {leg.strike ? `@ ${leg.strike}` : ""} 
          </span>

          <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
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

          {/* Campaign Selector */}
          {campaignOptions.length > 0 && (
            <EditableField 
              label="Campaign" 
              value={leg.campaignId}
              type="select"
              options={campaignOptions}
              onChange={v => update("campaignId", v)} 
            />
          )}

          {/* Editable fields */}
          <EditableField label="Ticker" value={leg.ticker}
            onChange={v => update("ticker", v)} />

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
            onChange={v => update("type", v)} 
          />

          <EditableField label="Qty" value={leg.qty}
            type="number"
            onChange={v => update("qty", v === "" ? null : Number(v))} />

          {isOption && (
            <>
              <EditableField label="Strike" value={leg.strike}
                type="number"
                onChange={v => update("strike", v === "" ? null : Number(v))} />

              <EditableField label="Expiry" value={leg.expiry}
                type="date"
                onChange={v => update("expiry", v)} />
            </>
          )}

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
                <button 
                  onClick={async () => {
                    await closeLeg(uid, leg);
                    if (reloadAll) reloadAll();
                  }}
                >
                  Close
                </button>
                <button 
                  onClick={async () => {
                    await rollLeg(uid, leg);
                    if (reloadAll) reloadAll();
                  }}
                >
                  Roll
                </button>
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
                if(window.confirm("Are you sure you want to delete this leg entirely?")) {
                  await deleteLeg(uid, leg.id);
                  if (reloadAll) reloadAll();
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
        <textarea value={localValue} onChange={e => setLocalValue(e.target.value)} onBlur={handleBlur} />
      ) : type === "select" ? (
        <select
          value={localValue}
          onChange={handleSelectChange}
        >
          {options.map(opt => {
            const isObj = typeof opt === "object" && opt !== null;
            const optVal = isObj ? opt.value : opt;
            const optLabel = isObj ? opt.label : opt;
            return <option key={optVal} value={optVal}>{optLabel}</option>;
          })}
        </select>
      ) : (
        <input type={type} value={localValue} onChange={e => setLocalValue(e.target.value)} onBlur={handleBlur} />
      )}
    </div>
  );
}