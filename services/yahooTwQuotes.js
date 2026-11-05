// Yahoo 台股報價：一次抓加權指數、十大權值股、市場地圖成分股與自選股，寫進 store。何時抓由 marketFeed 決定。
import { store } from '../data/store.js';
import { MARKET_UNIVERSE, UNIVERSE_BY_CODE } from '../data/marketUniverse.js';
import { getDashboardDataSource, withVolumeEstimate } from './dashboardDataSource.js';
import { isTwQuoteSession } from './marketCalendar.js';
import { TOP10_CODES } from './quoteUtils.js';
import { fetchYahooQuotes, mapYahooQuoteFields, yahooNumber } from './yahooApi.js';

const YAHOO_TAIEX_SYMBOL = '^TWII';
const BASE_SYMBOLS = [...new Set([YAHOO_TAIEX_SYMBOL, ...TOP10_CODES.map((code) => `${code}.TW`), ...MARKET_UNIVERSE.map((stock) => `${stock.code}.TW`)])];
const SPARKLINE_MAX = 30;

let inFlightPromise = null;

// 名單外的自選股（可能是上櫃股），上市 .TW 與上櫃 .TWO 都問，哪個有回就用哪個。
function extraWatchCodes() {
  return [...new Set(store.get('watchlist').map((row) => row.code))].filter((code) => !UNIVERSE_BY_CODE[code]);
}

function mapYahooTaiexQuote(raw, base) {
  const fields = mapYahooQuoteFields(raw, base);
  if (!fields) return null;
  const marketTime = yahooNumber(raw.regularMarketTime);
  return {
    ...base,
    ...fields,
    high: Math.max(fields.high || fields.price, fields.price),
    low: Math.min(fields.low || fields.price, fields.price),
    source: 'yahoo',
    sourceSymbol: YAHOO_TAIEX_SYMBOL,
    sourceUpdatedAt: Date.now(),
    marketTime: Number.isFinite(marketTime) ? marketTime : base.marketTime
  };
}

function mapYahooStockQuote(raw, previous) {
  const fields = mapYahooQuoteFields(raw, previous);
  if (!fields) return null;
  const history = previous.sparkline || [];
  return {
    ...previous,
    ...fields,
    sparkline: [...history, fields.price].slice(-SPARKLINE_MAX),
    source: 'yahoo',
    sourceUpdatedAt: Date.now()
  };
}

// 量比 = 今日量 ÷ 近 10 日（沒有就 3 個月）均量；算不出來是 null，不填假的 1 倍。
function mapYahooMarketQuote(raw, previous) {
  const fields = raw ? mapYahooQuoteFields(raw, previous) : null;
  if (!fields) return null;
  const avgVolume = yahooNumber(raw.averageDailyVolume10Day || raw.averageDailyVolume3Month);
  return {
    ...previous,
    ...fields,
    volRatio: Number.isFinite(fields.volume) && avgVolume > 0 ? +(fields.volume / avgVolume).toFixed(2) : null,
    source: 'yahoo',
    sourceUpdatedAt: Date.now()
  };
}

function updateTopStocksFromQuotes(rawMap) {
  const topStocks = store.get('topStocks');
  let changed = false;
  const next = topStocks.map((stock) => {
    const mapped = mapYahooStockQuote(rawMap.get(`${stock.code}.TW`), stock);
    if (!mapped) return stock;
    changed = true;
    return mapped;
  });
  if (changed) store.set('topStocks', next);
}

// marketMap 只有這裡會寫：名單每檔一列，Yahoo 沒回的代碼保留上一筆（第一次是沒有 source、沒有報價的名單列）。
function updateMarketMapFromQuotes(rawMap) {
  const previousByCode = new Map((store.get('marketMap') || []).map((row) => [String(row.code), row]));
  let changed = false;
  const next = MARKET_UNIVERSE.map((stock) => {
    const previous = previousByCode.get(stock.code) || { ...stock };
    const mapped = mapYahooMarketQuote(rawMap.get(`${stock.code}.TW`), previous);
    if (mapped) changed = true;
    return mapped || previous;
  });
  if (changed) store.set('marketMap', next);
}

function updateWatchQuotesFromQuotes(rawMap, codes) {
  if (!codes.length) return;
  const previous = store.get('watchQuotes');
  const next = {};
  codes.forEach((code) => {
    const raw = rawMap.get(`${code}.TW`) || rawMap.get(`${code}.TWO`);
    const mapped = mapYahooMarketQuote(raw, previous[code] || { code });
    if (mapped) next[code] = { ...mapped, name: mapped.name || raw.shortName || '' };
  });
  store.set('watchQuotes', next);
}

// 上一輪還沒回來就不重複發請求。週一至週五 09:00–13:35（台北）以外只有 force（啟動、切換來源、手動更新）才抓。
export async function updateYahooTwQuotes({ force = false } = {}) {
  if (getDashboardDataSource() !== 'yahoo') return false;
  if (inFlightPromise) return force ? inFlightPromise : false;
  if (!force && !isTwQuoteSession()) return false;

  inFlightPromise = (async () => {
    const extraCodes = extraWatchCodes();
    const symbols = [...BASE_SYMBOLS, ...extraCodes.flatMap((code) => [`${code}.TW`, `${code}.TWO`])];
    const rawMap = await fetchYahooQuotes(symbols);
    // 請求期間使用者可能已切換資料來源；不能讓晚到的 Yahoo 資料蓋掉新來源。
    if (getDashboardDataSource() !== 'yahoo') return false;
    updateTopStocksFromQuotes(rawMap);
    updateMarketMapFromQuotes(rawMap);
    updateWatchQuotesFromQuotes(rawMap, extraCodes);

    const raw = rawMap.get(YAHOO_TAIEX_SYMBOL);
    const next = raw ? mapYahooTaiexQuote(raw, store.get('taiex')) : null;
    // Yahoo 的 ^TWII 成交量是 0，算不出預估量時清成 null，畫面顯示「--」而不是舊值。
    if (next) store.set('taiex', withVolumeEstimate(next));
    return true;
  })();

  try {
    return await inFlightPromise;
  } finally {
    inFlightPromise = null;
  }
}
