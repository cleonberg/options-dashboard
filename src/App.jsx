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
import {
  ensureInitialSync,
  startBackgroundSync,
  forceSync,
  createCampaign,
} from "./sync/sync.js";

import { dbLocal } from "./db/dexie.js";
import "./styles/styles.css";

export default function App() {
  const [uid, setUid] = useState(null);

  const campaigns = useLiveQuery(() => dbLocal.getAllCampaigns(), []) || [];
  const legs = useLiveQuery(() => dbLocal.getAllLegs(), []) || [];

  const dirtyCount =
    useLiveQuery(async () => {
      const c = await dbLocal.campaigns.filter((c) => c.dirty === true).count();
      const l = await dbLocal.legs.filter((l) => l.dirty === true).count();
      return c + l;
    }, []) || 0;

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

  const [dashboardSearchTerm, setDashboardSearchTerm] = useState("");
  const [dashboardStartDateFilter, setDashboardStartDateFilter] = useState("2026-01-01");
  const [dashboardEndDateFilter, setDashboardEndDateFilter] = useState("");

  const dashboardSummary = useMemo(
    () => computeDashboardSummary(campaigns, legs),
    [campaigns, legs]
  );

  useEffect(() => {
    if (campaigns.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedCampaignId]);

  useEffect(() => {
    const unsubscribe = startAuth((user) => {
      setUid(user?.uid ?? null);
    });

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!uid) {
      setSyncStatus("synced");
      return;
    }

    let isCancelled = false;
    let stopBackgroundSync = () => {};

    const initSync = async () => {
      try {
        setSyncStatus("syncing");
        await ensureInitialSync(uid);
        await forceSync(uid);

        if (isCancelled) return;

        stopBackgroundSync = startBackgroundSync(uid);
        setSyncStatus("synced");
        setLastSync(new Date());
      } catch (err) {
        console.error("Startup sync failed:", err);
        if (!isCancelled) {
          setSyncStatus("error");
        }
      }
    };

    initSync();

    return () => {
      isCancelled = true;
      stopBackgroundSync();
    };
  }, [uid]);

  async function syncNow() {
    if (!uid) return;

    try {
      setSyncStatus("syncing");
      await forceSync(uid);
      setSyncStatus("synced");
      setLastSync(new Date());
    } catch (err) {
      console.error("Manual sync failed:", err);
      setSyncStatus("error");
    }
  }

  const handleSelectCampaign = (id) => {
    setSelectedCampaignId(id);
    setActiveTab("campaigns");
  };

  const handleAddCampaign = async (campaignData) => {
    if (!uid) {
      console.error("Cannot add campaign: User is not authenticated.");
      return;
    }

    await createCampaign(uid, campaignData);
  };

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
            onAddCampaign={handleAddCampaign}
            searchTerm={dashboardSearchTerm}
            setSearchTerm={setDashboardSearchTerm}
            startDateFilter={dashboardStartDateFilter}
            setStartDateFilter={setDashboardStartDateFilter}
            endDateFilter={dashboardEndDateFilter}
            setEndDateFilter={setDashboardEndDateFilter}
          />
        );

      case "trades":
        return <AllLegsTab campaigns={campaigns} legs={legs} uid={uid} />;

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
          />
        );

      case "settings":
        return <SettingsTab />;

      default:
        return <div className="card">Unknown tab.</div>;
    }
  }

  return (
    <div className="app-container">
      <Header
        syncStatus={syncStatus}
        lastSync={lastSync}
        dirtyCount={dirtyCount}
        syncNow={syncNow}
      />

      <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main>{renderTab()}</main>
    </div>
  );
}