import React, { useState } from "react";

import {
  fmt,
  cashClass,
  computeCampaignSummary,
  computeLegPL,
  groupCampaignsByTicker,
  getCampaignTimeline,
  computeCampaignPLSeries,
  loadCampaignsAndLegs
} from "../logic/logic.js";

import LegForm from "./LegForm.jsx";
import EditLegForm from "./EditLegForm.jsx";

import { updateCampaign, updateLeg, deleteCampaign } from "../logic/synclogic";

export default function CampaignsTab(props) {
  const {
    campaigns,
    legs,
    selectedCampaignId,
    setSelectedCampaignId,
    setCampaigns,
    setLegs,
    editingLeg,
    setEditingLeg,
    rollSourceLeg,
    setRollSourceLeg,
    rollClosePrice,
    setRollClosePrice,
    rollQty,
    setRollQty,
    rollStrike,
    setRollStrike,
    rollExpiry,
    setRollExpiry,
    rollOpenPrice,
    setRollOpenPrice
  } = props;

  const [newTicker, setNewTicker] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // ---------- Reload ----------
  async function reloadAll() {
    const { campaigns: c, legs: l } = await loadCampaignsAndLegs();
    setCampaigns(c);
    setLegs(l);
  }

  // ---------- Add Campaign ----------
  async function onCreateCampaign() {
    if (!newTicker.trim()) return;

    const id = crypto.randomUUID();

    await updateCampaign(id, {
      id,
      ticker: newTicker.trim(),
      notes: newNotes.trim(),
      status: "open",
    });

    await reloadAll();
    setSelectedCampaignId(id);

    setNewTicker("");
    setNewNotes("");
  }

  // ---------- Add Leg ----------
  async function onAddLeg(leg) {
    const id = crypto.randomUUID();

    await updateLeg(id, {
      id,
      campaignId: selectedCampaignId,
      ticker: selectedCampaign.ticker,
      type: leg.type,
      qty: Number(leg.qty),
      strike: leg.strike,
      expiry: leg.expiry,
      openPrice: Number(leg.openPrice),
      closePrice: 0,
      isOpen: true,
      notes: leg.notes || "",
      openDate: new Date().toISOString(),
      closeDate: null
    });

    await reloadAll();
  }

  // ---------- Edit Leg ----------
  async function onSubmitEdit(updatedLeg) {
    await updateLeg(updatedLeg.id, {
      ...updatedLeg,
      qty: Number(updatedLeg.qty),
      openPrice: Number(updatedLeg.openPrice),
      closePrice: Number(updatedLeg.closePrice || 0)
    });

    setEditingLeg(null);
    await reloadAll();
  }

  // ---------- Roll Leg ----------
  async function onSubmitRoll(e) {
    e.preventDefault();

    // Close old leg
    await updateLeg(rollSourceLeg.id, {
      closePrice: Number(rollClosePrice),
      closeDate: new Date().toISOString(),
      isOpen: false
    });

    // Add new leg
    const newId = crypto.randomUUID();
    await updateLeg(newId, {
      id: newId,
      campaignId: rollSourceLeg.campaignId,
      ticker: rollSourceLeg.ticker,
      type: rollSourceLeg.type,
      qty: Number(rollQty),
      strike: rollStrike,
      expiry: rollExpiry,
      openPrice: Number(rollOpenPrice),
      closePrice: 0,
      isOpen: true,
      notes: rollSourceLeg.notes,
      openDate: new Date().toISOString(),
      closeDate: null
    });

    setRollSourceLeg(null);
    await reloadAll();
  }

  // ---------- Close Campaign ----------
  async function onCloseCampaign() {
    const closeDates = legs
      .filter(l => l.campaignId === selectedCampaignId && l.closeDate)
      .map(l => new Date(l.closeDate));

    const endDate = closeDates.length
      ? new Date(Math.max(...closeDates)).toISOString()
      : new Date().toISOString();

    await updateCampaign(selectedCampaignId, {
      status: "closed",
      endDate
    });

    await reloadAll();
  }

  async function onDeleteCampaign() {
    if (!selectedCampaignId) return;
    if (!confirm("Delete this campaign?")) return;

    // Optimistic UI remove
    const prevCampaigns = campaigns;
    setCampaigns(prev => prev.filter(c => c.id !== selectedCampaignId));
    setSelectedCampaignId(null);

    console.log('[UI] calling deleteCampaign', { id: selectedCampaignId });
    const res = await deleteCampaign(selectedCampaignId);
    console.log('[UI] deleteCampaign result', res);

    if (res?.queued) {
      alert("Delete queued (will retry). See console for details.");
    } else if (!res?.ok) {
      const cls = res.classification || {};
      if (cls.type === "permission") {
        alert("Delete failed: permission denied. Check sign-in or Firestore rules.");
      } else {
        alert("Delete failed: " + (res.error?.message || "unknown error") + ". See console for details.");
      }
      // restore UI
      setCampaigns(prevCampaigns);
      if (prevCampaigns.length > 0) setSelectedCampaignId(prevCampaigns[0].id);
    } else {
      alert("Delete succeeded (remote and local).");
      // refresh UI from DB (getAllCampaigns should filter tombstones)
      await reloadAll();
    }
  }

  // ---------- Reopen Campaign ----------
  async function onReopenCampaign() {
    await updateCampaign(selectedCampaignId, {
      status: "open",
      endDate: null
    });

    await reloadAll();
  }

  // ---------- Status Badge ----------
  function statusBadge(status) {
    const color =
      status === "open" ? "#4caf50" :
      status === "closed" ? "#f44336" :
      "#9e9e9e";

    return (
      <span
        style={{
          background: color,
          color: "white",
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: 12,
          marginLeft: 6
        }}
      >
        {status}
      </span>
    );
  }

  // ---------- Grouped Campaign Selector ----------
  const grouped = groupCampaignsByTicker(campaigns);

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const legsForCampaign = legs.filter(l => l.campaignId === selectedCampaignId);

  const summary = selectedCampaign
    ? computeCampaignSummary(selectedCampaign, legsForCampaign)
    : null;

  // ---------- Empty State ----------
  if (campaigns.length === 0) {
    return (
      <div className="card">
        <h3>No campaigns yet</h3>
        <p>Create one below to get started.</p>

        <div className="form-row">
          <input
            className="input"
            placeholder="Ticker (e.g., AAPL)"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value)}
          />

          <input
            className="input"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
          />

          <button onClick={onCreateCampaign}>Create</button>
        </div>
      </div>
    );
  }

  // ---------- No Campaign Selected ----------
  if (!selectedCampaign) {
    return (
      <div className="card">
        <h3>Select Campaign</h3>

        <select
          className="input"
          value={selectedCampaignId ?? ""}
          onChange={e => {
            const value = e.target.value;
            setSelectedCampaignId(value === "" ? null : value);
          }}
        >
          {Object.entries(grouped).map(([ticker, group]) => (
            <optgroup key={ticker} label={ticker}>
              {group.map(c => (
                <option key={c.id} value={c.id}>
                  #{c.id} ({c.status})
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button onClick={onCloseCampaign}>Close Campaign</button>

          {selectedCampaign && selectedCampaign.status === "closed" && (
            <button className="secondary" onClick={onReopenCampaign}>
              Reopen Campaign
            </button>
          )}

          <button
            style={{ backgroundColor: "#d9534f", color: "white" }}
            onClick={onDeleteCampaign}
          >
            Delete Campaign
          </button>
        </div>
      </div>

    );
  }


  // ---------- Timeline ----------
  const timeline = getCampaignTimeline(legsForCampaign);

  // ---------- Performance Series ----------
  const plSeries = computeCampaignPLSeries(legsForCampaign);

  return (
    <div className="campaigns-tab">

      {/* ---------- Create Campaign ---------- */}
      <div className="card">
        <h3>Create Campaign</h3>

        <div className="form-row">
          <input
            className="input"
            placeholder="Ticker (e.g., AAPL)"
            value={newTicker}
            onChange={e => setNewTicker(e.target.value)}
          />

          <input
            className="input"
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={e => setNewNotes(e.target.value)}
          />

          <button onClick={onCreateCampaign}>Create</button>
        </div>
      </div>

      {/* ---------- Campaign Selector ---------- */}
      <div className="card">
        <h3>Select Campaign</h3>

        <select
          className="input"
          value={selectedCampaignId ?? ""}
          onChange={e => {
            const value = e.target.value;
            setSelectedCampaignId(value === "" ? null : value);
          }}
        >
          {Object.entries(grouped).map(([ticker, group]) => (
            <optgroup key={ticker} label={ticker}>
              {group.map(c => (
                <option key={c.id} value={c.id}>
                  #{c.id} ({c.status})
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button onClick={onCloseCampaign}>Close Campaign</button>

          {selectedCampaign && selectedCampaign.status === "closed" && (            
            <button className="secondary" onClick={onReopenCampaign}>
              Reopen Campaign
            </button>
          )}

          <button
            style={{ backgroundColor: "#d9534f", color: "white" }}
            onClick={onDeleteCampaign}
          >
            Delete Campaign
          </button>

        </div>
      </div>

      {/* ---------- Summary ---------- */}
      {summary && (
        <div className="card">
          <h3>
            Campaign Summary - {selectedCampaign.ticker}
            {statusBadge(selectedCampaign.status)}
          </h3>

          <div className="summary-grid">
            <div>
              <div className="summary-label">Options Net</div>
              <div className={cashClass(summary.optionsNet)}>
                {fmt(summary.optionsNet)}
              </div>
            </div>

            <div>
              <div className="summary-label">Stock Net</div>
              <div className={cashClass(summary.stockNet)}>
                {fmt(summary.stockNet)}
              </div>
            </div>

            <div>
              <div className="summary-label">Total Net Credit</div>
              <div className={cashClass(summary.netCredit)}>
                {fmt(summary.netCredit)}
              </div>
            </div>

            <div>
              <div className="summary-label">Leg Count</div>
              <div>{summary.legCount}</div>
            </div>

            <div>
              <div className="summary-label">Start</div>
              <div>{summary.startDate}</div>
            </div>

            <div>
              <div className="summary-label">End</div>
              <div>{summary.endDate || "-"}</div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Timeline Chart ---------- */}
      <div className="card">
        <h3>Timeline</h3>

        <svg width="100%" height="80">
          {timeline.map((t, i) => {
            const x1 = i * 120 + 20;
            const x2 = x1 + 100;
            return (
              <g key={t.id}>
                <line x1={x1} y1={40} x2={x2} y2={40} stroke="black" strokeWidth="3" />
                <text x={x1} y={30}>{t.label}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ---------- Performance Chart ---------- */}
      <div className="card">
        <h3>Performance</h3>

        <svg width="100%" height="120">
          {plSeries.map((p, i) => {
            if (i === 0) return null;
            const x1 = (i - 1) * 50 + 20;
            const x2 = i * 50 + 20;
            const y1 = 100 - plSeries[i - 1].cumulative / 10;
            const y2 = 100 - p.cumulative / 10;

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="blue"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      </div>

      {/* ---------- Add Leg Form ---------- */}
      <LegForm selectedCampaign={selectedCampaign} onAddLeg={onAddLeg} />

      {/* ---------- Edit Leg Form ---------- */}
      <EditLegForm
        editingLeg={editingLeg}
        setEditingLeg={setEditingLeg}
        onSubmitEdit={onSubmitEdit}
      />

      {/* ---------- Roll Form ---------- */}
      {rollSourceLeg && (
        <form className="card" onSubmit={onSubmitRoll}>
          <div className="settings-section-title">
            Roll Leg #{rollSourceLeg.id}
          </div>

          <div className="settings-row">
            <input
              className="input"
              placeholder="Close price"
              value={rollClosePrice}
              onChange={e => setRollClosePrice(e.target.value)}
            />
            <input
              className="input"
              placeholder="Qty"
              value={rollQty}
              onChange={e => setRollQty(e.target.value)}
            />
            <input
              className="input"
              placeholder="Strike"
              value={rollStrike}
              onChange={e => setRollStrike(e.target.value)}
            />
            <input
              className="input"
              type="date"
              value={rollExpiry}
              onChange={e => setRollExpiry(e.target.value)}
            />
            <input
              className="input"
              placeholder="Open price"
              value={rollOpenPrice}
              onChange={e => setRollOpenPrice(e.target.value)}
            />
          </div>

          <button type="submit">Submit Roll</button>
          <button
            type="button"
            className="secondary"
            style={{ marginLeft: 8 }}
            onClick={() => setRollSourceLeg(null)}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
