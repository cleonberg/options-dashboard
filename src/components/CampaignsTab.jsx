// CampaignsTab.jsx
import React, { useState } from "react"; // <-- Added useState

import {
  fmt,
  cashClass, 
  computeCampaignSummary,
} from "../logic/logic.js";

import CampaignForm from "./CampaignForm.jsx"; // <-- Import the new form
import LegForm from "./LegForm.jsx";
import LegTable from "./LegTable.jsx";

import { 
  closeCampaign,
  deleteCampaign,
  addLeg,
  updateCampaign,
} from "../sync/sync.js";

import { reopenCampaign } from "../sync/reopenCampaign.js";


export default function CampaignsTab(props) {
  const {
    campaigns,
    legs,
    selectedCampaignId,
    setSelectedCampaignId,
    uid,
  } = props;

  // <-- Track if the edit form is visible
  const [showEditForm, setShowEditForm] = useState(false); 
  
  // <-- NEW: Track if the success message should be visible
  const [saveSuccess, setSaveSuccess] = useState(false);

  // -----------------------------
  // Find selected campaign + legs
  // -----------------------------
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const legsForCampaign = legs.filter(l => l.campaignId === selectedCampaignId);

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
  // Handlers
  // -----------------------------
  const handleEditCampaign = async (updatedData) => {
    if (!uid) {
      alert("Error: User ID not found.");
      return;
    }
    
    // Call sync to update Dexie & Firestore
    await updateCampaign(uid, selectedCampaign.id, updatedData);
    
    // Hide the form upon success
    setShowEditForm(false);

    // <-- NEW: Show the success message for 3 seconds
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 3000);
  };

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

        <section className="button-group">
          {/* <-- Added Edit button */}
          <button onClick={() => setShowEditForm(!showEditForm)}>
            {showEditForm ? "Cancel Edit" : "Edit"}
          </button>
          
          <button onClick={() => closeCampaign(uid, selectedCampaign.id)}>Close</button>
          <button onClick={() => reopenCampaign(uid, selectedCampaign.id)}>Reopen</button>
          <button onClick={() => {
            deleteCampaign(uid, selectedCampaign.id);
            setSelectedCampaignId(null); // Send user back to dashboard on delete
          }}>Delete</button>
        </section>

        {/* <-- NEW: Conditionally render the success message */}
        {saveSuccess && (
          <div style={{ 
            marginTop: "12px", 
            padding: "8px 12px", 
            backgroundColor: "#d4edda", 
            color: "#155724", 
            borderRadius: "4px",
            border: "1px solid #c3e6cb",
            display: "inline-block"
          }}>
            ✅ Campaign saved!
          </div>
        )}

        {/* <-- Conditionally render the Edit Form here */}
        {showEditForm && (
          <CampaignForm 
            initialData={selectedCampaign} 
            onSubmit={handleEditCampaign} 
            onCancel={() => setShowEditForm(false)} 
          />
        )}
      </div>

      <section className="campaign-summary">
        {/* You can add className={cashClass(summary.totalPL)} here if you want color */}
        <div>Total PL: {fmt(summary.totalPL)}</div>
        <div>Net Credit: {fmt(summary.netCredit)}</div>
      </section>

      <section className="campaign-legs">
        <h3>Legs</h3>

        <LegTable
          legs={legsForCampaign}
          campaigns={campaigns}
          uid={uid}
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