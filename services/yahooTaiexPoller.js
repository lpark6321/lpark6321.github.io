// Yahoo ^TWII poller: fetches the latest Taiwan Weighted Index quote and writes it into store.taiex.
import { store } from '../data/store.js';
import { TAIEX_BY_CODE } from '../data/taiexWeightedConstituents.js';
import { TW50_BY_CODE } from '../data/tw50Constituents.js';
import { MID100_BY_CODE } from '../data/twMid100Constituents.js';
import { getDashboardDataSource } from './dashboardDataSource.js';

const YAHOO_TAIEX_SYMBOL = '^TWII';
const PAGE1_STOCK_SYMBOLS = ['2330.TW', '2308.TW', '2317.TW', '2454.TW', '3711.TW', '2881.TW', '2382.TW', '2412.TW', '2882.TW', '2891.TW'];
const MARKET_MAP_META_BY_CODE = buildMarketMapMetaByCode();
const PAGE6_MARKET_MAP_SYMBOLS = Object.values(MARKET_MAP_META_BY_CODE)
  .sort((a, b) => (b.weightPct || 0) - (a.weightPct || 0))
  .map((item) => `${item.code}.TW`);
const DEFAULT_POLL_MS = 10000;
const ERROR_RETRY_MS = 30000;
const LIVE_TTL_MS = 60000;
const DEFAULT_PROXY_BASE = 'http://127.0.0.1:8787/api';
const MAX_SYMBOLS_PER_REQUEST = 20;
const QUOTE_CHUNK_CONCURRENCY = 4;

let timer = null;
let retryTimer = null;
let inFlight = false;
let inFlightPromise = null;
let lastFetchAt = 0;

function buildMarketMapMetaByCode() {
  const map = new Map();

  Object.values(TAIEX_BY_CODE).forEach((item) => {
    map.set(item.code, { ...item });
  });

  Object.values(TW50_BY_CODE).forEach((item) => {
    const existing = map.get(item.code) || {};
    map.set(item.code, {
      ...existing,
      code: item.code,
      name: item.name || existing.name,
      weightPct: existing.weightPct ?? item.weightPct,
      tw50WeightPct: item.weightPct,
      tw50Major: item.majorGroup,
      isIn0050: true
    });
  });

  Object.values(MID100_BY_CODE).forEach((item) => {
    const existing = map.get(item.code) || {};
    map.set(item.code, {
      ...existing,
      code: item.code,
      name: item.name || existing.name,
      weightPct: existing.weightPct ?? item.weightPct,
      mid100WeightPct: item.weightPct,
      mid100Major: item.majorGroup,
      isInMid100: true
    });
  });

  return Object.fromEntries(map);
}

// yahooProxyUrl: builds a URL against the local/dev proxy instead of the Yahoo origin.
function yahooProxyUrl(endpoint) {
  const base = globalThis.window?.YAHOO_PROXY_BASE || globalThis.YAHOO_PROXY_BASE || DEFAULT_PROXY_BASE;
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return new URL(endpoint, normalized);
}

function pushSparkline(values, price, maxLen = 30) {
  const next = Array.isArray(values) ? [...values, price] : [price];
  if (next.length > maxLen) next.splice(0, next.length - maxLen);
  return next;
}

function isFreshChartTaiex(taiex, ttlMs = LIVE_TTL_MS) {
  return taiex?.source === 'chart' && Number.isFinite(taiex.sourceUpdatedAt) && Date.now() - taiex.sourceUpdatedAt < ttlMs;
}

// mapYahooTaiexQuote: converts Yahoo quote fields into the store.taiex shape used by Page1.
function mapYahooTaiexQuote(raw, previous) {
  const price = Number(raw.regularMarketPrice);
  const prevClose = Number(raw.regularMarketPreviousClose);
  const open = Number(raw.regularMarketOpen);
  const high = Number(raw.regularMarketDayHigh);
  const low = Number(raw.regularMarketDayLow);
  const volume = Number(raw.regularMarketVolume);
  const rawChange = Number(raw.regularMarketChange);
  const rawChangePct = Number(raw.regularMarketChangePercent);
  const calculatedChange = Number.isFinite(price) && Number.isFinite(prevClose) ? price - prevClose : null;
  const change = Number.isFinite(rawChange) ? rawChange : calculatedChange;
  const changePct = Number.isFinite(rawChangePct) ? rawChangePct : (
    Number.isFinite(change) && Number.isFinite(prevClose) && prevClose !== 0 ? (change / prevClose) * 100 : previous.changePct
  );

  if (!Number.isFinite(price)) return null;

  return {
    ...previous,
    price: +price.toFixed(2),
    prevClose: Number.isFinite(prevClose) ? +prevClose.toFixed(2) : previous.prevClose,
    open: Number.isFinite(open) ? +open.toFixed(2) : previous.open,
    high: Number.isFinite(high) ? +high.toFixed(2) : Math.max(previous.high || price, price),
    low: Number.isFinite(low) ? +low.toFixed(2) : Math.min(previous.low || price, price),
    change: Number.isFinite(change) ? +change.toFixed(2) : previous.change,
    changePct: Number.isFinite(changePct) ? +changePct.toFixed(2) : previous.changePct,
    volume: Number.isFinite(volume) ? volume : previous.volume,
    source: 'yahoo',
    sourceSymbol: YAHOO_TAIEX_SYMBOL,
    sourceUpdatedAt: Date.now(),
    marketTime: Number.isFinite(Number(raw.regularMarketTime)) ? Number(raw.regularMarketTime) : previous.marketTime
  };
}

function mapYahooStockQuote(raw, previous) {
  const price = Number(raw.regularMarketPrice);
  if (!Number.isFinite(price)) return null;

  const prevClose = Number(raw.regularMarketPreviousClose);
  const open = Number(raw.regularMarketOpen);
  const high = Number(raw.regularMarketDayHigh);
  const low = Number(raw.regularMarketDayLow);
  const rawChange = Number(raw.regularMarketChange);
  const rawChangePct = Number(raw.regularMarketChangePercent);
  const calculatedChange = Number.isFinite(prevClose) ? price - prevClose : null;
  const change = Number.isFinite(rawChange) ? rawChange : calculatedChange;
  const changePct = Number.isFinite(rawChangePct) ? rawChangePct : (
    Number.isFinite(change) && Number.isFinite(prevClose) && prevClose !== 0 ? (change / prevClose) * 100 : previous.changePct
  );
  const volume = Number(raw.regularMarketVolume);

  return {
    ...previous,
    price: +price.toFixed(2),
    prevClose: Number.isFinite(prevClose) ? +prevClose.toFixed(2) : previous.prevClose,
    open: Number.isFinite(open) ? +open.toFixed(2) : previous.open,
    high: Number.isFinite(high) ? +high.toFixed(2) : previous.high,
    low: Number.isFinite(low) ? +low.toFixed(2) : previous.low,
    change: Number.isFinite(change) ? +change.toFixed(2) : previous.change,
    changePct: Number.isFinite(changePct) ? +changePct.toFixed(2) : previous.changePct,
    volume: Number.isFinite(volume) ? volume : previous.volume,
    sparkline: pushSparkline(previous.sparkline, +price.toFixed(2)),
    source: 'yahoo',
    sourceUpdatedAt: Date.now()
  };
}

function mapYahooMarketMapQuote(raw, previous, meta) {
  if (!raw) return null;
  const price = Number(raw.regularMarketPrice);
  if (!Number.isFinite(price)) return null;

  const prevClose = Number(raw.regularMarketPreviousClose);
  const open = Number(raw.regularMarketOpen);
  const high = Number(raw.regularMarketDayHigh);
  const low = Number(raw.regularMarketDayLow);
  const rawChangePct = Number(raw.regularMarketChangePercent);
  const changePct = Number.isFinite(rawChangePct)
    ? rawChangePct
    : (Number.isFinite(prevClose) && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : previous.changePct);
  const volume = Number(raw.regularMarketVolume);
  const avgVolume = Number(raw.averageDailyVolume10Day || raw.averageDailyVolume3Month);

  return {
    ...previous,
    code: meta.code,
    name: meta.name || previous.name,
    sector: previous.sector || meta.yahooSector || meta.sector,
    subSector: previous.subSector || meta.sector,
    marketCap: previous.marketCap || Math.max((meta.weightPct || 0.01) * 100, 1),
    taiexWeightPct: meta.weightPct,
    taiexSector: meta.sector,
    yahooSector: meta.yahooSector,
    tw50WeightPct: meta.tw50WeightPct ?? previous.tw50WeightPct,
    tw50Major: meta.tw50Major ?? previous.tw50Major,
    isIn0050: meta.isIn0050 ?? previous.isIn0050,
    mid100WeightPct: meta.mid100WeightPct ?? previous.mid100WeightPct,
    mid100Major: meta.mid100Major ?? previous.mid100Major,
    isInMid100: meta.isInMid100 ?? previous.isInMid100,
    price: +price.toFixed(2),
    prevClose: Number.isFinite(prevClose) ? +prevClose.toFixed(2) : previous.prevClose,
    open: Number.isFinite(open) ? +open.toFixed(2) : previous.open,
    high: Number.isFinite(high) ? +high.toFixed(2) : previous.high,
    low: Number.isFinite(low) ? +low.toFixed(2) : previous.low,
    changePct: Number.isFinite(changePct) ? +changePct.toFixed(2) : previous.changePct,
    change5d: null,
    volume: Number.isFinite(volume) ? volume : previous.volume,
    volRatio: Number.isFinite(volume) && Number.isFinite(avgVolume) && avgVolume > 0
      ? +(volume / avgVolume).toFixed(2)
      : (Number.isFinite(previous.volRatio) ? previous.volRatio : 1),
    source: 'yahoo',
    sourceUpdatedAt: Date.now()
  };
}

function updateTopStocksFromQuotes(rawMap) {
  const topStocks = store.get('topStocks');
  let changed = false;
  const next = topStocks.map((stock) => {
    const raw = rawMap.get(`${stock.code}.TW`);
    if (!raw) return stock;
    const mapped = mapYahooStockQuote(raw, stock);
    if (!mapped) return stock;
    changed = true;
    return mapped;
  });
  if (changed) store.set('topStocks', next);
}

function updateMarketMapFromQuotes(rawMap) {
  const previousRows = store.get('marketMap') || [];
  const previousByCode = new Map(previousRows.map((row) => [String(row.code), row]));
  let changed = false;

  const next = Object.values(MARKET_MAP_META_BY_CODE)
    .sort((a, b) => (b.weightPct || 0) - (a.weightPct || 0))
    .map((meta) => {
      const previous = previousByCode.get(meta.code) || {
        code: meta.code,
        name: meta.name,
        sector: meta.yahooSector || meta.sector,
        subSector: meta.sector,
        marketCap: Math.max((meta.weightPct || 0.01) * 100, 1),
        taiexWeightPct: meta.weightPct,
        taiexSector: meta.sector,
        yahooSector: meta.yahooSector,
        tw50WeightPct: meta.tw50WeightPct,
        tw50Major: meta.tw50Major,
        isIn0050: meta.isIn0050,
        mid100WeightPct: meta.mid100WeightPct,
        mid100Major: meta.mid100Major,
        isInMid100: meta.isInMid100,
        changePct: 0,
        change5d: 0,
        volume: null,
        volRatio: 1
      };
      const mapped = mapYahooMarketMapQuote(rawMap.get(`${meta.code}.TW`), previous, meta);
      if (mapped) changed = true;
      return mapped || previous;
    });

  if (changed) store.set('marketMap', next);
}

async function fetchYahooQuoteChunk(symbols) {
  const url = yahooProxyUrl('yahoo-quote');
  url.searchParams.set('symbols', symbols.join(','));
  url.searchParams.set('_ts', String(Date.now()));

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Yahoo Page1 quotes HTTP ${response.status}`);

  const payload = await response.json();
  const rows = payload?.quoteResponse?.result;
  if (!Array.isArray(rows)) throw new Error('Yahoo Page1 quotes response is empty');
  return rows;
}

// fetchYahooQuotes: performs proxy-backed Yahoo quote requests for the shared dashboard symbols.
async function fetchYahooQuotes() {
  const symbols = [...new Set([YAHOO_TAIEX_SYMBOL, ...PAGE1_STOCK_SYMBOLS, ...PAGE6_MARKET_MAP_SYMBOLS])];
  const chunks = [];
  const rawMap = new Map();
  const errors = [];

  for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_REQUEST) {
    chunks.push(symbols.slice(i, i + MAX_SYMBOLS_PER_REQUEST));
  }

  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor];
      cursor += 1;
      try {
        const rows = await fetchYahooQuoteChunk(chunk);
        rows.forEach((raw) => {
          if (raw?.symbol) rawMap.set(raw.symbol, raw);
        });
      } catch (error) {
        errors.push(error);
      }
    }
  }

  const workerCount = Math.min(QUOTE_CHUNK_CONCURRENCY, chunks.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (!rawMap.size && errors.length) throw errors[0];
  return rawMap;
}

// updateYahooTaiexOnce: guarded single update; skips duplicate concurrent requests.
export async function updateYahooTaiexOnce({ force = false } = {}) {
  if (getDashboardDataSource() !== 'yahoo') return false;
  if (inFlight) return force && inFlightPromise ? inFlightPromise : false;
  const now = Date.now();
  if (!force && now - lastFetchAt < DEFAULT_POLL_MS - 500) return false;

  inFlight = true;
  inFlightPromise = (async () => {
    const rawMap = await fetchYahooQuotes();
    updateTopStocksFromQuotes(rawMap);
    updateMarketMapFromQuotes(rawMap);

    const previous = store.get('taiex');
    if (!isFreshChartTaiex(previous)) {
      const raw = rawMap.get(YAHOO_TAIEX_SYMBOL);
      const next = raw ? mapYahooTaiexQuote(raw, previous) : null;
      if (next) store.set('taiex', next);
    }

    lastFetchAt = now;
    return true;
  })();

  try {
    return await inFlightPromise;
  } finally {
    inFlight = false;
    inFlightPromise = null;
  }
}

// scheduleRetry: backs off after errors so repeated failures do not hammer Yahoo.
function scheduleRetry(pollMs) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    updateYahooTaiexOnce({ force: true }).catch((error) => {
      console.warn('[yahooTaiexPoller] retry failed:', error);
      scheduleRetry(pollMs);
    });
  }, Math.max(ERROR_RETRY_MS, pollMs));
}

// startYahooTaiexPoller: starts the 10-second quote polling loop.
export function startYahooTaiexPoller({ pollMs = DEFAULT_POLL_MS } = {}) {
  if (timer) return;

  updateYahooTaiexOnce({ force: true }).catch((error) => {
    console.warn('[yahooTaiexPoller] initial fetch failed:', error);
    scheduleRetry(pollMs);
  });

  timer = setInterval(() => {
    updateYahooTaiexOnce().catch((error) => {
      console.warn('[yahooTaiexPoller] fetch failed:', error);
      scheduleRetry(pollMs);
    });
  }, pollMs);
}

// stopYahooTaiexPoller: clears timers when the dashboard is torn down.
export function stopYahooTaiexPoller() {
  if (timer) clearInterval(timer);
  if (retryTimer) clearTimeout(retryTimer);
  timer = null;
  retryTimer = null;
  inFlight = false;
}

// hasFreshYahooTaiex: used by the simulator to avoid overwriting recent live data.
export function hasFreshYahooTaiex(taiex, ttlMs = LIVE_TTL_MS) {
  return (taiex?.source === 'yahoo' || taiex?.source === 'chart') && Number.isFinite(taiex.sourceUpdatedAt) && Date.now() - taiex.sourceUpdatedAt < ttlMs;
}
