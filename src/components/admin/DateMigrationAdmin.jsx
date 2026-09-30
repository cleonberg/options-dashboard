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
    <div style={{ marginTop: "12px" }}>
      <h4 className="settings-section-title">Date Format Migration Tool</h4>
      <p className="small">
        Scans local leg records for mixed timestamp and date formats, then
        normalizes them to <code>YYYY-MM-DD</code>.
      </p>
  
      <div className="settings-row">
        <button
          type="button"
          className="secondary"
          onClick={() => handleRun(true)}
          disabled={running}
        >
          {running ? "Running..." : "Run Dry-Run Preview"}
        </button>
  
        <button
          type="button"
          onClick={() => handleRun(false)}
          disabled={running}
        >
          {running ? "Writing..." : "Commit Migration"}
        </button>
      </div>
  
      {error && (
        <p className="small" style={{ color: "var(--color-negative)" }}>
          Error: {error}
        </p>
      )}
  
      {summary && (
        <div className="leg-details" style={{ marginTop: "12px" }}>
          <h4 className="settings-section-title">
            {summary.dryRun ? "Dry-Run Results" : "Commit Results"}
          </h4>
          <p className="small">
            Total legs checked: <strong>{summary.totalChecked}</strong>
          </p>
          <p className="small">
            {summary.dryRun ? "Would modify" : "Modified"}:{" "}
            <strong>{summary.wouldModify}</strong> legs
          </p>
  
          {summary.plan?.length > 0 && (
            <div style={{ maxHeight: "200px", overflowY: "auto" }}>
              {summary.plan.map((item) => (
                <div
                  key={item.id}
                  className="small"
                  style={{
                    padding: "4px 0",
                    overflowWrap: "anywhere",
                    borderBottom: "1px solid var(--border-color)"
                  }}
                >
                  ID <strong>{item.id.slice(0, 8)}...</strong>
                  {" | "}Open: {item.open}
                  {" | "}Close: {item.close}
                  {" | "}Expiry: {item.expiry}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}