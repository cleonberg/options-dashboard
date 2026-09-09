import React, { useState, useEffect } from "react";

import Header from "./components/Header.jsx";
import TabBar from "./components/TabBar.jsx";
import DashboardTab from "./components/DashboardTab.jsx";
import AllLegsTab from "./components/AllLegsTab.jsx";
import CampaignsTab from "./components/CampaignsTab.jsx";
import SettingsTab from "./components/SettingsTab.jsx";
import { startAuth } from "./auth.js";

import { computeDashboardSummary } from "./logic/logic.js";

import { loadCampaignsAndLegs } from "./sync/sync.js";

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

  const [syncStatus, setSyncStatus] = useState("synced"); 
  const [lastSync, setLastSync] = useState(null);
  const [dirtyCount, setDirtyCount] = useState(0);

  const [uid, setUid] = useState(null);
  useEffect(() => {
    startAuth(async user => {
      setUid(user.uid);
      await reloadAll(user.uid);   // initial load
    });
  }, []);

  async function syncNow() {
    setSyncStatus("syncing");

    await reloadAll(uid);

    setSyncStatus("synced");
  }


  // ---------- Reload Helper ----------
  async function reloadAll(uid) {
    setSyncStatus("syncing");

    const { campaigns: c, legs: l } = await loadCampaignsAndLegs(uid);

    setCampaigns(c);
    setLegs(l);

    // Auto-select first campaign
    if (c.length > 0) {
      setSelectedCampaignId(c[0].id);
    } else {
      setSelectedCampaignId(null);
    }

    // Count dirty Dexie rows
    const dirty = await dbLocal.legs.filter(leg => leg.dirty === true).count();
    setDirtyCount(dirty);

    // Compute dashboard summary
    setDashboardSummary(computeDashboardSummary(c, l));
    setSyncStatus("synced");
    setLastSync(new Date());
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

  window.dbLocal = dbLocal;



  return (
    <div className="app-container">
      <Header
        syncStatus={syncStatus}
        lastSync={lastSync}
        dirtyCount={dirtyCount}
        syncNow={syncNow}
      />

      <TabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main>
        {renderTab()}
      </main>
    </div>
  );

}
