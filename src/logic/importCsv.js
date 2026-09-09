function uuidv4() {
  return crypto.randomUUID();
}

// Convert MM/DD/YYYY → YYYY-MM-DD
function normalizeDate(d) {
  if (!d) return null;
  if (d.includes("-")) return d; // already ISO
  const [m, day, y] = d.split("/");
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// Convert old type + qty → new type + positive qty
function normalizeTypeAndQty(type, qty) {
  const t = type.toLowerCase();

  if (t === "stock") {
    return { type: "stock", qty };
  }

  if (t === "put") {
    return qty < 0
      ? { type: "sell_put", qty: Math.abs(qty) }
      : { type: "buy_put", qty: Math.abs(qty) };
  }

  if (t === "call") {
    return qty < 0
      ? { type: "sell_call", qty: Math.abs(qty) }
      : { type: "buy_call", qty: Math.abs(qty) };
  }

  // Already normalized (sell_put, buy_put, etc.)
  return { type, qty };
}

export function buildImportData(rows) {
  // STEP 1 — Build a map from CSV leg ID → UUID
  const uuidMap = new Map();

  rows.forEach(r => {
    if (!r.Type || r.Type.toLowerCase() === "stock") return;
    uuidMap.set(r.ID, uuidv4());
  });

  // STEP 2 — Normalize and index legs using UUIDs
  const legsById = new Map();

  rows.forEach(r => {
    if (!r.Type || r.Type.toLowerCase() === "stock") return;

    const newId = uuidMap.get(r.ID);
    const newRolledFrom = r.RolledFrom ? uuidMap.get(r.RolledFrom) : "";
    const newRolledTo = r.RolledTo ? uuidMap.get(r.RolledTo) : "";

    // Normalize type + qty
    const { type, qty } = normalizeTypeAndQty(r.Type, Number(r.Quantity));

    legsById.set(newId, {
      ...r,
      UUID: newId,
      RolledFromUUID: newRolledFrom,
      RolledToUUID: newRolledTo,
      NormalizedType: type,
      NormalizedQty: qty,
      NormalizedOpenDate: normalizeDate(r.OpenDate),
      NormalizedCloseDate: normalizeDate(r.CloseDate),
      NormalizedExpiry: normalizeDate(r.Expiration)
    });
  });

  const campaigns = [];
  const legs = [];
  const visited = new Set();

  // STEP 3 — Build campaigns using UUID roll links
  for (const [uuid, row] of legsById.entries()) {
    if (visited.has(uuid)) continue;

    if (!row.RolledFromUUID || !legsById.has(row.RolledFromUUID)) {
      const chain = [];
      let current = row;

      while (current) {
        chain.push(current);
        visited.add(current.UUID);

        const nextId = current.RolledToUUID;
        if (!nextId || !legsById.has(nextId)) break;
        current = legsById.get(nextId);
      }

      const first = chain[0];
      const last = chain[chain.length - 1];

      // NEW: correct open/closed logic
      const hasOpenLeg = chain.some(l => !l.NormalizedCloseDate);

      const campaignId = uuidv4();
      const ticker = first.Ticker;
      const startDate = first.NormalizedOpenDate;

      // NEW: endDate only if ALL legs are closed
      const endDate = hasOpenLeg ? null : last.NormalizedCloseDate;

      // NEW: status based on ANY open leg
      const status = hasOpenLeg ? "open" : "closed";

      const campaignName = `${ticker} ${first.NormalizedExpiry || ""}`.trim();

      campaigns.push({
        id: campaignId,
        ticker,
        name: campaignName,
        startDate,
        endDate,
        status,
        notes: "",
        updatedAt: Date.now(),
        dirty: true,
      });

      // Build legs
      chain.forEach(l => {
        legs.push({
          id: l.UUID,
          campaignId,
          ticker: l.Ticker,

          // ⭐ NEW normalized type + qty
          type: l.NormalizedType,
          qty: l.NormalizedQty,

          strike: l.Strike ? Number(String(l.Strike).replace("$", "")) : null,
          expiry: l.NormalizedExpiry,
          openDate: l.NormalizedOpenDate,
          closeDate: l.NormalizedCloseDate,

          openPrice: l.OpenPrice ? Number(String(l.OpenPrice).replace("$", "")) : 0,
          closePrice: l.ClosePrice ? Number(String(l.ClosePrice).replace("$", "")) : 0,

          isOpen: !l.NormalizedCloseDate,

          rolledFrom: l.RolledFromUUID || "",
          rolledTo: l.RolledToUUID || "",

          currentTheta: l.CurrentTheta
            ? Number(String(l.CurrentTheta).replace("$", "").replace(",", ""))
            : 0,

          originalId: l.ID,
          updatedAt: Date.now(),
          dirty: true,
        });
      });
    }
  }

  return { campaigns, legs };
}
