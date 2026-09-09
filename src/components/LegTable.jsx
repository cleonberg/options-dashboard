import React, { useState, useMemo } from "react";
import { fmt, cashClass, computeLegPL } from "../logic/logic.js";
import EditLegForm from "./EditLegForm.jsx";
import { editLeg, rollLeg, closeLeg } from "../sync/sync.js";

export default function LegTable({
  legs,
  campaigns,
  uid,
  reloadAll,

  enableSort = true,
  enablePaging = true,
  enableFilters = false,
  enableCampaignColumn = true
}) {
  const [sortBy, setSortBy] = useState("openDate");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editingLeg, setEditingLeg] = useState(null);

  // -----------------------------
  // Sorting
  // -----------------------------
  const sortedLegs = useMemo(() => {
    if (!enableSort) return legs;

    return [...legs].sort((a, b) => {
      if (sortBy === "pl") {
        const pa = computeLegPL(a) ?? 0;
        const pb = computeLegPL(b) ?? 0;
        return pa - pb;
      }

      if (sortBy === "openDate" || sortBy === "closeDate") {
        return new Date(a[sortBy] || 0) - new Date(b[sortBy] || 0);
      }
    });
  }, [legs, sortBy, enableSort]);

  // -----------------------------
  // Paging
  // -----------------------------
  const pages = enablePaging
    ? Math.max(1, Math.ceil(sortedLegs.length / pageSize))
    : 1;

  const pageItems = enablePaging
    ? sortedLegs.slice((page - 1) * pageSize, page * pageSize)
    : sortedLegs;

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div>

      {/* Controls */}
      {enableSort && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13 }}>Sort:</div>
          <button className={`secondary ${sortBy === "openDate" ? "active" : ""}`} onClick={() => setSortBy("openDate")}>Open Date</button>
          <button className={`secondary ${sortBy === "closeDate" ? "active" : ""}`} onClick={() => setSortBy("closeDate")}>Close Date</button>
          <button className={`secondary ${sortBy === "ticker" ? "active" : ""}`} onClick={() => setSortBy("ticker")}>Ticker</button>
          <button className={`secondary ${sortBy === "pl" ? "active" : ""}`} onClick={() => setSortBy("pl")}>P/L</button>

          {enablePaging && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <div className="summary-label">Page size</div>
              <select className="input" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <table className="table">
        <thead>
          <tr>
            <th>Open Date</th>
            <th>Close Date</th>
            <th>Ticker</th>
            {enableCampaignColumn && <th>Campaign</th>}
            <th>Type</th>
            <th>Qty</th>
            <th>Strike</th>
            <th>Expiry</th>
            <th>Open</th>
            <th>Close</th>
            <th>P/L</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {pageItems.map(l => {
            const pl = computeLegPL(l);

            return (
              <tr key={l.id}>
                <td>{l.openDate?.slice(0, 10) || "-"}</td>
                <td>{l.closeDate ? l.closeDate.slice(0, 10) : ""}</td>
                <td>{l.ticker}</td>

                {enableCampaignColumn && (
                  <td>{l.campaignId}</td>
                )}

                <td>{l.type}</td>
                <td>{l.qty}</td>
                <td>{l.strike}</td>
                <td>{l.expiry}</td>
                <td>{fmt(l.openPrice)}</td>
                <td>{l.closePrice == null ? "" : fmt(l.closePrice)}</td>

                <td className={pl == null ? "" : cashClass(pl)}>
                  {pl == null ? "" : fmt(pl)}
                </td>

                <td className="small">{l.notes}</td>

                <td>
                  <button className="secondary" onClick={() => setEditingLeg(l)}>Edit</button>

                  {l.isOpen ? (
                    <>
                      <button className="secondary" style={{ marginLeft: 6 }} onClick={() => closeLeg(uid, l)}>Close</button>
                      <button style={{ marginLeft: 6 }} onClick={() => rollLeg(uid, l)}>Roll</button>
                    </>
                  ) : (
                    <span className="small">Closed</span>
                  )}
                </td>
              </tr>
            );
          })}

          {pageItems.length === 0 && (
            <tr>
              <td colSpan={enableCampaignColumn ? 13 : 12} style={{ textAlign: "center", padding: 20 }}>
                No legs match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {enablePaging && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <button className="secondary" onClick={() => setPage(1)} disabled={page === 1}>First</button>
          <button className="secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>

          <div style={{ padding: "6px 10px", background: "#f1f1f1", borderRadius: 6 }}>
            Page {page} / {pages}
          </div>

          <button className="secondary" onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>Next</button>
          <button className="secondary" onClick={() => setPage(pages)} disabled={page === pages}>Last</button>

          <div style={{ marginLeft: "auto" }}>
            <button onClick={() => reloadAll(uid)}>Reload</button>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingLeg && (
        <EditLegForm
          leg={editingLeg}
          onSave={updated => {
            editLeg(uid, { ...editingLeg, ...updated });
            setEditingLeg(null);
          }}
          onClose={() => setEditingLeg(null)}
        />
      )}
    </div>
  );
}
