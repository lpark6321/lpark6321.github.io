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

function normalizeTaifexJson(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.candles)) return payload.candles;
  return [];
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
  if (options.source === 'taifex' || options.type === 'future') return fetchTaifexCandles(options);
  return fetchYahooCandles(options);
}

function createShell(container) {
  container.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'lc-chart';
  root.style.cssText = 'position:relative;width:100%;height:100%;min-height:360px;background:#0d0f14;';

  const chartNode = document.createElement('div');
  chartNode.style.cssText = 'position:absolute;inset:0;';

  const toolbar = document.createElement('div');
  toolbar.style.cssText = `
    position:absolute;left:8px;top:8px;z-index:3;display:flex;align-items:center;gap:6px;
    padding:4px;background:rgba(9,10,14,.9);border:1px solid rgba(120,140,180,.28);
  `;

  const symbolSelect = document.createElement('select');
  symbolSelect.style.cssText = controlStyle();

  const timeframeSelect = document.createElement('select');
  timeframeSelect.style.cssText = controlStyle();

  const status = document.createElement('span');
  status.style.cssText = 'font:11px "Noto Sans TC", sans-serif;color:#8da0bf;padding:0 4px;';

  const legend = document.createElement('div');
  legend.className = 'lc-chart-legend';
  legend.style.cssText = `
    position:absolute;left:12px;top:46px;z-index:2;min-width:280px;max-width:min(680px,calc(100% - 24px));
    color:#dfe7f7;font:12px "Noto Sans TC", "JetBrains Mono", sans-serif;
    text-shadow:0 1px 2px rgba(0,0,0,.9);pointer-events:none;
  `;

  toolbar.append(symbolSelect, timeframeSelect, status);
  root.append(chartNode, legend, toolbar);
  container.appendChild(root);

  return { root, chartNode, symbolSelect, timeframeSelect, status, legend };
}

function controlStyle() {
  return [
    'height:24px',
    'background:#151c2b',
    'color:#dfe7f7',
    'border:1px solid rgba(120,140,180,.35)',
    'font:12px "Noto Sans TC", sans-serif',
    'outline:none'
  ].join(';');
}

function fillSelect(select, items, activeValue) {
  select.innerHTML = items
    .map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === activeValue ? 'selected' : ''}>${escapeHtml(item.label)}</option>`)
    .join('');
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

  let activeSymbol = options.symbol || symbols[0]?.value || 'INDEX:TWII';
  let activeTimeframe = options.timeframe || options.interval || 'D';
  let lastCandles = [];
  let lastSmaData = [];
  let disposed = false;
  let timer = null;
  let closePriceLine = null;
  let smaPriceLine = null;

  fillSelect(shell.symbolSelect, symbols, activeSymbol);
  fillSelect(shell.timeframeSelect, timeframes, activeTimeframe);

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

  function activeSymbolConfig() {
    return symbols.find((item) => item.value === activeSymbol) || { label: activeSymbol, value: activeSymbol, source: 'yahoo' };
  }

  function activeTimeframeConfig() {
    return timeframes.find((item) => item.value === activeTimeframe) || { label: activeTimeframe, value: activeTimeframe };
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

    const symbolConfig = activeSymbolConfig();
    const timeframeConfig = activeTimeframeConfig();
    const { value: change, pct } = changeFromPrevious(lastCandles, index);
    const changeColor = change >= 0 ? UP_COLOR : DOWN_COLOR;
    const smaPoint = latestSmaPoint(index);
    const source = symbolConfig.source === 'taifex' ? 'TAIFEX' : 'Yahoo';

    shell.legend.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;white-space:nowrap;">
        <strong style="font-size:13px;color:#f3f6ff;">${escapeHtml(symbolConfig.label || symbolConfig.value)}</strong>
        <span style="color:#aebbd3;">${escapeHtml(timeframeConfig.label)} · ${source}</span>
        <span style="color:#f5c842;">D</span>
        <span>開 ${formatPrice(candle.open)}</span>
        <span>高 ${formatPrice(candle.high)}</span>
        <span>低 ${formatPrice(candle.low)}</span>
        <span>收 ${formatPrice(candle.close)}</span>
        <span style="color:${changeColor};">${change >= 0 ? '+' : ''}${formatPrice(change)} (${change >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span>
      </div>
      <div style="margin-top:4px;color:#dfe7f7;">成交量 <span style="color:#dfe7f7;">${formatVolume(candle.volume || 0)}</span></div>
      <div style="margin-top:4px;color:#dfe7f7;">SMA ${SMA_PERIOD} close <span style="color:${SMA_COLOR};">${smaPoint ? formatPrice(smaPoint.value) : '--'}</span></div>
    `;
  }

  function syncPriceLines() {
    const latest = lastCandles.at(-1);
    if (!latest) return;

    if (closePriceLine) candleSeries.removePriceLine(closePriceLine);
    if (smaPriceLine) smaSeries.removePriceLine(smaPriceLine);

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
    if (smaPoint) {
      smaPriceLine = smaSeries.createPriceLine({
        price: smaPoint.value,
        color: SMA_COLOR,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle?.Solid ?? 0,
        axisLabelVisible: true,
        title: ''
      });
    } else {
      smaPriceLine = null;
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
        timeframe: activeTimeframe
      });
      lastCandles = candles.length ? candles : generateFallbackCandles({ timeframe: activeTimeframe });
      lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, lastCandles);
      chart.timeScale().fitContent();
      updateLegend();
      syncPriceLines();
      shell.status.textContent = symbolConfig.source === 'taifex' ? 'TAIFEX' : 'Yahoo';
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
        timeframe: activeTimeframe
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
    timer = setInterval(pollLatest, options.pollMs || 15000);
  }

  chart.subscribeCrosshairMove((param) => {
    if (!param?.time || !lastCandles.length) {
      updateLegend();
      return;
    }

    const index = findTimeIndex(lastCandles, param.time);
    if (index < 0) {
      updateLegend();
      return;
    }
    updateLegend(lastCandles[index], index);
  });

  shell.symbolSelect.addEventListener('change', async () => {
    activeSymbol = shell.symbolSelect.value;
    await loadInitialData();
    restartPolling();
  });

  shell.timeframeSelect.addEventListener('change', async () => {
    activeTimeframe = shell.timeframeSelect.value;
    chart.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible: activeTimeframe === '1m'
      }
    });
    await loadInitialData();
    restartPolling();
  });

  await loadInitialData();
  restartPolling();

  return () => {
    disposed = true;
    if (timer) clearInterval(timer);
    chart.remove();
    shell.root.remove();
  };
}
