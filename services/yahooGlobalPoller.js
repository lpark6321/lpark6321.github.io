import { store } from '../data/store.js';
import { getDashboardDataSource } from './dashboardDataSource.js';

const DEFAULT_PROXY_BASE = 'http://127.0.0.1:8787/api';
const DEFAULT_POLL_MS = 10000;
const MAX_SYMBOLS_PER_REQUEST = 20;
const CHART_SPARKLINE_TTL_MS = 60000;
const CHART_CONCURRENCY = 5;

const GLOBAL_SYMBOL_BY_ID = {
  kospi: '^KS11',
  nikkei: '^N225',
  nasdaq: '^IXIC',
  sox: '^SOX',
  dow: '^DJI',
  sp500: '^GSPC',
  gold: 'GC=F',
  us10y: '^TNX',
  usdtwd: 'USDTWD=X',
  wti: 'CL=F',
  vix: '^VIX',
  hsi: '^HSI',
  shanghai: '000001.SS',
  eurusd: 'EURUSD=X',
  usdjpy: 'JPY=X',
  gbpusd: 'GBPUSD=X',
  audusd: 'AUDUSD=X',
  btcusd: 'BTC-USD',
  ethusd: 'ETH-USD',
  solusd: 'SOL-USD',
  xrpusd: 'XRP-USD'
};

let timer = null;
let inFlight = false;
let inFlightPromise = null;
let lastFetchAt = 0;
let lastChartFetchAt = 0;

function yahooProxyUrl(endpoint) {
  const base = globalThis.window?.YAHOO_PROXY_BASE || globalThis.YAHOO_PROXY_BASE || DEFAULT_PROXY_BASE;
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return new URL(endpoint, normalized);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  return +value.toFixed(digits);
}

function digitsFor(id, value) {
  if (id === 'us10y') return 3;
  if (['eurusd', 'gbpusd', 'audusd', 'xrpusd'].includes(id)) return 4;
  if (['usdjpy', 'usdtwd'].includes(id)) return 2;
  if (Math.abs(value) < 10) return 4;
  return 2;
}

function normalizeYahooValue(id, value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function mapYahooGlobalQuote(raw, previous, id, chartSparkline = null) {
  const priceValue = normalizeYahooValue(id, raw?.regularMarketPrice);
  if (!Number.isFinite(priceValue)) return null;

  const digits = digitsFor(id, priceValue);
  const prevCloseValue = normalizeYahooValue(id, raw.regularMarketPreviousClose);
  const openValue = normalizeYahooValue(id, raw.regularMarketOpen);
  const highValue = normalizeYahooValue(id, raw.regularMarketDayHigh);
  const lowValue = normalizeYahooValue(id, raw.regularMarketDayLow);
  const rawChangeValue = normalizeYahooValue(id, raw.regularMarketChange);
  const changeValue = Number.isFinite(rawChangeValue)
    ? rawChangeValue
    : (Number.isFinite(prevCloseValue) ? priceValue - prevCloseValue : null);
  const rawChangePct = Number(raw.regularMarketChangePercent);
  const changePctValue = Number.isFinite(rawChangePct)
    ? rawChangePct
    : (Number.isFinite(changeValue) && Number.isFinite(prevCloseValue) && prevCloseValue !== 0
      ? (changeValue / prevCloseValue) * 100
      : previous.changePct);

  const price = round(priceValue, digits);

  return {
    ...previous,
    price,
    prevClose: Number.isFinite(prevCloseValue) ? round(prevCloseValue, digits) : previous.prevClose,
    open: Number.isFinite(openValue) ? round(openValue, digits) : previous.open,
    high: Number.isFinite(highValue) ? round(highValue, digits) : previous.high,
    low: Number.isFinite(lowValue) ? round(lowValue, digits) : previous.low,
    change: Number.isFinite(changeValue) ? round(changeValue, digits) : previous.change,
    changePct: Number.isFinite(changePctValue) ? round(changePctValue, 2) : previous.changePct,
    sparkline: Array.isArray(chartSparkline) && chartSparkline.length
      ? chartSparkline
      : (previous.sparklineSource === 'yahoo-chart' && Array.isArray(previous.sparkline) ? previous.sparkline : [price]),
    sparklineSource: Array.isArray(chartSparkline) && chartSparkline.length ? 'yahoo-chart' : previous.sparklineSource,
    source: 'yahoo',
    sourceSymbol: GLOBAL_SYMBOL_BY_ID[id],
    sourceUpdatedAt: Date.now(),
    marketTime: Number.isFinite(Number(raw.regularMarketTime)) ? Number(raw.regularMarketTime) : previous.marketTime
  };
}

async function fetchYahooQuoteChunk(symbols) {
  const url = yahooProxyUrl('yahoo-quote');
  url.searchParams.set('symbols', symbols.join(','));
  url.searchParams.set('_ts', String(Date.now()));

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Yahoo global quotes HTTP ${response.status}`);

  const payload = await response.json();
  const rows = payload?.quoteResponse?.result;
  if (!Array.isArray(rows)) throw new Error('Yahoo global quotes response is empty');
  return rows;
}

async function fetchYahooGlobalQuotes() {
  const symbols = [...new Set(Object.values(GLOBAL_SYMBOL_BY_ID))];
  const rawMap = new Map();
  const errors = [];

  for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_REQUEST) {
    const chunk = symbols.slice(i, i + MAX_SYMBOLS_PER_REQUEST);
    try {
      const rows = await fetchYahooQuoteChunk(chunk);
      rows.forEach((raw) => {
        if (raw?.symbol) rawMap.set(raw.symbol, raw);
      });
    } catch (error) {
      errors.push(error);
    }
  }

  if (!rawMap.size && errors.length) throw errors[0];
  return rawMap;
}

async function fetchYahooChartSparkline(symbol) {
  const url = yahooProxyUrl('yahoo-chart');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', '5m');
  url.searchParams.set('range', '1d');
  url.searchParams.set('includePrePost', 'false');
  url.searchParams.set('_ts', String(Date.now()));

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Yahoo global chart HTTP ${response.status}`);

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return closes
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

async function fetchYahooGlobalSparklines(ids) {
  const entries = ids
    .map((id) => ({ id, symbol: GLOBAL_SYMBOL_BY_ID[id] }))
    .filter((item) => item.symbol);
  const sparklineById = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      try {
        const sparkline = await fetchYahooChartSparkline(entry.symbol);
        if (sparkline.length) sparklineById.set(entry.id, sparkline);
      } catch (error) {
        console.warn(`[yahooGlobalPoller] chart ${entry.symbol} failed:`, error);
      }
    }
  }

  const workerCount = Math.min(CHART_CONCURRENCY, entries.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return sparklineById;
}

export async function updateYahooGlobalIndicesOnce({ force = false } = {}) {
  if (getDashboardDataSource() !== 'yahoo') return false;
  if (inFlight) return force && inFlightPromise ? inFlightPromise : false;
  const now = Date.now();
  if (!force && now - lastFetchAt < DEFAULT_POLL_MS - 500) return false;

  inFlight = true;
  inFlightPromise = (async () => {
    const shouldFetchCharts = force || now - lastChartFetchAt >= CHART_SPARKLINE_TTL_MS;
    const rawMap = await fetchYahooGlobalQuotes();
    const rows = store.get('globalIndices') || [];
    const chartSparklineById = shouldFetchCharts
      ? await fetchYahooGlobalSparklines(rows.map((row) => row.id))
      : new Map();
    let changed = false;
    const next = rows.map((row) => {
      const symbol = GLOBAL_SYMBOL_BY_ID[row.id];
      const mapped = symbol ? mapYahooGlobalQuote(rawMap.get(symbol), row, row.id, chartSparklineById.get(row.id)) : null;
      if (!mapped) return row;
      changed = true;
      return mapped;
    });

    if (changed) store.set('globalIndices', next);
    lastFetchAt = now;
    if (shouldFetchCharts) lastChartFetchAt = now;
    return changed;
  })();

  try {
    return await inFlightPromise;
  } finally {
    inFlight = false;
    inFlightPromise = null;
  }
}

export function startYahooGlobalIndicesPoller({ pollMs = DEFAULT_POLL_MS } = {}) {
  if (timer) return;
  updateYahooGlobalIndicesOnce({ force: true }).catch((error) => {
    console.warn('[yahooGlobalPoller] initial fetch failed:', error);
  });
  timer = setInterval(() => {
    updateYahooGlobalIndicesOnce().catch((error) => {
      console.warn('[yahooGlobalPoller] fetch failed:', error);
    });
  }, pollMs);
}

export function stopYahooGlobalIndicesPoller() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
