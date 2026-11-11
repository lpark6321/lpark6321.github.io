// Page8 籌碼監控的盤後資料（「公開資料」經本機代理）：三大法人上市買賣金額、大盤成交金額、期貨未平倉（大／小／微台）、
// 三大法人期貨與選擇權未平倉、Put/Call Ratio。組表的都是純函式（tests/ 直接測）；fetch* 經代理取資料。
import { loadSetting, saveSetting } from '../data/storage.js';
import { trackedFetch } from './serviceHealth.js';
import { yahooProxyUrl } from './yahooApi.js';

// ---- 盤後資料存本機（代理的 bridges/.cache/）：依資料群組在「⋯」選單勾選，預設都不存 ----

export const DISK_CACHE_GROUPS = {
  futures: '期貨日 K／未平倉',
  institutional: '三大法人期貨／選擇權',
  twse: '證交所法人買賣／成交金額'
};
export const diskCacheEnabled = (group) => Boolean(loadSetting('diskCache', {})?.[group]);
export const setDiskCache = (group, on) => saveSetting('diskCache', { ...loadSetting('diskCache', {}), [group]: Boolean(on) });

export async function fetchProxy(endpoint, params = {}, { disk, timeout = 60000 } = {}) {
  const url = yahooProxyUrl(endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  if (disk && diskCacheEnabled(disk)) url.searchParams.set('disk', '1');
  const response = await trackedFetch('proxy', url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
  return response.json();
}

// ---- 天數與商品 ----

export const CHIP_DAYS = [20, 60];
// 小台 1 點 50 元、微台 1 點 10 元：換算成大台（1 點 200 元）的口數。
export const FUTURES_PRODUCTS = [
  { id: 'TX', inst: 'TXF', label: '大台', ratio: 1 },
  { id: 'MTX', inst: 'MXF', label: '小台', ratio: 1 / 4 },
  { id: 'TMF', inst: 'TMF', label: '微台', ratio: 1 / 20 }
];
export const IDENTITIES = { foreign: '外資', trust: '投信', dealer: '自營商' };
const monthsFor = (days) => (days > 20 ? 4 : 2);

// ---- 組表 ----

// 現貨買賣超（元）→ [{ date, foreign, trust, dealer, total }]（億元）。
export const buildSpotFlows = (rows) => (rows || []).map(([date, ...values]) => {
  const [foreign, trust, dealer, total] = values.map((value) => value / 1e8);
  return { date, foreign, trust, dealer, total };
});

// 全市場未平倉 [日期, 商品, 口數] → [{ date, TX, MTX, TMF, total(大台約當) }]，缺任一商品的日期不列。
export function buildOpenInterest(rows) {
  const byDate = new Map();
  (rows || []).forEach(([date, product, oi]) => byDate.set(date, { ...byDate.get(date), date, [product]: oi }));
  return [...byDate.values()]
    .filter((row) => FUTURES_PRODUCTS.every((p) => Number.isFinite(row[p.id])))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ ...row, total: FUTURES_PRODUCTS.reduce((sum, p) => sum + row[p.id] * p.ratio, 0) }));
}

// 三大法人期貨淨未平倉：{ TXF: rows, MXF: rows, TMF: rows }（代理 taifex-inst 的列）→
// [{ date, foreign: { TX, MTX, TMF, total }, trust: {...}, dealer: {...} }]，三種商品都有的日期才列。
export function buildInstitutionalOI(byCommodity) {
  const byDate = new Map();
  FUTURES_PRODUCTS.forEach((p) => (byCommodity?.[p.inst] || []).forEach(([date, identity, , , netOI]) => {
    const row = byDate.get(date) || { date, count: 0 };
    row[identity] = { ...row[identity], [p.id]: netOI };
    byDate.set(date, row);
  }));
  return [...byDate.values()]
    .filter((row) => Object.keys(IDENTITIES).every((id) => FUTURES_PRODUCTS.every((p) => Number.isFinite(row[id]?.[p.id]))))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, ...rest }) => ({
      date,
      ...Object.fromEntries(Object.keys(IDENTITIES).map((id) => [id, { ...rest[id], total: FUTURES_PRODUCTS.reduce((sum, p) => sum + rest[id][p.id] * p.ratio, 0) }]))
    }));
}

// 三大法人選擇權 [日期, call|put, 身份, 買方未平倉, 賣方未平倉, 淨口數, 淨額(千元)] →
// [{ date, foreign: { call, put, callAmt, putAmt }, ... }]（金額換成億元）。
export function buildOptionInstitutional(rows) {
  const byDate = new Map();
  (rows || []).forEach(([date, side, identity, , , net, amount]) => {
    const row = byDate.get(date) || { date };
    row[identity] = { ...row[identity], [side]: net, [`${side}Amt`]: amount / 1e5 };
    byDate.set(date, row);
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// P/C Ratio [日期, 賣權量, 買權量, 量比%, 賣權未平倉, 買權未平倉, 未平倉比%] → [{ date, volRatio, oiRatio, putOI, callOI }]。
export const buildPcRatio = (rows) => (rows || []).map(([date, , , volRatio, putOI, callOI, oiRatio]) => ({ date, volRatio, oiRatio, putOI, callOI }));

// 某欄位的最後一筆與前一筆的差：{ value, change, date }；沒有資料回傳 null。
export function lastWithChange(rows, pick) {
  const last = rows?.at(-1);
  if (!last) return null;
  const prev = rows.length > 1 ? pick(rows.at(-2)) : null;
  const value = pick(last);
  return { value, change: Number.isFinite(prev) ? value - prev : null, date: last.date };
}

// 加權每分鐘成交金額（百萬元，MIS）→ 累計（億元）[{ minute(台北當日分鐘), amountYi }]。
export function cumulativeMinutes(candles) {
  let sum = 0;
  return (candles || []).map((row) => {
    sum += Number(row.volume) || 0;
    return { minute: Math.floor(((row.time + 8 * 3600) % 86400) / 60), amountYi: sum / 100 };
  });
}

// ---- 取資料 ----

export async function fetchChipMonitor(days) {
  const months = monthsFor(days);
  const institutional = { disk: 'institutional' };
  // 證交所有頻率限制、期交所逐月請求：依序抓，不同時打太多請求。
  const spot = await fetchProxy('twse-inst-amount', { days }, { disk: 'twse', timeout: 120000 });
  const oi = await fetchProxy('taifex-oi', { months }, { disk: 'futures' });
  const inst = {};
  for (const p of FUTURES_PRODUCTS) inst[p.inst] = await fetchProxy('taifex-inst', { days: Math.max(30, Math.ceil(days * 1.6)), commodity: p.inst }, institutional);
  const optInst = await fetchProxy('taifex-opt-inst', { months }, institutional);
  const pcRatio = await fetchProxy('taifex-pc-ratio', { months }, institutional);
  const amounts = await fetchProxy('twse-market-amount', { months }, { disk: 'twse' });
  const lastN = (rows) => rows.slice(-days);
  return {
    days,
    spot: lastN(buildSpotFlows(spot)),
    openInterest: lastN(buildOpenInterest(oi)),
    institutional: lastN(buildInstitutionalOI(inst)),
    options: lastN(buildOptionInstitutional(optInst)),
    pcRatio: lastN(buildPcRatio(pcRatio)),
    // 20 日均量要多留 20 天。
    amounts: amounts.slice(-(days + 20)).map(([date, amount]) => ({ date, amountYi: amount / 1e8 }))
  };
}

// 前一個交易日的盤中累計成交金額（證交所 MI_5MINS）：[{ minute, amountYi }]。
export const fetchIntradayAmount = async (date) => (await fetchProxy('twse-intraday-amount', { date }, { disk: 'twse' }))
  .map(([minute, amount]) => ({ minute, amountYi: amount / 100 }));
