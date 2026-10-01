import React, { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import Header from "./components/Header.jsx";
import TabBar from "./components/TabBar.jsx";
import FilterBar from "./components/FilterBar.jsx";

const DashboardTab = lazy(() => import("./components/DashboardTab.jsx"));
const AllLegsTab = lazy(() => import("./components/AllLegsTab.jsx"));
const CampaignsTab = lazy(() => import("./components/CampaignsTab.jsx"));
const SettingsTab = lazy(() => import("./components/SettingsTab.jsx"));

import { startAuth } from "./auth.js";
import { computeDashboardSummary } from "./logic/logic.js";
import {
  startBackgroundSync,
  syncPendingChanges,
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

  const [syncStatus, setSyncStatus] = useState("synced");
  const [lastSync, setLastSync] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("2026-01-01");
  const [endDateFilter, setEndDateFilter] = useState("");

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
        stopBackgroundSync = startBackgroundSync(uid);
        await syncPendingChanges(uid);

        if (isCancelled) return;
        
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
      await syncPendingChanges(uid);
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
            searchTerm={searchTerm}
            startDateFilter={startDateFilter}
            endDateFilter={endDateFilter}
          />
        );

      case "trades":
        return (
          <AllLegsTab
            campaigns={campaigns}
            legs={legs}
            uid={uid}
            searchTerm={searchTerm}
            startDateFilter={startDateFilter}
            endDateFilter={endDateFilter}
          />
        );

      case "campaigns":
        return (
          <CampaignsTab
            campaigns={campaigns}
            legs={legs}
            selectedCampaignId={selectedCampaignId}
            setSelectedCampaignId={setSelectedCampaignId}
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

      <main>
        <Suspense fallback={<div className="card">Loading tab...</div>}>
          {(activeTab === "dashboard" || activeTab === "trades") && (
            <div className="card filter-card">
              <FilterBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                startDateFilter={startDateFilter}
                setStartDateFilter={setStartDateFilter}
                endDateFilter={endDateFilter}
                setEndDateFilter={setEndDateFilter}
              />
            </div>
          )}
          {renderTab()}
        </Suspense>
      </main>
    </div>
  );
}