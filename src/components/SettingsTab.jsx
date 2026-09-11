import React, { useRef, useState, useEffect } from "react";
import dbLocal from "../db/dexie";
import GoogleSignIn from "./GoogleSignIn.jsx";
import { forceSync, initialSync, deleteAllRemote } from "../sync/sync";
import { auth } from "../auth";
import { buildImportData } from "../logic/importCsv.js";

export default function SettingsTab({ reloadAll }) {
  const fileInputRef = useRef(null);
  const [deletedCampaigns, setDeletedCampaigns] = useState([]);

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

  // ---------- Option 1: Undelete Logic ----------
  async function handleUndelete(campaign) {
    await dbLocal.campaigns.update(campaign.id, {
      deleted: false,
      dirty: true,
      updatedAt: new Date().toISOString(),
    });
    alert(`Restored ${campaign.Ticker || "Campaign"}`);
    loadDeletedCampaigns(); // Refresh the list
    if (typeof reloadAll === "function") reloadAll(); // Refresh dashboard stats
  }

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

    const now = new Date().toISOString();

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
    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    if (uid) {
      await initialSync(uid);
    }
    if (typeof reloadAll === "function") reloadAll();
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

    if (!window.confirm("Importing will overwrite existing local data. Continue?")) return;

    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    const now = new Date().toISOString();

    if (Array.isArray(data.campaigns)) {
      for (const c of data.campaigns) {
        await dbLocal.campaigns.put({ ...c, dirty: true, updatedAt: c.updatedAt || now });
      }
    }
    if (Array.isArray(data.legs)) {
      for (const l of data.legs) {
        await dbLocal.legs.put({ ...l, dirty: true, updatedAt: l.updatedAt || now });
      }
    }

    alert("Import complete. Syncing to Firestore...");
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

      {/* 3. TRASH & RECOVERY (OPTION 1) */}
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
        <h3 style={{ color: "var(--color-negative)" }}>Danger Zone</h3>
        
        <div className="settings-section-title" style={{ marginTop: "12px" }}>Fix Local Database</div>
        <p className="small" style={{ marginBottom: "8px" }}>Wipes local data and re-downloads everything from your cloud account.</p>
        <button className="secondary" onClick={handleReset}>
          Resync from Server
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

    </div>
  );
}