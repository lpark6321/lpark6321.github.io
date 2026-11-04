// Page1 的 K 線計算：台北時間拆解、交易時段分組、6 區走勢、振幅歷史與當月高低。
import { TW_SESSIONS, minutesOf } from '../../services/marketCalendar.js';

// 時段一律取自 marketCalendar，這裡只換算成「當日第幾分鐘」給 K 線分組用。
const DAY_SESSION_START = minutesOf(TW_SESSIONS.futuresDay.open);
const DAY_SESSION_END = minutesOf(TW_SESSIONS.futuresDay.close);
const AFTER_SESSION_START = minutesOf(TW_SESSIONS.futuresNight.open);
const AFTER_SESSION_END = minutesOf(TW_SESSIONS.futuresNight.close);
export const TAIEX_PLOT_START = minutesOf(TW_SESSIONS.spot.open);
export const TAIEX_PLOT_END = minutesOf(TW_SESSIONS.spot.close);
const S6_INTRADAY_TIMEFRAMES = new Set(['1m', '5m']);
const S6_MIN_TREND_POINTS = 2;
export const AMP_HISTORY_DAYS = 30;

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

// 日 K 統計（Page1 1 區與 B 區）：近 30 日振幅、20 日均線（月成本）、前一個完整交易日的高低收（樞紐點用）。
export function buildDailyStats(candles, now = Date.now()) {
  const rows = Array.isArray(candles)
    ? candles
      .filter((row) => [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(Number(value))))
      .sort((a, b) => sortTimeForTrend(a.time, b.time))
    : [];
  const closes = rows.map((row) => Number(row.close));
  const today = taipeiTimeParts(Math.floor(now / 1000))?.dateKey;
  const prev = rows.filter((row) => taipeiTimeParts(row.time)?.dateKey < today).at(-1);
  return {
    ampHistory: buildAmpHistoryFromCandles(rows, 'D'),
    ma20: closes.length >= 20 ? closes.slice(-20).reduce((sum, v) => sum + v, 0) / 20 : null,
    prevDay: prev ? { high: Number(prev.high), low: Number(prev.low), close: Number(prev.close) } : null
  };
}

export function buildAmpHistoryFromCandles(candles, timeframe, limit = AMP_HISTORY_DAYS) {
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
      amplitude: row.high - row.low
    };
  });

  return rows.slice(-limit);
}

export function buildChartTrendSeries(candles, timeframe) {
  if (!S6_INTRADAY_TIMEFRAMES.has(timeframe)) return null;
  const rows = Array.isArray(candles) ? candles.filter((row) => Number.isFinite(Number(row.close))) : [];
  const { rows: source, sessionLabel } = selectLatestTradingSessionRows(rows, timeframe);
  const intradaySource = source.filter((row) => {
    const minute = taipeiTimeParts(row.time)?.minute;
    return Number.isFinite(minute) && minute >= TAIEX_PLOT_START && minute <= TAIEX_PLOT_END;
  });
  if (intradaySource.length < S6_MIN_TREND_POINTS) return null;

  // 來源沒有成交量（例如 Yahoo 的加權 1 分 K 量全是 0）時，均價改成單純平均，量也不畫，不拿假的 1 張頂替。
  const hasVolume = intradaySource.some((row) => Number(row.volume) > 0);
  let cumValue = 0;
  let cumVolume = 0;
  const points = intradaySource.map((row) => {
    const price = Number(row.close);
    const volume = Math.max(0, Number(row.volume) || 0);
    const weight = hasVolume ? volume : 1;
    const minute = taipeiTimeParts(row.time)?.minute;
    cumValue += price * weight;
    cumVolume += weight;
    return {
      minute,
      price,
      avg: cumVolume ? cumValue / cumVolume : price,
      volume: hasVolume ? volume : 0
    };
  });

  return { points, sourceRows: intradaySource, sessionLabel, hasVolume };
}
