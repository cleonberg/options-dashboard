import React, { useRef } from "react";
import dbLocal from "../db/dexie";
import GoogleSignIn from "./GoogleSignIn.jsx";
import { forceSync, initialSync, deleteAllRemote, loadCampaignsAndLegs } from "../sync/sync";
import { auth } from "../auth";
import { buildImportData } from "../logic/importCSV.js";

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

    // Convert TSV → row objects
    const rows = parseCsv(text);

    // Build campaigns + legs using your roll-chain logic
    const { campaigns, legs } = buildImportData(rows);

    console.log("Parsed rows:", rows.length);
    console.log("First row:", rows[0]);
    console.log("Import result:", { campaigns: campaigns.length, legs: legs.length });

    if (!window.confirm("Importing CSV will overwrite existing data. Continue?")) {
      return;
    }

    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    await dbLocal.campaigns.bulkPut(campaigns);
    await dbLocal.legs.bulkPut(legs);

    alert("CSV import complete. Reloading…");
    if (reloadAll) await reloadAll();
  }


  // ---------- Reset DB ----------
  async function handleReset() {
    if (!window.confirm("Reset ALL local data? This cannot be undone.")) return;

    const uid = auth.currentUser?.uid;

    // Clear local DB
    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    // No need to modify after clear — nothing to modify.
    // If you intended to clear dirty flags on remaining rows, do that before clear.

    // Force a fresh pull from server
    if (uid) {
      await initialSync(uid);
    }

    if (reloadAll) await reloadAll();
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

    // Delete local Dexie
    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    // Delete remote Firestore
    const uid = auth.currentUser?.uid;
    if (uid) {
      await deleteAllRemote(uid);
    } else {
      alert("Warning: Not signed in — remote delete skipped.");
    }

    alert("All campaigns and legs deleted.");

    // Reload local-only
    await loadCampaignsAndLegs(uid, { localOnly: true });
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

    if (!window.confirm("Importing will overwrite existing data. Continue?")) {
      return;
    }

    await dbLocal.campaigns.clear();
    await dbLocal.legs.clear();

    if (Array.isArray(data.campaigns)) {
      for (const c of data.campaigns) await dbLocal.addCampaign(c);
    }
    if (Array.isArray(data.legs)) {
      for (const l of data.legs) await dbLocal.addLeg(l);
    }

    alert("Import complete. Reloading…");
    if (reloadAll) await reloadAll();
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
          onClick={() => forceSync(auth.currentUser.uid)}
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
