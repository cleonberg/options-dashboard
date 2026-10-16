const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

const alpacaApiKey = defineSecret("ALPACA_API_KEY");
const alpacaApiSecret = defineSecret("ALPACA_API_SECRET");
const maxPositions = 100;
const maxContractPages = 10;

function normalizeTicker(value) {
  if (typeof value !== "string") return null;
  const ticker = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker) ? ticker : null;
}

function normalizeExpiry(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function normalizePositions(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxPositions) {
    throw new HttpsError(
      "invalid-argument",
      `Provide between 1 and ${maxPositions} positions.`
    );
  }

  const ids = new Set();
  return value.map((position) => {
    if (!position || typeof position !== "object") {
      throw new HttpsError("invalid-argument", "A position is invalid.");
    }

    const id = String(position.id || "");
    const ticker = normalizeTicker(position.ticker);
    if (!id || id.length > 200 || ids.has(id) || !ticker) {
      throw new HttpsError("invalid-argument", "A position has invalid details.");
    }
    ids.add(id);

    if (position.kind === "stock") {
      return { id, ticker, kind: "stock" };
    }

    const expiry = normalizeExpiry(position.expiry);
    const strike = Number(position.strike);
    if (
      position.kind !== "option" ||
      !["call", "put"].includes(position.right) ||
      !expiry ||
      !Number.isFinite(strike) ||
      strike <= 0
    ) {
      throw new HttpsError("invalid-argument", "An option position has invalid details.");
    }

    return {
      id,
      ticker,
      kind: "option",
      right: position.right,
      strike,
      expiry,
    };
  });
}

function quoteMidpoint(quote) {
  const bid = Number(quote?.bp);
  const ask = Number(quote?.ap);
  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid < 0 ||
    ask <= 0 ||
    ask < bid
  ) {
    return null;
  }
  return Math.round(((bid + ask) / 2) * 100) / 100;
}

function alpacaHeaders() {
  return {
    "APCA-API-KEY-ID": alpacaApiKey.value(),
    "APCA-API-SECRET-KEY": alpacaApiSecret.value(),
  };
}

async function fetchAlpacaJson(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: alpacaHeaders(),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    logger.error("Alpaca request failed before receiving a response.", {
      message: error.message,
    });
    throw new HttpsError("unavailable", "Could not reach Alpaca market data.");
  }

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    logger.error("Alpaca returned an error.", {
      status: response.status,
      details,
    });
    if (response.status === 401 || response.status === 403) {
      throw new HttpsError(
        "failed-precondition",
        "Alpaca rejected the credentials or market-data access."
      );
    }
    if (response.status === 429) {
      throw new HttpsError(
        "resource-exhausted",
        "Alpaca rate limit reached. Wait a moment and try again."
      );
    }
    throw new HttpsError("unavailable", "Alpaca could not provide market data.");
  }

  try {
    return await response.json();
  } catch (error) {
    logger.error("Alpaca returned invalid JSON.", { message: error.message });
    throw new HttpsError("internal", "Alpaca returned an invalid response.");
  }
}

function optionGroupKey(position) {
  return `${position.ticker}|${position.expiry}|${position.right}`;
}

function strikeKey(value) {
  return Number(value).toString();
}

async function getOptionContractSymbols(positions) {
  const groups = new Map();
  for (const position of positions.filter((item) => item.kind === "option")) {
    const key = optionGroupKey(position);
    if (!groups.has(key)) {
      groups.set(key, {
        ticker: position.ticker,
        expiry: position.expiry,
        right: position.right,
        strikes: new Set(),
      });
    }
    groups.get(key).strikes.add(strikeKey(position.strike));
  }

  const symbolsByContract = new Map();
  for (const group of groups.values()) {
    const strikes = [...group.strikes].map(Number);
    const params = new URLSearchParams({
      underlying_symbols: group.ticker,
      expiration_date: group.expiry,
      type: group.right,
      status: "active",
      strike_price_gte: String(Math.min(...strikes)),
      strike_price_lte: String(Math.max(...strikes)),
      limit: "10000",
    });
    let pageCount = 0;

    while (true) {
      const url = new URL("https://paper-api.alpaca.markets/v2/options/contracts");
      url.search = params.toString();
      const data = await fetchAlpacaJson(url);
      for (const contract of data.option_contracts || []) {
        const key = [
          group.ticker,
          group.expiry,
          group.right,
          strikeKey(contract.strike_price),
        ].join("|");
        if (group.strikes.has(strikeKey(contract.strike_price))) {
          symbolsByContract.set(key, contract.symbol);
        }
      }

      if (!data.next_page_token) break;
      pageCount += 1;
      if (pageCount >= maxContractPages) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many matching option contracts; narrow the positions and try again."
        );
      }
      params.set("page_token", data.next_page_token);
    }
  }
  return symbolsByContract;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function getLatestStockQuotes(tickers) {
  const quotes = {};
  for (const batch of chunks([...new Set(tickers)], 100)) {
    if (batch.length === 0) continue;
    const params = new URLSearchParams({
      symbols: batch.join(","),
      feed: "iex",
    });
    const url = new URL("https://data.alpaca.markets/v2/stocks/quotes/latest");
    url.search = params.toString();
    const data = await fetchAlpacaJson(url);
    Object.assign(quotes, data.quotes || {});
  }
  return quotes;
}

async function getLatestOptionQuotes(symbols) {
  const quotes = {};
  for (const batch of chunks([...new Set(symbols)], 100)) {
    if (batch.length === 0) continue;
    const params = new URLSearchParams({
      symbols: batch.join(","),
      feed: "indicative",
    });
    const url = new URL("https://data.alpaca.markets/v1beta1/options/quotes/latest");
    url.search = params.toString();
    const data = await fetchAlpacaJson(url);
    Object.assign(quotes, data.quotes || {});
  }
  return quotes;
}

exports.refreshAccountMarks = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    maxInstances: 1,
    enforceAppCheck: true,
    secrets: [alpacaApiKey, alpacaApiSecret],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in before refreshing quotes.");
    }

    const positions = normalizePositions(request.data?.positions);
    const optionPositions = positions.filter((item) => item.kind === "option");
    const symbolsByContract = await getOptionContractSymbols(optionPositions);
    const optionSymbols = [...new Set(symbolsByContract.values())];
    const stockTickers = [
      ...new Set(
        positions
          .filter((item) => item.kind === "stock" || item.kind === "option")
          .map((item) => item.ticker)
      ),
    ];

    const [stockQuotes, optionQuotes] = await Promise.all([
      getLatestStockQuotes(stockTickers),
      getLatestOptionQuotes(optionSymbols),
    ]);

    const positionMarks = {};
    const underlyingPrices = {};
    const missingPositionIds = [];
    const missingUnderlyingTickers = [];
    const optionTickers = new Set(optionPositions.map((item) => item.ticker));

    for (const ticker of optionTickers) {
      const price = quoteMidpoint(stockQuotes[ticker]);
      if (price == null) missingUnderlyingTickers.push(ticker);
      else underlyingPrices[ticker] = price;
    }

    for (const position of positions) {
      if (position.kind === "stock") {
        const price = quoteMidpoint(stockQuotes[position.ticker]);
        if (price == null) missingPositionIds.push(position.id);
        else positionMarks[position.id] = price;
        continue;
      }

      const contractKey = [
        position.ticker,
        position.expiry,
        position.right,
        strikeKey(position.strike),
      ].join("|");
      const symbol = symbolsByContract.get(contractKey);
      const price = symbol ? quoteMidpoint(optionQuotes[symbol]) : null;
      if (price == null) missingPositionIds.push(position.id);
      else positionMarks[position.id] = price;
    }

    return {
      positionMarks,
      underlyingPrices,
      missingPositionIds,
      missingUnderlyingTickers,
      source: {
        optionFeed: "indicative",
        stockFeed: "iex",
      },
    };
  }
);
