import React, { useRef } from "react";
import dbLocal from "../db/dexie";
import GoogleSignIn from "./GoogleSignIn.jsx";
import { forceSync, initialSync, deleteAllRemote } from "../sync/sync";
import { auth } from "../auth";
import { buildImportData } from "../logic/importCsv.js";

export default function SettingsTab({ reloadAll }) {
  const fileInputRef = useRef(null);

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
      CurrentTheta: row["Current Theta"]
    };
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines[0].split(",");

    return lines.slice(1).map(line => {
      const cols = line.split(",");
      const raw = {};
      headers.forEach((h, i) => raw[h.trim()] = (cols[i] || "").trim());
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

    // Attach required offline-first metadata for Firestore sync
    const campaignsToInsert = campaigns.map(c => ({
      ...c,
      dirty: true,
      deleted: false,
      updatedAt: now
    }));

    const legsToInsert = legs.map(l => ({
      ...l,
      dirty: true,
      deleted: false,
      updatedAt: now
    }));

    await dbLocal.campaigns.bulkPut(campaignsToInsert);
    await dbLocal.legs.bulkPut(legsToInsert);

    alert("CSV import complete. Syncing to Firestore...");
    // No reloadAll() needed! Dexie's on('changes') will update the UI instantly.
  }

  // ---------- Reset DB ----------
  async function handleReset() {
    if (!window.confirm("Reset ALL local data? This cannot be undone.")) return;

    const uid = auth.currentUser?.uid;

    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    // Force a fresh pull from server
    if (uid) {
      await initialSync(uid);
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm("Delete ALL campaigns and legs from LOCAL and FIRESTORE?")) {
      return;
    }

    const typed = window.prompt(
      "This action is permanent.\n\nType DELETE to confirm."
    );

    if (typed !== "DELETE") {
      alert("Deletion cancelled.");
      return;
    }

    // 1. Wipe local database
    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    // 2. Wipe remote database
    const uid = auth.currentUser?.uid;
    if (uid) {
      await deleteAllRemote(uid);
    } else {
      alert("Warning: Not signed in — remote delete skipped.");
    }

    // 3. ⭐ FORCE THE APP TO RE-RENDER OVER THE EMPTY DATABASE
    if (typeof reloadAll === "function") {
      await reloadAll();
    } else {
      // If reloadAll isn't in scope here, you might need to pass it in
      // or directly set your state: setCampaigns([]); setLegs([]);
    }

    alert("All campaigns and legs deleted.");
  }

  // ---------- Export DB ----------
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

  // ---------- Import DB ----------
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

    if (!window.confirm("Importing will overwrite existing local data. Continue?")) {
      return;
    }

    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    const now = new Date().toISOString();

    // Use .put() to preserve original IDs instead of addCampaign/addLeg
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
  }

  return (
    <div className="card">
      <GoogleSignIn />
      <h3>Settings</h3>

      {/* ---------- Reset ---------- */}
      <div className="settings-section-title">Database</div>

      <div className="settings-row">
        <button onClick={handleReset}>Reset Database</button>
      </div>

      {/* ---------- Export ---------- */}
      <div className="settings-section-title">Backup</div>

      <div className="settings-row">
        <button className="secondary" onClick={handleExport}>
          Export JSON Backup
        </button>
      </div>

      {/* ---------- Import ---------- */}
      <div className="settings-section-title">Restore</div>
      <div className="settings-row">
        <input
          type="file"
          className="input"
          ref={fileInputRef}
          accept=".json"
          onChange={handleImport}
        />
      </div>

      <div className="settings-section-title">Import CSV</div>
      <div className="settings-row">
        <input
          type="file"
          className="input"
          accept=".csv,.txt"
          onChange={handleCsvImport}
        />
      </div>

      <div className="settings-row">
        <button
          className="secondary"
          onClick={() => forceSync(auth.currentUser?.uid)}
        >
          Force Sync Now
        </button>
      </div>

      <button
        style={{ backgroundColor: "#d9534f", color: "white", marginTop: "1rem" }}
        onClick={handleDeleteAll}
      >
        Delete ALL Campaigns & Legs (Local + Server)
      </button>

    </div>
  );
}