import React, { useState } from "react";

import {
  fmt,
  cashClass,
  computeCampaignSummary,
  computeLegPL,
} from "../logic/logic.js";

import LegForm from "./LegForm.jsx";
import EditLegForm from "./EditLegForm.jsx";

import { 
  createCampaign,
  closeCampaign,
  deleteCampaign,
  addLeg,
  editLeg,
  rollLeg,
} from "../sync/sync.js";

import { reopenCampaign } from "../sync/reopenCampaign.js";

import LegTable from "./LegTable.jsx";

export default function CampaignsTab(props) {
  const {
    campaigns,
    legs,
    selectedCampaignId,
    setSelectedCampaignId,
    reloadAll,
    uid,
  } = props;

  const [newTicker, setNewTicker] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // -----------------------------
  // Find selected campaign + legs
  // -----------------------------
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const legsForCampaign = legs.filter(l => l.campaignId === selectedCampaignId);

  console.log("CampaignsTab selectedCampaignId =", selectedCampaignId);
  console.log("CampaignsTab selectedCampaign =", selectedCampaign);
  console.log("CampaignsTab legsForCampaign =", legsForCampaign);

  // -----------------------------
  // Guard: no campaign selected
  // -----------------------------
  if (!selectedCampaign) {
    return (
      <div className="card">
        <h3>No campaign selected.</h3>
        <p>Choose one from the dashboard.</p>
      </div>
    );
  }

  const summary = computeCampaignSummary(selectedCampaign, legsForCampaign);

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="campaigns-tab">

      <div className="card">
        <header className="campaign-header">
          <h2>
            {selectedCampaign.ticker} — opened {selectedCampaign.startDate}
          </h2>
          <div>Status: {selectedCampaign.endDate ? "Closed" : "Open"}</div>
        </header>

        <section className="campaign-actions">
          <button onClick={() => closeCampaign(uid, selectedCampaign.id)}>Close</button>
          <button onClick={() => reopenCampaign(uid, selectedCampaign.id)}>Reopen</button>
          <button onClick={() => deleteCampaign(uid, selectedCampaign.id)}>Delete</button>
        </section>
      </div>

      <section className="campaign-summary">
        <div>Total PL: {fmt(summary.totalPL)}</div>
        <div>Net Credit: {fmt(summary.netCredit)}</div>
      </section>

      <section className="campaign-legs">
        <h3>Legs</h3>

        <LegTable
          legs={legsForCampaign}
          campaigns={campaigns}
          uid={uid}
          reloadAll={reloadAll}

          enableSort={false}
          enablePaging={false}
          enableFilters={false}
          enableCampaignColumn={false}
        />

        <LegForm
          selectedCampaign={selectedCampaign}
          onAddLeg={legFields =>
            addLeg(uid, { ...legFields, campaignId: selectedCampaign.id })
          }
        />
      </section>

    </div>
  );
}
