import React, { useState } from "react";
import { migrateLegDates } from "../../sync/migrateDates";

export default function DateMigrationAdmin({ uid }) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const handleRun = async (dryRun) => {
    if (!uid) {
      setError("No UID provided. Please ensure you are authenticated.");
      return;
    }
    if (!dryRun && !window.confirm("WARNING: This will write updated date strings directly to Dexie and Firestore. Continue?")) {
      return;
    }

    setRunning(true);
    setError(null);
    setSummary(null);

    try {
      const res = await migrateLegDates(uid, { dryRun });
      setSummary({ ...res, dryRun });
    } catch (err) {
      console.error(err);
      setError(err.message || "Migration failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "8px", margin: "20px 0", background: "#f9f9f9" }}>
      <h3>🛠️ Date Format Migration Tool</h3>
      <p style={{ fontSize: "14px", color: "#555" }}>
        Scans all local leg records for mixed timestamp/slash/2-digit year formats and normalizes them to strict <code>YYYY-MM-DD</code> strings.
      </p>

      <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
        <button
          onClick={() => handleRun(true)}
          disabled={running}
          style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          {running ? "Running..." : "🔍 Run Dry-Run Preview"}
        </button>

        <button
          onClick={() => handleRun(false)}
          disabled={running}
          style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
        >
          {running ? "Writing..." : "⚡ Commit Migration to DB"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: "12px", padding: "10px", background: "#fee2e2", color: "#991b1b", borderRadius: "4px" }}>
          Error: {error}
        </div>
      )}

      {summary && (
        <div style={{ marginTop: "16px", padding: "12px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: "4px" }}>
          <h4>{summary.dryRun ? "🔍 Dry-Run Results" : "⚡ Commit Results"}</h4>
          <p>Total legs checked: <strong>{summary.totalChecked}</strong></p>
          <p>{summary.dryRun ? "Would modify" : "Modified"}: <strong>{summary.wouldModify}</strong> legs</p>
          
          {summary.plan?.length > 0 && (
            <div style={{ marginTop: "12px", maxHeight: "200px", overflowY: "auto", fontSize: "12px", fontFamily: "monospace" }}>
              {summary.plan.map((item, idx) => (
                <div key={idx} style={{ padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                  ID <b>{item.id.slice(0, 8)}...</b> | Open: {item.open} | Close: {item.close} | Expiry: {item.expiry}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}