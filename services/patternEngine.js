// 型態提醒：自選股日 K（Yahoo，屬盤後歷史資料，不受資料來源限制，每天抓一次）加上目前來源的即時價當「今天這一根」，
// 算技術指標後檢查使用者勾選的型態。沒有即時價時只用日 K 判斷。同一檔、同一型態一天只提醒一次。
import { store } from '../data/store.js';
import { loadSetting, saveSetting } from '../data/storage.js';
import {
  closeCrossAboveSma, kdGoldenCross, lowTouchesBollingerLower, macdGoldenCross, rsiCrossBelow, volumeSurge
} from './technicalSignals.js';
import { isDailyRefreshDue, isTwQuoteSession } from './marketCalendar.js';
import { dateKeyFromUnix, fetchStockDaily } from './marketSources.js';
import { hasValue, liveQuoteMap, stockName } from './quoteUtils.js';

// condition(candles)：判斷規則都在 technicalSignals.js，與 Page5 選股共用。
export const PATTERN_REGISTRY = [
  {
    id: 'ma20_breakout',
    name: '突破20日均線',
    category: '均線',
    condition: (candles) => closeCrossAboveSma(candles, 20),
    severity: 'high',
    description: '收盤價由下向上穿越20日均線'
  },
  {
    id: 'kd_golden_cross',
    name: 'KD黃金交叉',
    category: 'KD',
    condition: (candles) => kdGoldenCross(candles),
    severity: 'mid',
    description: 'K值由下向上穿越D值'
  },
  {
    id: 'vol_surge',
    name: '爆量 (>2x均量)',
    category: '成交量',
    condition: (candles) => volumeSurge(candles, 20, 2),
    severity: 'mid',
    description: '當日成交量超過20日均量兩倍'
  },
  {
    id: 'rsi_oversold',
    name: 'RSI超賣反彈',
    category: 'RSI',
    condition: (candles) => rsiCrossBelow(candles, 30),
    severity: 'high',
    description: 'RSI由超賣區(30以下)向上穿出'
  },
  {
    id: 'bb_lower_touch',
    name: '觸及布林下軌',
    category: '布林通道',
    condition: (candles) => lowTouchesBollingerLower(candles),
    severity: 'low',
    description: '當日最低點觸及或跌破布林下軌'
  },
  {
    id: 'macd_golden_cross',
    name: 'MACD黃金交叉',
    category: 'MACD',
    condition: (candles) => macdGoldenCross(candles),
    severity: 'mid',
    description: 'MACD線由下向上穿越Signal線'
  }
];

const MIN_BARS = 40;
const FETCH_CONCURRENCY = 4;
const MAX_ALERTS = 200;

const dailyByCode = new Map();
const firedToday = new Set();
let historyBusy = false;

const taipeiToday = () => dateKeyFromUnix(Math.floor(Date.now() / 1000));
const watchCodes = () => [...new Set(store.get('watchlist').map((row) => row.code))];
const firedKey = (date, code, patternId) => `${date}|${code}|${patternId}`;

// 當天的提醒存在瀏覽器：重新整理後原樣還原、已觸發的不再重複；隔天開啟（或跨日）就清掉。
let alertsDate = taipeiToday();
{
  const saved = loadSetting('patternAlerts');
  const alerts = saved?.date === alertsDate && Array.isArray(saved.alerts) ? saved.alerts.filter((row) => row?.code && row.patternId) : [];
  alerts.forEach((row) => firedToday.add(firedKey(alertsDate, row.code, row.patternId)));
  if (alerts.length) store.set('patternAlerts', alerts);
}

function saveAlerts(alerts) {
  store.set('patternAlerts', alerts);
  saveSetting('patternAlerts', { date: alertsDate, alerts });
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
        const candles = await fetchStockDaily(code);
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

export function isPatternNotifyEnabled() {
  // 舊版存的是 '1'／'0'（讀回來是數字 1／0）。
  return Boolean(loadSetting('patternNotify', false)) && globalThis.Notification?.permission === 'granted';
}

// 開啟時第一次會跳出瀏覽器的通知授權；回傳最後是否開啟。
export async function setPatternNotify(enabled) {
  let on = Boolean(enabled);
  if (on && globalThis.Notification && Notification.permission !== 'granted') {
    on = (await Notification.requestPermission()) === 'granted';
  }
  saveSetting('patternNotify', on);
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
  if (today !== alertsDate) {
    alertsDate = today;
    firedToday.clear();
    saveAlerts([]);
  }
  const now = new Date();
  const fresh = [];
  watchCodes().forEach((code) => {
    const candles = dailyByCode.get(code)?.candles;
    if (!candles?.length) return;
    // 模擬資料的價格不是真的，不拿來當「今天這一根」，只用日 K 判斷。
    const quote = quotes.get(code);
    const series = withLiveBar(candles, quote?.source === 'mock' ? null : quote);
    if (series.length < MIN_BARS) return;
    const price = series.at(-1).close;
    const prevClose = series.at(-2).close;
    // 價格不是數字就不判斷（不能拿 null 當 0 比較）。
    if (!Number.isFinite(price) || !Number.isFinite(prevClose)) return;
    PATTERN_REGISTRY.forEach((pattern) => {
      const key = firedKey(today, code, pattern.id);
      if (!enabled.has(pattern.id) || firedToday.has(key) || !pattern.condition(series)) return;
      firedToday.add(key);
      fresh.push({
        code,
        name: stockName(code) || store.get('watchlist').find((row) => row.code === code)?.name || '',
        price: +price.toFixed(2),
        changePct: +(((price - prevClose) / prevClose) * 100).toFixed(2),
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
  saveAlerts([...fresh, ...store.get('patternAlerts')].slice(0, MAX_ALERTS));
  notify(fresh);
}
