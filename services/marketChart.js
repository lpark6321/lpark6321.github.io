// Page1 C 區自有行情圖表服務：整合資料來源、CSV 轉換、指標與 Lightweight Charts。
const LIGHTWEIGHT_CHARTS_URL =
  'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';

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

const SMA_PERIOD = 9;
const UP_COLOR = '#f03a5f';
const DOWN_COLOR = '#1fd67a';
const SMA_COLOR = '#2962ff';
const VOLUME_UP_COLOR = 'rgba(240,58,95,.48)';
const VOLUME_DOWN_COLOR = 'rgba(31,214,122,.48)';
const VOLUME_ALERT_DAY_COLOR = 'rgba(245,200,66,.95)';
const VOLUME_ALERT_AFTER_HOURS_COLOR = 'rgba(130,224,170,.95)';
const DAY_VOLUME_REFERENCE = 1500;
const AFTER_HOURS_VOLUME_REFERENCE = 400;
const TAIEX_SESSION_START_SECONDS = 9 * 60 * 60;
const TAIEX_SESSION_END_SECONDS = 13 * 60 * 60 + 30 * 60;
const FUTURES_DAY_SESSION_START_SECONDS = 8 * 60 * 60 + 45 * 60;
const FUTURES_DAY_SESSION_END_SECONDS = 13 * 60 * 60 + 45 * 60;
const DEFAULT_KGI_DDE_URL = 'http://127.0.0.1:8788/api/broker-candles';
const DEFAULT_KGI_RTD_URL = 'http://127.0.0.1:8789/api/broker-candles';
const DEFAULT_TAISHIN_DDE_URL = 'http://127.0.0.1:8790/api/broker-candles';
const REQUIRED_LIVE_DATA_SOURCES = [
  { label: '凱基DDE', value: 'kgi_dde' },
  { label: '凱基RTD', value: 'kgi_rtd' },
  { label: '台新DDE', value: 'taishin_dde' }
];
// 期交所逐筆 CSV 內台指期常見商品代號；載入 CSV 時用這組代號篩出台指期。
const TAIEX_FUTURE_CODES = ['TX'];
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
const DEFAULT_YAHOO_PROXY_BASE = 'http://127.0.0.1:8787/api';
const FINMIND_FUTURES_SNAPSHOT_ENDPOINT = 'finmind-futures-snapshot';
const FINMIND_FUTURES_DAILY_ENDPOINT = 'finmind-futures-daily';

let lightweightPromise = null;

function isSecondTimeframe(timeframe) {
  return timeframe === '1s' || timeframe === 'tick';
}

function isIntradayTimeframe(timeframe) {
  return isSecondTimeframe(timeframe) || timeframe === '1m' || timeframe === '5m';
}

function isTaiexIndexSymbol(symbol) {
  return symbol === 'INDEX:TWII' || symbol === 'TWSE:TAIEX';
}

function taipeiSecondOfDay(time = Date.now()) {
  const date = time instanceof Date ? time : new Date(time);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const second = Number(parts.find((part) => part.type === 'second')?.value);
  return [hour, minute, second].every(Number.isFinite) ? hour * 3600 + minute * 60 + second : null;
}

function isTaiexTradingTime(time = Date.now()) {
  const second = taipeiSecondOfDay(time);
  return Number.isFinite(second) && second >= TAIEX_SESSION_START_SECONDS && second <= TAIEX_SESSION_END_SECONDS;
}

function isFuturesDayTradingTime(time = Date.now()) {
  const second = taipeiSecondOfDay(time);
  return Number.isFinite(second) && second >= FUTURES_DAY_SESSION_START_SECONDS && second <= FUTURES_DAY_SESSION_END_SECONDS;
}

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
  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.error || payload?.message || '';
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = '';
      }
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

// bucketTime：把 snapshot 時間對齊目前圖表週期，避免同一分鐘內重複產生多根 K。
function bucketTime(time, timeframe) {
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
  // codeSet：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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

// findHeaderIndex：函式用途註解，說明此處封裝一段可重用的流程。
function findHeaderIndex(headers, keyword, fallback) {
  // index：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const index = headers.findIndex((header) => header.includes(keyword));
  return index >= 0 ? index : fallback;
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

// cleanCsvCell：函式用途註解，說明此處封裝一段可重用的流程。
function cleanCsvCell(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
}

// cleanNumber：函式用途註解，說明此處封裝一段可重用的流程。
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

// aggregateTicksToCandles：函式用途註解，說明此處封裝一段可重用的流程。
function aggregateTicksToCandles(ticks, timeframe) {
  const buckets = new Map();

  // 分 K 用固定秒數切 bucket，日 K 則用日期字串切 bucket。
  // 這讓 Yahoo、TAIFEX、券商 API 最後都能回到同一種 OHLCV candle 結構。
  // 同一個時間 bucket 內：第一筆為 open、最高/最低更新 high/low、最後一筆為 close、量累加。
  ticks.forEach((tick) => {
    aggregateTickIntoCandleBuckets(buckets, tick, timeframe);
  });

  return [...buckets.values()]
    .map(({ firstTime, lastTime, ...candle }) => candle)
    .sort((a, b) => sortTime(a.time, b.time));
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
  const isIntraday = isIntradayTimeframe(timeframe);
  const count = isIntraday ? 120 : 120;
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
async function fetchCandles(options) {
  if (options.source === 'mock') return generateFallbackCandles(options);
  if (options.source === 'taifex_csv') return fetchTaifexCsvCandles(options);
  if (options.source === 'taifex') return fetchTaifexCandles(options);
  if (options.source === 'finmind') return fetchFinMindFuturesCandles(options);
  if (options.source === 'finmind_futures') return fetchFinMindFuturesCandles(options);
  if (options.source === 'kgi_dde') {
    return fetchBrokerCandles({
      ...options,
      brokerUrl: options.kgiDdeUrl || DEFAULT_KGI_DDE_URL
    });
  }
  if (options.source === 'kgi_rtd') {
    return fetchBrokerCandles({
      ...options,
      brokerUrl: options.kgiRtdUrl || DEFAULT_KGI_RTD_URL
    });
  }
  if (options.source === 'taishin_dde') {
    return fetchBrokerCandles({
      ...options,
      brokerUrl: options.taishinDdeUrl || DEFAULT_TAISHIN_DDE_URL
    });
  }
  if (options.source === 'broker') return fetchBrokerCandles(options);
  return fetchYahooCandles(options);
}

function isStrictLiveSource(source) {
  return source === 'kgi_dde' || source === 'kgi_rtd' || source === 'taishin_dde';
}

function isDayFuturesSymbol(symbol, symbolConfig = {}) {
  const value = String(symbol || '').toUpperCase();
  return (
    symbolConfig.session === 'day' ||
    value === 'FITX*1' ||
    value === 'FITX1' ||
    value === 'TXDAY' ||
    value === 'TX_DAY'
  );
}

function ensureLiveDataSources(sources) {
  const next = Array.isArray(sources) ? [...sources] : [];
  REQUIRED_LIVE_DATA_SOURCES.forEach((item) => {
    if (!next.some((source) => source.value === item.value)) next.push(item);
  });
  return next;
}

function shouldSkipLiveSpotRefresh(source, symbol) {
  return isStrictLiveSource(source) && isTaiexIndexSymbol(symbol) && !isTaiexTradingTime();
}

function shouldSkipLiveDayFuturesRefresh(source, symbol, symbolConfig = {}) {
  return isStrictLiveSource(source) && isDayFuturesSymbol(symbol, symbolConfig) && !isFuturesDayTradingTime();
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
  const alert = volumeAlertInfo(candle);
  return {
    time: candle.time,
    value: candle.volume || 0,
    color: alert?.color || (candle.close >= candle.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR)
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

function taipeiMinuteOfDay(time) {
  if (time == null || typeof time === 'string') return null;
  if (typeof time === 'object' && Number.isFinite(time.year)) return null;
  const date = new Date(Number(time) * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function volumeReferenceForTime(time) {
  const minute = taipeiMinuteOfDay(time);
  if (minute == null) return null;
  const dayStart = 8 * 60 + 45;
  const dayEnd = 13 * 60 + 45;
  return minute >= dayStart && minute <= dayEnd
    ? { label: '盤中量', value: DAY_VOLUME_REFERENCE, color: VOLUME_ALERT_DAY_COLOR }
    : { label: '盤後量', value: AFTER_HOURS_VOLUME_REFERENCE, color: VOLUME_ALERT_AFTER_HOURS_COLOR };
}

function volumeAlertInfo(candle) {
  const reference = volumeReferenceForTime(candle?.time);
  const volume = Number(candle?.volume || 0);
  if (!reference || !Number.isFinite(volume) || volume <= reference.value) return null;
  return { ...reference, volume };
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
    { label: '台指', value: 'FITX*1', source: 'taifex', type: 'future', session: 'day', productCodes: ['TX'], csvProductCodes: ['TX'], futuresId: 'TXF', dailyId: 'TX' },
    { label: '台指(全)', value: 'FITXN*1', source: 'taifex', type: 'future', session: 'full', productCodes: ['TX'], csvProductCodes: ['TX'], futuresId: 'TXF', dailyId: 'TX' }
  ];
  const timeframes = options.timeframes || [
    { label: '1S', value: '1s' },
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '日K', value: 'D' }
  ];
  const dataSources = ensureLiveDataSources(options.dataSources || [
    { label: 'YAHOO', value: 'yahoo' },
    { label: 'FinMind期貨', value: 'finmind_futures' },
    { label: '期交所資料', value: 'taifex' },
    { label: '期交所CSV', value: 'taifex_csv' },
    { label: '凱基DDE', value: 'kgi_dde' },
    { label: '凱基RTD', value: 'kgi_rtd' },
    { label: '台新DDE', value: 'taishin_dde' },
    { label: '券商API', value: 'broker' }
  ]);
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
  const initialSymbolConfig = symbols.find((item) => item.value === activeSymbol);
  if (isStrictLiveSource(activeDataSource) && initialSymbolConfig?.type !== 'future') {
    const futureSymbol = symbols.find((item) => item.value === 'TX' || item.value === 'TXF' || item.type === 'future');
    if (futureSymbol) activeSymbol = futureSymbol.value;
  }
  let taifexCsvText = options.taifexCsvText || '';
  let taifexCsvName = '';
  let lastCandles = [];
  let lastLoadedSymbol = null;
  let lastSmaData = [];
  let selectedCandle = null;
  let disposed = false;
  let timer = null;
  let closePriceLine = null;
  let smaPriceLine = null;
  let indexOverlayLastFetchAt = 0;

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
      secondsVisible: isSecondTimeframe(activeTimeframe) || activeTimeframe === '1m'
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

  const indexOverlaySeries = chart.addLineSeries({
    color: '#f5c842',
    lineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: false,
    title: '加權指數'
  });

  const volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    lastValueVisible: true,
    priceLineVisible: true
  });
  volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
  volumeSeries.createPriceLine({
    price: DAY_VOLUME_REFERENCE,
    color: '#f5c842',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle?.Dashed ?? 2,
    axisLabelVisible: true,
    title: `盤中量 ${DAY_VOLUME_REFERENCE}`
  });
  volumeSeries.createPriceLine({
    price: AFTER_HOURS_VOLUME_REFERENCE,
    color: '#82e0aa',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle?.Dashed ?? 2,
    axisLabelVisible: true,
    title: `盤後量 ${AFTER_HOURS_VOLUME_REFERENCE}`
  });

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

  function brokerUrlForSource(source) {
    if (source === 'kgi_dde') return options.kgiDdeUrl || DEFAULT_KGI_DDE_URL;
    if (source === 'kgi_rtd') return options.kgiRtdUrl || DEFAULT_KGI_RTD_URL;
    if (source === 'taishin_dde') return options.taishinDdeUrl || DEFAULT_TAISHIN_DDE_URL;
    if (source === 'broker') return options.brokerUrl;
    return '';
  }

  async function fetchIndexOverlayCandles() {
    if (isStrictLiveSource(activeDataSource) && isTaiexTradingTime()) {
      try {
        return await fetchBrokerCandles({
          brokerUrl: brokerUrlForSource(activeDataSource),
          symbol: 'INDEX:TWII',
          timeframe: activeTimeframe
        });
      } catch (error) {
        console.warn('[marketChart] index overlay live refresh failed:', error);
      }
    }
    return fetchYahooCandles({ symbol: 'INDEX:TWII', timeframe: activeTimeframe });
  }

  async function updateIndexOverlay({ force = false } = {}) {
    const symbolConfig = activeSymbolConfig();
    if (!isTaiexTradingTime() || isTaiexIndexSymbol(symbolConfig.value) || symbolConfig.type !== 'future') {
      indexOverlaySeries.setData([]);
      return;
    }
    const now = Date.now();
    if (!force && now - indexOverlayLastFetchAt < 10000) return;
    indexOverlayLastFetchAt = now;

    try {
      const candles = await fetchIndexOverlayCandles();
      indexOverlaySeries.setData((candles || [])
        .filter((row) => Number.isFinite(Number(row.close)))
        .map((row) => ({ time: row.time, value: Number(row.close) })));
    } catch (error) {
      console.warn('[marketChart] index overlay refresh failed:', error);
    }
  }

  function clearMainSeriesForSymbol(symbol) {
    if (lastLoadedSymbol === symbol) return;
    lastCandles = [];
    selectedCandle = null;
    lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, lastCandles);
    updateLegend();
    syncPriceLines();
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
  function activeProductCodes() {
    const symbolConfig = activeSymbolConfig();
    const codes = symbolConfig.csvProductCodes || symbolConfig.productCodes || symbolConfig.taifexProductCodes;
    if (Array.isArray(codes) && codes.length) return codes;
    const code = symbolConfig.taifexProduct || symbolConfig.productCode || symbolConfig.product || symbolConfig.value;
    return code ? [String(code).replace(/\.TW$/i, '').replace(/F$/i, '').toUpperCase()] : TAIEX_FUTURE_CODES;
  }

  function activeFuturesId() {
    const symbolConfig = activeSymbolConfig();
    return symbolConfig.finMindFuturesId || symbolConfig.futuresId || symbolConfig.taifexFuturesId || symbolConfig.value || 'TXF';
  }

  function activeDailyId() {
    const symbolConfig = activeSymbolConfig();
    return symbolConfig.finMindDailyId || symbolConfig.dailyId || symbolConfig.taifexDailyId || activeProductCodes()[0] || 'TX';
  }

  // CSV 模式才顯示載入按鈕；一般 API 來源不需要本機檔案。
  function syncCsvControls() {
    const visible = activeDataSource === 'taifex_csv';
    shell.csvButton.style.display = visible ? '' : 'none';
    if (visible && !taifexCsvText) shell.status.textContent = '請載入CSV';
  }

  // 商品欄就是資料查詢變數；不要在切換來源時強制改商品。
  function useFutureSymbolForCsv() {
    const symbolConfig = activeSymbolConfig();
    if (isStrictLiveSource(activeDataSource) && symbolConfig.type !== 'future') {
      const futureSymbol = symbols.find((item) => item.value === 'TX' || item.value === 'TXF' || item.type === 'future');
      if (futureSymbol) activeSymbol = futureSymbol.value;
    }
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
    const volumeAlert = volumeAlertInfo(candle);
    const volumeAlertColor = volumeAlert?.color || '#dfe7f7';
    const volumeRow = hasVolumeIndicator()
      ? `<div style="margin-top:4px;color:#dfe7f7;">成交量 <span style="color:${volumeAlertColor};">${formatVolume(candle.volume || 0)}</span>${volumeAlert ? ` <span style="color:${volumeAlertColor};">超過${volumeAlert.label} ${formatVolume(volumeAlert.value)}</span>` : ''}</div>`
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
    if (shouldSkipLiveSpotRefresh(activeDataSource, symbolConfig.value)) {
      shell.status.textContent = `${activeDataSourceConfig().label} 盤外不更新加權`;
      await updateIndexOverlay({ force: true });
      return;
    }
    if (shouldSkipLiveDayFuturesRefresh(activeDataSource, symbolConfig.value, symbolConfig)) {
      shell.status.textContent = `${activeDataSourceConfig().label} 台指盤外不更新`;
      clearMainSeriesForSymbol(symbolConfig.value);
      await updateIndexOverlay({ force: true });
      return;
    }
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
        productCodes: activeProductCodes(),
        futuresId: activeFuturesId(),
        finMindFuturesId: activeFuturesId(),
        dailyId: activeDailyId(),
        finMindDailyId: activeDailyId(),
        selectedProduct: symbolConfig
      });
      lastCandles = candles.length ? candles : generateFallbackCandles({ timeframe: activeTimeframe });
      lastLoadedSymbol = symbolConfig.value;
      if (candles.length) notifyDataUpdate(lastCandles);
      selectedCandle = null;
      lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, lastCandles);
      // 切換商品或來源後重設可視範圍，避免沿用上一張圖的縮放狀態。
      // 段落說明：自動縮放時間軸以顯示完整資料。
      chart.timeScale().fitContent();
      updateLegend();
      syncPriceLines();
      await updateIndexOverlay({ force: true });
      shell.status.textContent = activeDataSourceConfig().label;
    } catch (error) {
      lastCandles = isStrictLiveSource(activeDataSource)
        ? []
        : generateFallbackCandles({ timeframe: activeTimeframe });
      lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, lastCandles);
      // 段落說明：自動縮放時間軸以顯示完整資料。
      chart.timeScale().fitContent();
      updateLegend();
      syncPriceLines();
      await updateIndexOverlay({ force: true });
      shell.status.textContent = isStrictLiveSource(activeDataSource)
        ? `${activeDataSourceConfig().label}連線失敗：${error.message}`
        : `使用模擬資料：${error.message}`;
    }
  }

  // API 型資料源用 polling 更新；本機 CSV 不會自動變動，所以 restartPolling 會跳過。
  async function pollLatest() {
    if (disposed) return;
    try {
      const symbolConfig = activeSymbolConfig();
      if (shouldSkipLiveSpotRefresh(activeDataSource, symbolConfig.value)) {
        shell.status.textContent = `${activeDataSourceConfig().label} 盤外不更新加權`;
        return;
      }
      if (shouldSkipLiveDayFuturesRefresh(activeDataSource, symbolConfig.value, symbolConfig)) {
        shell.status.textContent = `${activeDataSourceConfig().label} 台指盤外不更新`;
        await updateIndexOverlay();
        return;
      }
      // 目前以簡單 polling 取得完整序列，再用最後一根更新畫面；
      // 之後若後端提供增量資料，只要替換這段取資料邏輯即可。
      const candles = await fetchCandles({
        ...options,
        ...symbolConfig,
        symbol: symbolConfig.value,
        timeframe: activeTimeframe,
        source: activeDataSource,
        taifexCsvText,
        productCodes: activeProductCodes(),
        futuresId: activeFuturesId(),
        finMindFuturesId: activeFuturesId(),
        dailyId: activeDailyId(),
        finMindDailyId: activeDailyId(),
        selectedProduct: symbolConfig
      });
      const latest = candles.at(-1);
      if (!latest) return;
      lastCandles = candles;
      lastLoadedSymbol = symbolConfig.value;
      notifyDataUpdate(lastCandles);
      lastSmaData = updateLastCandle(candleSeries, volumeSeries, smaSeries, lastCandles, latest);
      updateLegend();
      syncPriceLines();
      await updateIndexOverlay();
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
    // 段落說明：tick 需要快速追價，其它週期維持外部設定的更新頻率。
    const pollMs = (isSecondTimeframe(activeTimeframe) || (isStrictLiveSource(activeDataSource) && isIntradayTimeframe(activeTimeframe)))
      ? 1000
      : (options.pollMs || 15000);
    timer = setInterval(pollLatest, pollMs);
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
        secondsVisible: isSecondTimeframe(activeTimeframe) || activeTimeframe === '1m'
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
    shell.status.textContent = `CSV讀取中：${file.name}`;
    shell.csvButton.disabled = true;
    try {
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
    } catch (error) {
      shell.status.textContent = `CSV載入失敗：${error.message || error}`;
    } finally {
      shell.csvButton.disabled = false;
      shell.csvInput.value = '';
    }
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
