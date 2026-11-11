// 市場寬度（Page2 市場概況）：上市、上櫃普通股的漲跌／漲跌停家數、盤中創 N 日高低家數、站上週月季線與多頭排列家數。
// 名單：上市取證交所盤後資料（store twseDaily）、上櫃取櫃買中心每日收盤行情；即時價走 Yahoo 報價；歷史收盤走 Yahoo spark（一天抓一次）。
// summarizeBreadth 是純函式（tests/ 直接測）；refresh 由 marketFeed 決定何時呼叫。
import { trackedFetch } from './serviceHealth.js';
import { fetchYahooQuotes, mapYahooQuoteFields, yahooProxyUrl } from './yahooApi.js';
import { dateKeyFromUnix } from './marketSources.js';

export const HIGH_LOW_DAYS = [5, 10, 20, 60, 120, 240];
export const MA_DAYS = { week: 5, month: 20, quarter: 60 };
const SPARK_SYMBOLS_PER_REQUEST = 200;

// 台股升降單位：漲跌停價要落在跳動單位上（漲停往下取、跌停往上取）。
function tickOf(price) {
  if (price < 10) return 0.01;
  if (price < 50) return 0.05;
  if (price < 100) return 0.1;
  if (price < 500) return 0.5;
  if (price < 1000) return 1;
  return 5;
}

export function limitPrices(prevClose) {
  const up = prevClose * 1.1;
  const down = prevClose * 0.9;
  const upTick = tickOf(up);
  const downTick = tickOf(down);
  return {
    up: +(Math.floor(up / upTick + 1e-9) * upTick).toFixed(2),
    down: +(Math.ceil(down / downTick - 1e-9) * downTick).toFixed(2)
  };
}

const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

// stocks: [{ price, prevClose, closes(不含今天，由舊到新) }] → 一個市場的統計。
export function summarizeBreadth(stocks) {
  const result = {
    total: 0, up: 0, down: 0, flat: 0, limitUp: 0, limitDown: 0,
    newHigh: Object.fromEntries(HIGH_LOW_DAYS.map((n) => [n, 0])),
    newLow: Object.fromEntries(HIGH_LOW_DAYS.map((n) => [n, 0])),
    above: { week: 0, month: 0, quarter: 0 }, bullish: 0, withHistory: 0
  };
  stocks.forEach(({ price, prevClose, closes = [] }) => {
    if (!(price > 0) || !(prevClose > 0)) return;
    result.total += 1;
    if (price > prevClose) result.up += 1;
    else if (price < prevClose) result.down += 1;
    else result.flat += 1;
    const limits = limitPrices(prevClose);
    if (price >= limits.up) result.limitUp += 1;
    if (price <= limits.down) result.limitDown += 1;
    if (closes.length < MA_DAYS.week) return;
    result.withHistory += 1;
    HIGH_LOW_DAYS.forEach((n) => {
      if (closes.length < n) return;
      const window = closes.slice(-n);
      if (price > Math.max(...window)) result.newHigh[n] += 1;
      if (price < Math.min(...window)) result.newLow[n] += 1;
    });
    // 均線含今天的現價。
    const series = [...closes, price];
    const ma = Object.fromEntries(Object.entries(MA_DAYS).map(([key, n]) => [key, series.length >= n ? average(series.slice(-n)) : null]));
    Object.keys(MA_DAYS).forEach((key) => { if (ma[key] != null && price > ma[key]) result.above[key] += 1; });
    if (ma.quarter != null && price > ma.week && ma.week > ma.month && ma.month > ma.quarter) result.bullish += 1;
  });
  return result;
}

async function fetchProxy(endpoint, params, timeout) {
  const url = yahooProxyUrl(endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await trackedFetch('proxy', url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
  return response.json();
}

// 上櫃普通股代碼（代理已濾掉權證、ETF）。
export const fetchOtcCodes = async () => (await fetchProxy('tpex-daily', {}, 30000)).map((row) => row.SecuritiesCompanyCode);

// { 代號: 收盤陣列（不含 today，由舊到新） }；代理那邊每批快取 6 小時。
export async function fetchCloseHistory(symbols, today) {
  const result = {};
  for (let i = 0; i < symbols.length; i += SPARK_SYMBOLS_PER_REQUEST) {
    const json = await fetchProxy('yahoo-spark', { symbols: symbols.slice(i, i + SPARK_SYMBOLS_PER_REQUEST).join(','), range: '1y' }, 120000);
    Object.entries(json).forEach(([symbol, { t, c }]) => {
      result[symbol] = t.flatMap((time, index) => (c[index] != null && dateKeyFromUnix(time) < today ? [c[index]] : []));
    });
  }
  return result;
}

// 即時報價：{ 代號: { price, prevClose } }（一次最多 200 檔一批）。
export async function fetchLiveQuotes(symbols) {
  const raw = await fetchYahooQuotes(symbols, 4);
  return Object.fromEntries([...raw.entries()].flatMap(([symbol, row]) => {
    const fields = mapYahooQuoteFields(row);
    return fields ? [[symbol, { price: fields.price, prevClose: fields.prevClose }]] : [];
  }));
}
