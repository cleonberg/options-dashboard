import React, { useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import Header from "./components/Header.jsx";
import TabBar from "./components/TabBar.jsx";
import DashboardTab from "./components/DashboardTab.jsx";
import AllLegsTab from "./components/AllLegsTab.jsx";
import CampaignsTab from "./components/CampaignsTab.jsx";
import SettingsTab from "./components/SettingsTab.jsx";
import { startAuth } from "./auth.js";

import { computeDashboardSummary } from "./logic/logic.js";

// Import our newly created sync initializers
import { ensureInitialSync, startBackgroundSync, forceSync } from "./sync/sync.js";

import { dbLocal } from "./db/dexie.js";
import "./styles/styles.css";

export default function App() {
  // ---------- Auth State ----------
  const [uid, setUid] = useState(null);

  // ---------- Reactive Database State (Replaces useState) ----------
  // useLiveQuery automatically updates these whenever Dexie changes
  const campaigns = useLiveQuery(() => dbLocal.getAllCampaigns(), []) || [];
  const legs = useLiveQuery(() => dbLocal.getAllLegs(), []) || [];

  // Automatically track dirty items for the Header badge
  const dirtyCount = useLiveQuery(async () => {
    const c = await dbLocal.campaigns.filter(c => c.dirty === true).count();
    const l = await dbLocal.legs.filter(l => l.dirty === true).count();
    return c + l;
  }, []) || 0;

  // ---------- UI State ----------
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [editingLeg, setEditingLeg] = useState(null);

  const [rollSourceLeg, setRollSourceLeg] = useState(null);
  const [rollClosePrice, setRollClosePrice] = useState("");
  const [rollQty, setRollQty] = useState("");
  const [rollStrike, setRollStrike] = useState("");
  const [rollExpiry, setRollExpiry] = useState("");
  const [rollOpenPrice, setRollOpenPrice] = useState("");

  const [syncStatus, setSyncStatus] = useState("synced");
  const [lastSync, setLastSync] = useState(null);

  // ---------- Derived State ----------
  // Automatically recalculates whenever campaigns or legs change
  const dashboardSummary = useMemo(() => {
    return computeDashboardSummary(campaigns, legs);
  }, [campaigns, legs]);

  // Auto-select first campaign if we have data but no selection
  useEffect(() => {
    if (campaigns.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  // ---------- Initialization & Auth ----------
  useEffect(() => {
    startAuth((user) => {
      setUid(user.uid);
    });
  }, []);

  // ---------- Background Sync Engine ----------
  useEffect(() => {
    if (!uid) return;

    let unsubscribeSync = () => {};

    (async () => {
      setSyncStatus("syncing");
      
      // 1. Pull data if Dexie is completely empty
      await ensureInitialSync(uid);
      
      // 2. Push any offline changes made before reload
      await forceSync(uid);
      
      // 3. Start real-time Firebase listeners to silently update Dexie in the background
      unsubscribeSync = startBackgroundSync(uid);
      
      setSyncStatus("synced");
      setLastSync(new Date());
    })();

    // Stop listening to Firebase if the user logs out
    return () => unsubscribeSync();
  }, [uid]);

  // ---------- Manual Sync ----------
  async function syncNow() {
    if (!uid) return;
    setSyncStatus("syncing");
    
    // We only need to push local changes. The snapshot listeners handle pulling automatically.
    await forceSync(uid); 
    
    setSyncStatus("synced");
    setLastSync(new Date());
  }

  const handleSelectCampaign = (id) => {
    setSelectedCampaignId(id);
    setActiveTab("campaigns"); // Or "detail" depending on your tab name
  };  

  // ---------- Render Tabs ----------
  function renderTab() {
    switch (activeTab) {
      case "dashboard":
        return (
          <DashboardTab
            uid={uid}
            summary={dashboardSummary}
            campaigns={campaigns}
            legs={legs}
            onSelectCampaign={handleSelectCampaign}
          />
        );

      case "trades":
        return (
          <AllLegsTab
            legs={legs}
            uid={uid}
            // Note: reloadAll and setLegs are entirely removed!
          />
        );

      case "campaigns":
        return (
          <CampaignsTab
            campaigns={campaigns}
            legs={legs}
            selectedCampaignId={selectedCampaignId}
            setSelectedCampaignId={setSelectedCampaignId}
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
            uid={uid}
            // Note: reloadAll, setLegs, and setCampaigns are entirely removed!
          />
        );

      case "settings":
        return <SettingsTab />; // reloadAll removed

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