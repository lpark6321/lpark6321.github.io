// 各頁共用的報價小工具：權值股清單、依代碼找報價、股名查詢、數字格式、漲跌上色。
import { store } from '../data/store.js';
import { universeName } from '../data/marketUniverse.js';
import { TAIEX_TOP10 } from '../data/taiexWeightedConstituents.js';

// 十大權值股代碼（依加權權重排序）。
export const TOP10_CODES = TAIEX_TOP10.map((row) => row.code);

// ---- 數字格式：沒有有效數值一律顯示「--」 ----

// null、空字串、NaN 都算沒有值（Number(null) 是 0，要先排除）。
export function hasValue(value) {
  return value != null && value !== '' && Number.isFinite(Number(value));
}

export function orDash(value) {
  return hasValue(value) ? value : '--';
}

// 千分位、固定小數位數。
export function fmtNum(value, digits = 2) {
  if (!hasValue(value)) return '--';
  return Number(value).toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// 帶正負號的百分比，例如 +1.23%。
export function fmtPct(value, digits = 2) {
  if (!hasValue(value)) return '--';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(digits)}%`;
}

// 漲紅跌綠，平盤或無資料不上色。
export function trendClass(value) {
  return value > 0 ? 'metric-up' : value < 0 ? 'metric-down' : '';
}

export function pctFromPrevClose(value, prevClose) {
  const price = Number(value);
  const base = Number(prevClose);
  if (!Number.isFinite(price) || !Number.isFinite(base) || base === 0) return null;
  return ((price - base) / base) * 100;
}

// ---- 依代碼找報價 ----

// marketMap 裡 Yahoo 真的回過報價的列，依代碼索引；還沒有報價的名單列不算。
export function liveMarketMapQuotes(marketMap = store.get('marketMap')) {
  return new Map((Array.isArray(marketMap) ? marketMap : [])
    .filter((row) => row?.source === 'yahoo' && hasValue(row.changePct))
    .map((row) => [String(row.code), row]));
}

// 所有有報價的個股，依代碼索引：市場地圖 → 名單外的自選股 → 十大權值股（含走勢，同代碼時優先）。
export function liveQuoteMap() {
  const quotes = liveMarketMapQuotes();
  Object.values(store.get('watchQuotes')).forEach((row) => quotes.set(String(row.code), row));
  store.get('topStocks').filter((row) => hasValue(row.price)).forEach((row) => quotes.set(String(row.code), row));
  return quotes;
}

export function quoteByCode(code) {
  return liveQuoteMap().get(String(code)) || null;
}

// 中文股名：內建成分股名單 → 證交所全上市清單 → 空字串。
export function stockName(code) {
  return universeName(code) || store.get('twseDaily')?.rows.find((row) => row.code === code)?.name || '';
}
