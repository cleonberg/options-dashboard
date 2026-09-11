import React, { useState } from "react";

import {
  fmt,
  cashClass, 
  computeCampaignSummary,
} from "../logic/logic.js";

import CampaignForm from "./CampaignForm.jsx";
import LegForm from "./LegForm.jsx";
import LegTable from "./LegTable.jsx";
import PerformanceChart from "./PerformanceChart.jsx";

import { 
  closeCampaign,
  deleteCampaign,
  addLeg,
  updateCampaign,
  reopenCampaign,
} from "../sync/sync.js";

export default function CampaignsTab(props) {
  const {
    campaigns,
    legs,
    selectedCampaignId,
    setSelectedCampaignId,
    uid,
  } = props;

  const [showEditForm, setShowEditForm] = useState(false); 
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isAddingLeg, setIsAddingLeg] = useState(false);

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
      <div className="card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <h3 style={{ color: "#9fb3ff" }}>No campaign selected.</h3>
        <p>Choose one from the dashboard to view details.</p>
      </div>
    );
  }

  // -----------------------------
  // Computed Data
  // -----------------------------
  const summary = computeCampaignSummary(selectedCampaign, legsForCampaign);
  const isOpen = !selectedCampaign.endDate;
  const openLegsCount = legsForCampaign.filter(l => l.isOpen).length;
  const closedLegsCount = legsForCampaign.filter(l => !l.isOpen).length;

  // -----------------------------
  // Handlers
  // -----------------------------
  const handleEditCampaign = async (updatedData) => {
    if (!uid) {
      alert("Error: User ID not found.");
      return;
    }
    
    await updateCampaign(uid, selectedCampaign.id, updatedData);
    setShowEditForm(false);
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
      
      {/* --- HEADER CARD --- */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "12px" }}>
            {selectedCampaign.ticker} Campaign
            <span style={{ 
              fontSize: "12px", 
              padding: "4px 8px", 
              borderRadius: "12px", 
              backgroundColor: isOpen ? "#1e4620" : "#3b3b3b", 
              color: isOpen ? "#4ade80" : "#a1a1aa",
              border: `1px solid ${isOpen ? "#4ade80" : "#a1a1aa"}`
            }}>
              {isOpen ? "OPEN" : "CLOSED"}
            </span>
          </h2>
          <div style={{ fontSize: "13px", color: "#9fb3ff" }}>
            Opened: {selectedCampaign.startDate} {selectedCampaign.endDate ? ` | Closed: ${selectedCampaign.endDate}` : ""}
          </div>
        </div>

        <div className="button-group" style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setShowEditForm(!showEditForm)}>
            {showEditForm ? "Cancel Edit" : "Edit"}
          </button>
          
          {isOpen ? (
            <button 
              onClick={async () => {
                await closeCampaign(uid, selectedCampaign.id);
                setSelectedCampaignId(null); // ✨ This instantly sends them back to Dashboard!
              }}
            >
              Close
            </button>
          ) : (
            <button 
              onClick={async () => {
                await reopenCampaign(uid, selectedCampaign.id);
              }}
            >
              Reopen
            </button>
          )}
          
          <button 
            style={{ backgroundColor: "#5f2424", borderColor: "#8c3636", color: "#ff9f9f" }}
            onClick={() => {
              if (window.confirm("Are you sure you want to delete this campaign?")) {
                deleteCampaign(uid, selectedCampaign.id);
                setSelectedCampaignId(null); 
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* --- SUCCESS MESSAGE & EDIT FORM --- */}
      {saveSuccess && (
        <div style={{ 
          marginBottom: "16px", 
          padding: "12px 16px", 
          backgroundColor: "#1e4620", 
          color: "#4ade80", 
          borderRadius: "8px",
          border: "1px solid #4ade80",
          fontWeight: "bold"
        }}>
          ✅ Campaign saved successfully!
        </div>
      )}

      {showEditForm && (
        <div className="card" style={{ border: "1px solid #4ade80" }}>
          <CampaignForm 
            initialData={selectedCampaign} 
            onSubmit={handleEditCampaign} 
            onCancel={() => setShowEditForm(false)} 
          />
        </div>
      )}

      {/* --- 3-CARD SUMMARY METRICS --- */}
      <div className="summary-grid-cards">
        {/* Card 1: Total P/L */}
        <div className="summary-card">
          <div className="summary-card-title">Total P/L</div>
          <div className={`${cashClass(summary.totalPL)} summary-card-value`} style={{ fontSize: "24px" }}>
            {fmt(summary.totalPL)}
          </div>
        </div>

        {/* Card 2: Net Credit/Debit */}
        <div className="summary-card">
          <div className="summary-card-title">Net Credit</div>
          <div className={`${cashClass(summary.netCredit)} summary-card-value`}>
            {fmt(summary.netCredit)}
          </div>
        </div>

        {/* Card 3: Leg Status */}
        <div className="summary-card">
          <div className="summary-card-title">Legs Summary</div>
          <div className="summary-card-metrics">
            <div className="summary-metric-item">
              <div className="summary-metric-label">Open</div>
              <div className="summary-metric-val">{openLegsCount}</div>
            </div>
            <div className="summary-card-divider" />
            <div className="summary-metric-item">
              <div className="summary-metric-label">Closed</div>
              <div className="summary-metric-val">{closedLegsCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* --- PERFORMANCE CHART --- */}
      <PerformanceChart closedCampaigns={[selectedCampaign]} legs={legsForCampaign} />

      {/* --- LEGS SECTION --- */}
      <div className="card">
        
        {/* Header & Toggle Button (Now at the top) */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ color: "#9fb3ff", margin: 0 }}>Campaign Legs</h3>
          <button 
            onClick={() => setIsAddingLeg(!isAddingLeg)}
            style={{ 
              backgroundColor: isAddingLeg ? "transparent" : "#3182ce",
              border: isAddingLeg ? "1px solid #9fb3ff" : "none",
              color: isAddingLeg ? "#9fb3ff" : "#fff"
            }}
          >
            {isAddingLeg ? "Cancel" : "+ Add Leg"}
          </button>
        </div>

        {/* Animated Expandable Wrapper (Now directly below the header) */}
        <div className={`add-leg-wrapper ${isAddingLeg ? "open" : ""}`}>
          <div className="add-leg-content">
            {/* Added paddingBottom so it separates cleanly from the table when open */}
            <div style={{ paddingBottom: "24px" }}>
              <LegForm
                selectedCampaign={selectedCampaign}
                onAddLeg={legFields => {
                  addLeg(uid, { ...legFields, campaignId: selectedCampaign.id });
                  setIsAddingLeg(false);
                }}
              />
            </div>
          </div>
        </div>
        
        {/* The Table (Now underneath the expandable form) */}
        <LegTable
          legs={legsForCampaign}
          campaigns={campaigns}
          uid={uid}
          enableSort={false}
          enablePaging={false}
          enableFilters={false}
          enableCampaignColumn={false}
        />

      </div>

    </div>
  );
}