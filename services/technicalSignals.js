// 技術訊號判斷（純函式，不讀 store）：Page3 型態提醒與 Page5 選股共用，同一規則兩邊答案一致。
// 輸入依時間排序的日 K [{ time, open, high, low, close, volume }]，一律看最後一根；參數不合法或值算不出來就回傳 false。
import { bollinger, ema, kd, macd, rsi, sma } from './indicators.js';

const has = (value) => value != null && Number.isFinite(Number(value));
const isPeriod = (n) => Number.isInteger(n) && n >= 1;
const closesOf = (candles) => candles.map((c) => c.close);

// 由下往上穿越：前一根 a ≤ b、最後一根 a > b；任一值算不出來就不成立。
export function crossUp(a, b) {
  const i = a.length - 1;
  return i >= 1 && [a[i], b[i], a[i - 1], b[i - 1]].every(has) && a[i - 1] <= b[i - 1] && a[i] > b[i];
}

// 由上往下穿越：前一根 a ≥ b、最後一根 a < b。
export function crossDown(a, b) {
  const i = a.length - 1;
  return i >= 1 && [a[i], b[i], a[i - 1], b[i - 1]].every(has) && a[i - 1] >= b[i - 1] && a[i] < b[i];
}

// 收盤由下往上穿越 N 日均線。
export const closeCrossAboveSma = (candles, period = 20) => isPeriod(period) && crossUp(closesOf(candles), sma(closesOf(candles), period));

// KD 黃金交叉，且交叉時 K ≤ kMax（100＝不限）。
export function kdGoldenCross(candles, kMax = 100) {
  const { k, d } = kd(candles);
  return crossUp(k, d) && k.at(-1) <= kMax;
}

export function macdGoldenCross(candles, fast = 12, slow = 26, signalPeriod = 9) {
  if (![fast, slow, signalPeriod].every(isPeriod) || fast >= slow) return false;
  const { dif, signal } = macd(closesOf(candles), fast, slow, signalPeriod);
  return crossUp(dif, signal);
}

// RSI 由超賣區（level 以下）向上穿出。
export const rsiCrossAbove = (candles, level = 30, period = 14) => isPeriod(period) && crossUp(rsi(closesOf(candles), period), candles.map(() => level));

// 今日量對前 N 日均量（不含今日）的倍數；算不出來回傳 null。
export function volumeRatio(candles, days = 5) {
  if (!isPeriod(days) || candles.length < days + 1) return null;
  const avg = candles.slice(-days - 1, -1).reduce((sum, c) => sum + c.volume, 0) / days;
  const today = candles.at(-1).volume;
  return has(avg) && avg > 0 && has(today) ? today / avg : null;
}

// 量增：今日量 ≥ 均量 × ratio；量縮：今日量 ≤ 均量 × ratio。
export const volumeSurge = (candles, days = 5, ratio = 1.5) => { const r = volumeRatio(candles, days); return r != null && r >= ratio; };
export const volumeShrink = (candles, days = 5, ratio = 0.5) => { const r = volumeRatio(candles, days); return r != null && r <= ratio; };

// 收盤 ≥ 均線。
const closeAbove = (candles, line) => has(line) && candles.at(-1).close >= line;
export const closeAboveSma = (candles, period = 20) => isPeriod(period) && closeAbove(candles, sma(closesOf(candles), period).at(-1));
export const closeAboveEma = (candles, period = 20) => isPeriod(period) && closeAbove(candles, ema(closesOf(candles), period).at(-1));

const bands = (candles, period, width) => (isPeriod(period) ? bollinger(closesOf(candles), period, width) : null);

export function closeAboveBollingerUpper(candles, period = 20, width = 2) {
  const upper = bands(candles, period, width)?.upper.at(-1);
  return has(upper) && candles.at(-1).close > upper;
}

export function closeBelowBollingerLower(candles, period = 20, width = 2) {
  const lower = bands(candles, period, width)?.lower.at(-1);
  return has(lower) && candles.at(-1).close < lower;
}

// 最低點觸及或跌破下軌。
export function lowTouchesBollingerLower(candles, period = 20, width = 2) {
  const lower = bands(candles, period, width)?.lower.at(-1);
  return has(lower) && candles.at(-1).low <= lower;
}

// 進入上半：前一根收盤 < 中軌、最後一根 ≥ 中軌；進入下半相反。中軌只跟天數有關。
function middlePair(candles, period) {
  const middle = bands(candles, period, 2)?.middle;
  const i = candles.length - 1;
  if (!middle || i < 1 || !has(middle[i]) || !has(middle[i - 1])) return null;
  return { prev: candles[i - 1].close - middle[i - 1], last: candles[i].close - middle[i] };
}

export const bollingerEnterUpperHalf = (candles, period = 20) => { const p = middlePair(candles, period); return Boolean(p) && p.prev < 0 && p.last >= 0; };
export const bollingerEnterLowerHalf = (candles, period = 20) => { const p = middlePair(candles, period); return Boolean(p) && p.prev >= 0 && p.last < 0; };
