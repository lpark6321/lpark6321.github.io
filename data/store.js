const listeners = new Map();

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const state = {
  taiex: {
    price: 10879.47,
    change: -133.79,
    changePct: -1.21,
    open: 11013.26,
    high: 11025.0,
    low: 10854.0,
    volume: 1684.57,
    volEstimate: 1730.34
  },
  futures: {
    price: 32407,
    open: 32649,
    high: 32858,
    low: 32282,
    prevClose: 32480,
    change: -73,
    changePct: -0.22
  },
  sectors: [
    { name: '電子', upPct: 55, downPct: 30, flatPct: 15 },
    { name: '金融', upPct: 40, downPct: 45, flatPct: 15 },
    { name: '航運', upPct: 35, downPct: 50, flatPct: 15 },
    { name: '半導體', upPct: 62, downPct: 22, flatPct: 16 }
  ],  topStocks: [
    { code: '2330', name: '台積電', price: 972, change: 15, changePct: 1.57, volume: 58200, weightPct: 44.2978, sparkline: [920, 930, 940, 955, 965, 972] },
    { code: '2308', name: '台達電', price: 385, change: -2, changePct: -0.52, volume: 8900, weightPct: 3.4791, sparkline: [390, 389, 388, 387, 386, 385] },
    { code: '2317', name: '鴻海', price: 215, change: -1, changePct: -0.46, volume: 42100, weightPct: 2.5412, sparkline: [218, 217, 216, 214, 215, 215] },
    { code: '2454', name: '聯發科', price: 1125, change: 22, changePct: 2.0, volume: 12800, weightPct: 2.3195, sparkline: [1080, 1090, 1100, 1110, 1120, 1125] },
    { code: '3711', name: '日月光投控', price: 176.5, change: 1.2, changePct: 0.68, volume: 18400, weightPct: 1.4179, sparkline: [172.2, 173.1, 174.0, 175.0, 175.8, 176.5] },
    { code: '2881', name: '富邦金', price: 95.3, change: 0.7, changePct: 0.74, volume: 31200, weightPct: 1.1692, sparkline: [93, 93.5, 94, 94.2, 94.8, 95.3] },
    { code: '2382', name: '廣達', price: 318, change: 4, changePct: 1.27, volume: 22600, weightPct: 1.0441, sparkline: [306, 308, 311, 313, 316, 318] },
    { code: '2412', name: '中華電', price: 128.5, change: 0.3, changePct: 0.23, volume: 8600, weightPct: 1.0014, sparkline: [127.6, 127.8, 128.0, 128.2, 128.3, 128.5] },
    { code: '2882', name: '國泰金', price: 66.8, change: -0.2, changePct: -0.30, volume: 29800, weightPct: 1.0009, sparkline: [67.6, 67.4, 67.2, 67.0, 66.9, 66.8] },
    { code: '2891', name: '中信金', price: 40.9, change: 0.1, changePct: 0.24, volume: 35200, weightPct: 0.9798, sparkline: [40.1, 40.3, 40.4, 40.6, 40.8, 40.9] }
  ],  moneyFlow: {
    bigPlayer: { estimated: -92.1, actual: -114.6 },
    midPlayer: { estimated: -20.7, actual: -10.4 },
    other: { estimated: -21.0, actual: -8.8 }
  },
  bullBear: {
    bull: { score: 5, max: 28 },
    bear: { score: 18, max: 48 }
  },
  watchlist: [
    { code: '2330', name: '台積電', group: '自選1' },
    { code: '2317', name: '鴻海', group: '自選1' },
    { code: '2603', name: '長榮', group: '自選2' },
    { code: '2330', name: '台積電', group: 'page1分組' },
    { code: '2454', name: '聯發科', group: 'page1分組' },
    { code: '2308', name: '台達電', group: 'page1分組' }
  ],  selectedStock: '2330',
  enabledPatterns: ['ma20_breakout', 'kd_golden_cross', 'vol_surge', 'macd_golden_cross'],
  patternAlerts: [
    { code: '2330', name: '台積電', price: 972, changePct: 1.57, patterns: ['突破20日均線', 'KD黃金交叉'], triggered: '14:23:05', severity: 'high' },
    { code: '2603', name: '長榮', price: 188, changePct: -0.53, patterns: ['觸及布林下軌'], triggered: '13:52:14', severity: 'low' }
  ],
  optionsChain: {
    underlying: 'TX',
    spotPrice: 19850,
    expiry: '2026-04',
    calls: Array.from({ length: 9 }, (_, i) => {
      const strike = 19400 + i * 100;
      return { strike, bid: Math.max(20, 220 - i * 20), ask: Math.max(25, 225 - i * 20), iv: 0.16 + i * 0.003, delta: 0.7 - i * 0.08, gamma: 0.02, theta: -5.5, vega: 11 + i };
    }),
    puts: Array.from({ length: 9 }, (_, i) => {
      const strike = 19400 + i * 100;
      return { strike, bid: Math.max(20, 60 + i * 18), ask: Math.max(25, 65 + i * 18), iv: 0.17 + i * 0.003, delta: -0.68 + i * 0.08, gamma: 0.02, theta: -5.2, vega: 10 + i };
    })
  },
  strategyLegs: [
    { type: 'call', action: 'buy', strike: 19800, qty: 1, premium: 125 }
  ],
  screenResults: Array.from({ length: 140 }, (_, i) => {
    const code = String(1101 + i);
    const price = +(20 + Math.random() * 980).toFixed(2);
    const changePct = +((Math.random() - 0.5) * 6).toFixed(2);
    const ma20 = +(price * (0.97 + Math.random() * 0.06)).toFixed(2);
    return {
      code,
      name: `股票${code}`,
      price,
      changePct,
      pe: +(6 + Math.random() * 30).toFixed(2),
      pb: +(0.6 + Math.random() * 4).toFixed(2),
      roe: +(2 + Math.random() * 25).toFixed(2),
      dividendYield: +(1 + Math.random() * 8).toFixed(2),
      ma5: +(ma20 * (1 + (Math.random() - 0.45) * 0.04)).toFixed(2),
      ma20,
      ma60: +(ma20 * (1 - (Math.random() - 0.45) * 0.06)).toFixed(2),
      rsi: +(20 + Math.random() * 60).toFixed(2),
      vol: Math.round(100 + Math.random() * 80000),
      marketCap: +(100 + Math.random() * 28000).toFixed(2),
      sector: ['電子', '金融', '航運', '電機', '生技'][i % 5],
      sparkline: Array.from({ length: 20 }, (_, j) => +(price * (0.95 + (j / 40) + (Math.random() - 0.5) * 0.04)).toFixed(2))
    };
  }),
  marketMap: Array.from({ length: 180 }, (_, i) => {
    const code = String(1200 + i);
    return {
      code,
      name: `上市${code}`,
      sector: ['半導體', '金融', '航運', '塑化', 'AI伺服器', 'ETF'][i % 6],
      marketCap: +(100 + Math.random() * 25000).toFixed(2),
      turnover: +(10 + Math.random() * 5000).toFixed(2),
      market: ['上市', '上櫃', 'ETF'][i % 3],
      changePct: +((Math.random() - 0.5) * 8).toFixed(2),
      fiveDayPct: +((Math.random() - 0.5) * 12).toFixed(2),
      volumeRatio: +(0.4 + Math.random() * 3).toFixed(2),
      price: +(15 + Math.random() * 990).toFixed(2)
    };
  }),
  globalIndices: [
    { id: 'kospi', name: '韓綜', fullName: 'KOSPI', flag: '🇰🇷', price: 2580.5, change: 12.3, changePct: 0.48, open: 2568.2, high: 2585.0, low: 2562.1, prevClose: 2568.2, timezone: 'Asia/Seoul', tradingHours: { open: '09:00', close: '15:30' }, sparkline: [2568, 2570, 2572, 2578, 2580], status: 'open' },
    { id: 'nikkei', name: '日經225', fullName: 'Nikkei 225', flag: '🇯🇵', price: 39880.2, change: -88.6, changePct: -0.22, open: 39920.0, high: 40025.0, low: 39820.3, prevClose: 39968.8, timezone: 'Asia/Tokyo', tradingHours: { open: '09:00', close: '15:30' }, sparkline: [40010, 39990, 39930, 39890, 39880], status: 'open' },
    { id: 'nasdaq', name: '那斯達克', fullName: 'NASDAQ', flag: '🇺🇸', price: 18320.4, change: 65.2, changePct: 0.36, open: 18290.0, high: 18330.0, low: 18220.1, prevClose: 18255.2, timezone: 'America/New_York', tradingHours: { open: '09:30', close: '16:00' }, sparkline: [18255, 18270, 18280, 18310, 18320], status: 'closed' },
    { id: 'sox', name: '費半', fullName: 'SOX', flag: '🇺🇸', price: 4892.8, change: 22.5, changePct: 0.46, open: 4870.0, high: 4905.0, low: 4856.3, prevClose: 4870.3, timezone: 'America/New_York', tradingHours: { open: '09:30', close: '16:00' }, sparkline: [4870, 4865, 4888, 4896, 4892], status: 'closed' },
    { id: 'dow', name: '道瓊', fullName: 'Dow Jones', flag: '🇺🇸', price: 42210.1, change: -52.3, changePct: -0.12, open: 42250.0, high: 42310.0, low: 42190.3, prevClose: 42262.4, timezone: 'America/New_York', tradingHours: { open: '09:30', close: '16:00' }, sparkline: [42262, 42230, 42220, 42240, 42210], status: 'closed' },
    { id: 'sp500', name: '標普500', fullName: 'S&P 500', flag: '🇺🇸', price: 5389.5, change: 8.2, changePct: 0.15, open: 5382.0, high: 5398.1, low: 5374.0, prevClose: 5381.3, timezone: 'America/New_York', tradingHours: { open: '09:30', close: '16:00' }, sparkline: [5381, 5383, 5388, 5390, 5389], status: 'closed' },
    { id: 'gold', name: '黃金', fullName: 'Gold', flag: '🟡', price: 2350.2, change: 5.8, changePct: 0.25, open: 2344.0, high: 2354.0, low: 2338.2, prevClose: 2344.4, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [2344, 2346, 2348, 2351, 2350], status: 'open' },
    { id: 'us10y', name: '美債10Y', fullName: 'US10Y', flag: '🇺🇸', price: 4.18, change: -0.02, changePct: -0.48, open: 4.2, high: 4.22, low: 4.15, prevClose: 4.2, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [4.2, 4.19, 4.18, 4.17, 4.18], status: 'open' },
    { id: 'usdtwd', name: '美元/台幣', fullName: 'USD/TWD', flag: '🇹🇼', price: 31.96, change: -0.08, changePct: -0.25, open: 32.04, high: 32.06, low: 31.95, prevClose: 32.04, timezone: 'Asia/Taipei', tradingHours: { open: '09:00', close: '16:00' }, sparkline: [32.04, 32.01, 31.99, 31.97, 31.96], status: 'open' },
    { id: 'wti', name: 'WTI原油', fullName: 'WTI Oil', flag: '🛢️', price: 82.1, change: 0.9, changePct: 1.11, open: 81.0, high: 82.4, low: 80.8, prevClose: 81.2, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [81.2, 81.3, 81.6, 81.9, 82.1], status: 'open' },
    { id: 'vix', name: 'VIX', fullName: 'VIX', flag: '⚠️', price: 14.2, change: -0.3, changePct: -2.07, open: 14.5, high: 14.8, low: 14.1, prevClose: 14.5, timezone: 'America/New_York', tradingHours: { open: '09:30', close: '16:00' }, sparkline: [14.5, 14.4, 14.3, 14.2, 14.2], status: 'closed' },
    { id: 'hsi', name: '恒生', fullName: 'HSI', flag: '🇭🇰', price: 17320.7, change: -120.3, changePct: -0.69, open: 17420.1, high: 17442.0, low: 17288.3, prevClose: 17441.0, timezone: 'Asia/Hong_Kong', tradingHours: { open: '09:30', close: '16:00' }, sparkline: [17441, 17400, 17370, 17340, 17320], status: 'open' },
    { id: 'shanghai', name: '上證', fullName: 'Shanghai', flag: '🇨🇳', price: 3078.4, change: 9.8, changePct: 0.32, open: 3068.0, high: 3082.1, low: 3062.3, prevClose: 3068.6, timezone: 'Asia/Shanghai', tradingHours: { open: '09:30', close: '15:00' }, sparkline: [3068, 3070, 3074, 3076, 3078], status: 'open' }
    ,{ id: 'eurusd', name: '歐元/美元', fullName: 'EUR/USD', flag: '💱', price: 1.0821, change: 0.0018, changePct: 0.17, open: 1.0802, high: 1.0830, low: 1.0795, prevClose: 1.0803, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [1.0803, 1.0808, 1.0812, 1.0818, 1.0821], status: 'open' }
    ,{ id: 'usdjpy', name: '美元/日圓', fullName: 'USD/JPY', flag: '💱', price: 151.42, change: -0.33, changePct: -0.22, open: 151.75, high: 151.82, low: 151.31, prevClose: 151.75, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [151.75, 151.66, 151.58, 151.49, 151.42], status: 'open' }
    ,{ id: 'gbpusd', name: '英鎊/美元', fullName: 'GBP/USD', flag: '💱', price: 1.2662, change: -0.0011, changePct: -0.09, open: 1.2671, high: 1.2680, low: 1.2656, prevClose: 1.2673, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [1.2673, 1.2670, 1.2668, 1.2664, 1.2662], status: 'open' }
    ,{ id: 'audusd', name: '澳幣/美元', fullName: 'AUD/USD', flag: '💱', price: 0.6598, change: 0.0017, changePct: 0.26, open: 0.6580, high: 0.6601, low: 0.6576, prevClose: 0.6581, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [0.6581, 0.6586, 0.6590, 0.6595, 0.6598], status: 'open' }
    ,{ id: 'btcusd', name: '比特幣', fullName: 'BTC/USD', flag: '₿', price: 68250, change: 720, changePct: 1.07, open: 67520, high: 68600, low: 67150, prevClose: 67530, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [67530, 67710, 67950, 68110, 68250], status: 'open' }
    ,{ id: 'ethusd', name: '以太幣', fullName: 'ETH/USD', flag: '◆', price: 3585, change: 42, changePct: 1.19, open: 3542, high: 3605, low: 3528, prevClose: 3543, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [3543, 3552, 3568, 3578, 3585], status: 'open' }
    ,{ id: 'solusd', name: 'Solana', fullName: 'SOL/USD', flag: '◎', price: 182.4, change: 3.1, changePct: 1.73, open: 179.2, high: 183.5, low: 178.4, prevClose: 179.3, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [179.3, 180.0, 180.9, 181.7, 182.4], status: 'open' }
    ,{ id: 'xrpusd', name: 'XRP', fullName: 'XRP/USD', flag: '✕', price: 0.642, change: -0.006, changePct: -0.93, open: 0.648, high: 0.651, low: 0.639, prevClose: 0.648, timezone: 'UTC', tradingHours: { open: '00:00', close: '23:59' }, sparkline: [0.648, 0.646, 0.645, 0.643, 0.642], status: 'open' }
  ]
};

function emit(key) {
  const set = listeners.get(key);
  if (!set) return;
  const value = state[key];
  set.forEach((cb) => cb(value));
}

export const store = {
  set(key, value) {
    state[key] = value;
    emit(key);
  },
  get(key) {
    return clone(state[key]);
  },
  subscribe(key, callback) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(callback);
    return () => {
      const set = listeners.get(key);
      if (!set) return;
      set.delete(callback);
      if (set.size === 0) listeners.delete(key);
    };
  }
};





