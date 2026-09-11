function uuidv4() {
  return crypto.randomUUID();
}

function normalizeDate(d) {
  if (!d) return null;
  if (d.includes("-")) return d; // Assumes ISO format like YYYY-MM-DD
  
  const [m, day, y] = d.split("/");
  if (!m || !day || !y) return null;

  let year = y.trim();
  // Handle 2-digit years (e.g. "26" -> "2026")
  if (year.length === 2) {
    const num = Number(year);
    // Assuming 2000s for numbers 0-69, 1900s for 70-99
    year = num < 70 ? `20${year.padStart(2, "0")}` : `19${year.padStart(2, "0")}`;
  } else {
    year = year.padStart(4, "0");
  }

  const month = m.padStart(2, "0");
  const dateDay = day.padStart(2, "0");

  return `${year}-${month}-${dateDay}`;
}

function normalizeTypeAndQty(type = "", qty = 0) {
  const t = String(type).toLowerCase().trim();
  const q = Number(qty) || 0;

  if (t === "stock") return { type: "stock", qty: q };

  if (t === "put") {
    return q < 0 ? { type: "sell_put", qty: Math.abs(q) } : { type: "buy_put", qty: Math.abs(q) };
  }

  if (t === "call") {
    return q < 0 ? { type: "sell_call", qty: Math.abs(q) } : { type: "buy_call", qty: Math.abs(q) };
  }

  // already normalized or unknown
  return { type: String(type || "").trim(), qty: q };
}

function parseNumber(v) {
  if (v == null || v === "") return 0;
  return Number(String(v).replace(/[$,]/g, "")) || 0;
}

export function buildImportData(rows = []) {
  const uuidMap = new Map();

  // Build UUIDs only for non-stock legs that have an ID
  rows.forEach(r => {
    const id = r?.ID ?? r?.Id ?? r?.id;
    const type = r?.Type ?? "";
    if (!id) return;
    if (String(type).toLowerCase() === "stock") return;
    uuidMap.set(String(id), uuidv4());
  });

  const legsById = new Map();

  rows.forEach(r => {
    const rawId = r?.ID ?? r?.Id ?? r?.id;
    if (!rawId) return;
    const idKey = String(rawId);

    const typeRaw = r?.Type ?? "";
    if (String(typeRaw).toLowerCase() === "stock") return;

    const newId = uuidMap.get(idKey);
    if (!newId) return;

    const rolledFromRaw = r?.RolledFrom ?? r?.RolledFromId ?? r?.RolledFromID;
    const rolledToRaw = r?.RolledTo ?? r?.RolledToId ?? r?.RolledToID;

    const newRolledFrom = rolledFromRaw ? uuidMap.get(String(rolledFromRaw)) || "" : "";
    const newRolledTo = rolledToRaw ? uuidMap.get(String(rolledToRaw)) || "" : "";

    const { type, qty } = normalizeTypeAndQty(typeRaw, Number(r?.Quantity));

    legsById.set(newId, {
      // keep original CSV fields for debugging
      ID: idKey,
      Ticker: r?.Ticker ?? "",
      RolledFrom: rolledFromRaw ?? "",
      RolledTo: rolledToRaw ?? "",
      UUID: newId,
      RolledFromUUID: newRolledFrom,
      RolledToUUID: newRolledTo,
      NormalizedType: type,
      NormalizedQty: qty,
      NormalizedOpenDate: normalizeDate(r?.OpenDate),
      NormalizedCloseDate: normalizeDate(r?.CloseDate),
      NormalizedExpiry: normalizeDate(r?.Expiration),
      StrikeRaw: r?.Strike ?? "",
      OpenPriceRaw: r?.OpenPrice ?? "",
      ClosePriceRaw: r?.ClosePrice ?? "",
      CurrentThetaRaw: r?.CurrentTheta ?? ""
    });
  });

  const campaigns = [];
  const legs = [];
  const visited = new Set();

  for (const [uuid, row] of legsById.entries()) {
    if (visited.has(uuid)) continue;

    // start of chain if no valid RolledFrom or RolledFrom not present
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

      const hasOpenLeg = chain.some(l => !l.NormalizedCloseDate);

      const campaignId = uuidv4();
      const ticker = first.Ticker || "";
      const startDate = first.NormalizedOpenDate || null;
      const endDate = hasOpenLeg ? null : last.NormalizedCloseDate || null;
      const status = hasOpenLeg ? "open" : "closed";
      const campaignName = `${ticker} ${first.NormalizedExpiry || ""}`.trim();

      const now = Date.now();

      campaigns.push({
        id: campaignId,
        ticker,
        name: campaignName,
        startDate,
        endDate,
        status,
        notes: "",
        updatedAt: now,
        clientUpdatedAt: now,
        dirty: true,
        deleted: false
      });

      chain.forEach(l => {
        const strike = l.StrikeRaw ? parseNumber(l.StrikeRaw) : null;
        const openPrice = parseNumber(l.OpenPriceRaw);
        const closePrice = parseNumber(l.ClosePriceRaw);
        const currentTheta = l.CurrentThetaRaw ? parseNumber(l.CurrentThetaRaw) : 0;

        legs.push({
          id: l.UUID,
          campaignId,
          ticker: l.Ticker || "",
          type: l.NormalizedType,
          qty: l.NormalizedQty,
          strike,
          expiry: l.NormalizedExpiry || null,
          openDate: l.NormalizedOpenDate || null,
          closeDate: l.NormalizedCloseDate || null,
          openPrice,
          closePrice,
          isOpen: !l.NormalizedCloseDate,
          rolledFrom: l.RolledFromUUID || "",
          rolledTo: l.RolledToUUID || "",
          currentTheta,
          originalId: l.ID,
          updatedAt: now,
          clientUpdatedAt: now,
          dirty: true,
          deleted: false
        });
      });
    }
  }

  return { campaigns, legs };
}
