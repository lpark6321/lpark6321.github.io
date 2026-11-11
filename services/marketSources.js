// K 線與券商報價的資料來源：Yahoo、FinMind、券商本機橋接、期交所 CSV 與模擬資料，全部轉成標準 OHLCV。
// 哪個來源能做什麼（橋接位址等）定義在 dashboardDataSource.js 的來源清單。
import { trackedFetch } from './serviceHealth.js';
import { TW_FUTURES_BY_SYMBOL } from '../data/twDerivatives.js';
import { sourceInfo } from './dashboardDataSource.js';
import { TW_SESSIONS, isTwFuturesDaySession, minutesOf } from './marketCalendar.js';
import { splitCsvLine } from './csv.js';
import { buildFuturesDaily, fetchFuturesHistory } from './taifexHistory.js';
import { REQUEST_TIMEOUT_MS, fetchYahooChart, yahooProxyUrl } from './yahooApi.js';

// Yahoo 不同週期對應的 chart API interval/range；圖表內部統一轉成 OHLCV。
const TIMEFRAME_TO_YAHOO = {
  '1s': { interval: '1m', range: '1d' },
  tick: { interval: '1m', range: '1d' },
  '1m': { interval: '1m', range: '1d' },
  '5m': { interval: '5m', range: '5d' },
  D: { interval: '1d', range: '6mo' },
  '1D': { interval: '1d', range: '6mo' },
  day: { interval: '1d', range: '6mo' }
};

const DAY_SESSION_START_MINUTE = minutesOf(TW_SESSIONS.futuresDay.open);
const DAY_SESSION_END_MINUTE = minutesOf(TW_SESSIONS.futuresDay.close);
// 台北為固定 UTC+8（無夏令時間）；期交所 CSV 的日期時間都是台北時間。
const TAIPEI_OFFSET_SECONDS = 8 * 3600;
// 期交所逐筆 CSV 內台指期常見商品代號；載入 CSV 時用這組代號篩出台指期。
export const TAIEX_FUTURE_CODES = ['TX'];
const TAIFEX_TICK_COLUMNS = {
  date: 0,
  product: 1,
  month: 2,
  time: 3,
  price: 4,
  volume: 5,
  nearPrice: 6,
  farPrice: 7,
  auction: 8
};
const TAIFEX_MIN_VALID_FUTURES_PRICE = 1000;
const FINMIND_FUTURES_SNAPSHOT_ENDPOINT = 'finmind-futures-snapshot';
const FINMIND_FUTURES_DAILY_ENDPOINT = 'finmind-futures-daily';

export function isSecondTimeframe(timeframe) {
  return timeframe === '1s' || timeframe === 'tick';
}

export function isIntradayTimeframe(timeframe) {
  return isSecondTimeframe(timeframe) || timeframe === '1m' || timeframe === '5m';
}

// 標準 K 線格式：{ time, open, high, low, close, volume }。
// Yahoo、TAIFEX、券商 API、CSV 都先轉成這個格式，再交給 Lightweight Charts。
export function normalizeOhlcv(row) {
  const time = normalizeTime(row.time ?? row.timestamp ?? row.date ?? row.datetime);
  const open = Number(row.open ?? row.o);
  const high = Number(row.high ?? row.h);
  const low = Number(row.low ?? row.l);
  const close = Number(row.close ?? row.c ?? row.price);
  const volume = Number(row.volume ?? row.v ?? 0);
  const prevClose = Number(row.prevClose ?? row.previousClose ?? row.preClose);

  if (!time || ![open, high, low, close].every(Number.isFinite)) return null;
  return {
    time,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    prevClose: Number.isFinite(prevClose) ? prevClose : undefined
  };
}

function normalizeTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 9999999999 ? Math.floor(value / 1000) : Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000);
  }

  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  return null;
}

function yahooSymbol(symbol) {
  if (symbol === 'INDEX:TWII' || symbol === 'TWSE:TAIEX') return '^TWII';
  if (/^\d{4,6}$/.test(symbol)) return `${symbol}.TW`;
  return symbol;
}

function resolveTimeframe(timeframe = 'D') {
  return TIMEFRAME_TO_YAHOO[timeframe] || TIMEFRAME_TO_YAHOO.D;
}

// fetchYahooCandles：Yahoo chart API（經本機 proxy）轉成 OHLCV。
export async function fetchYahooCandles({ symbol, timeframe = 'D' }) {
  const { interval, range } = resolveTimeframe(timeframe);
  const result = await fetchYahooChart(yahooSymbol(symbol), interval, range);
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};

  return timestamps
    .map((time, index) =>
      normalizeOhlcv({
        time,
        open: quote.open?.[index],
        high: quote.high?.[index],
        low: quote.low?.[index],
        close: quote.close?.[index],
        volume: quote.volume?.[index]
      })
    )
    .filter(Boolean);
}

// 個股日 K（型態提醒、Page5 技術指標）：上市代碼抓 .TW，抓不到再試上櫃 .TWO；都沒有回傳空陣列。
export async function fetchStockDaily(code) {
  for (const symbol of [code, `${code}.TWO`]) {
    try {
      const candles = await fetchYahooCandles({ symbol, timeframe: 'D' });
      if (candles.length) return candles;
    } catch {
      // 換下一個代碼字尾再試。
    }
  }
  return [];
}

// 預留給券商 API：前端只假設回傳 data/candles 陣列，欄位仍會經 normalizeOhlcv。
export async function fetchBrokerCandles({ brokerUrl, symbol, timeframe = 'D' }) {
  if (!brokerUrl) {
    throw new Error('Provide options.brokerUrl. Expected JSON with OHLCV rows in data or candles.');
  }

  const url = new URL(brokerUrl, window.location.href);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('timeframe', timeframe);
  url.searchParams.set('_ts', String(Date.now()));

  const response = await trackedFetch('bridge', url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    // body 只能讀一次：先取文字，能解析成 JSON 就取 error/message。
    let detail = await response.text().catch(() => '');
    try {
      const payload = JSON.parse(detail);
      detail = payload?.error || payload?.message || detail;
    } catch {
      // 非 JSON 就直接用原文。
    }
    throw new Error(`Broker chart source HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }

  return normalizeTaifexJson(await response.json())
    .map(normalizeOhlcv)
    .filter(Boolean)
    .sort((a, b) => sortTime(a.time, b.time));
}

// 本機期交所逐筆 CSV：讀入後直接在前端聚合成目前週期的 K 線。
// resolveFinMindToken：讀取 FinMind token；可由 options、window.FINMIND_TOKEN 或 localStorage.finmindToken 提供。
function resolveFinMindToken(options = {}) {
  return (
    options.finMindToken ||
    options.finmindToken ||
    globalThis.window?.FINMIND_TOKEN ||
    globalThis.FINMIND_TOKEN ||
    globalThis.window?.localStorage?.getItem('finmindToken') ||
    ''
  );
}

export function bucketTime(time, timeframe) {
  if (typeof time !== 'number') return time;
  if (isSecondTimeframe(timeframe)) return time;
  if (timeframe === '1m') return Math.floor(time / 60) * 60;
  if (timeframe === '5m') return Math.floor(time / 300) * 300;
  return dateKeyFromUnix(time);
}

// pickFinMindFuturesSnapshot：從 FinMind 回傳的近遠月資料中挑最新且成交量最大的 TXF 列。
function pickFinMindFuturesSnapshot(rows, futuresId = 'TXF') {
  const prefix = String(futuresId || 'TXF').toUpperCase();
  const candidates = rows
    .filter((row) => String(row.futures_id || '').toUpperCase().startsWith(prefix))
    .sort((a, b) => {
      const at = Date.parse(a.date || '') || 0;
      const bt = Date.parse(b.date || '') || 0;
      if (bt !== at) return bt - at;
      return (Number(b.total_volume) || 0) - (Number(a.total_volume) || 0);
    });
  return candidates[0] || rows[0] || null;
}

// finMindSnapshotToCandle：把即時 snapshot 轉成 Lightweight Charts 使用的 OHLCV。
function finMindSnapshotToCandle(row, timeframe) {
  if (!row) return null;
  const time = normalizeTime(row.date);
  const open = Number(row.open);
  const high = Number(row.high);
  const low = Number(row.low);
  const close = Number(row.close);
  const volume = Number(row.total_volume ?? row.volume ?? 0);
  if (!time || ![open, high, low, close].every(Number.isFinite)) return null;
  return {
    time: bucketTime(time, timeframe),
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0
  };
}

// FinMind 不同資料集的成交量欄位名稱不一。
function finMindVolume(row) {
  return Number(
    row.volume ?? row.Volume ?? row.trading_volume ?? row.Trading_Volume ?? row.total_volume ?? row.TotalVolume ?? 0
  );
}

// finMindDailyRowToCandle：把 FinMind TaiwanFuturesDaily 每日資料轉成 OHLCV。
function finMindDailyRowToCandle(row) {
  if (!row) return null;
  const time = normalizeTime(row.date ?? row.datetime ?? row.trading_date);
  const open = Number(row.open ?? row.Open);
  const high = Number(row.max ?? row.high ?? row.High);
  const low = Number(row.min ?? row.low ?? row.Low);
  const close = Number(row.close ?? row.Close);
  const volume = finMindVolume(row);

  if (!time || ![open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

// selectFinMindDailyRows：同一天若有多個月份，挑成交量最大的近月代表台指期主力。
function selectFinMindDailyRows(rows, futuresId = 'TX') {
  const prefix = String(futuresId || 'TX').replace(/F$/i, '').toUpperCase();
  const byDate = new Map();

  rows.forEach((row) => {
    const contract = String(
      row.futures_id ?? row.contract ?? row.contract_code ?? row.data_id ?? row.symbol ?? ''
    ).toUpperCase();
    if (contract && !contract.startsWith(prefix)) return;

    const date = row.date ?? row.datetime ?? row.trading_date;
    if (!date) return;

    const current = byDate.get(date);
    if (!current || finMindVolume(row) >= finMindVolume(current)) byDate.set(date, row);
  });

  return [...byDate.values()].sort((a, b) =>
    sortTime(normalizeTime(a.date ?? a.datetime ?? a.trading_date), normalizeTime(b.date ?? b.datetime ?? b.trading_date))
  );
}

// token 放在 Authorization 標頭交給本機代理，不放網址：網址會留在瀏覽器紀錄、開發者工具與各種 log 裡。
function finMindHeaders(token) {
  return token ? { Accept: 'application/json', Authorization: `Bearer ${token}` } : { Accept: 'application/json' };
}

// fetchFinMindFuturesDailyCandles：snapshot 不可用時，用 FinMind daily 資料維持圖表可用。
async function fetchFinMindFuturesDailyCandles(options = {}) {
  const token = resolveFinMindToken(options);
  const dataId = options.finMindDailyId || options.dailyId || 'TX';
  const url = yahooProxyUrl(FINMIND_FUTURES_DAILY_ENDPOINT);
  url.searchParams.set('data_id', dataId);
  url.searchParams.set('_ts', String(Date.now()));

  const response = await trackedFetch('proxy', url.toString(), {
    cache: 'no-store',
    headers: finMindHeaders(token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.msg || payload?.error || `FinMind futures daily HTTP ${response.status}`);

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  if (!rows.length) {
    throw new Error(payload?.msg || payload?.message || payload?.error || 'FinMind futures daily returned no data.');
  }

  const selectedRows = selectFinMindDailyRows(rows, dataId);
  const candles = selectedRows.map(finMindDailyRowToCandle).filter(Boolean);
  if (!candles.length) throw new Error('FinMind futures daily cannot be converted to OHLCV.');
  return candles;
}

// fetchFinMindFuturesCandles：使用 FinMind futures snapshot 取得台指期當下資料。
export async function fetchFinMindFuturesCandles(options = {}) {
  const token = resolveFinMindToken(options);
  const futuresId = options.finMindFuturesId || options.futuresId || 'TXF';
  const url = yahooProxyUrl(FINMIND_FUTURES_SNAPSHOT_ENDPOINT);
  url.searchParams.set('data_id', futuresId);
  url.searchParams.set('_ts', String(Date.now()));

  const response = await trackedFetch('proxy', url.toString(), {
    cache: 'no-store',
    headers: finMindHeaders(token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return fetchFinMindFuturesDailyCandles(options);

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  if (!rows.length) {
    return fetchFinMindFuturesDailyCandles(options);
  }

  const row = pickFinMindFuturesSnapshot(rows, futuresId);
  const candle = finMindSnapshotToCandle(row, options.timeframe || '1m');
  if (!candle) return fetchFinMindFuturesDailyCandles(options);
  return [candle];
}

// session === 'day' 時只取日盤（08:45–13:45）成交，與「台指」商品的定義一致。
export async function fetchTaifexCsvCandles({ taifexCsvText, timeframe = 'D', productCodes = TAIEX_FUTURE_CODES, session }) {
  if (!taifexCsvText) {
    throw new Error('請先載入期交所逐筆CSV檔');
  }
  return buildCandlesFromTaifexTickCsv(taifexCsvText, { timeframe, productCodes, dayOnly: session === 'day' });
}

function normalizeTaifexJson(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.candles)) return payload.candles;
  return [];
}

function buildCandlesFromTaifexTickCsv(text, { timeframe = 'D', productCodes = TAIEX_FUTURE_CODES, dayOnly = false } = {}) {
  const lines = text.split(/\r?\n/);
  const headerLineIndex = lines.findIndex((line) => line.trim());
  if (headerLineIndex < 0 || lines.length - headerLineIndex < 2) return [];

  // TAIFEX CSV may come from different exports or encodings. Header lookup is used first,
  // and the fixed column fallback keeps old daily tick files usable.
  const headers = splitCsvLine(lines[headerLineIndex]).map(cleanCsvCell);
  const index = {
    date: findHeaderIndexByAliases(headers, ['成交日期'], TAIFEX_TICK_COLUMNS.date),
    product: findHeaderIndexByAliases(headers, ['商品代號'], TAIFEX_TICK_COLUMNS.product),
    month: findHeaderIndexByAliases(headers, ['到期月份', '到期月份(週別)'], TAIFEX_TICK_COLUMNS.month),
    time: findHeaderIndexByAliases(headers, ['成交時間'], TAIFEX_TICK_COLUMNS.time),
    price: findHeaderIndexByAliases(headers, ['成交價格'], TAIFEX_TICK_COLUMNS.price),
    volume: findHeaderIndexByAliases(headers, ['成交數量', '成交數量(B+S)'], TAIFEX_TICK_COLUMNS.volume),
    nearPrice: findHeaderIndexByAliases(headers, ['近月價格'], TAIFEX_TICK_COLUMNS.nearPrice),
    farPrice: findHeaderIndexByAliases(headers, ['遠月價格'], TAIFEX_TICK_COLUMNS.farPrice)
  };
  const productOrder = productCodes.map((code) => String(code).toUpperCase());
  const codeSet = new Set(productOrder);
  const byProduct = new Map();
  let matchedRows = 0;
  let rejectedRows = 0;

  // Keep only K buckets while parsing. This avoids holding every tick row in memory.
  for (let lineIndex = headerLineIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line?.trim()) continue;

    const values = splitCsvLine(line).map(cleanCsvCell);
    const product = String(values[index.product] || '').toUpperCase();
    if (!codeSet.has(product)) continue;

    const contractMonth = parseTaifexContractMonth(values[index.month]);
    const tradePrice = parseTaifexPrice(values[index.price]);
    const nearPrice = parseTaifexPrice(values[index.nearPrice]);
    const farPrice = parseTaifexPrice(values[index.farPrice]);
    const price = resolveTaifexTradePrice(tradePrice, nearPrice, farPrice);
    const volume = Number(cleanNumber(values[index.volume]));
    const time = parseTaifexTickTime(values[index.date], values[index.time]);

    if (
      !Number.isFinite(contractMonth) ||
      !Number.isFinite(price) ||
      !Number.isFinite(volume) ||
      !Number.isFinite(time)
    ) {
      rejectedRows += 1;
      continue;
    }

    matchedRows += 1;
    if (dayOnly && !isDaySessionMinute(taipeiMinuteOfUnix(time))) continue;
    let productMonths = byProduct.get(product);
    if (!productMonths) {
      productMonths = new Map();
      byProduct.set(product, productMonths);
    }

    let monthBuckets = productMonths.get(contractMonth);
    if (!monthBuckets) {
      monthBuckets = new Map();
      productMonths.set(contractMonth, monthBuckets);
    }

    aggregateTickIntoCandleBuckets(monthBuckets, { time, price, volume }, timeframe);
  }

  if (!matchedRows) {
    throw new Error(`CSV找不到可用的期交所商品代號：${productCodes.join('/')}`);
  }

  // 期交所逐筆檔常同時帶近月與遠月，前端看盤先以近月代表主力合約。
  // 若之後要做換月規則，擴充點會在這個 nearMonth 選擇邏輯。
  // 先依商品代號順序選定商品，再取該商品的近月，避免 TX/TXF/TMF 混在同一組 K 棒。
  const selectedProduct = productOrder.find((code) => byProduct.has(code));
  if (!selectedProduct) {
    throw new Error(`CSV找不到可用的期交所商品代號：${productCodes.join('/')}`);
  }

  const selectedMonths = byProduct.get(selectedProduct);
  const nearMonth = Math.min(...selectedMonths.keys());
  const candles = [...selectedMonths.get(nearMonth).values()]
    .map(({ firstTime, lastTime, ...candle }) => candle)
    .sort((a, b) => sortTime(a.time, b.time));

  if (!candles.length) {
    throw new Error(`CSV找到${matchedRows}筆${selectedProduct}資料，但沒有可繪製的近月K棒；略過${rejectedRows}筆格式錯誤資料`);
  }

  return candles;
}

function normalizeHeaderKey(value) {
  return cleanCsvCell(value).replace(/\s+/g, '').toUpperCase();
}

function findHeaderIndexByAliases(headers, aliases, fallback) {
  const normalizedAliases = aliases.map(normalizeHeaderKey);
  const index = headers.findIndex((header) => {
    const normalized = normalizeHeaderKey(header);
    return normalizedAliases.some((alias) => normalized.includes(alias));
  });
  return index >= 0 ? index : fallback;
}

function cleanCsvCell(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
}

function cleanNumber(value) {
  return cleanCsvCell(value).replaceAll(',', '').replaceAll('--', '').replaceAll('-', '');
}

function parseTaifexContractMonth(value) {
  const digits = cleanCsvCell(value).replace(/\D/g, '');
  return digits ? Number(digits) : NaN;
}

function parseTaifexPrice(value) {
  const price = Number(cleanNumber(value));
  return Number.isFinite(price) && price >= TAIFEX_MIN_VALID_FUTURES_PRICE ? price : NaN;
}

function resolveTaifexTradePrice(tradePrice, nearPrice, farPrice) {
  if (Number.isFinite(tradePrice)) return tradePrice;
  if (Number.isFinite(nearPrice)) return nearPrice;
  return Number.isFinite(farPrice) ? farPrice : NaN;
}

function parseTaifexTickTime(dateValue, timeValue) {
  const date = cleanCsvCell(dateValue).replace(/\D/g, '');
  const time = cleanCsvCell(timeValue).replace(/\D/g, '').padStart(6, '0');
  if (date.length !== 8 || time.length < 6) return null;

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6)) - 1;
  const day = Number(date.slice(6, 8));
  const hour = Number(time.slice(-6, -4));
  const minute = Number(time.slice(-4, -2));
  const second = Number(time.slice(-2));
  return Date.UTC(year, month, day, hour, minute, second) / 1000 - TAIPEI_OFFSET_SECONDS;
}

function aggregateTickIntoCandleBuckets(buckets, tick, timeframe) {
  const step = isSecondTimeframe(timeframe) ? 1 : timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : null;
  const key = step ? Math.floor(tick.time / step) * step : dateKeyFromUnix(tick.time);
  let candle = buckets.get(key);
  if (!candle) {
    candle = {
      time: key,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
      volume: 0,
      firstTime: tick.time,
      lastTime: tick.time
    };
    buckets.set(key, candle);
  }

  candle.high = Math.max(candle.high, tick.price);
  candle.low = Math.min(candle.low, tick.price);
  candle.volume += tick.volume;
  if (tick.time < candle.firstTime) {
    candle.open = tick.price;
    candle.firstTime = tick.time;
  }
  if (tick.time >= candle.lastTime) {
    candle.close = tick.price;
    candle.lastTime = tick.time;
  }
}

// unix 秒 → 台北日期 'YYYY-MM-DD'（日 K 的 bucket）。
export function dateKeyFromUnix(time) {
  return new Date((time + TAIPEI_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

// unix 秒 → 台北時間當日第幾分鐘。
export function taipeiMinuteOfUnix(time) {
  return Math.floor(((time + TAIPEI_OFFSET_SECONDS) % 86400) / 60);
}

export function isDaySessionMinute(minute) {
  return minute >= DAY_SESSION_START_MINUTE && minute <= DAY_SESSION_END_MINUTE;
}

export function sortTime(a, b) {
  const av = typeof a === 'string' ? Date.parse(a) / 1000 : a;
  const bv = typeof b === 'string' ? Date.parse(b) / 1000 : b;
  return av - bv;
}

// generateFallbackCandles：「模擬資料」來源專用的隨機 K 線；其他來源出錯時不能用它冒充真實資料。
function generateFallbackCandles({ timeframe = 'D', base = 32000 }) {
  const count = 120;
  const stepSeconds = isSecondTimeframe(timeframe) ? 1 : timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : 86400;
  const now = Math.floor(Date.now() / 1000);
  const first = now - stepSeconds * count;
  const candles = [];
  let close = base;

  for (let i = 0; i < count; i += 1) {
    const open = close;
    const drift = (Math.sin(i / 7) + Math.random() - 0.5) * base * 0.0012;
    close = Math.max(1, open + drift);
    const high = Math.max(open, close) + Math.random() * base * 0.0009;
    const low = Math.min(open, close) - Math.random() * base * 0.0009;
    candles.push({
      time: first + i * stepSeconds,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: Math.round(500000 + Math.random() * 2500000)
    });
  }

  return candles;
}

// 所有資料來源的入口；新增資料源時只要在這裡分流並回傳標準 OHLCV。
// 只向指定的來源要，不改用其他來源補；還沒接上的來源直接丟錯，畫面顯示原因。
export async function fetchCandles(options) {
  const { source } = options;
  if (source === 'mock') return generateFallbackCandles(options);
  // 公開資料的台指期只有期交所盤後日 K（Yahoo 沒有台指期）；分 K 要券商來源。
  if (source === 'yahoo' && options.type === 'future') {
    if (isIntradayTimeframe(options.timeframe)) throw new Error('公開資料只有台指期日 K');
    return buildFuturesDaily(await fetchFuturesHistory(6), options.session);
  }
  if (source === 'yahoo') return fetchYahooCandles(options);
  if (source === 'taifex_csv') return fetchTaifexCsvCandles(options);
  if (source === 'finmind') return fetchFinMindFuturesCandles(options);
  if (isBridgeSource(source)) return fetchBrokerCandles({ ...options, brokerUrl: brokerCandlesUrl(source) });
  throw new Error('尚未接上');
}

export function isBridgeSource(source) {
  return Boolean(sourceInfo(source).bridge);
}

export function brokerCandlesUrl(source) {
  return isBridgeSource(source) ? `${sourceInfo(source).bridge}/broker-candles` : '';
}

// 券商橋接的即時報價（期貨、加權現貨）；HTTP 錯誤時帶出橋接回傳的 error 訊息。
export async function fetchBrokerQuote(source, symbol) {
  if (!isBridgeSource(source)) throw new Error(`No quote URL for source ${source}`);
  const url = new URL(`${sourceInfo(source).bridge}/xq-quote`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('_ts', String(Date.now()));
  const response = await trackedFetch('bridge', url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function isDayFuturesSymbol(symbol, symbolConfig = {}) {
  const value = String(symbol || '').toUpperCase();
  return (
    symbolConfig.session === 'day' ||
    TW_FUTURES_BY_SYMBOL[value]?.session === 'day' ||
    value === 'FITX1' ||
    value === 'TXDAY' ||
    value === 'TX_DAY'
  );
}

export function shouldSkipLiveDayFuturesRefresh(source, symbol, symbolConfig = {}) {
  return isBridgeSource(source) && isDayFuturesSymbol(symbol, symbolConfig) && !isTwFuturesDaySession();
}
