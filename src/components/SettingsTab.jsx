// src/components/SettingsTab.jsx
import React, { useRef, useState, useEffect } from "react";
import dbLocal from "../db/dexie";
import GoogleSignIn from "./GoogleSignIn.jsx";
import { forceSync, initialSync, deleteAllRemote } from "../sync/sync";
import { auth } from "../auth";
import { buildImportData } from "../logic/importCsv.js";
import { updateCampaign } from "../sync/sync";

export default function SettingsTab({ reloadAll }) {
  const fileInputRef = useRef(null);
  const [deletedCampaigns, setDeletedCampaigns] = useState([]);
  const [isResetting, setIsResetting] = useState(false);

  // ✨ ADDED: State for our hidden Developer Mode
  const [devClicks, setDevClicks] = useState(0);
  const [showDevMode, setShowDevMode] = useState(false);

  // Fetch deleted campaigns when the tab opens
  useEffect(() => {
    loadDeletedCampaigns();
  }, []);

  async function loadDeletedCampaigns() {
    try {
      const allDeleted = await dbLocal.campaigns
        .filter((c) => c.deleted === true)
        .toArray();
      setDeletedCampaigns(allDeleted);
    } catch (err) {
      console.error("Failed to load deleted campaigns:", err);
    }
  }

  // ✨ ADDED: The secret unlock mechanism
  function handleSecretTap() {
    if (showDevMode) return;
    const newCount = devClicks + 1;
    if (newCount >= 5) {
      setShowDevMode(true);
      alert("🛠️ Developer Mode Unlocked!");
    } else {
      setDevClicks(newCount);
      // Optional: Reset clicks if they stop tapping (basic timeout)
      setTimeout(() => setDevClicks(0), 3000); 
    }
  }

  // ---------- Option 1: Undelete Logic ----------
  async function handleUndelete(campaign) {
    await dbLocal.campaigns.update(campaign.id, {
      deleted: false,
      dirty: true,
      updatedAt: Date.now(), // Ensure number format here too
    });
    alert(`Restored ${campaign.Ticker || "Campaign"}`);
    loadDeletedCampaigns(); // Refresh the list
    if (typeof reloadAll === "function") reloadAll(); // Refresh dashboard stats
  }

  // Inside your component, near your other handlers:
  const handleRetroactiveRename = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      alert("You must be logged in to rename campaigns.");
      return;
    }

    const confirm = window.confirm(
      "This will rename all existing campaigns sequentially. Are you sure?"
    );
    if (!confirm) return;

    try {
      // 1. Fetch ALL campaigns so our numbering matches Dexie's .count() perfectly
      const allCampaigns = await dbLocal.campaigns.toArray(); //[cite: 2, 3]

      // 2. Sort them chronologically. 
      // We use startDate or updatedAt to ensure older campaigns get lower numbers.
      allCampaigns.sort((a, b) => {
        const dateA = a.startDate || a.updatedAt || 0;
        const dateB = b.startDate || b.updatedAt || 0;
        return new Date(dateA) - new Date(dateB);
      });

      let count = 1;
      for (const campaign of allCampaigns) {
        const ticker = campaign.ticker || "UNKNOWN";
        const newName = `${ticker} #${count}`;

        // 3. Only trigger an update if the name actually needs changing
        if (campaign.name !== newName) {
          // updateCampaign handles saving to Dexie and pushing to Firestore[cite: 3]
          await updateCampaign(uid, campaign.id, { name: newName });
          console.log(`Renamed: ${ticker} -> ${newName}`);
        }
        
        count++;
      }

      alert(`Successfully renamed ${count - 1} campaigns!`);
    } catch (err) {
      console.error("Error renaming campaigns:", err);
      alert("An error occurred. Check the console.");
    }
  };

  // ---------- CSV Parsing Logic ----------
  function normalizeRow(row) {
    return {
      Ticker: row.Ticker,
      Type: row.Type,
      Quantity: row.Quantity,
      Strike: row.Strike,
      VerticalStrike: row["Vertical Strike"],
      Expiration: row.Expiration,
      OpenDate: row["Open Date"],
      OpenPrice: row["Open Price"],
      CloseDate: row["Close Date"],
      ClosePrice: row["Close Price"],
      RolledTo: row["Rolled To"],
      RolledFrom: row["Rolled From"],
      ID: row.ID,
      CurrentTheta: row["Current Theta"],
    };
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(",");

    return lines.slice(1).map((line) => {
      const cols = line.split(",");
      const raw = {};
      headers.forEach((h, i) => (raw[h.trim()] = (cols[i] || "").trim()));
      return normalizeRow(raw);
    });
  }

  async function handleCsvImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const rows = parseCsv(text);
    const { campaigns, legs } = buildImportData(rows);

    if (!window.confirm("Importing CSV will overwrite existing local data. Continue?")) {
      return;
    }

    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    const now = Date.now();

    const campaignsToInsert = campaigns.map((c) => ({
      ...c,
      dirty: true,
      deleted: false,
      updatedAt: now,
    }));

    const legsToInsert = legs.map((l) => ({
      ...l,
      dirty: true,
      deleted: false,
      updatedAt: now,
    }));

    await dbLocal.campaigns.bulkPut(campaignsToInsert);
    await dbLocal.legs.bulkPut(legsToInsert);

    alert("CSV import complete. Syncing to Firestore...");
    if (typeof reloadAll === "function") reloadAll();
  }

  // ---------- Danger Zone Logic ----------
  async function handleReset() {
    if (!window.confirm("Delete local data and re-download from the server?")) return;

    const uid = auth.currentUser?.uid;
    setIsResetting(true); 

    try {
      await dbLocal.transaction('rw', dbLocal.campaigns, dbLocal.legs, async () => {
        await dbLocal.campaigns.clear();
        await dbLocal.legs.clear();
      });

      if (uid) {
        await initialSync(uid);
      }

      if (typeof reloadAll === "function") {
        reloadAll();
      }

    } catch (error) {
      console.error("Error during reset and resync:", error);
      alert("Something went wrong while resetting your data. Please try again.");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm("Delete ALL campaigns and legs from LOCAL and FIRESTORE?")) return;

    const typed = window.prompt("This action is permanent.\n\nType DELETE to confirm.");

    if (typed !== "DELETE") {
      alert("Deletion cancelled.");
      return;
    }

    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    const uid = auth.currentUser?.uid;
    if (uid) {
      await deleteAllRemote(uid);
    } else {
      alert("Warning: Not signed in — remote delete skipped.");
    }

    if (typeof reloadAll === "function") reloadAll();
    alert("All campaigns and legs deleted.");
  }

  // ---------- Backup / Restore DB ----------
  async function handleExport() {
    const campaigns = await dbLocal.getAllCampaigns();
    const legs = await dbLocal.getAllLegs();

    const blob = new Blob(
      [JSON.stringify({ campaigns, legs }, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "options-dashboard-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      alert("Invalid JSON file.");
      return;
    }

    if (!window.confirm("Importing will merge this backup with your existing data. Newer items will be kept. Continue?")) return;

    const now = Date.now(); 

    const mergeItems = async (table, importedArray) => {
      if (!Array.isArray(importedArray)) return;

      for (const importedItem of importedArray) {
        const localItem = await table.get(importedItem.id);

        if (!localItem) {
          await table.put({ 
            ...importedItem, 
            dirty: true, 
            updatedAt: typeof importedItem.updatedAt === 'number' ? importedItem.updatedAt : now 
          });
          continue;
        }

        const importedTime = Number(importedItem.updatedAt) || 0;
        const localTime = Number(localItem.updatedAt) || 0;

        if (importedTime > localTime) {
          await table.put({ ...importedItem, dirty: true });
        }
      }
    };

    await mergeItems(dbLocal.campaigns, data.campaigns);
    await mergeItems(dbLocal.legs, data.legs);

    e.target.value = null; 

    alert("Import complete. Syncing any missing data to Firestore...");
    if (typeof reloadAll === "function") reloadAll();
  }
  
  async function handleHardResetImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      alert("Invalid JSON file.");
      return;
    }

    const warning = "DANGER: This will permanently overwrite ALL current data on ALL synced devices with this backup file. Are you absolutely sure?";
    if (!window.confirm(warning)) {
      e.target.value = null;
      return;
    }

    const now = Date.now();

    const currentCampaigns = await dbLocal.campaigns.toArray();
    const currentLegs = await dbLocal.legs.toArray();

    const campaignTombstones = currentCampaigns.map(c => ({
      ...c,
      deleted: true,
      dirty: true,
      updatedAt: now
    }));

    const legTombstones = currentLegs.map(l => ({
      ...l,
      deleted: true,
      dirty: true,
      updatedAt: now
    }));

    await dbLocal.campaigns.bulkPut(campaignTombstones);
    await dbLocal.legs.bulkPut(legTombstones);

    const futureTime = now + 5000; 

    const importedCampaigns = (data.campaigns || []).map(c => ({
      ...c,
      deleted: false, 
      dirty: true,    
      updatedAt: futureTime
    }));

    const importedLegs = (data.legs || []).map(l => ({
      ...l,
      deleted: false,
      dirty: true,
      updatedAt: futureTime
    }));

    await dbLocal.campaigns.bulkPut(importedCampaigns);
    await dbLocal.legs.bulkPut(importedLegs);

    e.target.value = null; 

    alert("Hard Reset complete. The app will now sync the backup to all devices.");
    
    if (typeof forceSync === "function" && window.currentUserUid) {
      forceSync(window.currentUserUid);
    }
    if (typeof reloadAll === "function") reloadAll();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      
      {/* 1. ACCOUNT & SYNC */}
      <div className="card">
        <h3>Account & Sync</h3>
        <div style={{ marginBottom: "16px" }}>
          <GoogleSignIn />
        </div>
        <p className="small">Force a manual sync if data seems out of date.</p>
        <button
          className="secondary"
          onClick={() => forceSync(auth.currentUser?.uid)}
        >
          Force Sync Now
        </button>
      </div>

      {/* 2. DATA MANAGEMENT (IMPORT/EXPORT) */}
      <div className="card">
        <h3>Data Management</h3>
        
        <div className="settings-section-title" style={{ marginTop: "12px" }}>Backup (JSON)</div>
        <div className="settings-row" style={{ alignItems: "center" }}>
          <button className="secondary" onClick={handleExport}>
            Export Backup
          </button>
          <span className="small" style={{ margin: "0 8px" }}>OR</span>
          <input
            type="file"
            className="input"
            ref={fileInputRef}
            accept=".json"
            onChange={handleImport}
            style={{ maxWidth: "200px" }}
          />
        </div>

        <div className="settings-section-title" style={{ marginTop: "16px" }}>Import Tracker (CSV)</div>
        <div className="settings-row">
          <input
            type="file"
            className="input"
            accept=".csv,.txt"
            onChange={handleCsvImport}
            style={{ maxWidth: "250px" }}
          />
        </div>
      </div>

      <div className="mt-8 p-4 border border-red-500 rounded bg-red-50">
        <h3 className="text-red-700 font-bold mb-2">Admin Tools</h3>
        <p className="text-sm text-red-600 mb-4">
          Run this once to apply the standard "TICKER #123" naming convention to all historical campaigns.
        </p>
        <button 
          onClick={handleRetroactiveRename}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
        >
          Retroactively Rename All Campaigns
        </button>
      </div>

      {/* 3. TRASH & RECOVERY */}
      <div className="card">
        <h3>Trash & Recovery</h3>
        <p className="small">Deleted campaigns are stored as local tombstones until permanently cleared.</p>
        
        {deletedCampaigns.length === 0 ? (
          <div className="small" style={{ opacity: 0.7, padding: "8px 0" }}>
            No deleted campaigns.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
            {deletedCampaigns.map((c) => (
              <div 
                key={c.id} 
                className="leg-row" 
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px" }}
              >
                <span>{c.Ticker || "Unknown"} (Deleted)</span>
                <button 
                  className="secondary" 
                  onClick={() => handleUndelete(c)}
                  style={{ padding: "4px 8px", fontSize: "12px" }}
                >
                  Undelete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. DANGER ZONE */}
      <div className="card" style={{ border: "1px solid var(--color-negative)", background: "rgba(239, 68, 68, 0.05)" }}>
        {/* ✨ ADDED onClick listener to the Danger Zone title */}
        <h3 
          style={{ color: "var(--color-negative)", cursor: "pointer", userSelect: "none" }}
          onClick={handleSecretTap}
        >
          Danger Zone
        </h3>
        
        <div className="settings-section-title" style={{ marginTop: "12px" }}>Fix Local Database</div>
        <p className="small" style={{ marginBottom: "8px" }}>Wipes local data and re-downloads everything from your cloud account.</p>
        <button 
          className="secondary" 
          onClick={handleReset}
          disabled={isResetting}
        >
          {isResetting ? "Resyncing..." : "Resync from Server"}
        </button>

        <div className="settings-section-title" style={{ marginTop: "20px" }}>Nuclear Option</div>
        <p className="small" style={{ marginBottom: "8px" }}>Permanently deletes everything from this device AND the cloud.</p>
        <button
          style={{ backgroundColor: "var(--color-negative)", color: "white" }}
          onClick={handleDeleteAll}
        >
          Delete ALL Data Forever
        </button>
      </div>

      {/* ✨ 5. DEVELOPER MODE (HIDDEN) */}
      {showDevMode && (
        <div className="card" style={{ border: "2px dashed #9333ea", background: "rgba(147, 51, 234, 0.05)", marginTop: "8px" }}>
          <h3 style={{ color: "#9333ea", marginBottom: "8px" }}>🛠️ Developer Tools</h3>
          
          <div className="settings-section-title">Nuke & Pave (Hard Reset)</div>
          <p className="small" style={{ marginBottom: "12px", color: "var(--color-text-secondary)" }}>
            Force-overwrites your entire local Dexie database with a JSON file, and pushes tombstones to force all other devices to wipe their local caches.
          </p>
          <div className="settings-row">
            <input
              type="file"
              className="input"
              accept=".json"
              onChange={handleHardResetImport}
              style={{ maxWidth: "250px", borderColor: "#9333ea" }}
            />
          </div>
        </div>
      )}

    </div>
  );
}