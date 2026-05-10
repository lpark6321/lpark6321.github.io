const LIGHTWEIGHT_CHARTS_URL =
  'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';

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
const TAIEX_FUTURE_CODES = ['TX', 'TXF'];

let lightweightPromise = null;

export function loadLightweightChartsScript() {
  if (lightweightPromise) return lightweightPromise;

  lightweightPromise = new Promise((resolve, reject) => {
    if (window.LightweightCharts) {
      resolve(window.LightweightCharts);
      return;
    }

    const script = document.createElement('script');
    script.src = LIGHTWEIGHT_CHARTS_URL;
    script.async = true;
    script.onload = () => resolve(window.LightweightCharts);
    script.onerror = () => reject(new Error('Lightweight Charts script failed to load'));
    document.head.appendChild(script);
  });

  return lightweightPromise;
}

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

export async function fetchYahooCandles({ symbol, timeframe = 'D' }) {
  const { interval, range } = resolveTimeframe(timeframe);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}`);
  url.searchParams.set('interval', interval);
  url.searchParams.set('range', range);
  url.searchParams.set('includePrePost', 'false');
  url.searchParams.set('_ts', String(Date.now()));

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

export async function fetchTaifexCandles({ taifexUrl }) {
  if (!taifexUrl) {
    throw new Error('Provide options.taifexUrl. Use a backend/proxy endpoint that returns OHLCV JSON or CSV.');
  }

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

export async function fetchBrokerCandles({ brokerUrl, symbol, timeframe = 'D' }) {
  if (!brokerUrl) {
    throw new Error('Provide options.brokerUrl. Expected JSON with OHLCV rows in data or candles.');
  }

  const url = new URL(brokerUrl, window.location.href);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('timeframe', timeframe);
  url.searchParams.set('_ts', String(Date.now()));

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

export async function fetchTaifexCsvCandles({ taifexCsvText, timeframe = 'D', productCodes = TAIEX_FUTURE_CODES }) {
  if (!taifexCsvText) {
    throw new Error('請先載入期交所逐筆CSV檔');
  }
  return buildCandlesFromTaifexTickCsv(taifexCsvText, { timeframe, productCodes });
}

function normalizeTaifexJson(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.candles)) return payload.candles;
  return [];
}

function buildCandlesFromTaifexTickCsv(text, { timeframe = 'D', productCodes = TAIEX_FUTURE_CODES } = {}) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(cleanCsvCell);
  const index = {
    date: findHeaderIndex(headers, '成交日期', 0),
    product: findHeaderIndex(headers, '商品代號', 1),
    month: findHeaderIndex(headers, '到期月份', 2),
    time: findHeaderIndex(headers, '成交時間', 3),
    price: findHeaderIndex(headers, '成交價格', 4),
    volume: findHeaderIndex(headers, '成交數量', 5)
  };
  const codeSet = new Set(productCodes.map((code) => String(code).toUpperCase()));

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

  const nearMonth = Math.min(...ticks.map((row) => row.contractMonth));
  const frontMonthTicks = ticks
    .filter((row) => row.contractMonth === nearMonth)
    .sort((a, b) => a.time - b.time);

  return aggregateTicksToCandles(frontMonthTicks, timeframe);
}

function findHeaderIndex(headers, keyword, fallback) {
  const index = headers.findIndex((header) => header.includes(keyword));
  return index >= 0 ? index : fallback;
}

function cleanCsvCell(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim();
}

function cleanNumber(value) {
  return cleanCsvCell(value).replaceAll(',', '').replaceAll('--', '').replaceAll('-', '');
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
  return Math.floor(new Date(year, month, day, hour, minute, second).getTime() / 1000);
}

function aggregateTicksToCandles(ticks, timeframe) {
  const buckets = new Map();
  const step = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : null;

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

function dateKeyFromUnix(time) {
  const date = new Date(time * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header] = values[index]?.trim();
      return row;
    }, {});
  });
}

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

function sortTime(a, b) {
  const av = typeof a === 'string' ? Date.parse(a) / 1000 : a;
  const bv = typeof b === 'string' ? Date.parse(b) / 1000 : b;
  return av - bv;
}

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

async function fetchCandles(options) {
  if (options.source === 'taifex_csv') return fetchTaifexCsvCandles(options);
  if (options.source === 'taifex') return fetchTaifexCandles(options);
  if (options.source === 'broker') return fetchBrokerCandles(options);
  return fetchYahooCandles(options);
}

function createShell(container) {
  container.innerHTML = '';

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

  const chartArea = document.createElement('div');
  chartArea.style.cssText = 'position:relative;min-height:0;';

  const chartNode = document.createElement('div');
  chartNode.style.cssText = 'position:absolute;inset:0;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = `
    position:relative;z-index:4;display:flex;align-items:center;gap:6px;flex-wrap:wrap;
    min-height:42px;padding:6px 8px;background:rgba(9,10,14,.96);border-bottom:1px solid rgba(120,140,180,.28);
  `;

  const symbolSelect = document.createElement('select');
  symbolSelect.dataset.minWidth = '180';
  symbolSelect.style.cssText = controlStyle('180px');

  const timeframeSelect = document.createElement('select');
  timeframeSelect.dataset.minWidth = '92';
  timeframeSelect.style.cssText = controlStyle('92px');

  const dataSourceSelect = document.createElement('select');
  dataSourceSelect.dataset.minWidth = '180';
  dataSourceSelect.style.cssText = controlStyle('180px');

  const csvInput = document.createElement('input');
  csvInput.type = 'file';
  csvInput.accept = '.csv,text/csv';
  csvInput.style.display = 'none';

  const csvButton = document.createElement('button');
  csvButton.type = 'button';
  csvButton.textContent = '載入CSV';
  csvButton.style.cssText = buttonStyle('92px');

  const indicatorSelect = document.createElement('select');
  indicatorSelect.dataset.minWidth = '210';
  indicatorSelect.style.cssText = controlStyle('210px');

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
  chartArea.append(chartNode, legend);
  root.append(toolbar, chartArea);
  container.appendChild(root);

  return { root, chartNode, symbolSelect, timeframeSelect, dataSourceSelect, csvInput, csvButton, indicatorSelect, status, legend };
}

function toolbarLabel(text) {
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

function fillSelect(select, items, activeValue) {
  select.innerHTML = items
    .map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === activeValue ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
  fitSelectToText(select);
}

function fitSelectToText(select) {
  const selectedText = select.options[select.selectedIndex]?.textContent || '';
  const minWidth = Number(select.dataset.minWidth || 120);
  const longestText = [...select.options].reduce((longest, option) => {
    const text = option.textContent || '';
    return text.length > longest.length ? text : longest;
  }, selectedText);
  const canvas = fitSelectToText.canvas || (fitSelectToText.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  ctx.font = getComputedStyle(select).font || '12px "Noto Sans TC", sans-serif';
  const width = Math.ceil(ctx.measureText(longestText).width) + 72;
  select.style.width = `${Math.max(minWidth, width)}px`;
  select.style.minWidth = select.style.width;
}

function fitAllSelects(...selects) {
  selects.forEach((select) => fitSelectToText(select));
}

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

function applyCandles(candleSeries, volumeSeries, smaSeries, candles) {
  candleSeries.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
  volumeSeries.setData(candles.map(toVolumePoint));
  const smaData = calculateSma(candles);
  smaSeries.setData(smaData);
  return smaData;
}

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
  smaSeries.setData(smaData);
  return smaData;
}

function toVolumePoint(candle) {
  return {
    time: candle.time,
    value: candle.volume || 0,
    color: candle.close >= candle.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR
  };
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return '--';
  return Number(value).toLocaleString('zh-TW', {
    minimumFractionDigits: value >= 1000 ? 2 : 2,
    maximumFractionDigits: value >= 1000 ? 2 : 2
  });
}

function formatVolume(value) {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}億`;
  if (abs >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return String(Math.round(value));
}

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

function findTimeIndex(candles, time) {
  if (time == null) return -1;
  const key = timeKey(time);
  return candles.findIndex((candle) => timeKey(candle.time) === key);
}

  function timeKey(time) {
    return typeof time === 'object' ? JSON.stringify(time) : String(time);
  }

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readFileText(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('CSV讀取失敗'));
    reader.readAsText(file, encoding);
  });
}

export async function mountMarketChart(container, options = {}) {
  if (!container) return () => {};

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
  let activeDataSource = options.source || dataSources[0]?.value || 'yahoo';
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

  function hasVolumeIndicator() {
    return activeIndicator === 'volume_sma' || activeIndicator === 'volume';
  }

  function hasSmaIndicator() {
    return activeIndicator === 'volume_sma' || activeIndicator === 'sma';
  }

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

  function activeSymbolConfig() {
    return symbols.find((item) => item.value === activeSymbol) || { label: activeSymbol, value: activeSymbol, source: 'yahoo' };
  }

  function activeTimeframeConfig() {
    return timeframes.find((item) => item.value === activeTimeframe) || { label: activeTimeframe, value: activeTimeframe };
  }

  function activeDataSourceConfig() {
    return dataSources.find((item) => item.value === activeDataSource) || { label: activeDataSource, value: activeDataSource };
  }

  function csvProductCodes() {
    const symbolConfig = activeSymbolConfig();
    if (Array.isArray(symbolConfig.csvProductCodes)) return symbolConfig.csvProductCodes;
    if (symbolConfig.type === 'future' || symbolConfig.value === 'TXF' || symbolConfig.value === 'TX') return TAIEX_FUTURE_CODES;
    return TAIEX_FUTURE_CODES;
  }

  function syncCsvControls() {
    const visible = activeDataSource === 'taifex_csv';
    shell.csvButton.style.display = visible ? '' : 'none';
    if (visible && !taifexCsvText) shell.status.textContent = '請載入CSV';
  }

  function useFutureSymbolForCsv() {
    if (activeDataSource !== 'taifex_csv') return;
    const futureSymbol = symbols.find((item) => item.value === 'TXF' || item.value === 'TX' || item.type === 'future');
    if (!futureSymbol) return;
    activeSymbol = futureSymbol.value;
    shell.symbolSelect.value = activeSymbol;
  }

  function latestSmaPoint(index = lastCandles.length - 1) {
    const candle = lastCandles[index];
    if (!candle) return null;
    return lastSmaData.find((point) => timeKey(point.time) === timeKey(candle.time)) || lastSmaData.at(-1) || null;
  }

  function updateLegend(candle = lastCandles.at(-1), index = lastCandles.length - 1) {
    if (!candle) {
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

  async function loadInitialData() {
    const symbolConfig = activeSymbolConfig();
    shell.status.textContent = '載入中';
    try {
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
      selectedCandle = null;
      lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, lastCandles);
      chart.timeScale().fitContent();
      updateLegend();
      syncPriceLines();
      shell.status.textContent = activeDataSourceConfig().label;
    } catch (error) {
      lastCandles = generateFallbackCandles({ timeframe: activeTimeframe });
      lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, lastCandles);
      chart.timeScale().fitContent();
      updateLegend();
      syncPriceLines();
      shell.status.textContent = `使用模擬資料：${error.message}`;
    }
  }

  async function pollLatest() {
    if (disposed) return;
    try {
      const symbolConfig = activeSymbolConfig();
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
      lastSmaData = updateLastCandle(candleSeries, volumeSeries, smaSeries, lastCandles, latest);
      updateLegend();
      syncPriceLines();
      shell.status.textContent = `更新 ${new Date().toLocaleTimeString('zh-TW', { hour12: false })}`;
    } catch (error) {
      shell.status.textContent = `更新失敗：${error.message}`;
    }
  }

  function restartPolling() {
    if (timer) clearInterval(timer);
    if (activeDataSource === 'taifex_csv') {
      timer = null;
      return;
    }
    timer = setInterval(pollLatest, options.pollMs || 15000);
  }

  chart.subscribeCrosshairMove((param) => {
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

  chart.subscribeClick((param) => {
    if (!param?.time || !lastCandles.length) return;
    let index = findTimeIndex(lastCandles, param.time);
    if (index < 0) index = nearestCandleIndex(lastCandles, param.time);
    if (index < 0) return;
    selectedCandle = lastCandles[index];
    updateLegend(selectedCandle, index);
    shell.status.textContent = `選取 ${formatChartTime(selectedCandle.time, activeTimeframe)}`;
  });

  shell.symbolSelect.addEventListener('change', async () => {
    activeSymbol = shell.symbolSelect.value;
    useFutureSymbolForCsv();
    fitSelectToText(shell.symbolSelect);
    await loadInitialData();
    restartPolling();
  });

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

  shell.dataSourceSelect.addEventListener('change', async () => {
    activeDataSource = shell.dataSourceSelect.value;
    useFutureSymbolForCsv();
    syncCsvControls();
    fitSelectToText(shell.dataSourceSelect);
    fitSelectToText(shell.symbolSelect);
    await loadInitialData();
    restartPolling();
  });

  shell.csvButton.addEventListener('click', () => {
    shell.csvInput.click();
  });

  shell.csvInput.addEventListener('change', async () => {
    const file = shell.csvInput.files?.[0];
    if (!file) return;
    taifexCsvText = await readFileText(file, 'big5');
    taifexCsvName = file.name;
    activeDataSource = 'taifex_csv';
    shell.dataSourceSelect.value = activeDataSource;
    useFutureSymbolForCsv();
    syncCsvControls();
    fitSelectToText(shell.dataSourceSelect);
    fitSelectToText(shell.symbolSelect);
    await loadInitialData();
    restartPolling();
    shell.status.textContent = `CSV：${taifexCsvName}`;
  });

  shell.indicatorSelect.addEventListener('change', () => {
    activeIndicator = shell.indicatorSelect.value;
    fitSelectToText(shell.indicatorSelect);
    applyIndicatorVisibility();
    updateLegend();
    syncPriceLines();
  });

  syncCsvControls();
  await loadInitialData();
  restartPolling();

  return () => {
    disposed = true;
    if (timer) clearInterval(timer);
    chart.remove();
    shell.root.remove();
  };
}
