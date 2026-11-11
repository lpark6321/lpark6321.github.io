// Page1 的 K 線計算：台北時間拆解、交易時段分組、6 區走勢、振幅統計、結算月 K 與比前一日的 K 棒顏色。
import { TW_SESSIONS, minutesOf } from '../../services/marketCalendar.js';
import { contractExpiry } from '../../services/taifexOptions.js';

// 時段一律取自 marketCalendar，這裡只換算成「當日第幾分鐘」給 K 線分組用。
const DAY_SESSION_START = minutesOf(TW_SESSIONS.futuresDay.open);
const DAY_SESSION_END = minutesOf(TW_SESSIONS.futuresDay.close);
const AFTER_SESSION_START = minutesOf(TW_SESSIONS.futuresNight.open);
const AFTER_SESSION_END = minutesOf(TW_SESSIONS.futuresNight.close);
export const TAIEX_PLOT_START = minutesOf(TW_SESSIONS.spot.open);
export const TAIEX_PLOT_END = minutesOf(TW_SESSIONS.spot.close);
const S6_INTRADAY_TIMEFRAMES = new Set(['1m', '5m']);
const S6_MIN_TREND_POINTS = 2;
export const AMP_HISTORY_DAYS = 20;

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

// 日 K 統計（Page1 1 區與 B 區）：近 20 日振幅、前一個完整交易日的高低收（樞紐點、比前一日 K 棒）；
// rows（排好序的日 K）與 today 給 periodAmplitudes、settlementMonth 用。
export function buildDailyStats(candles, now = Date.now()) {
  const rows = Array.isArray(candles)
    ? candles
      .filter((row) => [row.open, row.high, row.low, row.close].every((value) => Number.isFinite(Number(value))))
      .sort((a, b) => sortTimeForTrend(a.time, b.time))
    : [];
  const today = taipeiTimeParts(Math.floor(now / 1000))?.dateKey;
  const prev = rows.filter((row) => taipeiTimeParts(row.time)?.dateKey < today).at(-1);
  return {
    rows,
    today,
    ampHistory: buildAmpHistoryFromCandles(rows, 'D'),
    prevDay: prev ? { high: Number(prev.high), low: Number(prev.low), close: Number(prev.close) } : null
  };
}

// 振幅週期：日、週（週一為一週開始）、月（日曆月）。
const PERIOD_KEY = {
  D: (dateKey) => dateKey,
  W: (dateKey) => {
    const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    return shiftDateKey(dateKey, -((day + 6) % 7));
  },
  M: (dateKey) => dateKey.slice(0, 7)
};

// 近 limit 個完整週期的振幅（高－低，不含目前這一期）與目前這一期的振幅（含 live 的盤中高低）。
export function periodAmplitudes(rows, period, today, live, limit = AMP_HISTORY_DAYS) {
  const keyOf = PERIOD_KEY[period] || PERIOD_KEY.D;
  const currentKey = keyOf(today);
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyOf(taipeiTimeParts(row.time)?.dateKey || '');
    const item = groups.get(key) || { high: -Infinity, low: Infinity };
    item.high = Math.max(item.high, Number(row.high));
    item.low = Math.min(item.low, Number(row.low));
    groups.set(key, item);
  });
  const current = groups.get(currentKey) || { high: -Infinity, low: Infinity };
  if (live && Number.isFinite(Number(live.high)) && Number.isFinite(Number(live.low))) {
    current.high = Math.max(current.high, Number(live.high));
    current.low = Math.min(current.low, Number(live.low));
  }
  const history = [...groups.entries()].filter(([key]) => key < currentKey).sort(([a], [b]) => a.localeCompare(b)).slice(-limit)
    .map(([, item]) => item.high - item.low);
  return { history, current: Number.isFinite(current.high - current.low) ? current.high - current.low : null };
}

// 期海任我行的振幅統計：最大、大大（高於平均者的平均）、平均、小小（低於平均者的平均）、最小。
export function amplitudeStats(amps) {
  if (!amps.length) return null;
  const mean = (list) => (list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : null);
  const avg = mean(amps);
  return {
    max: Math.max(...amps),
    big: mean(amps.filter((v) => v > avg)) ?? avg,
    avg,
    small: mean(amps.filter((v) => v < avg)) ?? avg,
    min: Math.min(...amps)
  };
}

// 結算月 K（期海任我行的「月成本」）：上一次月結算（第三個星期三）之後的開高低，月成本＝(最高＋最低)÷2。
// 夜盤 K 棒的日期是它所屬的交易日（結算日 15:00 的夜盤算隔天），所以日盤、全日盤都從結算日的下一個交易日算起。
// rows 是近月連續日 K；live 是今天盤中的報價（今天的日 K 還沒進歷史時補上）。
export function settlementMonth(rows, today, live) {
  const [year, month] = today.split('-').map(Number);
  const expiries = [0, 1].map((back) => {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    return contractExpiry(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  });
  const lastExpiry = expiries.find((date) => date < today);
  const period = rows.filter((row) => {
    const dateKey = taipeiTimeParts(row.time)?.dateKey;
    return dateKey > lastExpiry && dateKey <= today;
  });
  const highs = period.map((row) => Number(row.high));
  const lows = period.map((row) => Number(row.low));
  const hasToday = period.some((row) => taipeiTimeParts(row.time)?.dateKey === today);
  if (live && !hasToday && Number.isFinite(Number(live.high)) && Number.isFinite(Number(live.low))) {
    highs.push(Number(live.high));
    lows.push(Number(live.low));
  }
  if (!highs.length) return null;
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  return { since: shiftDateKey(lastExpiry, 1), open: Number(period[0]?.open ?? live?.open), high, low, cost: (high + low) / 2 };
}

// 與前一個交易日的日 K 比：高過高低不過低＝紅、高不過高低過低＝綠、都沒過＝黃、都過＝灰。
export const COMPARE_COLORS = { red: '#f03a5f', green: '#1fd67a', yellow: '#f5c842', grey: '#8a93a6' };
export function compareWithPrevDay(today, prev) {
  if (!today || !prev) return null;
  const higher = Number(today.high) > Number(prev.high);
  const lower = Number(today.low) < Number(prev.low);
  if (higher && !lower) return 'red';
  if (!higher && lower) return 'green';
  return higher ? 'grey' : 'yellow';
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
