import { store } from '../data/store.js';
import { getMarketStatus } from './marketCalendar.js';

let tickTimer = null;
let globalTimer = null;
let marketMapTimer = null;

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

// Simulate Taiwan stock market prices for treemap (page6)
export function simulateMarketMap() {
  if (marketMapTimer) return;

  // Import here to avoid blocking initial page load
  import('../data/twStocks.js').then(mod => {
    const { TW_STOCK_UNIVERSE, SECTOR_ORDER } = mod;

    // Initialize sector trends (sector-wide drift)
    const sectorTrends = {};
    SECTOR_ORDER.forEach(sector => {
      sectorTrends[sector] = (Math.random() - 0.5) * 4; // -2% to +2% sector trend
    });

    marketMapTimer = setInterval(() => {
      const marketMap = TW_STOCK_UNIVERSE.map(stock => {
        // Get current price from store or initialize
        const current = store.get('marketMap')?.find(m => m.code === stock.code) || {
          price: Math.random() * 200 + 50,
          changePct: 0,
          change5d: 0,
          volume: Math.random() * 1e7,
          volRatio: Math.random() * 3
        };

        // Apply sector trend + random walk
        const sectorDrift = sectorTrends[stock.sector] || 0;
        const individualDrift = (Math.random() - 0.5) * 3;
        const priceDrift = (sectorDrift + individualDrift) * 0.1;

        const newPrice = Math.max(10, current.price * (1 + priceDrift / 100));
        const newChangePct = +(priceDrift * (Math.random() + 0.5)).toFixed(2);
        const newChange5d = +((newChangePct + (Math.random() - 0.5) * 4).toFixed(2));

        return {
          code: stock.code,
          name: stock.name,
          sector: stock.sector,
          subSector: stock.subSector,
          marketCap: stock.marketCap,
          isIn0050: stock.isIn0050,
          price: +newPrice.toFixed(2),
          changePct: +newChangePct.toFixed(2),
          change5d: +newChange5d.toFixed(2),
          volume: Math.round(current.volume * (0.8 + Math.random() * 0.4)),
          volRatio: +(current.volRatio * (0.7 + Math.random() * 0.6)).toFixed(2)
        };
      });

      store.set('marketMap', marketMap);

      // Update sector trends periodically (every 30 seconds)
      if (Math.random() < 0.1) {
        SECTOR_ORDER.forEach(sector => {
          sectorTrends[sector] += (Math.random() - 0.5) * 0.5;
          sectorTrends[sector] = Math.max(-5, Math.min(5, sectorTrends[sector]));
        });
      }
    }, 5000); // Update every 5 seconds
  });
}

export function stopMarketMapSimulator() {
  if (!marketMapTimer) return;
  clearInterval(marketMapTimer);
  marketMapTimer = null;
}
