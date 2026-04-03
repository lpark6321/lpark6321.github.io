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

function zonedParts(nowUTC, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    weekday: 'short'
  });
  const parts = Object.fromEntries(fmt.formatToParts(nowUTC).map((p) => [p.type, p.value]));
  return { hh: Number(parts.hour), mm: Number(parts.minute), wd: parts.weekday };
}

function minutesOf(time) {
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
  next.setUTCMinutes(next.getUTCMinutes() + diff);
  return { type: status === 'open' ? 'close' : 'open', utcTime: next };
}
