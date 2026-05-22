// 模擬行情服務：定期更新 store 內的大盤、期貨、股票與市場地圖資料。
import { store } from '../data/store.js';
import { TW_STOCK_UNIVERSE } from '../data/twStocks.js';
import { TW50_BY_CODE } from '../data/tw50Constituents.js';
import { MID100_BY_CODE } from '../data/twMid100Constituents.js';
import { TAIEX_BY_CODE } from '../data/taiexWeightedConstituents.js';
import { getMarketStatus } from './marketCalendar.js';
import { hasFreshYahooTaiex } from './yahooTaiexPoller.js';
import { getDashboardDataSource } from './dashboardDataSource.js';

let tickTimer = null;
let globalTimer = null;
let marketMapTimer = null;
let marketMapState = null;

// rand：函式用途註解，說明此處封裝一段可重用的流程。
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// drift：函式用途註解，說明此處封裝一段可重用的流程。
function drift(value, pct = 0.003) {
  const next = value * (1 + rand(-pct, pct));
  return +next.toFixed(2);
}

// pushSpark：函式用途註解，說明此處封裝一段可重用的流程。
function pushSpark(arr, value, maxLen = 60) {
  const next = [...arr, value];
  if (next.length > maxLen) next.shift();
  return next;
}

// clamp：函式用途註解，說明此處封裝一段可重用的流程。
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// hashCode：函式用途註解，說明此處封裝一段可重用的流程。
function hashCode(code) {
  return String(code)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

// intradayBias：函式用途註解，說明此處封裝一段可重用的流程。
function intradayBias() {
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  const sessionStart = 9 * 60;
  const sessionEnd = 13 * 60 + 30;
  const progress = clamp((minute - sessionStart) / (sessionEnd - sessionStart), 0, 1);
  return Math.sin((progress - 0.25) * Math.PI) * 0.5;
}

// buildMarketMapUniverse：函式用途註解，說明此處封裝一段可重用的流程。
function buildMarketMapUniverse() {
  // map：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const map = new Map(TW_STOCK_UNIVERSE.map((stock) => [stock.code, { ...stock }]));

  Object.values(TW50_BY_CODE).forEach((item) => {
    const existing = map.get(item.code);
    if (existing) {
      map.set(item.code, {
        ...existing,
        name: item.name || existing.name,
        isIn0050: true,
        tw50WeightPct: item.weightPct,
        tw50Major: item.majorGroup,
        syntheticConstituentOnly: false
      });
      return;
    }

    map.set(item.code, {
      code: item.code,
      name: item.name,
      sector: item.majorGroup,
      subSector: '台灣50',
      marketCap: Math.max(item.weightPct * 100, 1),
      isIn0050: true,
      tw50WeightPct: item.weightPct,
      tw50Major: item.majorGroup,
      syntheticConstituentOnly: true
    });
  });

  Object.values(MID100_BY_CODE).forEach((item) => {
    const existing = map.get(item.code);
    if (existing) {
      map.set(item.code, {
        ...existing,
        name: item.name || existing.name,
        isInMid100: true,
        mid100WeightPct: item.weightPct,
        mid100Major: item.majorGroup,
        syntheticConstituentOnly: existing.syntheticConstituentOnly || false
      });
      return;
    }

    map.set(item.code, {
      code: item.code,
      name: item.name,
      sector: '中型100',
      subSector: '中型100',
      marketCap: Math.max(item.weightPct * 100, 1),
      isInMid100: true,
      mid100WeightPct: item.weightPct,
      mid100Major: item.majorGroup,
      syntheticConstituentOnly: true
    });
  });

  Object.values(TAIEX_BY_CODE).forEach((item) => {
    const existing = map.get(item.code);
    if (existing) {
      map.set(item.code, {
        ...existing,
        name: item.name || existing.name,
        yahooSector: item.yahooSector || existing.yahooSector,
        taiexWeightPct: item.weightPct,
        taiexSector: item.sector,
        syntheticConstituentOnly: existing.syntheticConstituentOnly || false
      });
      return;
    }

    map.set(item.code, {
      code: item.code,
      name: item.name,
      sector: item.sector,
      yahooSector: item.yahooSector || null,
      subSector: '加權',
      marketCap: Math.max(item.weightPct * 100, 1),
      taiexWeightPct: item.weightPct,
      taiexSector: item.sector,
      syntheticConstituentOnly: true
    });
  });

  return [...map.values()];
}

// buildInitialMarketMap：函式用途註解，說明此處封裝一段可重用的流程。
function buildInitialMarketMap() {
  return buildMarketMapUniverse().map((stock) => {
    const seed = hashCode(stock.code);
    const basePrice = +(30 + (seed % 900) * 1.3).toFixed(2);
    const changePct = +((Math.random() - 0.5) * 1.2).toFixed(2);
    return {
      ...stock,
      price: basePrice,
      changePct,
      change5d: +(changePct * 1.8).toFixed(2),
      volume: Math.round(300000 + (seed % 700) * 8000),
      volRatio: +(0.75 + ((seed % 100) / 100) * 0.8).toFixed(2)
    };
  });
}

// updateTopStocks：函式用途註解，說明此處封裝一段可重用的流程。
function updateTopStocks() {
  if (getDashboardDataSource() !== 'mock') return;
  const current = store.get('topStocks');
  if (current.some((stock) => stock.source === 'yahoo' && Number.isFinite(stock.sourceUpdatedAt) && Date.now() - stock.sourceUpdatedAt < 60000)) return;
  // stocks：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const stocks = current.map((s) => {
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

// updateTaiex：函式用途註解，說明此處封裝一段可重用的流程。
function updateTaiex() {
  if (getDashboardDataSource() !== 'mock') return;
  const taiex = store.get('taiex');
  if (hasFreshYahooTaiex(taiex)) return;
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

// updateAlerts：函式用途註解，說明此處封裝一段可重用的流程。
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

// startPriceSimulator：函式用途註解，說明此處封裝一段可重用的流程。
export function startPriceSimulator() {
  if (tickTimer) return;
  // 段落說明：建立定時更新流程。
  tickTimer = setInterval(() => {
    updateTaiex();
    updateTopStocks();
    updateAlerts();
  }, 2500);
}

// stopPriceSimulator：函式用途註解，說明此處封裝一段可重用的流程。
export function stopPriceSimulator() {
  if (!tickTimer) return;
  // 段落說明：清除定時器，避免頁面卸載後繼續執行。
  clearInterval(tickTimer);
  tickTimer = null;
}

// simulateGlobalIndices：函式用途註解，說明此處封裝一段可重用的流程。
export function simulateGlobalIndices() {
  if (globalTimer) return;
  // 段落說明：建立定時更新流程。
  globalTimer = setInterval(() => {
    const now = new Date();
    // data：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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

// stopGlobalSimulator：函式用途註解，說明此處封裝一段可重用的流程。
export function stopGlobalSimulator() {
  if (!globalTimer) return;
  // 段落說明：清除定時器，避免頁面卸載後繼續執行。
  clearInterval(globalTimer);
  globalTimer = null;
}

// simulateMarketMap：函式用途註解，說明此處封裝一段可重用的流程。
export function simulateMarketMap() {
  if (marketMapTimer) return;

  const sectorTrends = {};
  // sectors：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const sectors = [...new Set(buildMarketMapUniverse().map((stock) => stock.taiexSector || stock.sector).filter(Boolean))];
  sectors.forEach((sector) => {
    sectorTrends[sector] = (Math.random() - 0.5) * 2;
  });

  if (getDashboardDataSource() === 'mock') {
    marketMapState = buildInitialMarketMap();
    store.set('marketMap', marketMapState);
  }

  // 段落說明：建立定時更新流程。
  marketMapTimer = setInterval(() => {
    if (getDashboardDataSource() !== 'mock') return;
    if (!marketMapState || !marketMapState.length) {
      marketMapState = buildInitialMarketMap();
    }

    const marketBias = intradayBias();
    marketMapState = marketMapState.map((stock) => {
      const sectorKey = stock.taiexSector || stock.sector;
      const sectorTrend = sectorTrends[sectorKey] || 0;
      const individualNoise = (Math.random() - 0.5) * 1.6;
      const target = sectorTrend + marketBias + individualNoise;
      const nextChangePct = clamp((stock.changePct || 0) * 0.55 + target * 0.45, -5, 5);
      const nextChange5d = clamp(
        (stock.change5d || 0) * 0.72 + nextChangePct * 0.28 + (Math.random() - 0.5) * 0.6,
        -12,
        12
      );

      const basePrice = Math.max((stock.price || 50) / (1 + (stock.changePct || 0) / 100), 10);
      const nextPrice = +(basePrice * (1 + nextChangePct / 100)).toFixed(2);
      const nextVolRatio = clamp((stock.volRatio || 1) * (0.88 + Math.random() * 0.24), 0.35, 3.8);
      const nextVolume = Math.max(50000, Math.round((stock.volume || 300000) * (0.76 + Math.random() * 0.48)));

      return {
        ...stock,
        price: nextPrice,
        changePct: +nextChangePct.toFixed(2),
        change5d: +nextChange5d.toFixed(2),
        volume: nextVolume,
        volRatio: +nextVolRatio.toFixed(2)
      };
    });

    store.set('marketMap', marketMapState);

    if (Math.random() < 0.1) {
      sectors.forEach((sector) => {
        sectorTrends[sector] = clamp(sectorTrends[sector] + (Math.random() - 0.5) * 0.4, -2.8, 2.8);
      });
    }
  }, 5000);
}

// stopMarketMapSimulator：函式用途註解，說明此處封裝一段可重用的流程。
export function stopMarketMapSimulator() {
  if (!marketMapTimer) return;
  // 段落說明：清除定時器，避免頁面卸載後繼續執行。
  clearInterval(marketMapTimer);
  marketMapTimer = null;
  marketMapState = null;
}
