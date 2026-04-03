import { store } from '../data/store.js';
import { getMarketStatus } from './marketCalendar.js';

let tickTimer = null;
let globalTimer = null;

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

function updateTopStocks() {
  const stocks = store.get('topStocks').map((s) => {
    const price = drift(s.price, 0.006);
    const change = +(price - (s.price - s.change)).toFixed(2);
    const changePct = +((change / (s.price - s.change)) * 100).toFixed(2);
    return {
      ...s,
      price,
      change,
      changePct,
      sparkline: pushSpark(s.sparkline, price, 30)
    };
  });
  store.set('topStocks', stocks);
}

function updateTaiex() {
  const taiex = store.get('taiex');
  const nextPrice = drift(taiex.price, 0.0015);
  const change = +(nextPrice - taiex.open).toFixed(2);
  const changePct = +((change / taiex.open) * 100).toFixed(2);
  store.set('taiex', {
    ...taiex,
    price: nextPrice,
    change,
    changePct,
    high: Math.max(taiex.high, nextPrice),
    low: Math.min(taiex.low, nextPrice),
    volume: +(taiex.volume + rand(0.2, 1.8)).toFixed(2)
  });
}

function updateAlerts() {
  const alerts = store.get('patternAlerts');
  if (Math.random() < 0.35) {
    const stocks = store.get('topStocks');
    const pick = stocks[Math.floor(Math.random() * stocks.length)];
    const choices = ['突破20日均線', 'KD黃金交叉', '爆量 (>2x均量)', 'MACD黃金交叉'];
    const sev = ['high', 'mid', 'low'][Math.floor(Math.random() * 3)];
    const now = new Date();
    const triggered = now.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
    alerts.unshift({
      code: pick.code,
      name: pick.name,
      price: pick.price,
      changePct: pick.changePct,
      patterns: [choices[Math.floor(Math.random() * choices.length)]],
      triggered,
      severity: sev
    });
    store.set('patternAlerts', alerts.slice(0, 80));
  }
}

export function startPriceSimulator() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    updateTaiex();
    updateTopStocks();
    updateAlerts();
  }, 2500);
}

export function stopPriceSimulator() {
  if (!tickTimer) return;
  clearInterval(tickTimer);
  tickTimer = null;
}

export function simulateGlobalIndices() {
  if (globalTimer) return;
  globalTimer = setInterval(() => {
    const now = new Date();
    const data = store.get('globalIndices').map((idx) => {
      const status = getMarketStatus(idx.id, now);
      const base = idx.prevClose;
      const maxSwing = base * 0.005;
      const candidate = idx.price + rand(-maxSwing, maxSwing) * 0.2;
      const price = +(Math.max(base * 0.95, Math.min(base * 1.05, candidate))).toFixed(2);
      const change = +(price - base).toFixed(2);
      const changePct = +((change / base) * 100).toFixed(2);
      return {
        ...idx,
        status,
        price,
        change,
        changePct,
        high: Math.max(idx.high, price),
        low: Math.min(idx.low, price),
        sparkline: pushSpark(idx.sparkline, price, 80)
      };
    });
    store.set('globalIndices', data);
  }, 3000);
}

export function stopGlobalSimulator() {
  if (!globalTimer) return;
  clearInterval(globalTimer);
  globalTimer = null;
}
