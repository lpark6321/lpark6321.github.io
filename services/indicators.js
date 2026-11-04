// 技術指標（純計算，不讀 store）：輸入依時間排序的日 K [{ open, high, low, close, volume }]，輸出與 K 線等長的陣列，算不出來的位置是 null。

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  values.forEach((value, i) => {
    sum += value;
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  });
  return out;
}

// 指數移動平均：第一個值用前 period 筆的簡單平均起算。
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  values.forEach((value, i) => {
    if (value == null) return;
    if (prev == null) {
      if (i < period - 1) return;
      const seed = values.slice(i - period + 1, i + 1);
      if (seed.some((v) => v == null)) return;
      prev = seed.reduce((a, b) => a + b, 0) / period;
    } else {
      prev = value * k + prev * (1 - k);
    }
    out[i] = prev;
  });
  return out;
}

// RSI（Wilder 平滑）。
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    const up = Math.max(diff, 0);
    const down = Math.max(-diff, 0);
    if (i <= period) {
      gain += up / period;
      loss += down / period;
      if (i < period) continue;
    } else {
      gain = (gain * (period - 1) + up) / period;
      loss = (loss * (period - 1) + down) / period;
    }
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

// 台股慣用 KD(9,3,3)：RSV 取 9 日高低，K、D 以 1/3 平滑，起始值 50。
export function kd(candles, period = 9) {
  const k = new Array(candles.length).fill(null);
  const d = new Array(candles.length).fill(null);
  let prevK = 50;
  let prevD = 50;
  candles.forEach((row, i) => {
    if (i < period - 1) return;
    const window = candles.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map((c) => c.high));
    const low = Math.min(...window.map((c) => c.low));
    const rsv = high === low ? 50 : ((row.close - low) / (high - low)) * 100;
    prevK = (2 / 3) * prevK + rsv / 3;
    prevD = (2 / 3) * prevD + prevK / 3;
    k[i] = prevK;
    d[i] = prevD;
  });
  return { k, d };
}

// 布林通道(20, 2)：中軌 20 日均、上下軌 ± 2 倍母體標準差。
export function bollinger(closes, period = 20, width = 2) {
  const middle = sma(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  closes.forEach((_, i) => {
    if (middle[i] == null) return;
    const window = closes.slice(i - period + 1, i + 1);
    const sd = Math.sqrt(window.reduce((sum, v) => sum + (v - middle[i]) ** 2, 0) / period);
    upper[i] = middle[i] + width * sd;
    lower[i] = middle[i] - width * sd;
  });
  return { middle, upper, lower };
}

// MACD(12, 26, 9)：DIF = EMA12 − EMA26，訊號線 = DIF 的 EMA9。
export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const dif = closes.map((_, i) => (fastEma[i] == null || slowEma[i] == null ? null : fastEma[i] - slowEma[i]));
  const firstIndex = dif.findIndex((v) => v != null);
  const signal = new Array(closes.length).fill(null);
  if (firstIndex >= 0) {
    ema(dif.slice(firstIndex), signalPeriod).forEach((v, i) => { signal[firstIndex + i] = v; });
  }
  return { dif, signal };
}

// 經典樞紐點：以前一日高低收計算 P 與三層壓力（R）、支撐（S）。
export function pivotLevels({ high, low, close }) {
  const p = (high + low + close) / 3;
  return {
    pivot: p,
    resistance: [2 * p - low, p + (high - low), high + 2 * (p - low)],
    support: [2 * p - high, p - (high - low), low - 2 * (high - p)]
  };
}
