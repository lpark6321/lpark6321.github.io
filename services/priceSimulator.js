// 模擬行情：資料來源為「模擬資料」時，由 marketFeed 每輪呼叫一次，更新 store 內的大盤與權值股。
// 切換到模擬資料時 store 已清空，第一輪從下面的起始值開始，之後接著上一輪跳。
import { store } from '../data/store.js';
import { withVolumeEstimate } from './dashboardDataSource.js';

const TAIEX_SEED = { price: 10879.47, prevClose: 11013.26, open: 11013.26, high: 11025.0, low: 10854.0, volume: 1684.57 };
const STOCK_SEED = {
  2330: [972, 957], 2308: [385, 387], 2317: [215, 216], 2454: [1125, 1103], 3711: [176.5, 175.3],
  2881: [95.3, 94.6], 2382: [318, 314], 2412: [128.5, 128.2], 2882: [66.8, 67], 2891: [40.9, 40.8]
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function drift(value, pct = 0.003) {
  const next = value * (1 + rand(-pct, pct));
  return +next.toFixed(2);
}

function pushSpark(arr, value, maxLen = 60) {
  const next = [...arr, value];
  if (next.length > maxLen) next.shift();
  return next;
}

// 沒有報價的股票用起始值；起始值表也沒有的就不動。
function seededStock(stock) {
  if (Number.isFinite(stock.price)) return { ...stock, prevClose: stock.prevClose ?? stock.price - (stock.change || 0) };
  const seed = STOCK_SEED[stock.code];
  return seed ? { ...stock, price: seed[0], prevClose: seed[1], sparkline: [] } : null;
}

function updateTopStocks() {
  const stocks = store.get('topStocks').map((raw) => {
    const s = seededStock(raw);
    if (!s) return raw;
    const price = drift(s.price, 0.006);
    const change = +(price - s.prevClose).toFixed(2);
    return {
      ...s,
      price,
      change,
      changePct: +((change / s.prevClose) * 100).toFixed(2),
      sparkline: pushSpark(s.sparkline || [], price, 30),
      source: 'mock'
    };
  });
  store.set('topStocks', stocks);
}

function updateTaiex() {
  const current = store.get('taiex');
  const taiex = Number.isFinite(current.price) ? { ...TAIEX_SEED, ...current } : { ...TAIEX_SEED };
  const base = taiex.prevClose || taiex.open;
  const nextPrice = drift(taiex.price, 0.0015);
  const change = +(nextPrice - base).toFixed(2);
  store.set('taiex', withVolumeEstimate({
    ...taiex,
    price: nextPrice,
    change,
    changePct: +((change / base) * 100).toFixed(2),
    high: Math.max(taiex.high, nextPrice),
    low: Math.min(taiex.low, nextPrice),
    volume: +((Number(taiex.volume) || 0) + rand(0.2, 1.8)).toFixed(2),
    source: 'mock',
    sourceUpdatedAt: Date.now()
  }));
}

export function tickPriceSimulator() {
  updateTaiex();
  updateTopStocks();
}
