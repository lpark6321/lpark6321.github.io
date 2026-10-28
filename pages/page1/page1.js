// Page1 期貨總覽：整合台指資訊、主圖分頁、監控區與多功能看板。
import { store } from '../../data/store.js';
import { Panel } from '../../components/Panel.js';
import { Sparkline } from '../../components/Sparkline.js';
import { StockCard } from '../../components/StockCard.js';
import { fetchBrokerCandles, fetchYahooCandles, mountMarketChart } from '../../services/marketChart.js';
import { mountTradingViewWidget } from '../../services/tradingview.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';
import { updateYahooTaiexOnce } from '../../services/yahooTaiexPoller.js';
import {
  DASHBOARD_DATA_SOURCES,
  getDashboardDataSource,
  setDashboardDataSource,
  subscribeDashboardDataSource
} from '../../services/dashboardDataSource.js';

// cleanup：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
let cleanup = () => {};

const TOP10_CODES = ['2330', '2308', '2317', '2454', '3711', '2881', '2382', '2412', '2882', '2891'];
const AMP_GRID = [["最大振幅",2668],["大大振幅",1749],["平均振幅",1282],["小小振幅",970],["最小振幅",677]];

// c：函式用途註解，說明此處封裝一段可重用的流程。
function c(v) { return v >= 0 ? 'metric-up' : 'metric-down'; }
// n：函式用途註解，說明此處封裝一段可重用的流程。
function n(v, d = 2) { return Number(v).toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }); }

const PRODUCT_SESSIONS = {
  '台指': { start: '08:45', end: '13:45', ticks: 29 },
  '台指(全)': { start: '15:00', end: '13:45', ticks: 45 }
};
const DAY_SESSION_START = 8 * 60 + 45;
const DAY_SESSION_END = 13 * 60 + 45;
const AFTER_SESSION_START = 15 * 60;
const AFTER_SESSION_END = 5 * 60;
const TAIEX_PLOT_START = 9 * 60;
const TAIEX_PLOT_END = 13 * 60 + 30;
const S6_INTRADAY_TIMEFRAMES = new Set(['1m', '5m']);
const S6_MIN_TREND_POINTS = 2;
const INFO_CANDLE_RANGE_PCT = 15;
const AMP_HISTORY_DAYS = 30;
const AMP_BAR_WIDTH_SCALE = 1.5;
const FUTURES_DETAIL_SOURCES = new Set(['taifex', 'taifex_csv', 'broker', 'kgi_dde', 'kgi_rtd', 'taishin_dde', 'finmind', 'finmind_futures']);
const KGI_DDE_QUOTE_URL = 'http://127.0.0.1:8788/api/xq-quote';
const KGI_RTD_QUOTE_URL = 'http://127.0.0.1:8789/api/xq-quote';
const TAISHIN_DDE_QUOTE_URL = 'http://127.0.0.1:8790/api/xq-quote';
const VOLUME_WEIGHT_URL = './volume_weight_5sec.csv';
const LIVE_SOURCE_PRIORITY = ['kgi_dde', 'kgi_rtd', 'taishin_dde'];
const PRODUCT_MODE_SYMBOLS = {
  '台指(全)': 'FITXN*1',
  '台指': 'FITX*1'
};
const PRODUCT_MODE_STORE_KEYS = {
  '台指(全)': 'futuresFull',
  '台指': 'futuresDay'
};

// toMinutes：函式用途註解，說明此處封裝一段可重用的流程。
function toMinutes(label) {
  const [h, m] = label.split(':').map(Number);
  return h * 60 + m;
}

// formatMinutes：函式用途註解，說明此處封裝一段可重用的流程。
function formatMinutes(total) {
  const minutes = ((Math.round(total) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// buildSessionLabels：函式用途註解，說明此處封裝一段可重用的流程。
function buildSessionLabels(mode) {
  const session = PRODUCT_SESSIONS[mode] || PRODUCT_SESSIONS['台指'];
  const start = toMinutes(session.start);
  const end = toMinutes(session.end);
  const span = end > start ? end - start : (1440 - start) + end;
  return Array.from({ length: 6 }, (_, idx) => formatMinutes(start + (span * idx) / 5));
}

function formatClockLabel(totalMinutes) {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildTaiexTimeLabels() {
  const labels = [];
  for (let minute = TAIEX_PLOT_START; minute <= TAIEX_PLOT_END; minute += 30) {
    labels.push(formatClockLabel(minute));
  }
  return labels;
}

// resolveProductSnapshot：函式用途註解，說明此處封裝一段可重用的流程。
function resolveProductSnapshot(mode, taiex, futures) {
  const chg = futures.price - futures.prevClose;
  return {
    name: mode,
    price: futures.price,
    open: futures.open,
    high: futures.high,
    low: futures.low,
    prevClose: futures.prevClose,
    chg,
    chgPct: futures.prevClose ? (chg / futures.prevClose) * 100 : 0,
    volume: taiex.volume
  };
}

// buildIntradaySeries：函式用途註解，說明此處封裝一段可重用的流程。
function buildIntradaySeries(mode, snapshot) {
  const labels = buildTaiexTimeLabels();
  const count = TAIEX_PLOT_END - TAIEX_PLOT_START + 1;
  const hiIndex = Math.max(2, Math.floor(count * 0.34));
  const loIndex = Math.min(count - 3, Math.floor(count * 0.72));
  const range = Math.max(snapshot.high - snapshot.low, Math.abs(snapshot.chg) * 2, snapshot.price * 0.003, 1);
  const points = [];
  let cumValue = 0;
  let cumVolume = 0;

  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1 || 1);
    const base = snapshot.open + (snapshot.price - snapshot.open) * t;
    const wave = Math.sin(t * Math.PI * 1.35) * range * 0.18 + Math.sin(t * Math.PI * 5.2) * range * 0.06;
    let price = base + wave;

    if (i === 0) price = snapshot.open;
    if (i === count - 1) price = snapshot.price;
    if (i === hiIndex) price = snapshot.high;
    if (i === loIndex) price = snapshot.low;
    price = Math.max(snapshot.low, Math.min(snapshot.high, price));

    const midday = 1 - Math.abs(t - 0.5) * 1.5;
    const volume = Math.max(18, Math.round(44 + (Math.sin(t * Math.PI * 2.8) + 1.2) * 20 + (1 - midday) * 36));
    cumValue += price * volume;
    cumVolume += volume;

    points.push({
      minute: TAIEX_PLOT_START + i,
      price,
      avg: cumValue / cumVolume,
      volume
    });
  }

  points[0].price = snapshot.open;
  points[count - 1].price = snapshot.price;
  return { points, labels };
}

// drawTrend：函式用途註解，說明此處封裝一段可重用的流程。
function formatTrendTimeLabel(time, timeframe) {
  if (typeof time === 'string') return time.slice(5);
  const date = new Date(Number(time) * 1000);
  if (!Number.isFinite(date.getTime())) return '';
  const options = timeframe === 'D'
    ? { month: '2-digit', day: '2-digit', timeZone: 'Asia/Taipei' }
    : { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' };
  return new Intl.DateTimeFormat('zh-TW', options).format(date);
}

function taipeiTimeParts(time) {
  if (typeof time === 'string') {
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(time) ? time : time.slice(0, 10);
    return { dateKey, minute: 0, isDateOnly: true };
  }

  const date = new Date(Number(time) * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
    isDateOnly: false
  };
}

function isIndexSymbol(value) {
  return value === 'INDEX:TWII' || value === 'TWSE:TAIEX';
}

function isFutureSymbol(symbolConfig) {
  return symbolConfig?.type === 'future' || symbolConfig?.value === 'TXF' || symbolConfig?.value === 'TX';
}

function isFuturesDetailSource(source) {
  return FUTURES_DETAIL_SOURCES.has(source);
}

function isIndexDerivedFutures(futures) {
  return futures?.source === 'chart-index' || isIndexSymbol(futures?.sourceSymbol);
}

function hasUsableFuturesSnapshot(futures) {
  const hasDetailSource = isFuturesDetailSource(futures?.source) || isFuturesDetailSource(futures?.chartSource);
  return Boolean(
    futures &&
    hasDetailSource &&
    !isIndexDerivedFutures(futures) &&
    ['price', 'open', 'high', 'low', 'prevClose'].every((key) => Number.isFinite(Number(futures[key])))
  );
}

function normalizeFuturesPayload(payload) {
  const next = { ...payload };
  ['price', 'open', 'high', 'low', 'prevClose', 'change', 'monthHigh', 'monthLow', 'monthCost'].forEach((key) => {
    if (Number.isFinite(Number(next[key]))) next[key] = Math.round(Number(next[key]));
  });
  if (Number.isFinite(Number(next.price)) && Number.isFinite(Number(next.prevClose))) {
    next.change = next.price - next.prevClose;
    next.changePct = next.prevClose ? +((next.change / next.prevClose) * 100).toFixed(2) : 0;
  }
  return next;
}

function normalizeKgiFuturesQuote(payload, current = {}, source = 'kgi_dde', sourceSymbol = 'TX') {
  const price = Number(payload.price ?? payload.close);
  const change = Number(payload.change);
  const changePct = Number(payload.changePct);
  const preClose = Number(payload.prevClose ?? payload.preClose);
  const derivedPrevClose = Number.isFinite(price) && Number.isFinite(change) ? price - change : null;
  return normalizeFuturesPayload({
    ...current,
    price: Number.isFinite(price) ? price : current.price,
    open: Number.isFinite(Number(payload.open)) ? Number(payload.open) : current.open,
    high: Number.isFinite(Number(payload.high)) ? Number(payload.high) : current.high,
    low: Number.isFinite(Number(payload.low)) ? Number(payload.low) : current.low,
    prevClose: Number.isFinite(preClose) ? preClose : Number.isFinite(derivedPrevClose) ? derivedPrevClose : current.prevClose,
    change: Number.isFinite(change) ? change : current.change,
    changePct: Number.isFinite(changePct) ? changePct : current.changePct,
    volume: Number.isFinite(Number(payload.volume)) ? Number(payload.volume) : current.volume,
    source,
    sourceSymbol,
    sourceUpdatedAt: Date.now()
  });
}

function brokerQuoteUrlForSource(source) {
  if (source === 'kgi_dde') return KGI_DDE_QUOTE_URL;
  if (source === 'kgi_rtd') return KGI_RTD_QUOTE_URL;
  if (source === 'taishin_dde') return TAISHIN_DDE_QUOTE_URL;
  return '';
}

function brokerCandlesUrlForSource(source) {
  const quoteUrl = brokerQuoteUrlForSource(source);
  return quoteUrl ? quoteUrl.replace('/api/xq-quote', '/api/broker-candles') : '';
}

function liveSourceCandidates(preferredSource = getDashboardDataSource()) {
  return [
    preferredSource,
    ...LIVE_SOURCE_PRIORITY
  ].filter((source, index, list) => brokerQuoteUrlForSource(source) && list.indexOf(source) === index);
}

function secondsFromClockLabel(value) {
  const [hh, mm, ss = 0] = String(value || '').trim().split(':').map(Number);
  if (![hh, mm, ss].every(Number.isFinite)) return null;
  return hh * 3600 + mm * 60 + ss;
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
  return Number.isFinite(second) && second >= TAIEX_PLOT_START * 60 && second <= TAIEX_PLOT_END * 60;
}

function isFuturesDayTradingTime(time = Date.now()) {
  const second = taipeiSecondOfDay(time);
  return Number.isFinite(second) && second >= DAY_SESSION_START * 60 && second <= DAY_SESSION_END * 60;
}

let volumeWeightPromise = null;

async function loadVolumeWeights() {
  if (volumeWeightPromise) return volumeWeightPromise;
  volumeWeightPromise = fetch(VOLUME_WEIGHT_URL, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`volume weight HTTP ${response.status}`);
      return response.text();
    })
    .then((text) => text.trim().split(/\r?\n/).slice(1).map((line) => {
      const [time, weight, stddev] = line.split(',').map((cell) => String(cell || '').trim());
      return {
        secondOfDay: secondsFromClockLabel(time),
        weight: Number(weight),
        stddev: Number(stddev)
      };
    }).filter((row) => Number.isFinite(row.secondOfDay) && Number.isFinite(row.weight)))
    .catch((error) => {
      console.warn('[page1] volume weight load failed:', error);
      return [];
    });
  return volumeWeightPromise;
}

function estimateVolumeFromWeights(cumulativeVolume, weights, time = Date.now()) {
  const volume = Number(cumulativeVolume);
  if (!Number.isFinite(volume) || volume <= 0 || !Array.isArray(weights) || !weights.length) return null;
  const second = taipeiSecondOfDay(time);
  if (!Number.isFinite(second)) return null;
  let selected = null;
  for (const row of weights) {
    if (row.secondOfDay <= second) selected = row;
    else break;
  }
  if (!selected || !Number.isFinite(selected.weight) || selected.weight <= 0) return null;
  return {
    value: volume * selected.weight,
    weight: selected.weight,
    secondOfDay: selected.secondOfDay
  };
}

function formatFuturesValue(value) {
  return Number.isFinite(Number(value)) ? n(Math.round(Number(value)), 0) : '--';
}

function shiftDateKey(dateKey, offsetDays) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

function trendTimeValue(time) {
  if (typeof time === 'number' && Number.isFinite(time)) return time;
  if (typeof time === 'string') {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? parsed / 1000 : 0;
  }
  return 0;
}

function sortTimeForTrend(a, b) {
  return trendTimeValue(a) - trendTimeValue(b);
}

function sessionOfCandle(row, timeframe) {
  const parts = taipeiTimeParts(row.time);
  if (!parts) return null;
  if (timeframe === 'D' || parts.isDateOnly) return { type: 'daily', key: parts.dateKey, label: parts.dateKey };

  const minute = parts.minute;
  if (minute >= DAY_SESSION_START && minute <= DAY_SESSION_END) {
    return { type: 'day', key: parts.dateKey, label: `${parts.dateKey} 盤中` };
  }
  if (minute >= AFTER_SESSION_START) {
    return { type: 'after', key: parts.dateKey, label: `${parts.dateKey} 盤後` };
  }
  if (minute <= AFTER_SESSION_END) {
    const key = shiftDateKey(parts.dateKey, -1);
    return { type: 'after', key, label: `${key} 盤後` };
  }
  if (minute < DAY_SESSION_START) {
    const key = shiftDateKey(parts.dateKey, -1);
    return { type: 'after', key, label: `${key} 盤後` };
  }
  return { type: 'day', key: parts.dateKey, label: `${parts.dateKey} 盤中` };
}

function selectLatestTradingSessionRows(rows, timeframe) {
  if (!rows.length) return { rows: [], sessionLabel: '' };
  const tagged = rows
    .map((row) => ({ row, session: sessionOfCandle(row, timeframe) }))
    .filter((item) => item.session);
  const latest = tagged.at(-1);
  if (!latest) return { rows: [], sessionLabel: '' };
  const selected = tagged
    .filter((item) => item.session.type === latest.session.type && item.session.key === latest.session.key)
    .map((item) => item.row);
  return { rows: selected, sessionLabel: latest.session.label };
}

function buildLatestSessionOhlc(candles, timeframe) {
  const source = Array.isArray(candles)
    ? candles
      .filter((row) => [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(Number(value))))
      .sort((a, b) => sortTimeForTrend(a.time, b.time))
    : [];
  const { rows } = selectLatestTradingSessionRows(source, timeframe);
  if (!rows.length) return null;

  const first = rows[0];
  const last = rows.at(-1);
  const firstIndex = source.indexOf(first);
  const previous = firstIndex > 0 ? source[firstIndex - 1] : null;
  const firstPrevClose = Number(first.prevClose);
  const highs = rows.map((row) => Number(row.high)).filter(Number.isFinite);
  const lows = rows.map((row) => Number(row.low)).filter(Number.isFinite);
  const volume = rows.reduce((sum, row) => {
    const value = Number(row.volume);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return {
    open: Number(first.open),
    high: Math.max(...highs),
    low: Math.min(...lows),
    close: Number(last.close),
    prevClose: Number.isFinite(firstPrevClose) ? firstPrevClose : Number(previous?.close),
    volume
  };
}

function buildCurrentMonthRange(candles, latest) {
  const latestDateKey = taipeiTimeParts(latest?.time)?.dateKey;
  if (!latestDateKey) return null;
  const monthKey = latestDateKey.slice(0, 7);
  const rows = Array.isArray(candles)
    ? candles.filter((row) => {
      const dateKey = taipeiTimeParts(row.time)?.dateKey;
      return (
        dateKey?.startsWith(monthKey) &&
        Number.isFinite(Number(row.high)) &&
        Number.isFinite(Number(row.low))
      );
    })
    : [];
  if (!rows.length) return null;

  const highs = rows.map((row) => Number(row.high));
  const lows = rows.map((row) => Number(row.low));
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  if (![high, low].every(Number.isFinite)) return null;
  return {
    high,
    low,
    cost: (high + low) / 2
  };
}

function buildAmpHistoryFromCandles(candles, timeframe, limit = AMP_HISTORY_DAYS) {
  const source = Array.isArray(candles)
    ? candles
      .filter((row) => [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(Number(value))))
      .sort((a, b) => sortTimeForTrend(a.time, b.time))
    : [];
  if (!source.length) return [];

  const groups = new Map();
  source.forEach((row) => {
    const session = sessionOfCandle(row, timeframe);
    if (!session) return;
    const key = `${session.type}:${session.key}`;
    if (!groups.has(key)) {
      groups.set(key, {
        date: session.key.slice(5).replace('-', '/'),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: 0
      });
    }
    const item = groups.get(key);
    item.high = Math.max(item.high, Number(row.high));
    item.low = Math.min(item.low, Number(row.low));
    item.close = Number(row.close);
    item.volume += Number(row.volume) || 0;
  });

  const rows = [...groups.values()].map((row, index, arr) => {
    const previous = arr[index - 1];
    const prevClose = Number(previous?.close);
    return {
      ...row,
      prevClose: Number.isFinite(prevClose) ? prevClose : row.open,
      delta: row.close - (Number.isFinite(prevClose) ? prevClose : row.open),
      amplitude: row.high - row.low
    };
  });

  return rows.slice(-limit);
}

function buildChartTrendSeries(candles, timeframe) {
  if (!S6_INTRADAY_TIMEFRAMES.has(timeframe)) return null;
  const rows = Array.isArray(candles) ? candles.filter((row) => Number.isFinite(Number(row.close))) : [];
  const { rows: source, sessionLabel } = selectLatestTradingSessionRows(rows, timeframe);
  const intradaySource = source.filter((row) => {
    const minute = taipeiTimeParts(row.time)?.minute;
    return Number.isFinite(minute) && minute >= TAIEX_PLOT_START && minute <= TAIEX_PLOT_END;
  });
  if (intradaySource.length < S6_MIN_TREND_POINTS) return null;

  let cumValue = 0;
  let cumVolume = 0;
  const points = intradaySource.map((row) => {
    const price = Number(row.close);
    const volume = Math.max(0, Number(row.volume) || 0);
    const weightedVolume = volume || 1;
    const minute = taipeiTimeParts(row.time)?.minute;
    cumValue += price * weightedVolume;
    cumVolume += weightedVolume;
    return {
      minute,
      price,
      avg: cumVolume ? cumValue / cumVolume : price,
      volume: weightedVolume
    };
  });

  const labels = buildTaiexTimeLabels();

  return { points, labels, sourceRows: intradaySource, sessionLabel };
}

function drawTrend(canvas, data, meta = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(520, Math.floor(canvas.clientWidth));
  const h = canvas.height = Math.max(320, Math.floor(canvas.clientHeight));
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#080b12';
  ctx.fillRect(0, 0, w, h);

  if (!data?.points?.length) return;
  const { points, labels } = data;

  const priceValues = points.flatMap((point) => [point.price, point.avg]);
  const rawMin = Math.min(...priceValues, meta.low ?? priceValues[0]);
  const rawMax = Math.max(...priceValues, meta.high ?? priceValues[0]);
  const rawRange = rawMax - rawMin || 1;
  const min = rawMin - rawRange * 0.04;
  const max = rawMax + rawRange * 0.04;
  const range = max - min || 1;

  const left = 62;
  const right = 16;
  const top = 14;
  const bottom = 30;
  const volumeGap = 14;
  const volumeHeight = Math.max(86, Math.round(h * 0.27));
  const priceHeight = h - top - bottom - volumeGap - volumeHeight;
  const volumeTop = top + priceHeight + volumeGap;
  const pw = w - left - right;

  const sessionSpan = TAIEX_PLOT_END - TAIEX_PLOT_START;
  const xFromMinute = (minute) => {
    const safeMinute = Number.isFinite(minute) ? Math.min(TAIEX_PLOT_END, Math.max(TAIEX_PLOT_START, minute)) : TAIEX_PLOT_START;
    return left + ((safeMinute - TAIEX_PLOT_START) / sessionSpan) * pw;
  };
  const x = (i) => xFromMinute(points[i]?.minute);
  const y = (v) => top + (1 - (v - min) / range) * priceHeight;

  const volumeMax = Math.max(...points.map((point) => point.volume), 1);
  const volumeStep = Math.max(1, Math.ceil(volumeMax / 4));
  const volumeAxisMax = volumeStep * 4;
  const yVolume = (v) => volumeTop + volumeHeight - (v / volumeAxisMax) * volumeHeight;

  const drawHLine = (yy, color = '#1f2a3d') => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  Array.from({ length: 6 }, (_, idx) => idx / 5).forEach((step) => {
    const yy = top + priceHeight * step;
    drawHLine(yy);
    const value = max - range * step;
    ctx.fillStyle = '#9fb2d0';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(n(value, value >= 100 ? 0 : 2), left - 8, yy);
  });

  for (let value = 0; value <= volumeAxisMax; value += volumeStep) {
    const yy = yVolume(value);
    drawHLine(yy, '#1c2434');
    if (value > 0) {
      ctx.fillStyle = '#8ea0be';
      ctx.font = '12px JetBrains Mono';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(n(value, 0), left - 8, yy);
    }
  }

  labels.forEach((label) => {
    const [hour, minute] = label.split(':').map(Number);
    const labelMinute = hour * 60 + minute;
    const isEdge = labelMinute === TAIEX_PLOT_START || labelMinute === TAIEX_PLOT_END;
    const xx = xFromMinute(labelMinute);
    ctx.strokeStyle = labelMinute % 60 === 0 ? '#29354a' : '#1b2433';
    ctx.lineWidth = 1;
    ctx.setLineDash(labelMinute % 60 === 0 ? [] : [3, 4]);
    ctx.beginPath();
    ctx.moveTo(xx, top);
    ctx.lineTo(xx, volumeTop + volumeHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = isEdge ? '#ffd84d' : '#aab8d0';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = labelMinute === TAIEX_PLOT_START ? 'left' : labelMinute === TAIEX_PLOT_END ? 'right' : 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, xx, h - 8);
  });

  ctx.strokeStyle = '#334156';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(left, top + priceHeight);
  ctx.lineTo(w - right, top + priceHeight);
  ctx.stroke();

  ctx.fillStyle = '#8ea0be';
  ctx.font = '12px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.fillText('量', left - 8, volumeTop + 12);

  const barWidth = Math.max(2, Math.min(8, pw / points.length * 0.82));
  ctx.fillStyle = '#f2d319';
  points.forEach((point, idx) => {
    const xx = x(idx);
    const barTop = yVolume(Math.min(point.volume, volumeAxisMax));
    ctx.fillRect(xx - barWidth / 2, barTop, barWidth, volumeTop + volumeHeight - barTop);
  });

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#d4cc45cc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  points.forEach((point, idx) => idx === 0 ? ctx.moveTo(x(idx), y(point.avg)) : ctx.lineTo(x(idx), y(point.avg)));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  points.forEach((point, idx) => idx === 0 ? ctx.moveTo(x(idx), y(point.price)) : ctx.lineTo(x(idx), y(point.price)));
  ctx.strokeStyle = '#25d6ff';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  const lastPoint = points[points.length - 1];
  const lastY = y(lastPoint.price);
  ctx.fillStyle = '#25d6ff';
  ctx.beginPath();
  ctx.arc(x(points.length - 1), lastY, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// drawInfoCandle：函式用途註解，說明此處封裝一段可重用的流程。
function drawInfoCandle(canvas, payload) {
  if (!canvas) return;
  // 段落說明：取得 Canvas 2D context 進行繪圖。
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(90, Math.floor(canvas.clientWidth || 90));
  const h = canvas.height = Math.max(130, Math.floor(canvas.clientHeight || 130));
  // 段落說明：清除上一輪 Canvas 繪圖內容。
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#1b1d22';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#424754';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  const top = 2;
  const bottom = 58;
  const left = 12;
  const right = 12;
  const plotHeight = h - top - bottom;
  const base = Number.isFinite(Number(payload.prevClose)) && Number(payload.prevClose) !== 0
    ? Number(payload.prevClose)
    : Number(payload.open);
  const halfRangePct = INFO_CANDLE_RANGE_PCT / 2;
  const pctOfBase = (value) => ((Number(value) - base) / base) * 100;
  const clampPct = (pct) => Math.max(-halfRangePct, Math.min(halfRangePct, pct));
  const yPct = (pct) => top + (1 - ((clampPct(pct) + halfRangePct) / INFO_CANDLE_RANGE_PCT)) * plotHeight;
  const y = (v) => yPct(pctOfBase(v));

  const cx = (w - left - right) / 2 + left;
  const bw = Math.min(24, (w - left - right) * 0.4);

  ctx.strokeStyle = 'rgba(180,190,215,.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, yPct(0));
  ctx.lineTo(w - right, yPct(0));
  ctx.stroke();

  ctx.strokeStyle = '#cde2d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, y(payload.high));
  ctx.lineTo(cx, y(payload.low));
  ctx.stroke();

  const up = payload.close >= payload.open;
  ctx.fillStyle = up ? '#f03a5f' : '#1fd67a';
  ctx.fillRect(cx - bw / 2, Math.min(y(payload.open), y(payload.close)), bw, Math.max(3, Math.abs(y(payload.open) - y(payload.close))));

  const changeText = `${payload.change >= 0 ? '+' : ''}${payload.change.toFixed(0)}`;
  const ampText = `${payload.ampPct >= 0 ? '+' : ''}${payload.ampPct.toFixed(1)}%`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#b5bfd6';
  ctx.font = '700 13px Noto Sans TC';
  ctx.fillText('漲跌:', 8, h - 32);
  ctx.fillText('幅度:', 8, h - 12);

  ctx.textAlign = 'right';
  ctx.fillStyle = payload.change >= 0 ? '#f03a5f' : '#1fd67a';
  ctx.font = '700 28px JetBrains Mono';
  ctx.fillText(changeText, w - 8, h - 28);
  ctx.fillStyle = payload.ampPct >= 0 ? '#f03a5f' : '#1fd67a';
  ctx.font = '700 20px JetBrains Mono';
  ctx.fillText(ampText, w - 8, h - 8);
}

// drawMonitor：函式用途註解，說明此處封裝一段可重用的流程。
function drawMonitor(canvas, rows) {
  // 段落說明：取得 Canvas 2D context 進行繪圖。
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(360, Math.floor(canvas.clientWidth));
  const h = canvas.height = Math.max(280, Math.floor(canvas.clientHeight));
  // 段落說明：清除上一輪 Canvas 繪圖內容。
  ctx.clearRect(0, 0, w, h);

  const left = 44;
  const right = 12;
  const top = 12;
  const bottom = 90;
  const pw = w - left - right;
  const ph = h - top - bottom;
  // y：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const y = (pct) => top + (1 - (pct + 10) / 20) * ph;
  const labelTop = h - bottom + 18;
  const nameStart = labelTop + 16;
  const nameLine = 12;

  [-10, -5, 0, 5, 10].forEach((v) => {
    const yy = y(v);
    ctx.strokeStyle = v === 0 ? '#f5c84266' : '#ffffff22';
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
    ctx.fillStyle = '#9aa6c2';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText(`${v}%`, left - 8, yy + 4);
  });

  if (!rows.length) return;

  const step = pw / rows.length;
  const bw = Math.max(10, Math.min(26, step * 0.52));

  rows.forEach((r, i) => {
    const cx = left + step * (i + 0.5);
    const x = cx - bw / 2;
    const yOpen = y(r.openPct);
    const yClose = y(r.closePct);
    const yHigh = y(r.highPct);
    const yLow = y(r.lowPct);
    const up = r.closePct >= r.openPct;

    ctx.strokeStyle = '#d8def0';
    ctx.beginPath();
    ctx.moveTo(cx, yHigh);
    ctx.lineTo(cx, yLow);
    ctx.stroke();

    ctx.fillStyle = up ? '#f03a5f' : '#1fd67a';
    ctx.fillRect(x, Math.min(yOpen, yClose), bw, Math.max(2, Math.abs(yOpen - yClose)));

    ctx.fillStyle = '#dce4f5';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(r.code || '', cx, labelTop);

    const shortName = String(r.shortName || '').slice(0, 4);
    if (shortName) {
      ctx.fillStyle = '#9fb0d8';
      ctx.font = '11px Noto Sans TC';
      ctx.textAlign = 'center';
      [...shortName].forEach((ch, idx) => {
        ctx.fillText(ch, cx, nameStart + idx * nameLine);
      });
    }
  });
}

function clampMonitorPct(value) {
  return Math.max(-10, Math.min(10, Number.isFinite(value) ? value : 0));
}

function pctFromPrevClose(value, prevClose) {
  const price = Number(value);
  const base = Number(prevClose);
  if (!Number.isFinite(price) || !Number.isFinite(base) || base === 0) return null;
  return ((price - base) / base) * 100;
}

function resolveMonitorOhlcPct(stock) {
  const price = Number(stock.price);
  const changePct = Number(stock.changePct);
  const derivedPrevClose = Number.isFinite(price) && Number.isFinite(changePct)
    ? price / (1 + changePct / 100)
    : null;
  const prevClose = Number.isFinite(Number(stock.prevClose)) ? Number(stock.prevClose) : derivedPrevClose;

  const closePct = pctFromPrevClose(stock.price, prevClose) ?? changePct ?? 0;
  const openPct = pctFromPrevClose(stock.open, prevClose) ?? closePct;
  const highPct = pctFromPrevClose(stock.high, prevClose) ?? Math.max(openPct, closePct);
  const lowPct = pctFromPrevClose(stock.low, prevClose) ?? Math.min(openPct, closePct);

  return {
    openPct: clampMonitorPct(openPct),
    closePct: clampMonitorPct(closePct),
    highPct: clampMonitorPct(Math.max(highPct, openPct, closePct)),
    lowPct: clampMonitorPct(Math.min(lowPct, openPct, closePct))
  };
}

// drawAmp20：函式用途註解，說明此處封裝一段可重用的流程。
function drawAmp20(canvas, hist) {
  // 段落說明：取得 Canvas 2D context 進行繪圖。
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(560, Math.floor(canvas.clientWidth));
  const h = canvas.height = Math.max(260, Math.floor(canvas.clientHeight));
  // 段落說明：清除上一輪 Canvas 繪圖內容。
  ctx.clearRect(0, 0, w, h);

  const left = 42;
  const right = 12;
  const top = 10;
  const mid = 96;
  const bottom = 24;
  const pw = w - left - right;

  ctx.fillStyle = '#10151f';
  ctx.fillRect(0, 0, w, h);

  // amps：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const amps = hist.map((x) => Number.isFinite(Number(x.amplitude)) ? Number(x.amplitude) : Math.abs(Number(x.delta) || 0));
  const maxAmp = Math.max(...amps, 1);

  // tY：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const tY = (v) => top + (1 - (v + 4) / 8) * (mid - top - 8);
  [-4, -2, 0, 2, 4].forEach((v) => {
    const yy = tY(v);
    ctx.strokeStyle = v === 0 ? '#f5c84266' : '#ffffff1f';
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
  });

  const step = pw / Math.max(hist.length, 1);
  const bw = Math.max(10, Math.min(30, step * 0.52 * AMP_BAR_WIDTH_SCALE));
  hist.forEach((x, i) => {
    const px = left + step * i + (step - bw) / 2;
    const base = Number(x.prevClose) || Number(x.open) || Number(x.close) || 1;
    const toPct = (value) => Math.max(-4, Math.min(4, ((Number(value) - base) / base) * 100));
    const open = toPct(x.open);
    const close = toPct(x.close);
    const high = Math.max(open, close, toPct(x.high));
    const low = Math.min(open, close, toPct(x.low));
    const up = close >= open;

    ctx.strokeStyle = '#c7d0e8';
    ctx.beginPath();
    ctx.moveTo(px + bw / 2, tY(high));
    ctx.lineTo(px + bw / 2, tY(low));
    ctx.stroke();

    ctx.fillStyle = up ? '#f03a5f' : '#1fd67a';
    ctx.fillRect(px, Math.min(tY(open), tY(close)), bw, Math.max(2, Math.abs(tY(open) - tY(close))));
  });

  const bTop = mid + 10;
  const bH = h - bTop - bottom;
  // bY：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const bY = (v) => bTop + (1 - v / maxAmp) * bH;

  ctx.strokeStyle = '#ffffff1f';
  [0, 0.33, 0.66, 1].forEach((t) => {
    const yy = bTop + bH * t;
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
  });

  const ref = 677;
  const refY = bY(ref);
  ctx.fillStyle = 'rgba(193,56,100,0.25)';
  ctx.fillRect(left, refY, pw, bTop + bH - refY);
  ctx.strokeStyle = '#82e0aa';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(left, refY);
  ctx.lineTo(w - right, refY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#82e0aa';
  ctx.font = '700 12px Noto Sans TC';
  ctx.textAlign = 'right';
  ctx.fillText('30日振幅', w - right - 8, top + 12);

  hist.forEach((x, i) => {
    const px = left + step * i + (step - bw) / 2;
    const amp = Number.isFinite(Number(x.amplitude)) ? Number(x.amplitude) : Math.abs(Number(x.delta) || 0);
    ctx.fillStyle = 'rgba(148,87,128,0.6)';
    ctx.fillRect(px, bY(amp), bw, bTop + bH - bY(amp));
  });

  ctx.beginPath();
  hist.forEach((x, i) => {
    const amp = Number.isFinite(Number(x.amplitude)) ? Number(x.amplitude) : Math.abs(Number(x.delta) || 0);
    const xx = left + step * i + step / 2;
    const yy = bY(amp);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  });
  ctx.strokeStyle = '#6f88d9';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// makeMonitorRows：函式用途註解，說明此處封裝一段可重用的流程。
function makeMonitorRows(mode, data) {
  const all = [...data.topStocks, ...data.screenResults];
  let source = [];
  if (mode === '權值股') source = TOP10_CODES.map((c) => all.find((x) => x.code === c)).filter(Boolean);
  if (mode === '高價股') source = all.filter((x) => (x.price || 0) >= 500).sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 12);
  if (mode === '熱門股') source = all.sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 12);
  if (mode === '自選股') {
    // set：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const set = data.watchlist.map((x) => x.code);
    source = set.map((c) => all.find((x) => x.code === c)).filter(Boolean).slice(0, 12);
  }

  return source.map((x) => {
    const ohlcPct = resolveMonitorOhlcPct(x);
    return {
      code: x.code,
      shortName: String(x.name || '').replace('-KY', ''),
      ...ohlcPct
    };
  });
}

// mount：函式用途註解，說明此處封裝一段可重用的流程。
export function mount(container) {
  // 段落說明：建立此區塊的 DOM 結構。
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 1｜期貨總覽</h2><span class="page-clock" id="p1-clock"></span></div>
    <div class="p1-layout" id="p1-layout">
      <aside class="p1-left" id="p1-left"></aside>
      <div class="grid-splitter-v p1-splitter-left" id="p1-split-left"></div>
      <section class="panel p1-center p1-resize">
        <div class="panel__header"><span class="panel__badge">C</span><h3 class="panel__title">TAIEX FUTURES 主圖</h3></div>
        <div class="panel__body p1-tv">
          <!-- C 區圖表分頁：自有資料為 Lightweight Charts，TradingView 與 Charting Library 保留替換路徑。 -->
          <div class="p1-chart-tabs" id="p1-chart-tabs">
            <button data-k="lightweight" class="is-active">自有資料</button>
            <button data-k="tradingview">TradingView</button>
            <button data-k="chartinglib">Charting Library</button>
          </div>
          <div class="p1-chart-pane" id="p1-chart-lightweight"></div>
          <div class="p1-chart-pane" id="p1-chart-tradingview" style="display:none"></div>
          <div class="p1-chart-pane p1-chart-placeholder" id="p1-chart-chartinglib" style="display:none">
            <div>
              <strong>Charting Library 預留區</strong>
              <span>日後接 TradingView Charting Library / UDF datafeed 時會掛載在這裡。</span>
            </div>
          </div>
        </div>
      </section>
      <div class="grid-splitter-v p1-splitter-right" id="p1-split-right"></div>
      <aside class="p1-right" id="p1-right"></aside>
      <section class="panel p1-bottom p1-resize"><div class="panel__header"><span class="panel__badge">B</span><h3 class="panel__title">多功能看板</h3></div><div class="panel__body"><div class="p1-b-tabs" id="p1-b-tabs"></div><div id="p1-b-content" class="p1-b-content"></div></div></section>
    </div>
  `;

  const layoutEl = container.querySelector('#p1-layout');
  // readVar：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const readVar = (name, fallback) => {
    const value = parseFloat(getComputedStyle(layoutEl).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const stopSplitLeft = bindHorizontalSplitter(container.querySelector('#p1-split-left'), {
    getValue: () => readVar('--p1-left-w', 320),
    setValue: (px) => layoutEl.style.setProperty('--p1-left-w', `${px}px`),
    min: 240,
    max: 560
  });
  const stopSplitRight = bindHorizontalSplitter(container.querySelector('#p1-split-right'), {
    getValue: () => readVar('--p1-right-w', 420),
    setValue: (px) => layoutEl.style.setProperty('--p1-right-w', `${px}px`),
    min: 280,
    max: 700,
    deltaSign: -1
  });

  const left = container.querySelector('#p1-left');
  const right = container.querySelector('#p1-right');

  const pLeft = new Panel(left, { badge: '1', title: '台指綜合資訊' }); pLeft.root.classList.add('p1-resize');
  const p6 = new Panel(right, { badge: '6', title: '走勢圖' }); p6.root.classList.add('p1-resize');
  const p5 = new Panel(right, { badge: '5', title: '即時股價監控' }); p5.root.classList.add('p1-resize');

  pLeft.setContent(`
    <div class="p1-side-table" id="p1-main"></div>
    <div class="p1-side-levels" id="p1-levels"></div>
    <div class="p1-side-amp" id="p1-hist"></div>
  `);

  p6.setContent(`
    <div class="p1-tabs" id="p1-s6-tabs">
      <button data-k="trend" class="is-active">加權指數走勢</button>
      <button data-k="group">自選股走勢</button>
    </div>
    <div id="p1-s6-trend" class="p1-s6-pane"><canvas class="p1-trend-canvas" id="p1-trend"></canvas><div class="p1-trend-meta" id="p1-trend-meta"></div></div>
    <div id="p1-s6-group" class="p1-s6-pane" style="display:none"><div class="p1-mini" id="p1-mini"></div></div>
  `);

  p5.setContent(`
    <div class="p1-monitor-head"><select id="p1-monitor-select"><option>權值股</option><option>高價股</option><option>熱門股</option><option>自選股</option></select></div>
    <div class="p1-monitor-wrap" id="p1-monitor-wrap"><canvas id="p1-monitor-canvas" class="p1-monitor-canvas"></canvas></div>
  `);

  const fallbackAmpHistory = [
    { date: '04/01', close: 32420, delta: 40 }, { date: '03/31', close: 32380, delta: -100 }, { date: '03/30', close: 32480, delta: 120 },
    { date: '03/29', close: 32360, delta: 95 }, { date: '03/28', close: 32265, delta: -210 }, { date: '03/27', close: 32475, delta: 180 },
    { date: '03/26', close: 32295, delta: -88 }, { date: '03/25', close: 32383, delta: 156 }, { date: '03/24', close: 32227, delta: -342 },
    { date: '03/21', close: 32569, delta: 223 }, { date: '03/20', close: 32346, delta: -115 }, { date: '03/19', close: 32461, delta: 289 },
    { date: '03/18', close: 32172, delta: -198 }, { date: '03/17', close: 32370, delta: 401 }, { date: '03/14', close: 31969, delta: -87 },
    { date: '03/13', close: 32056, delta: 66 }, { date: '03/12', close: 31990, delta: -54 }, { date: '03/11', close: 32044, delta: 41 },
    { date: '03/10', close: 32003, delta: -33 }, { date: '03/07', close: 32036, delta: 77 }, { date: '03/06', close: 31959, delta: -142 },
    { date: '03/05', close: 32101, delta: 186 }, { date: '03/04', close: 31915, delta: -94 }, { date: '03/03', close: 32009, delta: 251 },
    { date: '02/27', close: 31758, delta: -168 }, { date: '02/26', close: 31926, delta: 129 }, { date: '02/25', close: 31797, delta: -73 },
    { date: '02/24', close: 31870, delta: 214 }, { date: '02/21', close: 31656, delta: -118 }, { date: '02/20', close: 31774, delta: 96 }
  ];

  let cards = [];
  let miniSparks = [];
  let activeBTab = 'weighted';
  let productMode = '台指(全)';
  let ampResizeObserver = null;
  let bStockTrendTimer = null;
  let bStockTrendInFlight = false;
  let ampHistoryData = fallbackAmpHistory;
  const bStockTrendByCode = new Map();

  const bTabs = [
    { key: 'weighted', label: '十大權值股' },
    { key: 'intraday', label: '台指盤中資訊' },
    { key: 'watch', label: '自選股' },
    { key: 'volume', label: '大盤預估量' },
    { key: 'amp30', label: '30日振幅變化' }
  ];

  // renderBTabs：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const renderBTabs = () => {
    // 段落說明：更新 DOM 內容。
    container.querySelector('#p1-b-tabs').innerHTML = bTabs.map((t) => `<button data-k="${t.key}" class="${activeBTab === t.key ? 'is-active' : ''}">${t.label}</button>`).join('');
    // 段落說明：綁定使用者互動事件。
    container.querySelectorAll('#p1-b-tabs button').forEach((btn) => btn.addEventListener('click', () => {
      activeBTab = btn.dataset.k;
      renderBTabs();
      renderBContent();
      if (activeBTab === 'weighted') refreshBStockTrends();
    }));
  };

  const buildStockIntradaySparkline = (candles) => {
    const rows = Array.isArray(candles)
      ? candles
        .filter((row) => Number.isFinite(Number(row.close)))
        .filter((row) => {
          const minute = taipeiTimeParts(row.time)?.minute;
          return Number.isFinite(minute) && minute >= TAIEX_PLOT_START && minute <= TAIEX_PLOT_END;
        })
        .sort((a, b) => sortTimeForTrend(a.time, b.time))
      : [];
    if (rows.length < 2) return null;
    return {
      values: rows.map((row) => Number(row.close)),
      baseline: Number(rows[0].open) || Number(rows[0].close)
    };
  };

  const refreshBStockTrends = async () => {
    if (bStockTrendInFlight) return;
    bStockTrendInFlight = true;
    try {
      const results = await Promise.allSettled(TOP10_CODES.map(async (code) => {
        const candles = await fetchYahooCandles({ symbol: code, timeframe: '1m' });
        const trend = buildStockIntradaySparkline(candles);
        if (trend) bStockTrendByCode.set(code, trend);
      }));
      const hasUpdate = results.some((result) => result.status === 'fulfilled');
      if (hasUpdate && activeBTab === 'weighted') renderBContent();
    } catch (error) {
      console.warn('[page1] B section stock intraday refresh failed:', error);
    } finally {
      bStockTrendInFlight = false;
    }
  };

  // attachAmpResize：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const attachAmpResize = () => {
    if (ampResizeObserver) ampResizeObserver.disconnect();
    const wrap = container.querySelector('#p1-amp20-wrap');
    const cvs = container.querySelector('#p1-amp20');
    if (!wrap || !cvs) return;
    // 段落說明：監聽容器尺寸變化，重新計算或重繪內容。
    ampResizeObserver = new ResizeObserver(() => drawAmp20(cvs, ampHistoryData));
    ampResizeObserver.observe(wrap);
  };

  // renderBContent：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const renderBContent = () => {
    cards.forEach((x) => x.destroy()); cards = [];
    if (ampResizeObserver) { ampResizeObserver.disconnect(); ampResizeObserver = null; }

    const box = container.querySelector('#p1-b-content');

    if (activeBTab === 'weighted') {
      // 段落說明：更新 DOM 內容。
      box.innerHTML = '<div class="p1-cards" id="p1-cards"></div>';
      const wrap = box.querySelector('#p1-cards');
      const list = store.get('topStocks');
      // weighted：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
      const weighted = TOP10_CODES.map((code) => list.find((s) => s.code === code)).filter(Boolean);
      weighted.forEach((s) => {
        const intradayTrend = bStockTrendByCode.get(s.code);
        cards.push(new StockCard(wrap, {
          stock: {
            ...s,
            sparkline: intradayTrend?.values || [],
            sparklineBaseline: intradayTrend?.baseline ?? null
          }
        }));
      });
      return;
    }

    if (activeBTab === 'intraday') {
      const t = store.get('taiex');
      const f = store.get('futures');
      // 段落說明：更新 DOM 內容。
      box.innerHTML = `
        <div class="p1-rows">
          <div class="p1-row"><span>加權 開/高/低</span><strong>${t.open} / ${t.high} / ${t.low}</strong></div>
          <div class="p1-row"><span>加權 現/漲跌</span><strong class="${c(t.change)}">${t.price} / ${t.change}</strong></div>
          <div class="p1-row"><span>台指 開/高/低</span><strong>${f.open} / ${f.high} / ${f.low}</strong></div>
          <div class="p1-row"><span>台指 現/漲跌</span><strong class="${c(f.change)}">${f.price} / ${f.change}</strong></div>
        </div>
      `;
      return;
    }

    if (activeBTab === 'watch') {
      const w = store.get('watchlist');
      // map：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
      const map = new Map([...store.get('topStocks'), ...store.get('screenResults')].map((x) => [x.code, x]));
      // 段落說明：更新 DOM 內容。
      box.innerHTML = `<div class="p1-rows">${w.map((x) => {
        const q = map.get(x.code) || { price: '-', changePct: 0 };
        return `<div class="p1-row"><span>${x.group}｜${x.code} ${x.name}</span><strong class="${c(q.changePct)}">${q.price} / ${q.changePct}%</strong></div>`;
      }).join('')}</div>`;
      return;
    }

    if (activeBTab === 'volume') {
      const t = store.get('taiex');
      const currentVolume = Number(t.volume);
      const freshEstimate = estimateVolumeFromWeights(currentVolume, volumeWeights);
      const estimatedVolume = Number.isFinite(Number(freshEstimate?.value))
        ? Number(freshEstimate.value)
        : Number(t.volEstimate);
      const ratio = Number.isFinite(currentVolume) && Number.isFinite(estimatedVolume) && estimatedVolume > 0
        ? (currentVolume / estimatedVolume) * 100
        : null;
      const barWidth = ratio == null ? 0 : Math.min(100, Math.max(0, ratio));
      // 段落說明：更新 DOM 內容。
      box.innerHTML = `
        <div class="p1-rows">
          <div class="p1-row"><span>目前成交量</span><strong>${Number.isFinite(currentVolume) ? n(currentVolume, 0) : '--'}</strong></div>
          <div class="p1-row"><span>預估成交量</span><strong>${Number.isFinite(estimatedVolume) ? n(estimatedVolume, 0) : '--'}</strong></div>
          <div style="height:14px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:${barWidth}%;background:var(--gold)"></div></div>
          <div class="p1-row"><span>達成率</span><strong>${ratio == null ? '--' : `${ratio.toFixed(2)}%`}</strong></div>
        </div>
      `;
      return;
    }

    // 段落說明：更新 DOM 內容。
    box.innerHTML = '<div id="p1-amp20-wrap" class="p1-amp20-wrap"><canvas id="p1-amp20" style="width:100%;height:100%"></canvas></div>';
    drawAmp20(box.querySelector('#p1-amp20'), ampHistoryData);
    attachAmpResize();
  };

  // renderLeftPanel：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const renderLeftPanel = () => {
    const d = store.get('taiex');
    const f = getProductFuturesSnapshot(productMode);
    const isFull = productMode === '台指(全)';
    const hasFutures = hasUsableFuturesSnapshot(f);
    const m = hasFutures ? resolveProductSnapshot(productMode, d, f) : null;
    const liveChange = m ? m.price - m.prevClose : null;
    const liveChangePct = m?.prevClose ? (liveChange / m.prevClose) * 100 : 0;
    const liveAmplitude = m ? Math.abs(m.high - m.low) : null;
    const spread = m ? m.price - d.price : null;
    const displayPrice = m?.price ?? d.price;
    const displayChange = m ? liveChange : d.change;

    // 段落說明：更新 DOM 內容。
    container.querySelector('#p1-main').innerHTML = `
      <div class="p1-kv"><span>商品</span><strong><label class="p1-radio"><input type="radio" name="p1-product" value="台指(全)" ${isFull ? 'checked' : ''}>台指(全)</label><label class="p1-radio"><input type="radio" name="p1-product" value="台指" ${!isFull ? 'checked' : ''}>台指</label></strong></div>
      <div class="p1-main-top">
        <div class="p1-main-table">
          <div class="p1-kv p1-kv-current"><span>${productMode}</span><strong class="${c(displayChange ?? 0)}">${formatFuturesValue(displayPrice)}</strong></div>
          <div class="p1-kv"><span>${productMode}開</span><strong>${formatFuturesValue(m?.open)}</strong></div>
          <div class="p1-kv"><span>${productMode}高</span><strong>${formatFuturesValue(m?.high)}</strong></div>
          <div class="p1-kv"><span>${productMode}低</span><strong>${formatFuturesValue(m?.low)}</strong></div>
          <div class="p1-kv"><span>月成本</span><strong>${formatFuturesValue(m?.monthCost)}</strong></div>
        </div>
        <div class="p1-main-mini" id="p1-main-mini">
          <canvas id="p1-main-mini-canvas" class="p1-main-mini-canvas"></canvas>
        </div>
      </div>
      <div class="p1-kv"><span>${productMode}加權價差</span><strong class="${c(spread ?? 0)}">${Number.isFinite(spread) ? spread.toFixed(2) : '--'}</strong></div>
      <div class="p1-kv"><span>${productMode}近月漲跌</span><strong class="${c(liveChange ?? 0)}">${formatFuturesValue(liveChange)}</strong></div>
    `;

    const miniCanvas = container.querySelector('#p1-main-mini-canvas');
    if (m) {
      drawInfoCandle(miniCanvas, {
        open: m.open,
        close: m.price,
        high: m.high,
        low: m.low,
        prevClose: m.prevClose,
        change: liveChange,
        ampPct: liveChangePct
      });
    } else {
      miniCanvas.getContext('2d')?.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    }

    // upper：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const levelBase = m?.price ?? d.price;
    const upper = [levelBase + 280, levelBase + 180, levelBase + 100, levelBase + 40, levelBase + 10].map((x) => x.toFixed(0));
    // lower：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const lower = [levelBase - 10, levelBase - 40, levelBase - 100, levelBase - 180, levelBase - 280].map((x) => x.toFixed(0));
    // 段落說明：更新 DOM 內容。
    container.querySelector('#p1-levels').innerHTML = `
      <div class="p1-block p1-block--red"><div class="p1-block-title">日多方關卡</div>${upper.map((x, i) => `<div class="p1-kv"><span>關卡${5 - i}</span><strong>${x}</strong></div>`).join('')}</div>
      <div class="p1-block p1-block--green"><div class="p1-block-title">日空方關卡</div>${lower.map((x, i) => `<div class="p1-kv"><span>關卡${i + 1}</span><strong>${x}</strong></div>`).join('')}</div>
    `;

    // 段落說明：更新 DOM 內容。
    container.querySelector('#p1-hist').innerHTML = `
      <div class="p1-block-title">日振幅統計(近${AMP_HISTORY_DAYS}日)</div>
      <div class="p1-amp-list">${[...AMP_GRID, ['本日振幅', Number.isFinite(liveAmplitude) ? liveAmplitude.toFixed(0) : '--']].map((r) => `<div class="p1-kv"><span>${r[0]}</span><strong>${r[1]}</strong></div>`).join('')}</div>
    `;

    // 段落說明：綁定使用者互動事件。
    container.querySelectorAll('input[name="p1-product"]').forEach((el) => el.addEventListener('change', (e) => {
      productMode = e.target.value;
      renderLeftPanel();
      renderMainTrend();
      refreshPage1Quotes(true);
    }));
  };

  // renderMainTrend：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  let chartTrendState = null;
  let s6TrendTimer = null;
  let page1QuoteTimer = null;
  let volumeWeights = [];

  const productStoreKey = (mode) => PRODUCT_MODE_STORE_KEYS[mode] || 'futuresFull';

  const productSymbol = (mode) => PRODUCT_MODE_SYMBOLS[mode] || PRODUCT_MODE_SYMBOLS['台指(全)'];

  const getProductFuturesSnapshot = (mode) => {
    const selected = store.get(productStoreKey(mode));
    if (hasUsableFuturesSnapshot(selected)) return selected;
    return store.get('futures');
  };

  const applyVolumeEstimateToTaiex = (volume, weights = volumeWeights) => {
    const estimate = estimateVolumeFromWeights(volume, weights);
    if (!estimate) return null;
    const current = store.get('taiex');
    store.set('taiex', {
      ...current,
      volEstimate: Math.round(estimate.value),
      volumeEstimateWeight: +estimate.weight.toFixed(6)
    });
    return estimate;
  };

  const applySpotQuoteToStore = (payload, source) => {
    if (!payload) return false;
    const current = store.get('taiex');
    const price = Number(payload.price ?? payload.close);
    if (!Number.isFinite(price)) return false;
    const change = Number(payload.change);
    const changePct = Number(payload.changePct);
    const derivedPrevClose = Number.isFinite(price) && Number.isFinite(change) ? price - change : null;
    const volume = Number(payload.totalVolume ?? payload.volume);
    const amountYi = Number(payload.amountYi);
    const next = {
      ...current,
      price: +price.toFixed(2),
      change: Number.isFinite(change) ? +change.toFixed(2) : current.change,
      changePct: Number.isFinite(changePct) ? +changePct.toFixed(2) : current.changePct,
      prevClose: Number.isFinite(Number(payload.prevClose)) ? +Number(payload.prevClose).toFixed(2)
        : Number.isFinite(derivedPrevClose) ? +derivedPrevClose.toFixed(2) : current.prevClose,
      open: Number.isFinite(Number(payload.open)) ? +Number(payload.open).toFixed(2) : current.open,
      high: Number.isFinite(Number(payload.high)) ? +Number(payload.high).toFixed(2) : current.high,
      low: Number.isFinite(Number(payload.low)) ? +Number(payload.low).toFixed(2) : current.low,
      volume: Number.isFinite(volume) ? volume : current.volume,
      amountYi: Number.isFinite(amountYi) ? +amountYi.toFixed(2) : current.amountYi,
      source,
      sourceUpdatedAt: Date.now()
    };
    const estimate = estimateVolumeFromWeights(next.volume, volumeWeights);
    if (estimate) {
      next.volEstimate = Math.round(estimate.value);
      next.volumeEstimateWeight = +estimate.weight.toFixed(6);
    }
    store.set('taiex', next);
    return true;
  };

  const fetchBrokerQuote = async (source, symbol) => {
    const quoteBase = brokerQuoteUrlForSource(source);
    if (!quoteBase) throw new Error(`No quote URL for source ${source}`);
    const quoteUrl = new URL(quoteBase);
    quoteUrl.searchParams.set('symbol', symbol);
    quoteUrl.searchParams.set('_ts', String(Date.now()));
    const response = await fetch(quoteUrl.toString(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
  };

  const setChartTrendStateFromCandles = ({ candles, timeframe, source, symbol }) => {
    const trend = buildChartTrendSeries(candles, timeframe);
    if (!trend) return false;
    const chartRows = trend.sourceRows || [];
    const highs = chartRows.map((row) => Number(row.high)).filter(Number.isFinite);
    const lows = chartRows.map((row) => Number(row.low)).filter(Number.isFinite);
    const latest = chartRows.at(-1);
    chartTrendState = {
      trend,
      high: Math.max(...highs, Number(latest?.close) || 0),
      low: Math.min(...lows, Number(latest?.close) || 0),
      timeframe,
      source,
      symbol,
      sessionLabel: trend.sessionLabel || `C區${timeframe}`
    };
    return true;
  };

  const renderMainTrend = () => {
    const taiex = store.get('taiex');
    const futures = getProductFuturesSnapshot(productMode);
    const snap = resolveProductSnapshot(productMode, taiex, futures);
    const useChartTrend = chartTrendState?.trend?.points?.length >= S6_MIN_TREND_POINTS;
    const intraday = useChartTrend ? chartTrendState.trend : buildIntradaySeries(productMode, snap);
    const avg = intraday.points[intraday.points.length - 1]?.avg ?? snap.price;
    // totalVolume：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const totalVolume = intraday.points.reduce((sum, point) => sum + point.volume, 0);
    const taiexVolume = Number(taiex.volume);
    const cumulativeVolume = Number.isFinite(taiexVolume) && taiexVolume > 0 ? taiexVolume : totalVolume;
    const volumeEstimate = estimateVolumeFromWeights(cumulativeVolume, volumeWeights);
    drawTrend(container.querySelector('#p1-trend'), intraday, {
      high: useChartTrend ? chartTrendState.high : snap.high,
      low: useChartTrend ? chartTrendState.low : snap.low,
      title: '#001 加權指數'
    });
    // 段落說明：更新 DOM 內容。
    container.querySelector('#p1-trend-meta').innerHTML = `
      <span>${productMode} 盤中走勢</span>
      <span>現價 ${n(snap.price, snap.price >= 100 ? 0 : 2)}</span>
      <span>本日均價 ${n(avg, avg >= 100 ? 0 : 2)}</span>
      <span>累計量 ${n(cumulativeVolume, 0)}</span>
      <span>金額(億) ${Number.isFinite(Number(taiex.amountYi)) ? n(taiex.amountYi, 2) : '--'}</span>
      <span>預估量 ${volumeEstimate ? n(volumeEstimate.value, 0) : '--'}</span>
      <span>時段 ${useChartTrend ? chartTrendState.sessionLabel : `${PRODUCT_SESSIONS[productMode].start} - ${PRODUCT_SESSIONS[productMode].end}`}</span>
    `;
  };

  // renderPage1Group：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const renderPage1Group = () => {
    // list：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const list = store.get('watchlist').filter((x) => x.group === 'page1分組');
    // quoteMap：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const quoteMap = new Map([...store.get('topStocks'), ...store.get('screenResults')].map((x) => [x.code, x]));

    miniSparks.forEach((x) => x.destroy()); miniSparks = [];
    const mini = container.querySelector('#p1-mini');
    if (!mini) return;

    // 段落說明：更新 DOM 內容。
    mini.innerHTML = list.map((s) => {
      const q = quoteMap.get(s.code) || { code: s.code, name: s.name, changePct: 0, sparkline: [0, 0, 0, 0, 0] };
      return `
        <div class="p1-mini-item" data-code="${q.code}">
          <div><div>${q.code}</div><div style="color:var(--text2)">${q.name || s.name}</div></div>
          <div class="spark-${q.code}"></div>
          <div class="${c(q.changePct)}">${q.changePct > 0 ? '+' : ''}${q.changePct}%</div>
        </div>
      `;
    }).join('');

    list.forEach((s) => {
      const q = quoteMap.get(s.code) || { code: s.code, sparkline: [0, 0, 0, 0, 0], changePct: 0 };
      const el = mini.querySelector(`.spark-${q.code}`);
      if (!el) return;
      const sp = new Sparkline(el, { width: 140, height: 44, color: q.changePct >= 0 ? 'rgb(240,58,95)' : 'rgb(31,214,122)' });
      sp.update(q.sparkline || [0, 0, 0, 0, 0]);
      miniSparks.push(sp);
    });
  };

  // renderMonitor：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const renderMonitor = () => {
    const mode = container.querySelector('#p1-monitor-select').value;
    const rows = makeMonitorRows(mode, {
      topStocks: store.get('topStocks'),
      screenResults: store.get('screenResults'),
      watchlist: store.get('watchlist')
    });
    drawMonitor(container.querySelector('#p1-monitor-canvas'), rows);
  };

  // setS6Tab：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const setS6Tab = (tab) => {
    container.querySelectorAll('#p1-s6-tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.k === tab));
    container.querySelector('#p1-s6-trend').style.display = tab === 'trend' ? '' : 'none';
    container.querySelector('#p1-s6-group').style.display = tab === 'group' ? '' : 'none';
  };

  // 段落說明：綁定使用者互動事件。
  container.querySelectorAll('#p1-s6-tabs button').forEach((btn) => btn.addEventListener('click', () => setS6Tab(btn.dataset.k)));
  // 段落說明：綁定使用者互動事件。
  container.querySelector('#p1-monitor-select').addEventListener('change', renderMonitor);

  // monitorResize：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  // 段落說明：監聽容器尺寸變化，重新計算或重繪內容。
  const monitorResize = new ResizeObserver(() => renderMonitor());
  monitorResize.observe(container.querySelector('#p1-monitor-wrap'));
  // trendResize：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  // 段落說明：監聽容器尺寸變化，重新計算或重繪內容。
  const trendResize = new ResizeObserver(() => renderMainTrend());
  trendResize.observe(container.querySelector('#p1-s6-trend'));

  // redrawAll：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const redrawAll = () => {
    renderLeftPanel();
    renderMainTrend();
    renderPage1Group();
    renderMonitor();
    renderBContent();
  };

  renderBTabs();
  loadVolumeWeights().then((rows) => {
    volumeWeights = rows;
    applyVolumeEstimateToTaiex(store.get('taiex').volume);
    renderMainTrend();
    renderBContent();
  });
  redrawAll();

  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsubTaiex = store.subscribe('taiex', redrawAll);
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsubFut = store.subscribe('futures', redrawAll);
  const unsubFutDay = store.subscribe('futuresDay', redrawAll);
  const unsubFutFull = store.subscribe('futuresFull', redrawAll);
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsubTop = store.subscribe('topStocks', redrawAll);
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsubWatch = store.subscribe('watchlist', redrawAll);

  // clockTimer：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  // 段落說明：建立定時更新流程。
  const clockTimer = setInterval(() => {
    container.querySelector('#p1-clock').textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
  }, 1000);

  const syncChartDataToStore = ({ candles, latest, previous, symbolConfig, source, timeframe }) => {
    if (!latest || !symbolConfig) return;
    const sessionOhlc = buildLatestSessionOhlc(candles, timeframe) || latest;
    const close = Number(sessionOhlc.close);
    const open = Number(sessionOhlc.open);
    const high = Number(sessionOhlc.high);
    const low = Number(sessionOhlc.low);
    if (![close, open, high, low].every(Number.isFinite)) return;

    const prevClose = Number(sessionOhlc.prevClose ?? previous?.close);
    const base = Number.isFinite(prevClose) && prevClose !== 0 ? prevClose : open;
    const change = +(close - base).toFixed(2);
    const changePct = base ? +((change / base) * 100).toFixed(2) : 0;
    const volume = Number(sessionOhlc.volume);
    const payloadBase = {
      price: +close.toFixed(2),
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      prevClose: Number.isFinite(prevClose) ? +prevClose.toFixed(2) : undefined,
      change,
      changePct,
      volume: Number.isFinite(volume) ? volume : undefined,
      source: 'chart',
      chartSource: source,
      chartTimeframe: timeframe,
      sourceUpdatedAt: Date.now()
    };
    if (
      isIndexSymbol(symbolConfig.value) ||
      isFutureSymbol(symbolConfig)
    ) {
      setChartTrendStateFromCandles({ candles, timeframe, source, symbol: symbolConfig.value });
      const nextAmpHistory = buildAmpHistoryFromCandles(candles, timeframe);
      if (nextAmpHistory.length) {
        ampHistoryData = nextAmpHistory;
        if (activeBTab === 'amp30') renderBContent();
      }
    }

    if (isIndexSymbol(symbolConfig.value)) {
      const current = store.get('taiex');
      const estimate = estimateVolumeFromWeights(payloadBase.volume, volumeWeights);
      store.set('taiex', {
        ...current,
        ...payloadBase,
        volume: payloadBase.volume ?? current.volume,
        volEstimate: estimate ? Math.round(estimate.value) : current.volEstimate,
        volumeEstimateWeight: estimate ? +estimate.weight.toFixed(6) : current.volumeEstimateWeight
      });
      return;
    }

    if (isFutureSymbol(symbolConfig) && isFuturesDetailSource(source)) {
      const current = store.get('futures');
      const monthRange = buildCurrentMonthRange(candles, latest);
      const futuresPayload = normalizeFuturesPayload({
        ...payloadBase,
        prevClose: payloadBase.prevClose ?? current.prevClose,
        monthHigh: monthRange?.high,
        monthLow: monthRange?.low,
        monthCost: monthRange?.cost
      });
      store.set('futures', {
        ...current,
        ...futuresPayload,
        source,
        sourceSymbol: symbolConfig.value
      });
    }
  };

  const refreshS6TickTrend = async () => {
    if (!isTaiexTradingTime()) {
      applyVolumeEstimateToTaiex(store.get('taiex').volume);
      renderMainTrend();
      return;
    }

    const candidates = liveSourceCandidates();
    for (const source of candidates) {
      try {
        const [candles, quote] = await Promise.all([
          fetchBrokerCandles({
            brokerUrl: brokerCandlesUrlForSource(source),
            symbol: 'INDEX:TWII',
            timeframe: '1m'
          }),
          fetchBrokerQuote(source, 'INDEX:TWII')
        ]);
        applySpotQuoteToStore(quote, source);
        if (setChartTrendStateFromCandles({
          candles,
          timeframe: '1m',
          source,
          symbol: 'INDEX:TWII'
        })) {
          renderMainTrend();
          return;
        }
      } catch (error) {
        console.warn(`[page1] section 6 ${source} trend refresh failed:`, error);
      }
    }

    try {
      const candles = await fetchYahooCandles({ symbol: 'INDEX:TWII', timeframe: '1m' });
      if (setChartTrendStateFromCandles({
        candles,
        timeframe: '1m',
        source: 'yahoo-tick',
        symbol: 'INDEX:TWII'
      })) {
        const current = store.get('taiex');
        applyVolumeEstimateToTaiex(current.volume);
        renderMainTrend();
      }
    } catch (error) {
      console.warn('[page1] section 6 tick trend refresh failed:', error);
    }
  };

  const refreshPage1Quotes = async (force = false) => {
    const source = getDashboardDataSource();
    const quoteBase = brokerQuoteUrlForSource(source);
    const shouldRefreshSpot = isTaiexTradingTime();
    const shouldRefreshDayFutures = isFuturesDayTradingTime();
    if (quoteBase) {
      try {
        if (!volumeWeights.length) volumeWeights = await loadVolumeWeights();
        const spotPromise = shouldRefreshSpot
          ? fetchBrokerQuote(source, 'INDEX:TWII').catch((error) => {
            console.warn(`[page1] ${source} spot quote refresh failed:`, error);
            return null;
          })
          : Promise.resolve(null);
        const dayPromise = shouldRefreshDayFutures
          ? fetchBrokerQuote(source, productSymbol('台指')).catch((error) => {
            console.warn(`[page1] ${source} day futures quote refresh failed:`, error);
            return null;
          })
          : Promise.resolve(null);
        const [dayPayload, fullPayload, spotPayload] = await Promise.all([
          dayPromise,
          fetchBrokerQuote(source, productSymbol('台指(全)')),
          spotPromise
        ]);
        if (spotPayload) applySpotQuoteToStore(spotPayload, source);
        if (dayPayload) store.set(productStoreKey('台指'), normalizeKgiFuturesQuote(dayPayload, store.get(productStoreKey('台指')) || store.get('futures'), source, productSymbol('台指')));
        store.set(productStoreKey('台指(全)'), normalizeKgiFuturesQuote(fullPayload, store.get(productStoreKey('台指(全)')) || store.get('futures'), source, productSymbol('台指(全)')));
        return;
      } catch (error) {
        console.warn(`[page1] ${source} quote refresh failed:`, error);
      }
    }

    try {
      if (!shouldRefreshSpot) {
        if (!volumeWeights.length) volumeWeights = await loadVolumeWeights();
        applyVolumeEstimateToTaiex(store.get('taiex').volume);
        return;
      }
      await updateYahooTaiexOnce({ force });
      if (!volumeWeights.length) volumeWeights = await loadVolumeWeights();
      applyVolumeEstimateToTaiex(store.get('taiex').volume);
    } catch (error) {
      console.warn('[page1] quote refresh failed:', error);
    }
  };

  const chartOptions = {
    symbol: 'INDEX:TWII',
    timeframe: 'D',
    source: getDashboardDataSource(),
    pollMs: 10000,
    onDataUpdate: syncChartDataToStore,
    getDataSource: getDashboardDataSource,
    onDataSourceChange: setDashboardDataSource,
    subscribeDataSourceChange: subscribeDashboardDataSource,
    // TODO: replace with your backend/proxy endpoint for TAIFEX OHLCV data.
    // Expected JSON/CSV fields: time/open/high/low/close/volume.
    taifexUrl: '',
    brokerUrl: 'http://127.0.0.1:8788/api/broker-candles',
    kgiDdeUrl: 'http://127.0.0.1:8788/api/broker-candles',
    kgiRtdUrl: 'http://127.0.0.1:8789/api/broker-candles',
    taishinDdeUrl: 'http://127.0.0.1:8790/api/broker-candles',
    dataSources: DASHBOARD_DATA_SOURCES,
    symbols: [
      { label: '加權指數', value: 'INDEX:TWII', source: 'yahoo' },
      { label: '台積電', value: '2330', source: 'yahoo' },
      {
        label: '台指',
        value: 'FITX*1',
        source: 'taifex',
        type: 'future',
        session: 'day',
        productCodes: ['TX'],
        csvProductCodes: ['TX'],
        futuresId: 'TXF',
        finMindFuturesId: 'TXF',
        dailyId: 'TX',
        finMindDailyId: 'TX'
      },
      {
        label: '台指(全)',
        value: 'FITXN*1',
        source: 'taifex',
        type: 'future',
        session: 'full',
        productCodes: ['TX'],
        csvProductCodes: ['TX'],
        futuresId: 'TXF',
        finMindFuturesId: 'TXF',
        dailyId: 'TX',
        finMindDailyId: 'TX'
      }
    ],
    timeframes: [
      { label: '1S', value: '1s' },
      { label: '1m', value: '1m' },
      { label: '5m', value: '5m' },
      { label: '日K', value: 'D' }
    ]
  };

  let activeChartTab = 'lightweight';
  // stopLightweightChart：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  let stopLightweightChart = () => {};
  // stopTradingViewWidget：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  let stopTradingViewWidget = () => {};
  let tradingViewMounted = false;

  // 三個圖表分頁共用同一個 C 區容器；只有 TradingView 需要延遲掛載外部 widget。
  const chartLightweightEl = container.querySelector('#p1-chart-lightweight');
  const chartTradingViewEl = container.querySelector('#p1-chart-tradingview');
  const chartingLibraryEl = container.querySelector('#p1-chart-chartinglib');

  // 自有資料圖表：由 services/marketChart.js 處理資料來源、CSV、指標與 Lightweight Charts。
  const mountLightweight = () => {
    mountMarketChart(chartLightweightEl, chartOptions)
      .then((fn) => { stopLightweightChart = fn; })
      // 段落說明：更新 DOM 內容。
      .catch(() => { chartLightweightEl.innerHTML = '<div style="color:var(--text2)">Lightweight Charts 載入失敗</div>'; });
  };

  // TradingView widget 只有切到該分頁時才載入，避免預設頁面多載外部資源。
  const mountTradingViewTab = () => {
    if (tradingViewMounted) return;
    tradingViewMounted = true;
    mountTradingViewWidget(chartTradingViewEl, {
      symbol: 'INDEX:TWII',
      interval: 'D'
    })
      .then((fn) => { stopTradingViewWidget = fn; })
      // 段落說明：更新 DOM 內容。
      .catch(() => { chartTradingViewEl.innerHTML = '<div style="color:var(--text2)">TradingView 載入失敗</div>'; });
  };

  // 單純切換分頁顯示狀態；Charting Library 目前是預留區，日後可在這裡接掛載流程。
  const setChartTab = (tab) => {
    activeChartTab = tab;
    container.querySelectorAll('#p1-chart-tabs button').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.k === activeChartTab);
    });
    chartLightweightEl.style.display = activeChartTab === 'lightweight' ? '' : 'none';
    chartTradingViewEl.style.display = activeChartTab === 'tradingview' ? '' : 'none';
    chartingLibraryEl.style.display = activeChartTab === 'chartinglib' ? '' : 'none';
    if (activeChartTab === 'tradingview') mountTradingViewTab();
  };

  container.querySelectorAll('#p1-chart-tabs button').forEach((btn) => {
    // 段落說明：綁定使用者互動事件。
    btn.addEventListener('click', () => setChartTab(btn.dataset.k));
  });

  mountLightweight();
  refreshPage1Quotes(true);
  page1QuoteTimer = setInterval(refreshPage1Quotes, 10000);
  refreshBStockTrends();
  bStockTrendTimer = setInterval(refreshBStockTrends, 60000);
  refreshS6TickTrend();
  s6TrendTimer = setInterval(refreshS6TickTrend, 10000);

  cleanup = () => {
    unsubTaiex(); unsubFut(); unsubFutDay(); unsubFutFull(); unsubTop(); unsubWatch();
    // 段落說明：清除定時器，避免頁面卸載後繼續執行。
    clearInterval(clockTimer);
    if (page1QuoteTimer) clearInterval(page1QuoteTimer);
    if (bStockTrendTimer) clearInterval(bStockTrendTimer);
    if (s6TrendTimer) clearInterval(s6TrendTimer);
    stopLightweightChart();
    stopTradingViewWidget();
    monitorResize.disconnect();
    trendResize.disconnect();
    if (ampResizeObserver) ampResizeObserver.disconnect();
    stopSplitLeft();
    stopSplitRight();
    cards.forEach((x) => x.destroy()); miniSparks.forEach((x) => x.destroy());
    pLeft.destroy(); p6.destroy(); p5.destroy();
  };

  // 段落說明：回傳目前頁面的清理函式。
  return cleanup;
}

// unmount：函式用途註解，說明此處封裝一段可重用的流程。
export function unmount() {
  cleanup();
  cleanup = () => {};
}
