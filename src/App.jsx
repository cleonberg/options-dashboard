import React, { useState, useEffect } from "react";

import TabBar from "./components/TabBar.jsx";
import DashboardTab from "./components/DashboardTab.jsx";
import AllLegsTab from "./components/AllLegsTab.jsx";
import CampaignsTab from "./components/CampaignsTab.jsx";
import SettingsTab from "./components/SettingsTab.jsx";
import { startAuth } from "./auth.js";

import {
  loadCampaignsAndLegs,
  computeDashboardSummary,
} from "./logic/logic.js";

import dbLocal from "./db/dexie.js";
import "./styles/styles.css";

export default function App() {
  // ---------- State ----------
  const [activeTab, setActiveTab] = useState("dashboard");

  const [campaigns, setCampaigns] = useState([]);
  const [legs, setLegs] = useState([]);

  const [selectedCampaignId, setSelectedCampaignId] = useState(null);

  const [editingLeg, setEditingLeg] = useState(null);

  const [rollSourceLeg, setRollSourceLeg] = useState(null);
  const [rollClosePrice, setRollClosePrice] = useState("");
  const [rollQty, setRollQty] = useState("");
  const [rollStrike, setRollStrike] = useState("");
  const [rollExpiry, setRollExpiry] = useState("");
  const [rollOpenPrice, setRollOpenPrice] = useState("");

  const [dashboardSummary, setDashboardSummary] = useState(null);

  const [uid, setUid] = useState(null);
  useEffect(() => {
    startAuth(async user => {
      setUid(user.uid);
      await reloadAll(user.uid);   // initial load
    });
  }, []);

  // ---------- Reload Helper ----------
  async function reloadAll(uid) {
    const { campaigns: c, legs: l } = await loadCampaignsAndLegs(uid);

    setCampaigns(c);
    setLegs(l);

    // Auto-select first campaign
    if (c.length > 0) {
      setSelectedCampaignId(c[0].id);
    } else {
      setSelectedCampaignId(null);
    }

    // Compute dashboard summary
    setDashboardSummary(computeDashboardSummary(c, l));
  }

  // ---------- Render Tabs ----------
  function renderTab() {
    switch (activeTab) {
      case "dashboard":
        return (
          <DashboardTab
            summary={dashboardSummary}
            campaigns={campaigns}
            legs={legs}
            setSelectedCampaignId={setSelectedCampaignId}
            setActiveTab={setActiveTab}
          />
        );

      case "trades":
        return (
          <AllLegsTab
            legs={legs}
            setLegs={setLegs}
            reloadAll={reloadAll}   // ⭐ add this
            uid={uid}               // ⭐ add this
          />
        );

      case "campaigns":
        return (
          <CampaignsTab
            campaigns={campaigns}
            legs={legs}
            selectedCampaignId={selectedCampaignId}
            setSelectedCampaignId={setSelectedCampaignId}
            setCampaigns={setCampaigns}
            setLegs={setLegs}
            editingLeg={editingLeg}
            setEditingLeg={setEditingLeg}
            rollSourceLeg={rollSourceLeg}
            setRollSourceLeg={setRollSourceLeg}
            rollClosePrice={rollClosePrice}
            setRollClosePrice={setRollClosePrice}
            rollQty={rollQty}
            setRollQty={setRollQty}
            rollStrike={rollStrike}
            setRollStrike={setRollStrike}
            rollExpiry={rollExpiry}
            setRollExpiry={setRollExpiry}
            rollOpenPrice={rollOpenPrice}
            setRollOpenPrice={setRollOpenPrice}
            reloadAll={reloadAll}   // ⭐ correct
            uid={uid}               // ⭐ needed
          />
        );

      case "settings":
        return <SettingsTab reloadAll={reloadAll} />;

      default:
        return <div className="card">Unknown tab.</div>;
    }
  }


  return (
    <>
      <div className="app-header">
        <div className="app-title">Options Dashboard</div>
        <div className="app-subtitle">Offline + Dexie + React</div>
      </div>

      <div className="app-container">
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main>{renderTab()}</main>
      </div>
    </>
  );
}
