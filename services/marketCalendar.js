// 市場交易時間設定：提供各市場開收盤時段與倒數狀態判斷基礎資料。
import { TW_MARKET_HOLIDAYS } from '../data/twMarketHolidays.js';

export const MARKET_SCHEDULES = {
  kospi: { tz: 'Asia/Seoul', open: '09:00', close: '15:30' },
  nikkei: { tz: 'Asia/Tokyo', open: '09:00', close: '15:30' },
  nasdaq: { tz: 'America/New_York', open: '09:30', close: '16:00' },
  sox: { tz: 'America/New_York', open: '09:30', close: '16:00' },
  dow: { tz: 'America/New_York', open: '09:30', close: '16:00' },
  sp500: { tz: 'America/New_York', open: '09:30', close: '16:00' },
  gold: { tz: 'UTC', open: '00:00', close: '23:59' },
  us10y: { tz: 'UTC', open: '00:00', close: '23:59' },
  usdtwd: { tz: 'Asia/Taipei', open: '09:00', close: '16:00' },
  wti: { tz: 'UTC', open: '00:00', close: '23:59' },
  vix: { tz: 'America/New_York', open: '09:30', close: '16:00' },
  hsi: { tz: 'Asia/Hong_Kong', open: '09:30', close: '16:00' },
  shanghai: { tz: 'Asia/Shanghai', open: '09:30', close: '15:00' },
  eurusd: { tz: 'UTC', open: '00:00', close: '23:59' },
  usdjpy: { tz: 'UTC', open: '00:00', close: '23:59' },
  gbpusd: { tz: 'UTC', open: '00:00', close: '23:59' },
  audusd: { tz: 'UTC', open: '00:00', close: '23:59' },
  btcusd: { tz: 'UTC', open: '00:00', close: '23:59' },
  ethusd: { tz: 'UTC', open: '00:00', close: '23:59' },
  solusd: { tz: 'UTC', open: '00:00', close: '23:59' },
  xrpusd: { tz: 'UTC', open: '00:00', close: '23:59' }
};

const US_MARKETS = new Set(['nasdaq', 'sox', 'dow', 'sp500', 'vix']);
let US_DST_MODE = 'auto';

export function setUsDstMode(mode = 'auto') {
  US_DST_MODE = ['auto', 'on', 'off'].includes(mode) ? mode : 'auto';
}

function getSchedule(indexId) {
  const base = MARKET_SCHEDULES[indexId];
  if (!base) return null;
  if (!US_MARKETS.has(indexId)) return base;
  if (US_DST_MODE === 'auto') return base;
  if (US_DST_MODE === 'on') return { ...base, tz: 'Etc/GMT+4' };
  return { ...base, tz: 'Etc/GMT+5' };
}

const zoneFormatters = new Map();

// zonedParts：指定時區的星期與時分；每個時區只建一個 Intl formatter。
function zonedParts(nowUTC, tz) {
  let fmt = zoneFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      weekday: 'short'
    });
    zoneFormatters.set(tz, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(nowUTC).map((p) => [p.type, p.value]));
  return { hh: Number(parts.hour), mm: Number(parts.minute), wd: parts.weekday };
}

// 台股休市日（證交所公布）；台北固定 UTC+8，直接平移後取日期比對。
export function isTwMarketHoliday(time = Date.now()) {
  return TW_MARKET_HOLIDAYS.has(new Date(Number(time) + 8 * 3600 * 1000).toISOString().slice(0, 10));
}

// 台北時間週一到週五、非休市日、open~close（'HH:MM'，含首尾分鐘）之內。
function isTaipeiSession(open, close, time = Date.now()) {
  const z = zonedParts(new Date(time), 'Asia/Taipei');
  const minute = z.hh * 60 + z.mm;
  return !isWeekend(z.wd) && !isTwMarketHoliday(time) && minute >= minutesOf(open) && minute <= minutesOf(close);
}

// 台股時段（台北時間），全站唯一的定義。期貨夜盤跨午夜到次日 05:00。
export const TW_SESSIONS = {
  spot: { open: '09:00', close: '13:30' },
  futuresDay: { open: '08:45', close: '13:45' },
  futuresNight: { open: '15:00', close: '05:00' }
};

export const isTwSpotSession = (time) => isTaipeiSession(TW_SESSIONS.spot.open, TW_SESSIONS.spot.close, time);
export const isTwFuturesDaySession = (time) => isTaipeiSession(TW_SESSIONS.futuresDay.open, TW_SESSIONS.futuresDay.close, time);

// 凌晨那段屬於前一個交易日的夜盤，所以用 24 小時前的日期判斷星期與休市日。
export function isTwFuturesNightSession(time = Date.now()) {
  const { open, close } = TW_SESSIONS.futuresNight;
  return isTaipeiSession(open, '23:59', time) || isTaipeiSession('00:00', close, time - 24 * 3600 * 1000);
}

// 台股現貨（Yahoo 加權/個股）報價時段：收盤集合競價後多留 5 分鐘抓收盤價。
export function isTwQuoteSession(time = Date.now()) {
  return isTaipeiSession(TW_SESSIONS.spot.open, '13:35', time);
}

// ---- 台股現貨狀態（標頭顯示）：盤前／盤中／收盤／休市（附原因）與下一個開收盤時間 ----
const WEEKDAY_ZH = '日一二三四五六';
const taipeiMinuteAt = (day, minute) => Date.parse(`${day}T00:00:00+08:00`) + minute * 60000;
const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

// 不開市的原因（週末或休市日名稱）；交易日回傳空字串。
function twClosedReason(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return `週${WEEKDAY_ZH[weekday]}`;
  return TW_MARKET_HOLIDAYS.get(day) ?? '';
}

// 回傳 { state: 'pre'|'open'|'closed'|'holiday', label, reason, next: { type: 'open'|'close', at(ms) } }。
export function getTwMarketStatus(time = Date.now()) {
  const { day } = taipeiDayAndMinute(time);
  const openAt = taipeiMinuteAt(day, minutesOf(TW_SESSIONS.spot.open));
  const closeAt = taipeiMinuteAt(day, minutesOf(TW_SESSIONS.spot.close));
  const reason = twClosedReason(day);
  if (!reason && time < openAt) return { state: 'pre', label: '盤前', reason, next: { type: 'open', at: openAt } };
  if (!reason && time < closeAt) return { state: 'open', label: '盤中', reason, next: { type: 'close', at: closeAt } };
  let next = nextDay(day);
  // 最長的連假（春節）也不到兩週；休市表沒有的年份只跳過週末。
  for (let i = 0; i < 30 && twClosedReason(next); i += 1) next = nextDay(next);
  return {
    state: reason ? 'holiday' : 'closed',
    label: reason ? '休市' : '收盤',
    reason,
    next: { type: 'open', at: taipeiMinuteAt(next, minutesOf(TW_SESSIONS.spot.open)) }
  };
}

// 台指期狀態：日盤 08:45–13:45、夜盤 15:00–次日 05:00（交易日晚上才有夜盤，凌晨屬於前一天的夜盤）。
// 回傳 { state: 'day'|'night'|'closed'|'holiday', label, reason, next: { type: 'open'|'close', at(ms) } }。
export function getTwFuturesStatus(time = Date.now()) {
  const { day } = taipeiDayAndMinute(time);
  const prevDay = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const at = (d, hhmm) => taipeiMinuteAt(d, minutesOf(hhmm));
  const { futuresDay, futuresNight } = TW_SESSIONS;
  const reason = twClosedReason(day);
  if (!twClosedReason(prevDay) && time < at(day, futuresNight.close)) {
    return { state: 'night', label: '夜盤', reason: '', next: { type: 'close', at: at(day, futuresNight.close) } };
  }
  if (!reason) {
    if (time < at(day, futuresDay.open)) return { state: 'closed', label: '盤前', reason, next: { type: 'open', at: at(day, futuresDay.open) } };
    if (time < at(day, futuresDay.close)) return { state: 'day', label: '日盤', reason, next: { type: 'close', at: at(day, futuresDay.close) } };
    if (time < at(day, futuresNight.open)) return { state: 'closed', label: '休息', reason, next: { type: 'open', at: at(day, futuresNight.open) } };
    return { state: 'night', label: '夜盤', reason, next: { type: 'close', at: at(nextDay(day), futuresNight.close) } };
  }
  let next = nextDay(day);
  for (let i = 0; i < 30 && twClosedReason(next); i += 1) next = nextDay(next);
  return { state: 'holiday', label: '休市', reason, next: { type: 'open', at: at(next, futuresDay.open) } };
}

// 盤後資料（日 K、證交所盤後表）的重抓時機：從沒抓過、跨日，或今天已過收盤後的更新點（14:30、18:00）但上次是在那之前抓的。
const AFTER_CLOSE_REFRESH_MINUTES = [14 * 60 + 30, 18 * 60];

function taipeiDayAndMinute(time) {
  const shifted = new Date(Number(time) + 8 * 3600 * 1000);
  return { day: shifted.toISOString().slice(0, 10), minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

// 失敗的盤後資料一分鐘後重試，不必等到下一個更新點（例如開網頁時代理還沒開）。
const DAILY_RETRY_MS = 60000;

export function isDailyRefreshDue(lastAt, now = Date.now(), failedAt = 0) {
  if (failedAt && now - failedAt >= DAILY_RETRY_MS) return true;
  if (!lastAt) return true;
  const last = taipeiDayAndMinute(lastAt);
  const current = taipeiDayAndMinute(now);
  if (last.day !== current.day) return true;
  return AFTER_CLOSE_REFRESH_MINUTES.some((point) => current.minute >= point && last.minute < point);
}

// 'HH:MM' → 當日第幾分鐘。
export function minutesOf(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function isWeekend(weekday) {
  return weekday === 'Sat' || weekday === 'Sun';
}

export function getMarketStatus(indexId, nowUTC = new Date()) {
  const schedule = getSchedule(indexId);
  if (!schedule) return 'closed';
  const z = zonedParts(nowUTC, schedule.tz);
  if (isWeekend(z.wd) && schedule.tz !== 'UTC') return 'closed';

  const minNow = z.hh * 60 + z.mm;
  const minOpen = minutesOf(schedule.open);
  const minClose = minutesOf(schedule.close);

  if (minNow < minOpen) return 'pre';
  if (minNow >= minOpen && minNow <= minClose) return 'open';
  if (minNow > minClose && minNow <= minClose + 120) return 'after';
  return 'closed';
}

export function isMarketOpen(indexId, nowUTC = new Date()) {
  return getMarketStatus(indexId, nowUTC) === 'open';
}

export function getNextEvent(indexId, nowUTC = new Date()) {
  const schedule = getSchedule(indexId);
  if (!schedule) return null;

  const status = getMarketStatus(indexId, nowUTC);
  const z = zonedParts(nowUTC, schedule.tz);
  const target = status === 'open' ? schedule.close : schedule.open;
  const [th, tm] = target.split(':').map(Number);

  const localNow = z.hh * 60 + z.mm;
  let diff = th * 60 + tm - localNow;
  if (diff < 0) diff += 24 * 60;

  const next = new Date(nowUTC);
  next.setUTCMinutes(next.getUTCMinutes() + diff, 0, 0); // 對齊整分鐘，每秒重算的倒數才會遞減
  // 週末不開盤：順延到週一。shortcut: 以 24 小時順延，美股夏令時間切換的那個週末會差 1 小時，需要時改用時區日期運算。
  while (schedule.tz !== 'UTC' && isWeekend(zonedParts(next, schedule.tz).wd)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return { type: status === 'open' ? 'close' : 'open', utcTime: next };
}
