// 最底層的取資料排程：跟著 feedClock 的全站節拍，依「資料來源」決定向誰拿、依「更新頻率」決定多久拿一次，結果只寫進 store。
// 頁面只訂閱 store 重畫，不自己抓資料；不在畫面上的頁面已卸載、沒有訂閱，所以不會重畫。
// 圖表要抓使用者選的商品 K 線，用 feedClock 的 subscribeFeedTick 跟著同一個節拍重抓。
import { store } from '../data/store.js';
import { TW_FUTURES_BY_LABEL, TW_FUTURES_PRODUCTS } from '../data/twDerivatives.js';
import {
  getDashboardDataSource,
  subscribeDashboardDataSource,
  withVolumeEstimate
} from './dashboardDataSource.js';
import { subscribeFeedTick, tickNow } from './feedClock.js';
import { isDailyRefreshDue, isTwFuturesDaySession, isTwFuturesNightSession, isTwQuoteSession, isTwSpotSession } from './marketCalendar.js';
import { brokerCandlesUrl, dateKeyFromUnix, fetchBrokerCandles, fetchBrokerQuote, fetchYahooCandles, isBridgeSource } from './marketSources.js';
import { fetchCloseHistory, fetchLiveQuotes, fetchOtcCodes, summarizeBreadth } from './marketBreadth.js';
import { fetchIndexExtras, fetchMarketAmountHistory, fetchMisFutures, fetchMisIndex, fetchMisOptions, fetchTaifexOptionsDaily } from './misQuotes.js';
import { evaluatePatterns, refreshPatternHistory } from './patternEngine.js';
import { tickPriceSimulator } from './priceSimulator.js';
import { TOP10_CODES } from './quoteUtils.js';
import { INSTITUTIONS, buildFuturesDaily, buildPositionCost, fetchFuturesHistory, fetchInstitutional } from './taifexHistory.js';
import { buildChain, listExpiries, parseTxoReport, pickExpiry } from './taifexOptions.js';
import { fetchTwseDaily } from './twseData.js';
import { updateYahooGlobalQuotes } from './yahooGlobalQuotes.js';
import { updateYahooTwQuotes } from './yahooTwQuotes.js';

const SPOT_SYMBOL = 'INDEX:TWII';
const TREND_MIN_MS = 60000;
// 選擇權全部履約價約 3000 檔：日盤中 15 秒抓一次，盤外 10 分鐘一次就夠。
const OPTIONS_LIVE_MS = 15000;
const OPTIONS_IDLE_MS = 10 * 60 * 1000;
// 由「資料來源」寫入的 store 鍵，切換來源時清空。證交所盤後資料與型態提醒不受來源限制，不在這裡。
const SOURCE_KEYS = [
  'taiex', 'futuresDay', 'futuresFull', 'topStocks', 'marketMap', 'globalIndices',
  'taiexIntraday', 'stockTrends', 'selectedIntraday', 'watchQuotes', 'productDaily', 'optionsChain',
  'institutional', 'indexExtras', 'marketAmountHistory', 'marketBreadth'
];
// 台指期歷史日 K 抓 24 個月：週／月振幅統計要 20 週、20 個月。
const FUTURES_HISTORY_MONTHS = 24;
const BREADTH_MIN_MS = 60000;

let started = false;
let busy = 0;
let stockTrendAt = 0;
let selectedAt = 0;
let productDailyAt = 0;
let productDailyFailedAt = 0;
let twseAt = 0;
let twseFailedAt = 0;
let optionsAt = 0;
let optionsRows = [];
let optionsOrigin = null;
let instAt = 0;
let instFailedAt = 0;
let amountAt = 0;
let amountFailedAt = 0;
let breadthAt = 0;
// 寬度統計的名單與歷史收盤一天抓一次：{ date, otcCodes, closes }。
let breadthBase = null;

// 失敗只記 log、回傳 false，不讓單一來源的錯誤擋住同一輪的其他請求。
const settle = (label, promise) => promise.then(() => true, (error) => {
  console.warn(`[marketFeed] ${label} failed:`, error);
  return false;
});

// 加權 1 分 K（Page1 6 區走勢）：盤中每輪抓；盤外已有資料就不再抓。
async function refreshTaiexIntraday(source, loadCandles, force) {
  if (!force && !isTwQuoteSession() && store.get('taiexIntraday')) return;
  const candles = await loadCandles();
  if (getDashboardDataSource() === source) store.set('taiexIntraday', { source, candles });
}

function intradaySparkline(candles) {
  const rows = candles.filter((row) => typeof row.time === 'number' && isTwSpotSession(row.time * 1000));
  if (rows.length < 2) return null;
  return { values: rows.map((row) => row.close), baseline: rows[0].open || rows[0].close };
}

// 個股當日 1 分 K：上市代碼抓 .TW，抓不到再試上櫃 .TWO。
async function fetchStockIntraday(code) {
  try {
    const candles = await fetchYahooCandles({ symbol: code, timeframe: '1m' });
    if (candles.length) return candles;
  } catch {
    // 改試上櫃代碼。
  }
  return fetchYahooCandles({ symbol: `${code}.TWO`, timeframe: '1m' });
}

// 個股 1 分 K 走勢（十大權值股卡片、Page1 6 區 page1分組）：盤中最多每分鐘一輪；盤外只在 force 時抓。
async function refreshStockTrends(force) {
  if (!force && (!isTwQuoteSession() || Date.now() - stockTrendAt < TREND_MIN_MS)) return;
  stockTrendAt = Date.now();
  const groupCodes = store.get('watchlist').filter((row) => row.group === 'page1分組').map((row) => row.code);
  const trends = { ...store.get('stockTrends') };
  const results = await Promise.allSettled([...new Set([...TOP10_CODES, ...groupCodes])].map(async (code) => {
    const trend = intradaySparkline(await fetchStockIntraday(code));
    if (trend) trends[code] = trend;
  }));
  if (!results.some((result) => result.status === 'fulfilled')) throw results[0].reason;
  if (getDashboardDataSource() === 'yahoo') store.set('stockTrends', trends);
}

// 目前選取個股的當日 1 分 K（Page3 個股細節）：換股票立刻抓，盤中每分鐘一次。
async function refreshSelectedIntraday(force) {
  const code = store.get('selectedStock');
  const current = store.get('selectedIntraday');
  const sameCode = current?.code === code;
  if (!force && sameCode && (!isTwQuoteSession() || Date.now() - selectedAt < TREND_MIN_MS)) return;
  selectedAt = Date.now();
  const candles = await fetchStockIntraday(code);
  if (getDashboardDataSource() === 'yahoo' && store.get('selectedStock') === code) store.set('selectedIntraday', { code, candles });
}

// Page1 統計（振幅、樞紐點、比前一日 K 棒）用的日 K，一天抓一次。券商橋接：兩個台指商品；
// 公開資料：期交所台指期歷史（近月日盤／全日盤）＋Yahoo 加權日 K。
async function refreshProductDaily(source, force) {
  if (!force && !isDailyRefreshDue(productDailyAt, Date.now(), productDailyFailedAt)) return;
  productDailyAt = Date.now();
  productDailyFailedAt = productDailyAt; // 成功時在最後清掉；中途丟例外就保留，一分鐘後重試
  const next = {};
  if (isBridgeSource(source)) {
    const brokerUrl = brokerCandlesUrl(source);
    await Promise.all(TW_FUTURES_PRODUCTS.map(async (product) => {
      next[product.storeKey] = { label: product.label, source, candles: await fetchBrokerCandles({ brokerUrl, symbol: product.symbol, timeframe: 'D' }) };
    }));
  } else {
    const [raw, index] = await Promise.all([fetchFuturesHistory(FUTURES_HISTORY_MONTHS), fetchYahooCandles({ symbol: SPOT_SYMBOL, timeframe: 'D' })]);
    TW_FUTURES_PRODUCTS.forEach((product) => {
      next[product.storeKey] = { label: product.label, source, candles: buildFuturesDaily(raw, product.session) };
    });
    next.index = { label: '加權', source, candles: index };
  }
  productDailyFailedAt = 0;
  if (getDashboardDataSource() === source) store.set('productDaily', next);
}

// 證交所盤後資料（Page5 選股、全上市股名）：不受資料來源限制，一天在收盤後更新；失敗一分鐘後重試。
async function refreshTwseDaily(force) {
  if (!force && !isDailyRefreshDue(twseAt, Date.now(), twseFailedAt)) return;
  twseAt = Date.now();
  twseFailedAt = twseAt;
  store.set('twseDaily', await fetchTwseDaily());
  twseFailedAt = 0;
}

// 三大法人臺股期貨持倉成本與未平倉（期交所盤後，約 15:00 更新）：一天在收盤後更新。
async function refreshInstitutional(source, force) {
  if (!force && !isDailyRefreshDue(instAt, Date.now(), instFailedAt)) return;
  instAt = Date.now();
  instFailedAt = instAt;
  const raw = await fetchInstitutional(365);
  instFailedAt = 0;
  if (getDashboardDataSource() === source) store.set('institutional', Object.fromEntries(Object.keys(INSTITUTIONS).map((id) => [id, buildPositionCost(raw, id)])));
}

// 大盤每日成交金額（20 日均量用），一天更新一次。
async function refreshMarketAmount(source, force) {
  if (!force && !isDailyRefreshDue(amountAt, Date.now(), amountFailedAt)) return;
  amountAt = Date.now();
  amountFailedAt = amountAt;
  const rows = await fetchMarketAmountHistory();
  amountFailedAt = 0;
  if (getDashboardDataSource() === source) store.set('marketAmountHistory', rows);
}

// 櫃買指數、台指 VIX：盤中每輪；盤外已有資料就不抓。
async function refreshIndexExtras(source, force) {
  if (!force && !isTwQuoteSession() && store.get('indexExtras')) return;
  const extras = await fetchIndexExtras();
  if (getDashboardDataSource() === source) store.set('indexExtras', { ...extras, updatedAt: Date.now() });
}

// 市場寬度（上市＋上櫃約 1900 檔）：盤中最多每分鐘一輪，盤外有資料就不再抓；名單與歷史收盤一天抓一次。上市名單等證交所盤後資料到了才算。
async function refreshBreadth(source, force) {
  const tseCodes = (store.peek('twseDaily')?.rows || []).map((row) => row.code).filter((code) => /^[1-9]\d{3}$/.test(code));
  if (!tseCodes.length) return;
  if (!force && (Date.now() - breadthAt < BREADTH_MIN_MS || (store.peek('marketBreadth') && !isTwQuoteSession()))) return;
  breadthAt = Date.now();
  const today = dateKeyFromUnix(Math.floor(Date.now() / 1000));
  if (breadthBase?.date !== today) {
    const otcCodes = await fetchOtcCodes();
    const symbols = [...tseCodes.map((code) => `${code}.TW`), ...otcCodes.map((code) => `${code}.TWO`)];
    breadthBase = { date: today, otcCodes, closes: await fetchCloseHistory(symbols, today) };
  }
  const symbols = [...tseCodes.map((code) => `${code}.TW`), ...breadthBase.otcCodes.map((code) => `${code}.TWO`)];
  const live = await fetchLiveQuotes(symbols);
  const pick = (suffix) => symbols.filter((symbol) => symbol.endsWith(suffix)).map((symbol) => ({ ...live[symbol], closes: breadthBase.closes[symbol] }));
  if (getDashboardDataSource() === source) store.set('marketBreadth', { tse: summarizeBreadth(pick('.TW')), otc: summarizeBreadth(pick('.TWO')), updatedAt: Date.now() });
}

// ---- 公開資料：證交所／期交所 MIS 補 Yahoo 沒有的加權成交金額、台指期、選擇權 ----

// 加權累積成交金額（億，大盤「成交量」習慣看金額）與每分鐘走勢。盤中每輪抓；盤外只在 force 時抓。
async function refreshMisIndex(source, force) {
  if (!force && !isTwQuoteSession()) return;
  const index = await fetchMisIndex();
  if (getDashboardDataSource() !== source) return;
  if (index.amount !== null) {
    const amountYi = +(index.amount / 1e8).toFixed(2);
    store.set('taiex', withVolumeEstimate({ ...store.get('taiex'), volume: amountYi, amountYi, sourceUpdatedAt: Date.now() }));
  }
  // 每分鐘只有收盤價：開高低都用收盤價；量是該分鐘成交金額（百萬元），6 區算均價用。
  if (index.minutes.length) {
    store.set('taiexIntraday', {
      source,
      candles: index.minutes.map(({ time, close, amount }) => ({ time, open: close, high: close, low: close, close, volume: amount }))
    });
  }
}

// 台指期近月：台指（日盤）＝日盤報價；台指(全)＝日盤時段用日盤，其他時段夜盤有成交就用夜盤。只在期貨交易時段輪詢。
async function refreshMisFutures(source, force) {
  const daySession = isTwFuturesDaySession();
  if (!force && !daySession && !isTwFuturesNightSession()) return;
  const [day, night] = await Promise.all([fetchMisFutures('day'), daySession ? null : fetchMisFutures('night')]);
  if (getDashboardDataSource() !== source) return;
  const full = !daySession && night?.price != null ? night : day;
  [['futuresDay', day], ['futuresFull', full]].forEach(([key, quote]) => {
    if (quote?.price == null) return;
    store.set(key, { ...store.get(key), ...quote, source: 'mis', sourceSymbol: quote.symbol, sourceUpdatedAt: Date.now() });
  });
}

// 選擇權鏈：日盤看期交所 MIS 日盤、夜盤看夜盤的成交價；其他時段 MIS 還留著當天成交就繼續用，清空了（隔天開盤前）才改讀期交所盤後檔。
async function refreshOptions(source, force) {
  const night = isTwFuturesNightSession();
  const live = isTwFuturesDaySession() || night;
  if (!force && Date.now() - optionsAt < (live ? OPTIONS_LIVE_MS : OPTIONS_IDLE_MS)) return;
  optionsAt = Date.now();
  const session = night ? 'night' : 'day';
  let rows = await fetchMisOptions(session);
  let origin = { kind: 'mis', session };
  if (!live && !rows.some((row) => row.volume > 0)) {
    const daily = await fetchTaifexOptionsDaily();
    rows = parseTxoReport(daily);
    origin = { kind: 'taifex-daily', date: String(daily[0]?.Date || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') };
  }
  if (getDashboardDataSource() !== source) return;
  optionsRows = rows;
  optionsOrigin = origin;
  publishOptionsChain();
}

// 依 Page4 選的到期序列（optionsExpiry，沒選就挑最近一期）組鏈；換到期序列時不必重抓。
function publishOptionsChain() {
  if (!optionsRows.length) return;
  const expiries = listExpiries(optionsRows);
  const today = dateKeyFromUnix(Math.floor(Date.now() / 1000));
  const picked = expiries.find((item) => item.contractMonth === store.get('optionsExpiry')) || pickExpiry(expiries, today) || expiries.at(-1);
  if (!picked) return;
  const spot = Number(store.get('futuresDay').price ?? store.get('taiex').price);
  const chain = buildChain(optionsRows, picked.contractMonth, Number.isFinite(spot) ? spot : NaN);
  // 沒有現價時用履約價的中間值當損益圖中心，圖才畫得出來。
  const strikes = chain.calls.map((row) => row.strike);
  store.set('optionsChain', {
    ...chain,
    spotPrice: Number.isFinite(spot) ? spot : strikes[Math.floor(strikes.length / 2)] ?? null,
    contractMonth: picked.contractMonth,
    expiries,
    origin: optionsOrigin
  });
}

// null/空字串視為缺值（Number(null) 是 0）。
const roundedOr = (value, fallback, digits = 2) => (value != null && value !== '' && Number.isFinite(Number(value)) ? +Number(value).toFixed(digits) : fallback);

// 券商期貨報價 → store 格式（整數點）；橋接沒給的欄位沿用上一筆。
function mapBrokerFutures(payload, base, source, sourceSymbol) {
  const price = roundedOr(payload.price ?? payload.close, base.price, 0);
  const change = roundedOr(payload.change, NaN, 0);
  const prevClose = roundedOr(payload.prevClose ?? payload.preClose, Number.isFinite(change) ? price - change : base.prevClose, 0);
  const next = {
    ...base,
    price,
    open: roundedOr(payload.open, base.open, 0),
    high: roundedOr(payload.high, base.high, 0),
    low: roundedOr(payload.low, base.low, 0),
    prevClose,
    volume: roundedOr(payload.volume, base.volume, 0),
    source,
    sourceSymbol,
    sourceUpdatedAt: Date.now()
  };
  if (Number.isFinite(next.price) && Number.isFinite(next.prevClose)) {
    next.change = next.price - next.prevClose;
    next.changePct = next.prevClose ? +((next.change / next.prevClose) * 100).toFixed(2) : 0;
  }
  return next;
}

function mapBrokerSpot(payload, base, source) {
  const price = roundedOr(payload.price ?? payload.close, NaN);
  if (!Number.isFinite(price)) return null;
  const change = roundedOr(payload.change, NaN);
  return {
    ...base,
    price,
    change: Number.isFinite(change) ? change : base.change,
    changePct: roundedOr(payload.changePct, base.changePct),
    prevClose: roundedOr(payload.prevClose, Number.isFinite(change) ? +(price - change).toFixed(2) : base.prevClose),
    open: roundedOr(payload.open, base.open),
    high: roundedOr(payload.high, base.high),
    low: roundedOr(payload.low, base.low),
    volume: roundedOr(payload.totalVolume ?? payload.volume, base.volume),
    amountYi: roundedOr(payload.amountYi, base.amountYi),
    source,
    sourceUpdatedAt: Date.now()
  };
}

// 券商橋接：台指(全) 每輪都問（含夜盤）；台指日盤與加權現貨只在各自時段問。
async function refreshBrokerQuotes(source) {
  const ask = (enabled, symbol) => (enabled ? fetchBrokerQuote(source, symbol) : Promise.resolve(null));
  const [day, full, spot] = await Promise.allSettled([
    ask(isTwFuturesDaySession(), TW_FUTURES_BY_LABEL['台指'].symbol),
    ask(true, TW_FUTURES_BY_LABEL['台指(全)'].symbol),
    ask(isTwSpotSession(), SPOT_SYMBOL)
  ]);
  if (getDashboardDataSource() !== source) return;
  [[day, TW_FUTURES_BY_LABEL['台指']], [full, TW_FUTURES_BY_LABEL['台指(全)']]].forEach(([result, product]) => {
    if (result.value) store.set(product.storeKey, mapBrokerFutures(result.value, store.get(product.storeKey), source, product.symbol));
  });
  const taiex = spot.value ? mapBrokerSpot(spot.value, store.get('taiex'), source) : null;
  if (taiex) store.set('taiex', withVolumeEstimate(taiex));
  const failed = [day, full, spot].find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
}

// 一輪：即時行情只向目前選定的來源拿，不改用其他來源補；盤後資料（證交所、型態用的日 K）不受來源限制。回傳這輪是否全部成功。
async function fetchAll(force) {
  const source = getDashboardDataSource();
  const jobs = [
    settle('證交所盤後資料', refreshTwseDaily(force)),
    settle('型態提醒', refreshPatternHistory().then(evaluatePatterns))
  ];
  if (source === 'mock') {
    tickPriceSimulator();
  } else if (source === 'yahoo') {
    // 公開資料：個股、全球指數、日 K 走 Yahoo；加權成交金額與 1 分走勢、台指期、選擇權走證交所／期交所 MIS。
    jobs.push(
      settle('Yahoo 台股報價', updateYahooTwQuotes({ force })),
      settle('Yahoo 全球指數', updateYahooGlobalQuotes({ force })),
      settle('MIS 加權成交金額與走勢', refreshMisIndex(source, force)),
      settle('MIS 台指期', refreshMisFutures(source, force)),
      settle('期交所選擇權', refreshOptions(source, force)),
      settle('Yahoo 個股 1 分 K', refreshStockTrends(force)),
      settle('Yahoo 選取個股 1 分 K', refreshSelectedIntraday(force)),
      settle('期交所台指期與 Yahoo 加權日 K', refreshProductDaily(source, force)),
      settle('期交所三大法人', refreshInstitutional(source, force)),
      settle('證交所大盤成交金額', refreshMarketAmount(source, force)),
      settle('櫃買指數與 VIX', refreshIndexExtras(source, force)),
      settle('市場寬度', refreshBreadth(source, force))
    );
  } else if (isBridgeSource(source)) {
    const brokerUrl = brokerCandlesUrl(source);
    jobs.push(
      settle(`${source} 報價`, refreshBrokerQuotes(source)),
      settle(`${source} 加權 1 分 K`, refreshTaiexIntraday(source, () => fetchBrokerCandles({ brokerUrl, symbol: SPOT_SYMBOL, timeframe: '1m' }), force)),
      settle(`${source} 期貨日 K`, refreshProductDaily(source, force))
    );
  }
  return (await Promise.all(jobs)).every(Boolean);
}

// 上一輪還沒結束就跳過；force（啟動、切換來源、手動更新）一律執行。
async function runTick(force) {
  if (busy && !force) return false;
  busy += 1;
  try {
    return await fetchAll(force);
  } finally {
    busy -= 1;
  }
}

// 切換來源時把行情清回初始的空值：畫面先顯示「--」，不讓上一個來源的數字冒充新來源。
function resetSourceData() {
  stockTrendAt = 0;
  selectedAt = 0;
  productDailyAt = 0;
  productDailyFailedAt = 0;
  optionsAt = 0;
  instAt = 0;
  instFailedAt = 0;
  amountAt = 0;
  amountFailedAt = 0;
  breadthAt = 0;
  optionsRows = [];
  optionsOrigin = null;
  store.reset(...SOURCE_KEYS);
}

// 先跑強制的一輪（busy 已加一），之後節拍上的一般輪次會因 busy 跳過，不會重複抓。
export function refreshMarketFeed() {
  const done = runTick(true);
  tickNow();
  return done;
}

export function startMarketFeed() {
  if (started) return;
  started = true;
  subscribeFeedTick(() => runTick(false));
  subscribeDashboardDataSource(() => {
    resetSourceData();
    runTick(true);
  });
  // 自選股有增減時立刻補抓報價與日 K（盤外也要抓得到新加入的股票）；換選取個股時立刻抓它的 1 分 K。
  store.subscribe('watchlist', () => runTick(true));
  store.subscribe('optionsExpiry', publishOptionsChain);
  store.subscribe('selectedStock', () => {
    if (getDashboardDataSource() === 'yahoo') settle('Yahoo 選取個股 1 分 K', refreshSelectedIntraday(true));
  });
  runTick(true);
}
