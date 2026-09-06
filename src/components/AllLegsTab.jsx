import React, { useState, useMemo, useEffect } from "react";

import {
  fmt,
  computeLegPL,
  cashClass,
  handleEditLegSubmit,
  handleCloseLeg,
  handleRollSubmit,
  handleAddLeg,
} from "../logic/logic.js";

/**
 * Props:
 * - legs: array of all legs (unfiltered)
 * - loadCampaignsAndLegs: async function to reload campaigns+legs and return { campaigns, legs }
 * - setLegs: setter to update legs in parent state (optional but recommended)
 */
export default function AllLegsTab({ legs = [], loadCampaignsAndLegs, setLegs }) {
  // UI state
  const [query, setQuery] = useState("");
  const [filterTicker, setFilterTicker] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("openDate"); // openDate | closeDate | ticker | pl | qty
  const [sortDir, setSortDir] = useState("desc"); // asc | desc
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [editingLeg, setEditingLeg] = useState(null);
  const [rollSourceLeg, setRollSourceLeg] = useState(null);
  const [rollClosePrice, setRollClosePrice] = useState("");
  const [rollQty, setRollQty] = useState("");
  const [rollStrike, setRollStrike] = useState("");
  const [rollExpiry, setRollExpiry] = useState("");
  const [rollOpenPrice, setRollOpenPrice] = useState("");

  // Derived lists
  const tickers = useMemo(() => {
    const s = new Set();
    for (const l of legs) if (l.ticker) s.add(l.ticker);
    return Array.from(s).sort();
  }, [legs]);

  // Filter + search
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return legs
      .filter(l => {
        if (filterTicker && l.ticker !== filterTicker) return false;
        if (filterType !== "all" && l.type !== filterType) return false;
        if (filterStatus !== "all") {
          const isOpen = !!l.isOpen;
          if (filterStatus === "open" && !isOpen) return false;
          if (filterStatus === "closed" && isOpen) return false;
        }
        if (!q) return true;
        // search across ticker, notes, campaignId, type
        if (l.ticker && l.ticker.toLowerCase().includes(q)) return true;
        if (l.notes && l.notes.toLowerCase().includes(q)) return true;
        if (String(l.campaignId).includes(q)) return true;
        if (l.type && l.type.toLowerCase().includes(q)) return true;
        return false;
      })
      .map(l => ({ ...l, pl: computeLegPL(l) }));
  }, [legs, query, filterTicker, filterType, filterStatus]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va, vb;
      switch (sortBy) {
        case "ticker":
          va = (a.ticker || "").toLowerCase();
          vb = (b.ticker || "").toLowerCase();
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        case "pl":
          va = a.pl || 0;
          vb = b.pl || 0;
          return sortDir === "asc" ? va - vb : vb - va;
        case "qty":
          va = a.qty || 0;
          vb = b.qty || 0;
          return sortDir === "asc" ? va - vb : vb - va;
        case "closeDate":
          va = a.closeDate ? new Date(a.closeDate).getTime() : 0;
          vb = b.closeDate ? new Date(b.closeDate).getTime() : 0;
          return sortDir === "asc" ? va - vb : vb - va;
        case "openDate":
        default:
          va = a.openDate ? new Date(a.openDate).getTime() : 0;
          vb = b.openDate ? new Date(b.openDate).getTime() : 0;
          return sortDir === "asc" ? va - vb : vb - va;
      }
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  // Pagination
  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > pages) setPage(1);
  }, [pages, page]);

  const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize);

  // Charts: timeline and cumulative P/L series
  const plSeries = useMemo(() => {
    // aggregate pl by date (open/close events)
    const map = new Map();
    for (const l of legs) {
      if (l.openDate) {
        const d = l.openDate.slice(0, 10);
        const val = -(l.openPrice || 0) * (l.qty || 0);
        map.set(d, (map.get(d) || 0) + val);
      }
      if (l.closeDate) {
        const d = l.closeDate.slice(0, 10);
        const val = (l.closePrice || 0) * (l.qty || 0);
        map.set(d, (map.get(d) || 0) + val);
      }
    }
    const entries = Array.from(map.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0]));
    let cum = 0;
    return entries.map(([date, val]) => {
      cum += val;
      return { date, val, cumulative: cum };
    });
  }, [legs]);

  // Actions
  async function onSubmitEdit(updated) {
    await handleEditLegSubmit(updated);
    setEditingLeg(null);
    setLegs([...legs]);
  }

  async function onClose(leg) {
    const price = prompt("Enter close price:");
    if (!price) return;
    await handleCloseLeg(leg, price);
    setLegs([...legs]);
  }

  async function onRollSubmit(e) {
    e.preventDefault();
    if (!rollSourceLeg) return;
    await handleRollSubmit(rollSourceLeg, {
      closePrice: rollClosePrice,
      qty: rollQty,
      strike: rollStrike,
      expiry: rollExpiry,
      openPrice: rollOpenPrice,
    });
    setRollSourceLeg(null);
    setLegs([...legs]);
  }

  // Small helpers
  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  return (
    <div className="card">
      <h3>All Legs (Activity)</h3>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <input
          className="input"
          placeholder="Search ticker, notes, campaign id, type..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />

        <select className="input" value={filterTicker} onChange={e => setFilterTicker(e.target.value)}>
          <option value="">All tickers</option>
          {tickers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          <option value="call">call</option>
          <option value="put">put</option>
          <option value="stock">stock</option>
        </select>

        <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>

        <button className="secondary" onClick={() => { setQuery(""); setFilterTicker(""); setFilterType("all"); setFilterStatus("all"); }}>
          Reset
        </button>
      </div>

      {/* Summary */}
      <div className="summary-grid" style={{ marginBottom: 12 }}>
        <div>
          <div className="summary-label">Total Legs</div>
          <div>{legs.length}</div>
        </div>

        <div>
          <div className="summary-label">Filtered</div>
          <div>{total}</div>
        </div>

        <div>
          <div className="summary-label">Open</div>
          <div>{legs.filter(l => l.isOpen).length}</div>
        </div>

        <div>
          <div className="summary-label">Closed</div>
          <div>{legs.filter(l => !l.isOpen).length}</div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }} className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Performance (Cumulative P/L)</div>
          <svg width="100%" height="120">
            {plSeries.length > 0 && (() => {
              const maxCum = Math.max(...plSeries.map(p => Math.abs(p.cumulative))) || 1;
              const w = 600;
              const h = 100;
              return plSeries.map((p, i) => {
                if (i === 0) return null;
                const x1 = ((i - 1) / (plSeries.length - 1)) * (w - 40) + 20;
                const x2 = (i / (plSeries.length - 1)) * (w - 40) + 20;
                const y1 = h - (plSeries[i - 1].cumulative / maxCum) * (h / 2) - h / 4;
                const y2 = h - (p.cumulative / maxCum) * (h / 2) - h / 4;
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1e88e5" strokeWidth="2" />;
              });
            })()}
          </svg>
        </div>

        <div style={{ width: 260 }} className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Recent P/L (last 10)</div>
          <ul style={{ margin: 0, paddingLeft: 14 }}>
            {plSeries.slice(-10).map(p => (
              <li key={p.date}>
                <strong>{p.date}</strong>: {fmt(p.cumulative)}
              </li>
            ))}
            {plSeries.length === 0 && <li className="small">No events</li>}
          </ul>
        </div>
      </div>

      {/* Table controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13 }}>Sort:</div>
        <button className={`secondary ${sortBy === "openDate" ? "active" : ""}`} onClick={() => toggleSort("openDate")}>Open Date</button>
        <button className={`secondary ${sortBy === "closeDate" ? "active" : ""}`} onClick={() => toggleSort("closeDate")}>Close Date</button>
        <button className={`secondary ${sortBy === "ticker" ? "active" : ""}`} onClick={() => toggleSort("ticker")}>Ticker</button>
        <button className={`secondary ${sortBy === "pl" ? "active" : ""}`} onClick={() => toggleSort("pl")}>P/L</button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div className="summary-label">Page size</div>
          <select className="input" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <table className="table">
        <thead>
          <tr>
            <th>Open Date</th>
            <th>Close Date</th>
            <th>Ticker</th>
            <th>Campaign</th>
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
          {pageItems.map(l => (
            <tr key={l.id}>
              <td>{l.openDate ? l.openDate.slice(0, 10) : "-"}</td>
              <td>{l.closeDate ? l.closeDate.slice(0, 10) : "-"}</td>
              <td>{l.ticker}</td>
              <td>{l.campaignId}</td>
              <td>{l.type}</td>
              <td>{l.qty}</td>
              <td>{l.strike}</td>
              <td>{l.expiry}</td>
              <td>{fmt(l.openPrice)}</td>
              <td>{fmt(l.closePrice)}</td>
              <td className={cashClass(l.pl)}>{fmt(l.pl)}</td>
              <td className="small">{l.notes}</td>
              <td>
                <button className="secondary" onClick={() => setEditingLeg(l)}>Edit</button>

                {l.isOpen ? (
                  <>
                    <button className="secondary" style={{ marginLeft: 6 }} onClick={() => onClose(l)}>Close</button>
                    <button style={{ marginLeft: 6 }} onClick={() => {
                      setRollSourceLeg(l);
                      setRollClosePrice("");
                      setRollQty(l.qty);
                      setRollStrike(l.strike);
                      setRollExpiry(new Date().toISOString().slice(0, 10));
                      setRollOpenPrice("");
                    }}>Roll</button>
                  </>
                ) : (
                  <span className="small">Closed</span>
                )}
              </td>
            </tr>
          ))}

          {pageItems.length === 0 && (
            <tr>
              <td colSpan={13} style={{ textAlign: "center", padding: 20 }}>
                No legs match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
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

      {/* Edit form (inline simple) */}
      {editingLeg && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4>Edit Leg #{editingLeg.id}</h4>
          <div className="form-row">
            <input className="input" value={editingLeg.notes || ""} onChange={e => setEditingLeg({ ...editingLeg, notes: e.target.value })} />
            <input className="input" value={editingLeg.qty} onChange={e => setEditingLeg({ ...editingLeg, qty: e.target.value })} />
            <input className="input" value={editingLeg.openPrice} onChange={e => setEditingLeg({ ...editingLeg, openPrice: e.target.value })} />
            <input className="input" value={editingLeg.closePrice || ""} onChange={e => setEditingLeg({ ...editingLeg, closePrice: e.target.value })} />
            <button onClick={() => onSubmitEdit(editingLeg)}>Save</button>
            <button className="secondary" onClick={() => setEditingLeg(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Roll form */}
      {rollSourceLeg && (
        <form className="card" onSubmit={onRollSubmit} style={{ marginTop: 12 }}>
          <div className="settings-section-title">Roll Leg #{rollSourceLeg.id}</div>
          <div className="settings-row">
            <input className="input" placeholder="Close price" value={rollClosePrice} onChange={e => setRollClosePrice(e.target.value)} />
            <input className="input" placeholder="Qty" value={rollQty} onChange={e => setRollQty(e.target.value)} />
            <input className="input" placeholder="Strike" value={rollStrike} onChange={e => setRollStrike(e.target.value)} />
            <input className="input" type="date" value={rollExpiry} onChange={e => setRollExpiry(e.target.value)} />
            <input className="input" placeholder="Open price" value={rollOpenPrice} onChange={e => setRollOpenPrice(e.target.value)} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit">Submit Roll</button>
            <button type="button" className="secondary" onClick={() => setRollSourceLeg(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
