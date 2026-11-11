// 選股條件登錄表（Page5）：每個條件定義名稱、參數欄位與判斷函式；資料欄位來自證交所盤後資料（services/twseData.js）。
// 新增條件只要在這裡加一筆，篩選面板會自動產生勾選框與參數欄位。缺資料的股票不符合條件（不當成 0）。
// needsHistory 的條件要日 K（services/screenerHistory.js 抓），fn 第三個參數是依時間排序的日 K。
import {
  bollingerEnterLowerHalf, bollingerEnterUpperHalf, closeAboveBollingerUpper, closeAboveEma, closeAboveSma,
  closeBelowBollingerLower, kdGoldenCross, macdGoldenCross, volumeShrink, volumeSurge
} from './technicalSignals.js';

const has = (value) => value != null && Number.isFinite(Number(value));

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
  // 以下都用最後一根日 K 判斷（規則在 technicalSignals.js，與 Page3 型態提醒共用）；Yahoo 還沒有今天這根時就用最近一根，不拿證交所今日資料去拼。
  {
    id: 'kd_golden_cross',
    name: 'KD 黃金交叉',
    needsHistory: true,
    params: [{ key: 'kdKMax', label: 'K 值 ≤（100＝不限）', defaultValue: 100 }],
    fn: (stock, settings, candles) => kdGoldenCross(candles, settings.kdKMax)
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
    fn: (stock, settings, candles) => macdGoldenCross(candles, settings.macdFast, settings.macdSlow, settings.macdSignal)
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
    fn: (stock, settings, candles) => volumeSurge(candles, settings.volMaDays, settings.volRatio)
  },
  {
    id: 'volume_shrink',
    name: '量縮（今日量 ≤ 均量 × 倍數）',
    needsHistory: true,
    params: [
      { key: 'volShrinkDays', label: '均量天數', defaultValue: 5 },
      { key: 'volShrinkRatio', label: '倍數 ≤', defaultValue: 0.5 }
    ],
    fn: (stock, settings, candles) => volumeShrink(candles, settings.volShrinkDays, settings.volShrinkRatio)
  },
  {
    id: 'above_sma',
    name: '站上 SMA',
    needsHistory: true,
    params: [{ key: 'smaDays', label: 'SMA 天數', defaultValue: 20 }],
    fn: (stock, settings, candles) => closeAboveSma(candles, settings.smaDays)
  },
  {
    id: 'above_ema',
    name: '站上 EMA',
    needsHistory: true,
    params: [{ key: 'emaDays', label: 'EMA 天數', defaultValue: 20 }],
    fn: (stock, settings, candles) => closeAboveEma(candles, settings.emaDays)
  },
  {
    id: 'bb_upper_break',
    name: '收盤突破布林上軌',
    needsHistory: true,
    params: [
      { key: 'bbUpPeriod', label: '天數', defaultValue: 20 },
      { key: 'bbUpWidth', label: '標準差倍數', defaultValue: 2 }
    ],
    fn: (stock, settings, candles) => closeAboveBollingerUpper(candles, settings.bbUpPeriod, settings.bbUpWidth)
  },
  {
    id: 'bb_lower_break',
    name: '收盤跌破布林下軌',
    needsHistory: true,
    params: [
      { key: 'bbLowPeriod', label: '天數', defaultValue: 20 },
      { key: 'bbLowWidth', label: '標準差倍數', defaultValue: 2 }
    ],
    fn: (stock, settings, candles) => closeBelowBollingerLower(candles, settings.bbLowPeriod, settings.bbLowWidth)
  },
  // 中軌＝N 日均線，與標準差倍數無關，所以只有天數。
  {
    id: 'bb_enter_upper',
    name: '布林進入上半（收盤由下站上中軌）',
    needsHistory: true,
    params: [{ key: 'bbMidUpPeriod', label: '天數', defaultValue: 20 }],
    fn: (stock, settings, candles) => bollingerEnterUpperHalf(candles, settings.bbMidUpPeriod)
  },
  {
    id: 'bb_enter_lower',
    name: '布林進入下半（收盤由上跌破中軌）',
    needsHistory: true,
    params: [{ key: 'bbMidDownPeriod', label: '天數', defaultValue: 20 }],
    fn: (stock, settings, candles) => bollingerEnterLowerHalf(candles, settings.bbMidDownPeriod)
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

// 值得抓日 K 的股票：當日量 > HISTORY_MIN_VOLUME 張，依成交量由大到小取前 cap 檔。
export const historyCandidates = (stocks, cap = Infinity) => stocks
  .filter((stock) => has(stock.volume) && stock.volume > HISTORY_MIN_VOLUME)
  .sort((a, b) => b.volume - a.volume)
  .slice(0, cap);

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
