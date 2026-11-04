// 型態提醒：自選股日 K（Yahoo，屬盤後歷史資料，不受資料來源限制，每天抓一次）加上目前來源的即時價當「今天這一根」，
// 算技術指標後檢查使用者勾選的型態。沒有即時價時只用日 K 判斷。同一檔、同一型態一天只提醒一次。
import { store } from '../data/store.js';
import { bollinger, kd, macd, rsi, sma } from './indicators.js';
import { isDailyRefreshDue, isTwQuoteSession } from './marketCalendar.js';
import { dateKeyFromUnix, fetchYahooCandles } from './marketSources.js';
import { hasValue, liveQuoteMap, stockName } from './quoteUtils.js';

export const PATTERN_REGISTRY = [
  {
    id: 'ma20_breakout',
    name: '突破20日均線',
    category: '均線',
    condition: (snap) => snap.price > snap.ma20 && snap.prevClose <= snap.ma20,
    severity: 'high',
    description: '收盤價由下向上穿越20日均線'
  },
  {
    id: 'kd_golden_cross',
    name: 'KD黃金交叉',
    category: 'KD',
    condition: (snap) => snap.kd_k > snap.kd_d && snap.prev_kd_k <= snap.prev_kd_d,
    severity: 'mid',
    description: 'K值由下向上穿越D值'
  },
  {
    id: 'vol_surge',
    name: '爆量 (>2x均量)',
    category: '成交量',
    condition: (snap) => snap.vol > snap.volAvg20 * 2,
    severity: 'mid',
    description: '當日成交量超過20日均量兩倍'
  },
  {
    id: 'rsi_oversold',
    name: 'RSI超賣反彈',
    category: 'RSI',
    condition: (snap) => snap.rsi < 30 && snap.prev_rsi >= 30,
    severity: 'high',
    description: 'RSI由超賣區(30以下)向上穿出'
  },
  {
    id: 'bb_lower_touch',
    name: '觸及布林下軌',
    category: '布林通道',
    condition: (snap) => snap.low <= snap.lowerBB,
    severity: 'low',
    description: '當日最低點觸及或跌破布林下軌'
  },
  {
    id: 'macd_golden_cross',
    name: 'MACD黃金交叉',
    category: 'MACD',
    condition: (snap) => snap.macd > snap.macd_signal && snap.prev_macd <= snap.prev_macd_signal,
    severity: 'mid',
    description: 'MACD線由下向上穿越Signal線'
  }
];

const MIN_BARS = 40;
const FETCH_CONCURRENCY = 4;
const MAX_ALERTS = 200;
const NOTIFY_KEY = 'tw_pattern_notify';

const dailyByCode = new Map();
const firedToday = new Set();
let historyBusy = false;

const taipeiToday = () => dateKeyFromUnix(Math.floor(Date.now() / 1000));
const watchCodes = () => [...new Set(store.get('watchlist').map((row) => row.code))];

// 上市代碼抓 .TW，抓不到再試上櫃 .TWO。
async function fetchDaily(code) {
  for (const symbol of [code, `${code}.TWO`]) {
    try {
      const candles = await fetchYahooCandles({ symbol, timeframe: 'D' });
      if (candles.length) return candles;
    } catch {
      // 換下一個代碼字尾再試。
    }
  }
  return [];
}

// 每輪呼叫：只抓還沒抓過或該在收盤後重抓的自選股日 K；已不在自選股的代碼丟掉。
export async function refreshPatternHistory() {
  if (historyBusy) return;
  historyBusy = true;
  try {
    const codes = watchCodes();
    [...dailyByCode.keys()].filter((code) => !codes.includes(code)).forEach((code) => dailyByCode.delete(code));
    const due = codes.filter((code) => {
      const entry = dailyByCode.get(code);
      return isDailyRefreshDue(entry?.fetchedAt, Date.now(), entry?.failedAt);
    });
    let cursor = 0;
    const worker = async () => {
      while (cursor < due.length) {
        const code = due[cursor];
        cursor += 1;
        const candles = await fetchDaily(code);
        // 抓不到（代理沒開、代碼錯）記下失敗時間，一分鐘後重試；舊的日 K 先留著用。
        dailyByCode.set(code, candles.length
          ? { candles, fetchedAt: Date.now(), failedAt: 0 }
          : { candles: dailyByCode.get(code)?.candles || [], fetchedAt: Date.now(), failedAt: Date.now() });
      }
    };
    await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, due.length) }, worker));
  } finally {
    historyBusy = false;
  }
}

// 即時價當「今天這一根」：日 K 最後一根已是今天就更新它；盤中且還沒有今天這根才接上新的一根。
function withLiveBar(candles, quote) {
  if (!quote || !hasValue(quote.price) || !candles.length) return candles;
  const last = candles.at(-1);
  const price = Number(quote.price);
  const bar = {
    open: hasValue(quote.open) ? Number(quote.open) : price,
    high: Math.max(price, hasValue(quote.high) ? Number(quote.high) : price),
    low: Math.min(price, hasValue(quote.low) ? Number(quote.low) : price),
    close: price,
    volume: hasValue(quote.volume) ? Number(quote.volume) : last.volume
  };
  const today = taipeiToday();
  if (typeof last.time === 'number' && dateKeyFromUnix(last.time) === today) return [...candles.slice(0, -1), { ...last, ...bar }];
  return isTwQuoteSession() ? [...candles, { time: today, ...bar }] : candles;
}

// 最後一根的指標快照；任何一個值算不出來就回傳 null（不能拿 null 當 0 比較）。
function snapshotOf(series) {
  if (series.length < MIN_BARS) return null;
  const i = series.length - 1;
  const closes = series.map((row) => row.close);
  const volumes = series.map((row) => row.volume || 0);
  const ma20 = sma(closes, 20);
  const { k, d } = kd(series);
  const r = rsi(closes);
  const bb = bollinger(closes);
  const m = macd(closes);
  const prevVolumes = volumes.slice(-21, -1);
  const snap = {
    price: closes[i],
    prevClose: closes[i - 1],
    low: series[i].low,
    ma20: ma20[i],
    kd_k: k[i],
    kd_d: d[i],
    prev_kd_k: k[i - 1],
    prev_kd_d: d[i - 1],
    vol: volumes[i],
    volAvg20: prevVolumes.reduce((sum, v) => sum + v, 0) / prevVolumes.length,
    rsi: r[i],
    prev_rsi: r[i - 1],
    lowerBB: bb.lower[i],
    macd: m.dif[i],
    macd_signal: m.signal[i],
    prev_macd: m.dif[i - 1],
    prev_macd_signal: m.signal[i - 1]
  };
  return Object.values(snap).every(Number.isFinite) ? snap : null;
}

export function isPatternNotifyEnabled() {
  try {
    return globalThis.localStorage?.getItem(NOTIFY_KEY) === '1' && globalThis.Notification?.permission === 'granted';
  } catch {
    return false;
  }
}

// 開啟時第一次會跳出瀏覽器的通知授權；回傳最後是否開啟。
export async function setPatternNotify(enabled) {
  let on = Boolean(enabled);
  if (on && globalThis.Notification && Notification.permission !== 'granted') {
    on = (await Notification.requestPermission()) === 'granted';
  }
  try {
    globalThis.localStorage?.setItem(NOTIFY_KEY, on ? '1' : '0');
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
  return on && Boolean(globalThis.Notification);
}

function notify(alerts) {
  if (!isPatternNotifyEnabled()) return;
  alerts.forEach((alert) => {
    new Notification(`型態提醒：${alert.code} ${alert.name}`, {
      body: `${alert.patterns.join('、')}｜${alert.price}`,
      tag: `${alert.date}-${alert.code}-${alert.patternId}`
    });
  });
}

// 每輪呼叫：檢查勾選的型態，新觸發的寫進 patternAlerts（最新的在前）並通知。
export function evaluatePatterns() {
  const enabled = new Set(store.get('enabledPatterns'));
  if (!enabled.size) return;
  const quotes = liveQuoteMap();
  const today = taipeiToday();
  const now = new Date();
  const fresh = [];
  watchCodes().forEach((code) => {
    const candles = dailyByCode.get(code)?.candles;
    if (!candles?.length) return;
    // 模擬資料的價格不是真的，不拿來當「今天這一根」，只用日 K 判斷。
    const quote = quotes.get(code);
    const snap = snapshotOf(withLiveBar(candles, quote?.source === 'mock' ? null : quote));
    if (!snap) return;
    PATTERN_REGISTRY.forEach((pattern) => {
      const key = `${today}|${code}|${pattern.id}`;
      if (!enabled.has(pattern.id) || firedToday.has(key) || !pattern.condition(snap)) return;
      firedToday.add(key);
      fresh.push({
        code,
        name: stockName(code) || store.get('watchlist').find((row) => row.code === code)?.name || '',
        price: +snap.price.toFixed(2),
        changePct: +(((snap.price - snap.prevClose) / snap.prevClose) * 100).toFixed(2),
        patterns: [pattern.name],
        patternId: pattern.id,
        severity: pattern.severity,
        date: today,
        triggeredAt: now.getTime(),
        triggered: now.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })
      });
    });
  });
  if (!fresh.length) return;
  store.set('patternAlerts', [...fresh, ...store.get('patternAlerts')].slice(0, MAX_ALERTS));
  notify(fresh);
}
