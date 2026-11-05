// 選股條件登錄表（Page5）：每個條件定義名稱、參數欄位與判斷函式；資料欄位來自證交所盤後資料（services/twseData.js）。
// 新增條件只要在這裡加一筆，篩選面板會自動產生勾選框與參數欄位。缺資料的股票不符合條件（不當成 0）。
// needsHistory 的條件要日 K（services/screenerHistory.js 抓），fn 第三個參數是依時間排序的日 K。
import { bollinger, ema, kd, macd, sma } from './indicators.js';

const has = (value) => value != null && Number.isFinite(Number(value));
const isPeriod = (n) => Number.isInteger(n) && n >= 1;
const closesOf = (candles) => candles.map((c) => c.close);
// 由下往上穿越：前一根 a ≤ b、最後一根 a > b；任一值算不出來就不成立。
const crossUp = (a, b) => {
  const i = a.length - 1;
  return i >= 1 && [a[i], b[i], a[i - 1], b[i - 1]].every(has) && a[i - 1] <= b[i - 1] && a[i] > b[i];
};

// 只有證交所當日量超過這個張數的股票才抓日 K；其餘一律不符合技術指標條件。
export const HISTORY_MIN_VOLUME = 1000;

export const FILTER_REGISTRY = [
  {
    id: 'pe_max',
    name: '本益比上限',
    params: [{ key: 'peMax', label: '本益比 ≤', defaultValue: 15 }],
    fn: (stock, settings) => has(stock.pe) && stock.pe > 0 && stock.pe <= settings.peMax
  },
  {
    id: 'yield_min',
    name: '殖利率下限',
    params: [{ key: 'yieldMin', label: '殖利率(%) ≥', defaultValue: 4 }],
    fn: (stock, settings) => has(stock.dividendYield) && stock.dividendYield >= settings.yieldMin
  },
  {
    id: 'pb_max',
    name: '股價淨值比上限',
    params: [{ key: 'pbMax', label: '股價淨值比 ≤', defaultValue: 1.5 }],
    fn: (stock, settings) => has(stock.pb) && stock.pb <= settings.pbMax
  },
  {
    id: 'volume_min',
    name: '成交量下限',
    params: [{ key: 'volumeMin', label: '成交量(張) ≥', defaultValue: 1000 }],
    fn: (stock, settings) => has(stock.volume) && stock.volume >= settings.volumeMin
  },
  {
    id: 'change_range',
    name: '漲跌幅區間',
    params: [
      { key: 'changeMin', label: '漲跌幅(%) ≥', defaultValue: -3 },
      { key: 'changeMax', label: '漲跌幅(%) ≤', defaultValue: 3 }
    ],
    fn: (stock, settings) => has(stock.changePct) && stock.changePct >= settings.changeMin && stock.changePct <= settings.changeMax
  },
  // 以下都用最後一根日 K 判斷；Yahoo 還沒有今天這根時就用最近一根，不拿證交所今日資料去拼。
  {
    id: 'kd_golden_cross',
    name: 'KD 黃金交叉',
    needsHistory: true,
    params: [{ key: 'kdKMax', label: 'K 值 ≤（100＝不限）', defaultValue: 100 }],
    fn: (stock, settings, candles) => {
      const { k, d } = kd(candles);
      return crossUp(k, d) && k.at(-1) <= settings.kdKMax;
    }
  },
  {
    id: 'macd_golden_cross',
    name: 'MACD 黃金交叉',
    needsHistory: true,
    params: [
      { key: 'macdFast', label: '快線', defaultValue: 12 },
      { key: 'macdSlow', label: '慢線', defaultValue: 26 },
      { key: 'macdSignal', label: '訊號', defaultValue: 9 }
    ],
    fn: (stock, settings, candles) => {
      const { macdFast: f, macdSlow: s, macdSignal: g } = settings;
      if (![f, s, g].every(isPeriod) || f >= s) return false;
      const { dif, signal } = macd(closesOf(candles), f, s, g);
      return crossUp(dif, signal);
    }
  },
  {
    id: 'volume_surge',
    name: '量增（今日量 ≥ 均量 × 倍數）',
    needsHistory: true,
    params: [
      { key: 'volMaDays', label: '均量天數', defaultValue: 5 },
      { key: 'volRatio', label: '倍數 ≥', defaultValue: 1.5 }
    ],
    // 均量取今日之前 N 天（不含今日），今日量與均量都用日 K 的量，單位一致。
    fn: (stock, settings, candles) => {
      const n = settings.volMaDays;
      if (!isPeriod(n) || candles.length < n + 1) return false;
      const avg = candles.slice(-n - 1, -1).reduce((sum, c) => sum + c.volume, 0) / n;
      const today = candles.at(-1).volume;
      return has(avg) && avg > 0 && has(today) && today >= avg * settings.volRatio;
    }
  },
  {
    id: 'above_sma',
    name: '站上 SMA',
    needsHistory: true,
    params: [{ key: 'smaDays', label: 'SMA 天數', defaultValue: 20 }],
    fn: (stock, settings, candles) => {
      if (!isPeriod(settings.smaDays)) return false;
      const line = sma(closesOf(candles), settings.smaDays).at(-1);
      return has(line) && candles.at(-1).close >= line;
    }
  },
  {
    id: 'above_ema',
    name: '站上 EMA',
    needsHistory: true,
    params: [{ key: 'emaDays', label: 'EMA 天數', defaultValue: 20 }],
    fn: (stock, settings, candles) => {
      if (!isPeriod(settings.emaDays)) return false;
      const line = ema(closesOf(candles), settings.emaDays).at(-1);
      return has(line) && candles.at(-1).close >= line;
    }
  },
  {
    id: 'bb_upper_break',
    name: '收盤突破布林上軌',
    needsHistory: true,
    params: [
      { key: 'bbUpPeriod', label: '天數', defaultValue: 20 },
      { key: 'bbUpWidth', label: '標準差倍數', defaultValue: 2 }
    ],
    fn: (stock, settings, candles) => {
      if (!isPeriod(settings.bbUpPeriod)) return false;
      const upper = bollinger(closesOf(candles), settings.bbUpPeriod, settings.bbUpWidth).upper.at(-1);
      return has(upper) && candles.at(-1).close > upper;
    }
  },
  {
    id: 'bb_lower_break',
    name: '收盤跌破布林下軌',
    needsHistory: true,
    params: [
      { key: 'bbLowPeriod', label: '天數', defaultValue: 20 },
      { key: 'bbLowWidth', label: '標準差倍數', defaultValue: 2 }
    ],
    fn: (stock, settings, candles) => {
      if (!isPeriod(settings.bbLowPeriod)) return false;
      const lower = bollinger(closesOf(candles), settings.bbLowPeriod, settings.bbLowWidth).lower.at(-1);
      return has(lower) && candles.at(-1).close < lower;
    }
  }
];

export const DEFAULT_FILTER_SETTINGS = Object.fromEntries(
  FILTER_REGISTRY.flatMap((filter) => filter.params.map((param) => [param.key, param.defaultValue]))
);

const activeFilters = (enabled, history) => FILTER_REGISTRY.filter((f) => enabled.includes(f.id) && Boolean(f.needsHistory) === history);

// 只套用不需要日 K 的條件。
export function applyFilters(stocks, enabled, settings) {
  const active = activeFilters(enabled, false);
  if (active.length === 0) return stocks;
  return stocks.filter((stock) => active.every((f) => f.fn(stock, settings)));
}

export const hasHistoryFilters = (enabled) => activeFilters(enabled, true).length > 0;

// 值得抓日 K 的股票：當日量 > HISTORY_MIN_VOLUME 張。
export const historyCandidates = (stocks) => stocks.filter((stock) => has(stock.volume) && stock.volume > HISTORY_MIN_VOLUME);

// 套用需要日 K 的條件；candlesByCode 是 Map(code → 日 K)，沒日 K 或量不夠的股票不符合。
export function applyHistoryFilters(stocks, enabled, settings, candlesByCode) {
  const active = activeFilters(enabled, true);
  if (active.length === 0) return stocks;
  const candidates = new Set(historyCandidates(stocks));
  return stocks.filter((stock) => {
    const candles = candlesByCode.get(stock.code);
    return candidates.has(stock) && candles?.length > 0 && active.every((f) => f.fn(stock, settings, candles));
  });
}
