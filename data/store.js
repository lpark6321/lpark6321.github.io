// 全域資料 store：保存行情、篩選、自選股等狀態並提供訂閱更新。
import { TAIEX_TOP10 } from './taiexWeightedConstituents.js';
import { DEFAULT_FUTURES_CONTRACT, FUTURES_CONTRACTS } from './twDerivatives.js';
import { loadSetting, saveSetting } from './storage.js';
const listeners = new Map();

// 存在瀏覽器的 store 鍵（data/storage.js 的設定名稱與 store 鍵同名）。
const PERSISTED_KEYS = new Set(['watchlist', 'watchGroups', 'strategyLegs', 'enabledPatterns']);
const DEFAULT_PATTERNS = ['ma20_breakout', 'kd_golden_cross', 'vol_surge', 'macd_golden_cross'];

// 勾選的型態：存過就用存的（包含全部取消勾選的空陣列），沒存過用預設。
function loadPatterns() {
  const stored = loadSetting('enabledPatterns');
  return Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : DEFAULT_PATTERNS;
}
const STOCK_CODE_RE = /^[0-9A-Z]{4,6}$/;
const DEFAULT_WATCHLIST = [
  { code: '2330', name: '台積電', group: '自選1' },
  { code: '2317', name: '鴻海', group: '自選1' },
  { code: '2603', name: '長榮', group: '自選2' },
  { code: '2330', name: '台積電', group: 'page1分組' },
  { code: '2454', name: '聯發科', group: 'page1分組' },
  { code: '2308', name: '台達電', group: 'page1分組' }
];

export function isValidStockCode(code) {
  return STOCK_CODE_RE.test(String(code ?? '').trim().toUpperCase());
}

// 自選股來自使用者輸入、匯入檔與瀏覽器儲存，一律在這裡驗證：代碼格式不符的列丟掉，同群組重複的代碼只留一筆。
export function sanitizeWatchlist(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const result = [];
  rows.forEach((row) => {
    if (!row || !isValidStockCode(row.code)) return;
    const code = String(row.code).trim().toUpperCase();
    const group = String(row.group ?? '').trim().slice(0, 40) || '自選1';
    const key = `${group}|${code}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ code, name: String(row.name ?? '').trim().slice(0, 40), group });
  });
  return result;
}

// 選擇權策略腳位：來自瀏覽器儲存與匯入檔，逐欄驗證，不合格的腳位丟掉。
export function sanitizeLegs(rows) {
  if (!Array.isArray(rows)) return [];
  const contracts = new Set(FUTURES_CONTRACTS.map((item) => item.value));
  return rows.filter((leg) => leg
    && ['call', 'put', 'future'].includes(leg.type)
    && ['buy', 'sell'].includes(leg.action)
    && Number.isFinite(Number(leg.strike))
    && Number.isInteger(Number(leg.qty)) && Number(leg.qty) >= 1
    && Number.isFinite(Number(leg.premium)) && Number(leg.premium) >= 0)
    .map((leg) => ({
      type: leg.type,
      action: leg.action,
      strike: Number(leg.strike),
      qty: Number(leg.qty),
      premium: Number(leg.premium),
      ...(leg.type === 'future' ? { contract: contracts.has(leg.contract) ? leg.contract : DEFAULT_FUTURES_CONTRACT } : {})
    }));
}

// 存過且驗證後還有資料就用存的，否則用預設。
// 自選股群組（含還沒放股票的空群組）。page1分組 是 Page1 6 區與盤中走勢用的固定群組，不能改名或刪除。
export const PAGE1_GROUP = 'page1分組';
const DEFAULT_GROUPS = [PAGE1_GROUP, '自選1', '自選2', '自選3'];

export function sanitizeGroups(rows) {
  if (!Array.isArray(rows)) return [];
  return [...new Set(rows.map((name) => String(name ?? '').trim().slice(0, 40)).filter(Boolean))];
}

// 群組順序：page1分組 → 存的群組 → 自選股裡有、但群組清單沒有的（例如匯入檔帶來的）。
export function watchGroupNames(groups = state.watchGroups, watchlist = state.watchlist) {
  return [...new Set([PAGE1_GROUP, ...groups, ...watchlist.map((row) => row.group)])];
}

function loadRows(name, sanitize, fallback) {
  const stored = sanitize(loadSetting(name));
  return stored.length ? stored : fallback;
}

// 台指選擇權月選在每月第三個星期三到期；回傳下個月那一天 'YYYY-MM-DD'。
function nextMonthlyExpiry(now = new Date()) {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const firstWednesday = 1 + ((3 - first.getUTCDay() + 7) % 7);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), firstWednesday + 14)).toISOString().slice(0, 10);
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const state = {
  // 行情一開始是空的：只有 marketFeed 從選定來源抓到的報價（或模擬資料）會寫進來，畫面在那之前顯示「--」。
  taiex: {},
  futuresDay: {},
  futuresFull: {},
  // marketFeed 寫入的盤中 1 分 K：加權指數 { source, candles }、個股走勢 { 代碼: { values, baseline } }（十大權值股與 page1分組）、
  // 目前選取個股 { code, candles }。
  taiexIntraday: null,
  stockTrends: {},
  selectedIntraday: null,
  // 名單外的自選股報價 { 代碼: quote }；Page1 統計用的日 K { label, source, candles }；Page5 證交所盤後資料 { date, rows }。
  watchQuotes: {},
  productDaily: null,
  twseDaily: null,
  // 公開資料來源（marketFeed 寫入）：三大法人持倉成本 { foreign|trust|dealer: [{ date, netOI, change, cost }] }、
  // 櫃買指數與 VIX { otc, vix }、大盤每日成交金額 [{ date, amountYi }]、市場寬度 { tse, otc }。
  institutional: null,
  indexExtras: null,
  marketAmountHistory: null,
  marketBreadth: null,
  // 目前顯示的分頁（app.js 寫入）：市場寬度、籌碼監控這種大量請求只在該頁開著時才抓。
  activePage: null,
  // Page8 籌碼監控（marketFeed 寫入，不受資料來源限制）：盤後資料 { days, spot, openInterest, institutional, options, pcRatio, amounts }、
  // 前一交易日盤中累計成交金額 { date, points: [{ minute, amountYi }] }；chipDays＝Page8 選的天數。
  chipMonitor: null,
  chipPrevIntraday: null,
  chipDays: [20, 60].includes(loadSetting('page8Days')) ? loadSetting('page8Days') : 20,
  topStocks: TAIEX_TOP10.map(({ code, name, weightPct }) => ({ code, name, weightPct })),
  watchlist: loadRows('watchlist', sanitizeWatchlist, DEFAULT_WATCHLIST),
  watchGroups: loadRows('watchGroups', sanitizeGroups, DEFAULT_GROUPS),
  selectedStock: '2330',
  enabledPatterns: loadPatterns(),
  // 型態警示由 services/patternEngine.js 依自選股日 K 與即時價計算。
  patternAlerts: [],
  // Page4 選的到期序列（contractMonth）；空字串＝最近一期。不存瀏覽器。
  optionsExpiry: '',
  // 選擇權鏈：公開資料來源由 marketFeed 寫入期交所的真資料（origin 標明來源）；其他來源是這份示範資料，
  // 到期日固定在下個月的第三個星期三，Greeks 由 Black-Scholes 算。
  optionsChain: {
    underlying: 'TX',
    spotPrice: 19850,
    expiry: nextMonthlyExpiry(),
    calls: Array.from({ length: 9 }, (_, i) => ({ strike: 19400 + i * 100, bid: Math.max(20, 220 - i * 20), ask: Math.max(25, 225 - i * 20) })),
    puts: Array.from({ length: 9 }, (_, i) => ({ strike: 19400 + i * 100, bid: Math.max(20, 60 + i * 18), ask: Math.max(25, 65 + i * 18) }))
  },
  strategyLegs: loadRows('strategyLegs', sanitizeLegs, [{ type: 'call', action: 'buy', strike: 19800, qty: 1, premium: 125 }]),
  marketMap: [],
  globalIndices: [
    { id: 'kospi', name: '韓綜', fullName: 'KOSPI', flag: '🇰🇷' },
    { id: 'nikkei', name: '日經225', fullName: 'Nikkei 225', flag: '🇯🇵' },
    { id: 'nasdaq', name: '那斯達克', fullName: 'NASDAQ', flag: '🇺🇸' },
    { id: 'sox', name: '費半', fullName: 'SOX', flag: '🇺🇸' },
    { id: 'dow', name: '道瓊', fullName: 'Dow Jones', flag: '🇺🇸' },
    { id: 'sp500', name: '標普500', fullName: 'S&P 500', flag: '🇺🇸' },
    { id: 'gold', name: '黃金', fullName: 'Gold', flag: '🟡' },
    { id: 'us10y', name: '美債10Y', fullName: 'US10Y', flag: '🇺🇸' },
    { id: 'usdtwd', name: '美元/台幣', fullName: 'USD/TWD', flag: '🇹🇼' },
    { id: 'wti', name: 'WTI原油', fullName: 'WTI Oil', flag: '🛢️' },
    { id: 'vix', name: 'VIX', fullName: 'VIX', flag: '⚠️' },
    { id: 'hsi', name: '恒生', fullName: 'HSI', flag: '🇭🇰' },
    { id: 'shanghai', name: '上證', fullName: 'Shanghai', flag: '🇨🇳' },
    { id: 'eurusd', name: '歐元/美元', fullName: 'EUR/USD', flag: '💱' },
    { id: 'usdjpy', name: '美元/日圓', fullName: 'USD/JPY', flag: '💱' },
    { id: 'gbpusd', name: '英鎊/美元', fullName: 'GBP/USD', flag: '💱' },
    { id: 'audusd', name: '澳幣/美元', fullName: 'AUD/USD', flag: '💱' },
    { id: 'btcusd', name: '比特幣', fullName: 'BTC/USD', flag: '₿' },
    { id: 'ethusd', name: '以太幣', fullName: 'ETH/USD', flag: '◆' },
    { id: 'solusd', name: 'Solana', fullName: 'SOL/USD', flag: '◎' },
    { id: 'xrpusd', name: 'XRP', fullName: 'XRP/USD', flag: '✕' }
  ]
};

function emit(key) {
  const set = listeners.get(key);
  if (!set) return;
  const value = state[key];
  // 一個訂閱者出錯不能中斷其他訂閱者，也不能讓呼叫 set() 的輪詢器跟著失敗。
  set.forEach((cb) => {
    try {
      cb(value);
    } catch (error) {
      console.error(`[store] listener for "${key}" failed:`, error);
    }
  });
}

// 初始值的快照，給 reset() 還原用。
const initialState = clone(state);

export const store = {
  set(key, value) {
    if (key === 'watchlist') value = sanitizeWatchlist(value);
    if (key === 'watchGroups') value = sanitizeGroups(value);
    if (key === 'strategyLegs') value = sanitizeLegs(value);
    if (PERSISTED_KEYS.has(key)) saveSetting(key, value);
    state[key] = value;
    emit(key);
  },
  get(key) {
    return clone(state[key]);
  },
  // 唯讀取值：直接回傳 store 裡那一份（不複製），給每個節拍要讀很多次的大資料用（市場地圖約 1000 列、證交所盤後表）。
  // 呼叫端絕對不能修改它（包括 sort、push）；要改請用 get() 拿複本。set() 一律換成新物件，所以拿到的那份不會被別人改。
  peek(key) {
    return state[key];
  },
  // 還原成初始值（例如切換資料來源時清掉上一個來源的報價）。
  reset(...keys) {
    keys.forEach((key) => this.set(key, clone(initialState[key])));
  },
  subscribe(key, callback) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(callback);
    return () => {
      const set = listeners.get(key);
      if (!set) return;
      set.delete(callback);
      if (set.size === 0) listeners.delete(key);
    };
  }
};




