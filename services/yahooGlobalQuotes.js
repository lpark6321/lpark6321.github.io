// Yahoo 全球指數（Page7）：24 小時市場，不設交易時段限制；何時抓由 marketFeed 決定。
import { store } from '../data/store.js';
import { getDashboardDataSource } from './dashboardDataSource.js';
import { fetchYahooChart, fetchYahooQuotes, mapYahooQuoteFields, yahooNumber } from './yahooApi.js';

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

let inFlightPromise = null;
let lastChartFetchAt = 0;

function digitsFor(id, value) {
  if (id === 'us10y') return 3;
  if (['eurusd', 'gbpusd', 'audusd', 'xrpusd'].includes(id)) return 4;
  if (['usdjpy', 'usdtwd'].includes(id)) return 2;
  if (Math.abs(value) < 10) return 4;
  return 2;
}

function mapYahooGlobalQuote(raw, previous, id, chartSparkline = null) {
  const fields = mapYahooQuoteFields(raw, previous, digitsFor(id, yahooNumber(raw?.regularMarketPrice)));
  if (!fields) return null;
  const hasChart = Array.isArray(chartSparkline) && chartSparkline.length > 0;
  const marketTime = yahooNumber(raw.regularMarketTime);

  return {
    ...previous,
    ...fields,
    sparkline: hasChart
      ? chartSparkline
      : (previous.sparklineSource === 'yahoo-chart' && Array.isArray(previous.sparkline) ? previous.sparkline : [fields.price]),
    sparklineSource: hasChart ? 'yahoo-chart' : previous.sparklineSource,
    source: 'yahoo',
    sourceSymbol: GLOBAL_SYMBOL_BY_ID[id],
    sourceUpdatedAt: Date.now(),
    marketTime: Number.isFinite(marketTime) ? marketTime : previous.marketTime
  };
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
        const result = await fetchYahooChart(entry.symbol, '5m', '1d');
        const sparkline = (result?.indicators?.quote?.[0]?.close || [])
          .map(yahooNumber)
          .filter(Number.isFinite);
        if (sparkline.length) sparklineById.set(entry.id, sparkline);
      } catch (error) {
        console.warn(`[yahooGlobalQuotes] chart ${entry.symbol} failed:`, error);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CHART_CONCURRENCY, entries.length) }, worker));
  return sparklineById;
}

// 走勢小圖（5 分 K）每分鐘最多重抓一次，報價每輪都抓。
export async function updateYahooGlobalQuotes({ force = false } = {}) {
  if (getDashboardDataSource() !== 'yahoo') return false;
  if (inFlightPromise) return force ? inFlightPromise : false;
  const now = Date.now();

  inFlightPromise = (async () => {
    const shouldFetchCharts = force || now - lastChartFetchAt >= CHART_SPARKLINE_TTL_MS;
    const rawMap = await fetchYahooQuotes([...new Set(Object.values(GLOBAL_SYMBOL_BY_ID))]);
    const ids = (store.get('globalIndices') || []).map((row) => row.id);
    const chartSparklineById = shouldFetchCharts ? await fetchYahooGlobalSparklines(ids) : new Map();
    // 請求期間使用者可能已切換資料來源；不能讓晚到的 Yahoo 資料蓋掉新來源。
    if (getDashboardDataSource() !== 'yahoo') return false;

    let changed = false;
    const next = (store.get('globalIndices') || []).map((row) => {
      const symbol = GLOBAL_SYMBOL_BY_ID[row.id];
      const mapped = symbol ? mapYahooGlobalQuote(rawMap.get(symbol), row, row.id, chartSparklineById.get(row.id)) : null;
      if (!mapped) return row;
      changed = true;
      return mapped;
    });

    if (changed) store.set('globalIndices', next);
    if (shouldFetchCharts) lastChartFetchAt = now;
    return changed;
  })();

  try {
    return await inFlightPromise;
  } finally {
    inFlightPromise = null;
  }
}
