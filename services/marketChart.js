// Page1 C 區自有行情圖表服務：整合資料來源、CSV 轉換、指標與 Lightweight Charts。
const LIGHTWEIGHT_CHARTS_URL =
  'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';

// Yahoo 不同週期對應的 chart API interval/range；圖表內部統一轉成 OHLCV。
const TIMEFRAME_TO_YAHOO = {
  '1m': { interval: '1m', range: '1d' },
  '5m': { interval: '5m', range: '5d' },
  D: { interval: '1d', range: '6mo' },
  '1D': { interval: '1d', range: '6mo' },
  day: { interval: '1d', range: '6mo' }
};

const SMA_PERIOD = 9;
const UP_COLOR = '#f03a5f';
const DOWN_COLOR = '#1fd67a';
const SMA_COLOR = '#2962ff';
const VOLUME_UP_COLOR = 'rgba(240,58,95,.48)';
const VOLUME_DOWN_COLOR = 'rgba(31,214,122,.48)';
// 期交所逐筆 CSV 內台指期常見商品代號；載入 CSV 時用這組代號篩出台指期。
const TAIEX_FUTURE_CODES = ['TX', 'TXF'];
const DEFAULT_YAHOO_PROXY_BASE = 'http://127.0.0.1:8787/api';
const FINMIND_FUTURES_SNAPSHOT_ENDPOINT = 'finmind-futures-snapshot';
const FINMIND_FUTURES_DAILY_ENDPOINT = 'finmind-futures-daily';

let lightweightPromise = null;

// loadLightweightChartsScript：函式用途註解，說明此處封裝一段可重用的流程。
export function loadLightweightChartsScript() {
  if (lightweightPromise) return lightweightPromise;

  lightweightPromise = new Promise((resolve, reject) => {
    if (window.LightweightCharts) {
      resolve(window.LightweightCharts);
      return;
    }

    // 段落說明：建立新的 DOM 節點。
    const script = document.createElement('script');
    script.src = LIGHTWEIGHT_CHARTS_URL;
    script.async = true;
    script.onload = () => resolve(window.LightweightCharts);
    script.onerror = () => reject(new Error('Lightweight Charts script failed to load'));
    // 段落說明：將建立好的節點掛回頁面。
    document.head.appendChild(script);
  });

  return lightweightPromise;
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

  if (!time || ![open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

// normalizeTime：函式用途註解，說明此處封裝一段可重用的流程。
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

// yahooSymbol：函式用途註解，說明此處封裝一段可重用的流程。
function yahooSymbol(symbol) {
  if (symbol === 'INDEX:TWII' || symbol === 'TWSE:TAIEX') return '^TWII';
  if (/^\d{4,6}$/.test(symbol)) return `${symbol}.TW`;
  return symbol;
}

// resolveTimeframe：函式用途註解，說明此處封裝一段可重用的流程。
function resolveTimeframe(timeframe = 'D') {
  return TIMEFRAME_TO_YAHOO[timeframe] || TIMEFRAME_TO_YAHOO.D;
}

// yahooProxyUrl：把 Yahoo chart API 改走本機 proxy，避免瀏覽器 CORS 擋住 query1.finance.yahoo.com。
function yahooProxyUrl(endpoint) {
  const base = globalThis.window?.YAHOO_PROXY_BASE || globalThis.YAHOO_PROXY_BASE || DEFAULT_YAHOO_PROXY_BASE;
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return new URL(endpoint, normalized);
}

// fetchYahooCandles：函式用途註解，說明此處封裝一段可重用的流程。
export async function fetchYahooCandles({ symbol, timeframe = 'D' }) {
  const { interval, range } = resolveTimeframe(timeframe);
  const url = yahooProxyUrl('yahoo-chart');
  url.searchParams.set('symbol', yahooSymbol(symbol));
  url.searchParams.set('interval', interval);
  url.searchParams.set('range', range);
  url.searchParams.set('includePrePost', 'false');
  url.searchParams.set('_ts', String(Date.now()));

  // 段落說明：呼叫外部資料來源並等待回應。
  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Yahoo chart HTTP ${response.status}`);

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
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

// 預留給後端/Proxy：期交所即時或歷史資料需要先由後端整理成 JSON/CSV OHLCV。
export async function fetchTaifexCandles({ taifexUrl }) {
  if (!taifexUrl) {
    throw new Error('Provide options.taifexUrl. Use a backend/proxy endpoint that returns OHLCV JSON or CSV.');
  }

  // 段落說明：呼叫外部資料來源並等待回應。
  const response = await fetch(`${taifexUrl}${taifexUrl.includes('?') ? '&' : '?'}_ts=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json,text/csv,text/plain,*/*' }
  });
  if (!response.ok) throw new Error(`TAIFEX chart source HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') || '';
  const rows = contentType.includes('application/json')
    ? normalizeTaifexJson(await response.json())
    : parseCsv(await response.text());

  return rows.map(normalizeOhlcv).filter(Boolean).sort((a, b) => sortTime(a.time, b.time));
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

  // 段落說明：呼叫外部資料來源並等待回應。
  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Broker chart source HTTP ${response.status}`);

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

// bucketTime：把 snapshot 時間對齊目前圖表週期，避免同一分鐘內重複產生多根 K。
function bucketTime(time, timeframe) {
  if (typeof time !== 'number') return time;
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

// finMindDailyRowToCandle：把 FinMind TaiwanFuturesDaily 每日資料轉成 OHLCV。
function finMindDailyRowToCandle(row) {
  if (!row) return null;
  const time = normalizeTime(row.date ?? row.datetime ?? row.trading_date);
  const open = Number(row.open ?? row.Open);
  const high = Number(row.max ?? row.high ?? row.High);
  const low = Number(row.min ?? row.low ?? row.Low);
  const close = Number(row.close ?? row.Close);
  const volume = Number(
    row.volume ??
      row.Volume ??
      row.trading_volume ??
      row.Trading_Volume ??
      row.total_volume ??
      row.TotalVolume ??
      0
  );

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

    const volume = Number(
      row.volume ??
        row.Volume ??
        row.trading_volume ??
        row.Trading_Volume ??
        row.total_volume ??
        row.TotalVolume ??
        0
    );
    const current = byDate.get(date);
    const currentVolume = current
      ? Number(
          current.volume ??
            current.Volume ??
            current.trading_volume ??
            current.Trading_Volume ??
            current.total_volume ??
            current.TotalVolume ??
            0
        )
      : -1;

    if (!current || volume >= currentVolume) byDate.set(date, row);
  });

  return [...byDate.values()].sort((a, b) =>
    sortTime(normalizeTime(a.date ?? a.datetime ?? a.trading_date), normalizeTime(b.date ?? b.datetime ?? b.trading_date))
  );
}

// fetchFinMindFuturesDailyCandles：snapshot 不可用時，用 FinMind daily 資料維持圖表可用。
async function fetchFinMindFuturesDailyCandles(options = {}) {
  const token = resolveFinMindToken(options);
  const dataId = options.finMindDailyId || options.dailyId || 'TX';
  const url = yahooProxyUrl(FINMIND_FUTURES_DAILY_ENDPOINT);
  url.searchParams.set('data_id', dataId);
  if (token) url.searchParams.set('token', token);
  url.searchParams.set('_ts', String(Date.now()));

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
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
  if (token) url.searchParams.set('token', token);
  url.searchParams.set('_ts', String(Date.now()));

  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
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

export async function fetchTaifexCsvCandles({ taifexCsvText, timeframe = 'D', productCodes = TAIEX_FUTURE_CODES }) {
  if (!taifexCsvText) {
    throw new Error('請先載入期交所逐筆CSV檔');
  }
  return buildCandlesFromTaifexTickCsv(taifexCsvText, { timeframe, productCodes });
}

// normalizeTaifexJson：函式用途註解，說明此處封裝一段可重用的流程。
function normalizeTaifexJson(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.candles)) return payload.candles;
  return [];
}

// buildCandlesFromTaifexTickCsv：函式用途註解，說明此處封裝一段可重用的流程。
function buildCandlesFromTaifexTickCsv(text, { timeframe = 'D', productCodes = TAIEX_FUTURE_CODES } = {}) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // TAIFEX CSV may come from different exports or encodings. Header lookup is used first,
  // and the fixed column fallback keeps old daily tick files usable.
  const headers = splitCsvLine(lines[0]).map(cleanCsvCell);
  const index = {
    date: findHeaderIndex(headers, '成交日期', 0),
    product: findHeaderIndex(headers, '商品代號', 1),
    month: findHeaderIndex(headers, '到期月份', 2),
    time: findHeaderIndex(headers, '成交時間', 3),
    price: findHeaderIndex(headers, '成交價格', 4),
    volume: findHeaderIndex(headers, '成交數量', 5)
  };
  // codeSet：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const codeSet = new Set(productCodes.map((code) => String(code).toUpperCase()));

  // CSV 可能含有不同商品或缺漏列；先在這裡做資料品質閘門。
  // 後續聚合邏輯假設 rows 都已經是同一商品、同一欄位格式的有效 tick。
  // 逐筆資料先篩商品代號，再保留可解析的成交價、成交量、成交時間。
  const ticks = lines
    .slice(1)
    .map((line) => splitCsvLine(line).map(cleanCsvCell))
    .map((values) => {
      const product = String(values[index.product] || '').toUpperCase();
      const contractMonth = parseInt(cleanNumber(values[index.month]), 10);
      const price = Number(cleanNumber(values[index.price]));
      const volume = Number(cleanNumber(values[index.volume]));
      const time = parseTaifexTickTime(values[index.date], values[index.time]);
      return { product, contractMonth, price, volume, time };
    })
    .filter((row) =>
      codeSet.has(row.product) &&
      Number.isFinite(row.contractMonth) &&
      Number.isFinite(row.price) &&
      Number.isFinite(row.volume) &&
      Number.isFinite(row.time)
    );

  if (!ticks.length) {
    throw new Error(`CSV找不到台指期商品代號：${productCodes.join('/')}`);
  }

  // 期交所逐筆檔常同時帶近月與遠月，前端看盤先以近月代表主力合約。
  // 若之後要做換月規則，擴充點會在這個 nearMonth 選擇邏輯。
  // 近月以 CSV 中可用到期月份的最小值判斷；日後若要處理換倉可在這裡擴充。
  const nearMonth = Math.min(...ticks.map((row) => row.contractMonth));
  const frontMonthTicks = ticks
    .filter((row) => row.contractMonth === nearMonth)
    .sort((a, b) => a.time - b.time);

  return aggregateTicksToCandles(frontMonthTicks, timeframe);
}

// findHeaderIndex：函式用途註解，說明此處封裝一段可重用的流程。
function findHeaderIndex(headers, keyword, fallback) {
  // index：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const index = headers.findIndex((header) => header.includes(keyword));
  return index >= 0 ? index : fallback;
}

// cleanCsvCell：函式用途註解，說明此處封裝一段可重用的流程。
function cleanCsvCell(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
}

// cleanNumber：函式用途註解，說明此處封裝一段可重用的流程。
function cleanNumber(value) {
  return cleanCsvCell(value).replaceAll(',', '').replaceAll('--', '').replaceAll('-', '');
}

// parseTaifexTickTime：函式用途註解，說明此處封裝一段可重用的流程。
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
  return Math.floor(new Date(year, month, day, hour, minute, second).getTime() / 1000);
}

// aggregateTicksToCandles：函式用途註解，說明此處封裝一段可重用的流程。
function aggregateTicksToCandles(ticks, timeframe) {
  const buckets = new Map();
  const step = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : null;

  // 分 K 用固定秒數切 bucket，日 K 則用日期字串切 bucket。
  // 這讓 Yahoo、TAIFEX、券商 API 最後都能回到同一種 OHLCV candle 結構。
  // 同一個時間 bucket 內：第一筆為 open、最高/最低更新 high/low、最後一筆為 close、量累加。
  ticks.forEach((tick) => {
    const key = step ? Math.floor(tick.time / step) * step : dateKeyFromUnix(tick.time);
    let candle = buckets.get(key);
    if (!candle) {
      candle = {
        time: key,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: 0
      };
      buckets.set(key, candle);
    }

    candle.high = Math.max(candle.high, tick.price);
    candle.low = Math.min(candle.low, tick.price);
    candle.close = tick.price;
    candle.volume += tick.volume;
  });

  return [...buckets.values()].sort((a, b) => sortTime(a.time, b.time));
}

// dateKeyFromUnix：函式用途註解，說明此處封裝一段可重用的流程。
function dateKeyFromUnix(time) {
  const date = new Date(time * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// parseCsv：函式用途註解，說明此處封裝一段可重用的流程。
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // headers：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index]?.trim();
      return row;
    }, {});
  });
}

// splitCsvLine：函式用途註解，說明此處封裝一段可重用的流程。
function splitCsvLine(line) {
  const result = [];
  let current = '';
  let quoted = false;

  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}

// sortTime：函式用途註解，說明此處封裝一段可重用的流程。
function sortTime(a, b) {
  const av = typeof a === 'string' ? Date.parse(a) / 1000 : a;
  const bv = typeof b === 'string' ? Date.parse(b) / 1000 : b;
  return av - bv;
}

// generateFallbackCandles：函式用途註解，說明此處封裝一段可重用的流程。
function generateFallbackCandles({ timeframe = 'D', base = 32000 }) {
  const isIntraday = timeframe === '1m' || timeframe === '5m';
  const count = isIntraday ? 120 : 120;
  const stepSeconds = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : 86400;
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
async function fetchCandles(options) {
  if (options.source === 'mock') return generateFallbackCandles(options);
  if (options.source === 'taifex_csv') return fetchTaifexCsvCandles(options);
  if (options.source === 'taifex') return fetchTaifexCandles(options);
  if (options.source === 'finmind') return fetchFinMindFuturesCandles(options);
  if (options.source === 'finmind_futures') return fetchFinMindFuturesCandles(options);
  if (options.source === 'broker') return fetchBrokerCandles(options);
  return fetchYahooCandles(options);
}

// 建立圖表外殼：上方控制列、CSV 載入按鈕、圖表容器、左上 legend。
function createShell(container) {
  // 段落說明：建立此區塊的 DOM 結構。
  container.innerHTML = '';

  // 段落說明：建立新的 DOM 節點。
  const root = document.createElement('div');
  root.className = 'lc-chart';
  root.style.cssText = [
    'position:relative',
    'width:100%',
    'height:100%',
    'min-height:360px',
    'background:#0d0f14',
    'display:grid',
    'grid-template-rows:auto minmax(0,1fr)',
    'overflow:hidden'
  ].join(';');

  // 段落說明：建立新的 DOM 節點。
  const chartArea = document.createElement('div');
  chartArea.style.cssText = 'position:relative;min-height:0;';

  // 段落說明：建立新的 DOM 節點。
  const chartNode = document.createElement('div');
  chartNode.style.cssText = 'position:absolute;inset:0;';

  // 段落說明：建立新的 DOM 節點。
  const toolbar = document.createElement('div');
  toolbar.style.cssText = `
    position:relative;z-index:4;display:flex;align-items:center;gap:6px;flex-wrap:wrap;
    min-height:42px;padding:6px 8px;background:rgba(9,10,14,.96);border-bottom:1px solid rgba(120,140,180,.28);
  `;

  // 段落說明：建立新的 DOM 節點。
  const symbolSelect = document.createElement('select');
  symbolSelect.dataset.minWidth = '180';
  symbolSelect.style.cssText = controlStyle('180px');

  // 段落說明：建立新的 DOM 節點。
  const timeframeSelect = document.createElement('select');
  timeframeSelect.dataset.minWidth = '92';
  timeframeSelect.style.cssText = controlStyle('92px');

  // 段落說明：建立新的 DOM 節點。
  const dataSourceSelect = document.createElement('select');
  dataSourceSelect.dataset.minWidth = '180';
  dataSourceSelect.style.cssText = controlStyle('180px');

  // 段落說明：建立新的 DOM 節點。
  const csvInput = document.createElement('input');
  csvInput.type = 'file';
  csvInput.accept = '.csv,text/csv';
  csvInput.style.display = 'none';

  // 段落說明：建立新的 DOM 節點。
  const csvButton = document.createElement('button');
  csvButton.type = 'button';
  csvButton.textContent = '載入CSV';
  csvButton.style.cssText = buttonStyle('92px');

  // 段落說明：建立新的 DOM 節點。
  const indicatorSelect = document.createElement('select');
  indicatorSelect.dataset.minWidth = '210';
  indicatorSelect.style.cssText = controlStyle('210px');

  // 段落說明：建立新的 DOM 節點。
  const status = document.createElement('span');
  status.style.cssText = [
    'font:12px "Noto Sans TC", sans-serif',
    'color:#8da0bf',
    'padding:0 4px',
    'min-width:160px',
    'flex:1 1 180px',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis'
  ].join(';');

  // 段落說明：建立新的 DOM 節點。
  const legend = document.createElement('div');
  legend.className = 'lc-chart-legend';
  legend.style.cssText = `
    position:absolute;left:12px;top:10px;z-index:3;min-width:280px;max-width:calc(100% - 96px);
    padding:7px 10px;border:1px solid rgba(120,140,180,.24);border-radius:6px;
    background:linear-gradient(90deg,rgba(9,10,14,.88),rgba(9,10,14,.62));
    backdrop-filter:blur(2px);
    color:#dfe7f7;font:12px "Noto Sans TC", "JetBrains Mono", sans-serif;
    text-shadow:0 1px 2px rgba(0,0,0,.9);pointer-events:none;
  `;

  // 段落說明：將建立好的節點掛回頁面。
  toolbar.append(
    toolbarLabel('商品'),
    symbolSelect,
    toolbarLabel('週期'),
    timeframeSelect,
    toolbarLabel('資料來源'),
    dataSourceSelect,
    csvButton,
    csvInput,
    toolbarLabel('指標'),
    indicatorSelect,
    status
  );
  // 段落說明：將建立好的節點掛回頁面。
  chartArea.append(chartNode, legend);
  // 段落說明：將建立好的節點掛回頁面。
  root.append(toolbar, chartArea);
  // 段落說明：將建立好的節點掛回頁面。
  container.appendChild(root);

  return { root, chartNode, symbolSelect, timeframeSelect, dataSourceSelect, csvInput, csvButton, indicatorSelect, status, legend };
}

// toolbarLabel：函式用途註解，說明此處封裝一段可重用的流程。
function toolbarLabel(text) {
  // 段落說明：建立新的 DOM 節點。
  const label = document.createElement('span');
  label.textContent = text;
  label.style.cssText = [
    'height:28px',
    'min-height:28px',
    'display:inline-flex',
    'align-items:center',
    'padding:0 8px',
    'border:1px solid rgba(245,200,66,.42)',
    'background:rgba(245,200,66,.1)',
    'color:#f5c842',
    'font:700 13px "Noto Sans TC", sans-serif',
    'line-height:28px',
    'letter-spacing:.04em',
    'flex:0 0 auto'
  ].join(';');
  return label;
}

// controlStyle：函式用途註解，說明此處封裝一段可重用的流程。
function controlStyle(width = 'auto') {
  return [
    'height:28px',
    'min-height:28px',
    `width:${width}`,
    `min-width:${width}`,
    'max-width:none',
    'box-sizing:border-box',
    'background:#151c2b',
    'color:#dfe7f7',
    'border:1px solid rgba(120,140,180,.35)',
    'border-radius:3px',
    'font:12px "Noto Sans TC", sans-serif',
    'line-height:26px',
    'padding:0 28px 0 8px',
    'outline:none',
    'flex:0 0 auto'
  ].join(';');
}

// buttonStyle：函式用途註解，說明此處封裝一段可重用的流程。
function buttonStyle(width = '92px') {
  return [
    'height:28px',
    'min-height:28px',
    `width:${width}`,
    `min-width:${width}`,
    'box-sizing:border-box',
    'background:#2a1f07',
    'color:#f5c842',
    'border:1px solid rgba(245,200,66,.55)',
    'border-radius:3px',
    'font:700 12px "Noto Sans TC", sans-serif',
    'line-height:26px',
    'padding:0 8px',
    'cursor:pointer',
    'outline:none',
    'flex:0 0 auto'
  ].join(';');
}

// fillSelect：函式用途註解，說明此處封裝一段可重用的流程。
function fillSelect(select, items, activeValue) {
  // 段落說明：更新 DOM 內容。
  select.innerHTML = items
    .map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === activeValue ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
  fitSelectToText(select);
}

// 下拉框寬度依最長選項文字自動增寬，但不低於各自 dataset.minWidth。
function fitSelectToText(select) {
  const selectedText = select.options[select.selectedIndex]?.textContent || '';
  const minWidth = Number(select.dataset.minWidth || 120);
  // longestText：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const longestText = [...select.options].reduce((longest, option) => {
    const text = option.textContent || '';
    return text.length > longest.length ? text : longest;
  }, selectedText);
  // 段落說明：建立新的 DOM 節點。
  const canvas = fitSelectToText.canvas || (fitSelectToText.canvas = document.createElement('canvas'));
  // 段落說明：取得 Canvas 2D context 進行繪圖。
  const ctx = canvas.getContext('2d');
  ctx.font = getComputedStyle(select).font || '12px "Noto Sans TC", sans-serif';
  const width = Math.ceil(ctx.measureText(longestText).width) + 72;
  select.style.width = `${Math.max(minWidth, width)}px`;
  select.style.minWidth = select.style.width;
}

// fitAllSelects：函式用途註解，說明此處封裝一段可重用的流程。
function fitAllSelects(...selects) {
  selects.forEach((select) => fitSelectToText(select));
}

// SMA 指標資料只依 close 計算；目前固定使用 SMA_PERIOD。
function calculateSma(candles, period = SMA_PERIOD) {
  const result = [];
  let sum = 0;

  candles.forEach((candle, index) => {
    sum += candle.close;
    if (index >= period) sum -= candles[index - period].close;
    if (index >= period - 1) {
      result.push({
        time: candle.time,
        value: +(sum / period).toFixed(4)
      });
    }
  });

  return result;
}

// 初次載入整批資料時使用 setData；這會重建 K 線、成交量、SMA。
function applyCandles(candleSeries, volumeSeries, smaSeries, candles) {
  // 段落說明：將整批資料送入圖表序列。
  candleSeries.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
  // 段落說明：將整批資料送入圖表序列。
  volumeSeries.setData(candles.map(toVolumePoint));
  const smaData = calculateSma(candles);
  // 段落說明：將整批資料送入圖表序列。
  smaSeries.setData(smaData);
  return smaData;
}

// 輪詢更新時只更新最後一根 K 線，但 SMA 會用最新 candles 重算。
function updateLastCandle(candleSeries, volumeSeries, smaSeries, candles, candle) {
  candleSeries.update({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  });
  volumeSeries.update(toVolumePoint(candle));
  const smaData = calculateSma(candles);
  // 段落說明：將整批資料送入圖表序列。
  smaSeries.setData(smaData);
  return smaData;
}

// toVolumePoint：函式用途註解，說明此處封裝一段可重用的流程。
function toVolumePoint(candle) {
  return {
    time: candle.time,
    value: candle.volume || 0,
    color: candle.close >= candle.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR
  };
}

// formatPrice：函式用途註解，說明此處封裝一段可重用的流程。
function formatPrice(value) {
  if (!Number.isFinite(value)) return '--';
  return Number(value).toLocaleString('zh-TW', {
    minimumFractionDigits: value >= 1000 ? 2 : 2,
    maximumFractionDigits: value >= 1000 ? 2 : 2
  });
}

// formatVolume：函式用途註解，說明此處封裝一段可重用的流程。
function formatVolume(value) {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}億`;
  if (abs >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return String(Math.round(value));
}

// formatChartTime：函式用途註解，說明此處封裝一段可重用的流程。
function formatChartTime(time, timeframe = 'D') {
  if (time == null) return '--';
  if (typeof time === 'string') return time;
  if (typeof time === 'object' && Number.isFinite(time.year)) {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  }

  const date = new Date(Number(time) * 1000);
  const options = timeframe === 'D'
    ? { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }
    : {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
  return new Intl.DateTimeFormat('zh-TW', options).format(date);
}

// chartTimeToUnix：函式用途註解，說明此處封裝一段可重用的流程。
function chartTimeToUnix(time) {
  if (typeof time === 'number') return time;
  if (typeof time === 'string') {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  if (typeof time === 'object' && Number.isFinite(time.year)) {
    return Math.floor(new Date(time.year, time.month - 1, time.day).getTime() / 1000);
  }
  return null;
}

// changeFromPrevious：函式用途註解，說明此處封裝一段可重用的流程。
function changeFromPrevious(candles, index) {
  const candle = candles[index];
  if (!candle) return { value: 0, pct: 0 };
  const prevClose = candles[index - 1]?.close ?? candle.open;
  const value = candle.close - prevClose;
  return {
    value,
    pct: prevClose ? (value / prevClose) * 100 : 0
  };
}

// findTimeIndex：函式用途註解，說明此處封裝一段可重用的流程。
function findTimeIndex(candles, time) {
  if (time == null) return -1;
  const key = timeKey(time);
  return candles.findIndex((candle) => timeKey(candle.time) === key);
}

  // timeKey：函式用途註解，說明此處封裝一段可重用的流程。
  function timeKey(time) {
    return typeof time === 'object' ? JSON.stringify(time) : String(time);
  }

// nearestCandleIndex：函式用途註解，說明此處封裝一段可重用的流程。
function nearestCandleIndex(candles, targetTime) {
  const target = chartTimeToUnix(targetTime);
  if (!Number.isFinite(target)) return -1;

  let bestIndex = -1;
  let bestDistance = Infinity;
  candles.forEach((candle, index) => {
    const current = chartTimeToUnix(candle.time);
    if (!Number.isFinite(current)) return;
    const distance = Math.abs(current - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

// escapeHtml：函式用途註解，說明此處封裝一段可重用的流程。
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// readFileText：函式用途註解，說明此處封裝一段可重用的流程。
function readFileText(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('CSV讀取失敗'));
    reader.readAsText(file, encoding);
  });
}

// mountMarketChart：函式用途註解，說明此處封裝一段可重用的流程。
export async function mountMarketChart(container, options = {}) {
  // 段落說明：回傳清理函式，供頁面卸載時釋放資源。
  if (!container) return () => {};

  // mountMarketChart 是 Page1 C 區「自有資料」分頁的主要入口。
  const LightweightCharts = await loadLightweightChartsScript();
  const shell = createShell(container);
  const symbols = options.symbols || [
    { label: '加權指數', value: 'INDEX:TWII', source: 'yahoo' },
    { label: '台積電', value: '2330', source: 'yahoo' },
    { label: '台指期', value: 'TXF', source: 'taifex', type: 'future' }
  ];
  const timeframes = options.timeframes || [
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '日K', value: 'D' }
  ];
  const dataSources = options.dataSources || [
    { label: 'YAHOO', value: 'yahoo' },
    { label: 'FinMind期貨', value: 'finmind_futures' },
    { label: '期交所資料', value: 'taifex' },
    { label: '期交所CSV', value: 'taifex_csv' },
    { label: '券商API', value: 'broker' }
  ];
  const indicators = options.indicators || [
    { label: '成交量 + SMA 9', value: 'volume_sma' },
    { label: '成交量', value: 'volume' },
    { label: 'SMA 9', value: 'sma' },
    { label: '無', value: 'none' }
  ];

  let activeSymbol = options.symbol || symbols[0]?.value || 'INDEX:TWII';
  let activeTimeframe = options.timeframe || options.interval || 'D';
  let activeDataSource = options.getDataSource?.() || options.source || dataSources[0]?.value || 'yahoo';
  let activeIndicator = options.indicator || indicators[0]?.value || 'volume_sma';
  let taifexCsvText = options.taifexCsvText || '';
  let taifexCsvName = '';
  let lastCandles = [];
  let lastSmaData = [];
  let selectedCandle = null;
  let disposed = false;
  let timer = null;
  let closePriceLine = null;
  let smaPriceLine = null;

  fillSelect(shell.symbolSelect, symbols, activeSymbol);
  fillSelect(shell.timeframeSelect, timeframes, activeTimeframe);
  fillSelect(shell.dataSourceSelect, dataSources, activeDataSource);
  fillSelect(shell.indicatorSelect, indicators, activeIndicator);
  fitAllSelects(shell.symbolSelect, shell.timeframeSelect, shell.dataSourceSelect, shell.indicatorSelect);

  const chart = LightweightCharts.createChart(shell.chartNode, {
    autoSize: true,
    layout: {
      background: { color: '#0d0f14' },
      textColor: '#aebbd3'
    },
    grid: {
      vertLines: { color: 'rgba(80,95,125,.22)' },
      horzLines: { color: 'rgba(80,95,125,.22)' }
    },
    localization: { locale: 'zh-TW' },
    timeScale: {
      timeVisible: true,
      secondsVisible: activeTimeframe === '1m'
    },
    rightPriceScale: {
      borderColor: 'rgba(120,140,180,.28)',
      scaleMargins: { top: 0.05, bottom: 0.18 }
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
  });

  const candleSeries = chart.addCandlestickSeries({
    upColor: UP_COLOR,
    downColor: DOWN_COLOR,
    borderUpColor: UP_COLOR,
    borderDownColor: DOWN_COLOR,
    wickUpColor: '#f2a6b8',
    wickDownColor: '#83e8b0',
    priceLineVisible: false
  });

  const smaSeries = chart.addLineSeries({
    color: SMA_COLOR,
    lineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: false,
    title: `SMA ${SMA_PERIOD} close`
  });

  const volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    lastValueVisible: true,
    priceLineVisible: true
  });
  volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

  // hasVolumeIndicator：函式用途註解，說明此處封裝一段可重用的流程。
  function hasVolumeIndicator() {
    return activeIndicator === 'volume_sma' || activeIndicator === 'volume';
  }

  // hasSmaIndicator：函式用途註解，說明此處封裝一段可重用的流程。
  function hasSmaIndicator() {
    return activeIndicator === 'volume_sma' || activeIndicator === 'sma';
  }

  // applyIndicatorVisibility：函式用途註解，說明此處封裝一段可重用的流程。
  function applyIndicatorVisibility() {
    volumeSeries.applyOptions({
      visible: hasVolumeIndicator(),
      lastValueVisible: hasVolumeIndicator(),
      priceLineVisible: hasVolumeIndicator()
    });
    smaSeries.applyOptions({
      visible: hasSmaIndicator(),
      lastValueVisible: hasSmaIndicator(),
      priceLineVisible: false
    });
  }

  applyIndicatorVisibility();

  // activeSymbolConfig：函式用途註解，說明此處封裝一段可重用的流程。
  function activeSymbolConfig() {
    return symbols.find((item) => item.value === activeSymbol) || { label: activeSymbol, value: activeSymbol, source: 'yahoo' };
  }

  // activeTimeframeConfig：函式用途註解，說明此處封裝一段可重用的流程。
  function activeTimeframeConfig() {
    return timeframes.find((item) => item.value === activeTimeframe) || { label: activeTimeframe, value: activeTimeframe };
  }

  // activeDataSourceConfig：函式用途註解，說明此處封裝一段可重用的流程。
  function activeDataSourceConfig() {
    return dataSources.find((item) => item.value === activeDataSource) || { label: activeDataSource, value: activeDataSource };
  }

  function notifyDataUpdate(candles) {
    if (typeof options.onDataUpdate !== 'function' || !Array.isArray(candles) || !candles.length) return;
    const latest = candles.at(-1);
    if (!latest) return;
    options.onDataUpdate({
      candles,
      latest,
      previous: candles.length > 1 ? candles.at(-2) : null,
      symbol: activeSymbol,
      symbolConfig: activeSymbolConfig(),
      source: activeDataSource,
      dataSource: activeDataSourceConfig(),
      timeframe: activeTimeframe
    });
  }

  // csvProductCodes：函式用途註解，說明此處封裝一段可重用的流程。
  function csvProductCodes() {
    const symbolConfig = activeSymbolConfig();
    if (Array.isArray(symbolConfig.csvProductCodes)) return symbolConfig.csvProductCodes;
    if (symbolConfig.type === 'future' || symbolConfig.value === 'TXF' || symbolConfig.value === 'TX') return TAIEX_FUTURE_CODES;
    return TAIEX_FUTURE_CODES;
  }

  // CSV 模式才顯示載入按鈕；一般 API 來源不需要本機檔案。
  function syncCsvControls() {
    const visible = activeDataSource === 'taifex_csv';
    shell.csvButton.style.display = visible ? '' : 'none';
    if (visible && !taifexCsvText) shell.status.textContent = '請載入CSV';
  }

  // 切到 CSV 模式時自動改用期貨商品，避免拿加權指數去篩逐筆商品代號。
  function useFutureSymbolForCsv() {
    if (activeDataSource !== 'taifex_csv' && activeDataSource !== 'finmind_futures' && activeDataSource !== 'finmind') return;
    // futureSymbol：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const futureSymbol = symbols.find((item) => item.value === 'TXF' || item.value === 'TX' || item.type === 'future');
    if (!futureSymbol) return;
    activeSymbol = futureSymbol.value;
    shell.symbolSelect.value = activeSymbol;
  }

  // latestSmaPoint：函式用途註解，說明此處封裝一段可重用的流程。
  function latestSmaPoint(index = lastCandles.length - 1) {
    const candle = lastCandles[index];
    if (!candle) return null;
    return lastSmaData.find((point) => timeKey(point.time) === timeKey(candle.time)) || lastSmaData.at(-1) || null;
  }

  // updateLegend：函式用途註解，說明此處封裝一段可重用的流程。
  function updateLegend(candle = lastCandles.at(-1), index = lastCandles.length - 1) {
    if (!candle) {
      // 段落說明：更新 DOM 內容。
      shell.legend.innerHTML = '';
      return;
    }

    const { value: change, pct } = changeFromPrevious(lastCandles, index);
    const changeColor = change >= 0 ? UP_COLOR : DOWN_COLOR;
    const smaPoint = latestSmaPoint(index);
    const displayTime = formatChartTime(candle.time, activeTimeframe);
    const selectedRow = selectedCandle
      ? `<div style="margin-top:4px;color:#f5c842;">選取時間 <span>${formatChartTime(selectedCandle.time, activeTimeframe)}</span></div>`
      : '';
    const volumeRow = hasVolumeIndicator()
      ? `<div style="margin-top:4px;color:#dfe7f7;">成交量 <span style="color:#dfe7f7;">${formatVolume(candle.volume || 0)}</span></div>`
      : '';
    const smaRow = hasSmaIndicator()
      ? `<div style="margin-top:4px;color:#dfe7f7;">SMA ${SMA_PERIOD} close <span style="color:${SMA_COLOR};">${smaPoint ? formatPrice(smaPoint.value) : '--'}</span></div>`
      : '';

    // 段落說明：更新 DOM 內容。
    shell.legend.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;white-space:nowrap;flex-wrap:nowrap;">
        <span style="color:#f5c842;">K線時間 ${escapeHtml(displayTime)}</span>
        <span style="color:#f5c842;">D</span>
        <span>開 ${formatPrice(candle.open)}</span>
        <span>高 ${formatPrice(candle.high)}</span>
        <span>低 ${formatPrice(candle.low)}</span>
        <span>收 ${formatPrice(candle.close)}</span>
        <span style="color:${changeColor};">${change >= 0 ? '+' : ''}${formatPrice(change)} (${change >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span>
      </div>
      ${selectedRow}
      ${volumeRow}
      ${smaRow}
    `;
  }

  // 最新價與 SMA 的右側價格線；指標關閉時不畫 SMA 線。
  function syncPriceLines() {
    const latest = lastCandles.at(-1);
    if (!latest) return;

    if (closePriceLine) candleSeries.removePriceLine(closePriceLine);
    if (smaPriceLine) {
      smaSeries.removePriceLine(smaPriceLine);
      smaPriceLine = null;
    }

    const latestIndex = lastCandles.length - 1;
    const { value: change } = changeFromPrevious(lastCandles, latestIndex);
    closePriceLine = candleSeries.createPriceLine({
      price: latest.close,
      color: change >= 0 ? UP_COLOR : DOWN_COLOR,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle?.Dotted ?? 1,
      axisLabelVisible: true,
      title: ''
    });

    const smaPoint = latestSmaPoint(latestIndex);
    if (hasSmaIndicator() && smaPoint) {
      smaPriceLine = smaSeries.createPriceLine({
        price: smaPoint.value,
        color: SMA_COLOR,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle?.Solid ?? 0,
        axisLabelVisible: true,
        title: ''
      });
    }
  }

  // 初次載入或切換商品/週期/資料來源時會走這裡。
  async function loadInitialData() {
    const symbolConfig = activeSymbolConfig();
    shell.status.textContent = '載入中';
    try {
      // fetchCandles 是資料來源分流的單一入口；不同來源回來後都會被轉成 OHLCV。
      const candles = await fetchCandles({
        ...options,
        ...symbolConfig,
        symbol: symbolConfig.value,
        timeframe: activeTimeframe,
        source: activeDataSource,
        taifexCsvText,
        productCodes: csvProductCodes()
      });
      lastCandles = candles.length ? candles : generateFallbackCandles({ timeframe: activeTimeframe });
      if (candles.length) notifyDataUpdate(lastCandles);
      selectedCandle = null;
      lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, lastCandles);
      // 切換商品或來源後重設可視範圍，避免沿用上一張圖的縮放狀態。
      // 段落說明：自動縮放時間軸以顯示完整資料。
      chart.timeScale().fitContent();
      updateLegend();
      syncPriceLines();
      shell.status.textContent = activeDataSourceConfig().label;
    } catch (error) {
      lastCandles = generateFallbackCandles({ timeframe: activeTimeframe });
      lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, lastCandles);
      // 段落說明：自動縮放時間軸以顯示完整資料。
      chart.timeScale().fitContent();
      updateLegend();
      syncPriceLines();
      shell.status.textContent = `使用模擬資料：${error.message}`;
    }
  }

  // API 型資料源用 polling 更新；本機 CSV 不會自動變動，所以 restartPolling 會跳過。
  async function pollLatest() {
    if (disposed) return;
    try {
      const symbolConfig = activeSymbolConfig();
      // 目前以簡單 polling 取得完整序列，再用最後一根更新畫面；
      // 之後若後端提供增量資料，只要替換這段取資料邏輯即可。
      const candles = await fetchCandles({
        ...options,
        ...symbolConfig,
        symbol: symbolConfig.value,
        timeframe: activeTimeframe,
        source: activeDataSource,
        taifexCsvText,
        productCodes: csvProductCodes()
      });
      const latest = candles.at(-1);
      if (!latest) return;
      lastCandles = candles;
      notifyDataUpdate(lastCandles);
      lastSmaData = updateLastCandle(candleSeries, volumeSeries, smaSeries, lastCandles, latest);
      updateLegend();
      syncPriceLines();
      shell.status.textContent = `更新 ${new Date().toLocaleTimeString('zh-TW', { hour12: false })}`;
    } catch (error) {
      shell.status.textContent = `更新失敗：${error.message}`;
    }
  }

  // restartPolling：函式用途註解，說明此處封裝一段可重用的流程。
  function restartPolling() {
    // 段落說明：清除定時器，避免頁面卸載後繼續執行。
    if (timer) clearInterval(timer);
    if (activeDataSource === 'taifex_csv') {
      timer = null;
      return;
    }
    // 段落說明：建立定時更新流程。
    timer = setInterval(pollLatest, options.pollMs || 15000);
  }

  async function setActiveDataSource(source, { notify = false, reload = true } = {}) {
    if (!source || source === activeDataSource) return;
    activeDataSource = source;
    shell.dataSourceSelect.value = activeDataSource;
    useFutureSymbolForCsv();
    syncCsvControls();
    fitSelectToText(shell.dataSourceSelect);
    fitSelectToText(shell.symbolSelect);
    if (notify) options.onDataSourceChange?.(activeDataSource);
    if (!reload) return;
    await loadInitialData();
    restartPolling();
  }

  // 滑鼠移到哪根 K 線，legend 就顯示該根 K 線的時間與 OHLCV。
  // 段落說明：監聽圖表十字線移動，用來更新目前 K 線資訊。
  chart.subscribeCrosshairMove((param) => {
    // crosshair 沒有精準落在資料點時，保留已點選 K 線或回到最新 K 線。
    if (!param?.time || !lastCandles.length) {
      if (selectedCandle) {
        const selectedIndex = findTimeIndex(lastCandles, selectedCandle.time);
        updateLegend(selectedCandle, selectedIndex >= 0 ? selectedIndex : lastCandles.length - 1);
      } else {
        updateLegend();
      }
      return;
    }

    let index = findTimeIndex(lastCandles, param.time);
    if (index < 0) index = nearestCandleIndex(lastCandles, param.time);
    if (index < 0) {
      updateLegend();
      return;
    }
    updateLegend(lastCandles[index], index);
  });

  // 點擊 K 線會固定選取時間，滑鼠移開後仍可看到「選取時間」。
  // 段落說明：監聽圖表點擊，用來固定選取的 K 線。
  chart.subscribeClick((param) => {
    // Lightweight Charts 有時回傳的是邏輯時間，不一定能直接等於 candle.time；
    // 找不到精準索引時再用 nearestCandleIndex 貼近使用者點的位置。
    if (!param?.time || !lastCandles.length) return;
    let index = findTimeIndex(lastCandles, param.time);
    if (index < 0) index = nearestCandleIndex(lastCandles, param.time);
    if (index < 0) return;
    selectedCandle = lastCandles[index];
    updateLegend(selectedCandle, index);
    shell.status.textContent = `選取 ${formatChartTime(selectedCandle.time, activeTimeframe)}`;
  });

  // 段落說明：綁定使用者互動事件。
  shell.symbolSelect.addEventListener('change', async () => {
    activeSymbol = shell.symbolSelect.value;
    useFutureSymbolForCsv();
    fitSelectToText(shell.symbolSelect);
    await loadInitialData();
    restartPolling();
  });

  // 段落說明：綁定使用者互動事件。
  shell.timeframeSelect.addEventListener('change', async () => {
    activeTimeframe = shell.timeframeSelect.value;
    fitSelectToText(shell.timeframeSelect);
    chart.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible: activeTimeframe === '1m'
      }
    });
    await loadInitialData();
    restartPolling();
  });

  // 段落說明：綁定使用者互動事件。
  shell.dataSourceSelect.addEventListener('change', async () => {
    await setActiveDataSource(shell.dataSourceSelect.value, { notify: true });
  });

  // 段落說明：綁定使用者互動事件。
  shell.csvButton.addEventListener('click', () => {
    shell.csvInput.click();
  });

  // 段落說明：綁定使用者互動事件。
  shell.csvInput.addEventListener('change', async () => {
    const file = shell.csvInput.files?.[0];
    if (!file) return;
    taifexCsvText = await readFileText(file, 'big5');
    taifexCsvName = file.name;
    activeDataSource = '';
    await setActiveDataSource('taifex_csv', { notify: true, reload: false });
    useFutureSymbolForCsv();
    syncCsvControls();
    fitSelectToText(shell.dataSourceSelect);
    fitSelectToText(shell.symbolSelect);
    await loadInitialData();
    restartPolling();
    shell.status.textContent = `CSV：${taifexCsvName}`;
  });

  // 段落說明：綁定使用者互動事件。
  shell.indicatorSelect.addEventListener('change', () => {
    activeIndicator = shell.indicatorSelect.value;
    fitSelectToText(shell.indicatorSelect);
    applyIndicatorVisibility();
    updateLegend();
    syncPriceLines();
  });

  const unsubscribeDataSource = options.subscribeDataSourceChange?.((source) => {
    setActiveDataSource(source, { notify: false }).catch((error) => {
      shell.status.textContent = `資料來源切換失敗：${error.message}`;
    });
  }) || null;

  syncCsvControls();
  await loadInitialData();
  restartPolling();

  // 段落說明：回傳清理函式，供頁面卸載時釋放資源。
  return () => {
    disposed = true;
    // 段落說明：清除定時器，避免頁面卸載後繼續執行。
    if (timer) clearInterval(timer);
    if (typeof unsubscribeDataSource === 'function') unsubscribeDataSource();
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    chart.remove();
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    shell.root.remove();
  };
}
