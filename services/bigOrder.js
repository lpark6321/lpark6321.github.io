// 大單提醒（純邏輯，尚未接資料源）：個股逐筆大單（內外盤）與台指期一分鐘大量。
// 時間一律用 unix 秒（與 marketSources 的 K 線一致）；台北固定 UTC+8。
import { isTwFuturesNightSession } from './marketCalendar.js';

// 個股預設門檻 100 張：台股看盤軟體常見的「大單」張數門檻，單一數字好懂；個別股票再用 thresholds 覆寫。
export const DEFAULT_STOCK_THRESHOLD = 100;
const TAIPEI_OFFSET_SECONDS = 8 * 3600;

// 成交價 >= 委賣價為外盤、<= 委買價為內盤；缺報價或夾在中間回傳 null（不明）。
export function tradeSide(trade) {
  const { price, bid, ask } = trade;
  if (ask != null && price >= ask) return '外盤';
  if (bid != null && price <= bid) return '內盤';
  return null;
}

// thresholds 是 { 代碼: 張數 } 的一般物件，之後可交給 data/storage.js 存。
export function resolveThreshold(code, thresholds = {}, defaults = DEFAULT_STOCK_THRESHOLD) {
  const own = Number(thresholds?.[code]);
  return Number.isFinite(own) && own > 0 ? own : defaults;
}

// 2400.00 → "2400"、1105.5 → "1105.5"（先取兩位避免浮點尾數）。
export function formatPrice(price) {
  return String(Number(Number(price).toFixed(2)));
}

// 台北時間 HH:MM。
export function taipeiMinute(time) {
  return new Date((time + TAIPEI_OFFSET_SECONDS) * 1000).toISOString().slice(11, 16);
}

// 個股逐筆：push(trade) → alert|null。同一筆（時間+價+量）不重複提醒。
// 方向不明的大單略過：訊息格式一定帶內外盤，沒方向的提醒容易誤導。
export function createStockTradeTracker({ code, name, threshold = DEFAULT_STOCK_THRESHOLD }) {
  const seen = new Set();
  return {
    push(trade) {
      if (!(trade.volume >= threshold)) return null;
      const side = tradeSide(trade);
      if (!side) return null;
      const key = `${trade.time}|${trade.price}|${trade.volume}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        kind: 'stock', code, name, side,
        volume: trade.volume, price: trade.price, time: trade.time,
        message: `${name}${side}${trade.volume}張_${formatPrice(trade.price)}元`
      };
    }
  };
}

export function stockBigOrders(trades, options) {
  const tracker = createStockTradeTracker(options);
  return trades.map((trade) => tracker.push(trade)).filter(Boolean);
}

// 台指期一分鐘大量門檻（口）：夜盤量小很多，日盤 1500、夜盤 400。
export const FUTURES_MINUTE_THRESHOLDS = { day: 1500, night: 400 };

// 依該筆的時間（unix 秒，不看現在幾點）判斷日夜盤；夜盤以外一律用日盤門檻。
export function futuresMinuteThreshold(time, thresholds = FUTURES_MINUTE_THRESHOLDS) {
  return isTwFuturesNightSession(time * 1000) ? thresholds.night : thresholds.day;
}

// 期貨一分鐘量：tick 為 { time, volume（該筆口數）}，依台北分鐘累加；
// 某分鐘累計第一次 >= 該時段門檻時提醒一次，volume 是越過門檻當下的累計量。
// shortcut: 只吃每筆口數、不吃累計量快照；資料源給累計量時再加差分。
export function createMinuteVolumeTracker(thresholds = FUTURES_MINUTE_THRESHOLDS, { code = 'TXF', name = '台指期' } = {}) {
  const minutes = new Map(); // 分鐘序號 → { total, alerted }
  return {
    push(tick) {
      const key = Math.floor((tick.time + TAIPEI_OFFSET_SECONDS) / 60);
      const slot = minutes.get(key) || { total: 0, alerted: false };
      minutes.set(key, slot);
      slot.total += Number(tick.volume) || 0;
      if (slot.alerted || slot.total < futuresMinuteThreshold(tick.time, thresholds)) return null;
      slot.alerted = true;
      return {
        kind: 'futures', code, name,
        volume: slot.total, minute: taipeiMinute(tick.time), time: tick.time,
        message: `${name}一分鐘大量${slot.total}口`
      };
    }
  };
}
