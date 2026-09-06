import React, { useRef } from "react";
import dbLocal from "../db/dexie";
import GoogleSignIn from "./GoogleSignIn.jsx";
import { forceSync, initialSync } from "../sync";
import { auth } from "../auth";

export default function SettingsTab({ reloadAll }) {
  const fileInputRef = useRef(null);

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

      <div className="settings-row">
        <button
          className="secondary"
          onClick={() => forceSync(auth.currentUser.uid)}
        >
          Force Sync Now
        </button>
      </div>

    </div>
  );
}
