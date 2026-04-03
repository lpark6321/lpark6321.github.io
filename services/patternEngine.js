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

export function runPattern(id, stockSnap) {
  const pattern = PATTERN_REGISTRY.find((p) => p.id === id);
  if (!pattern) return false;
  return !!pattern.condition(stockSnap);
}

export function runAllPatterns(stockSnap, enabledIds = null) {
  return PATTERN_REGISTRY.filter((p) => {
    if (enabledIds && !enabledIds.includes(p.id)) return false;
    return !!p.condition(stockSnap);
  });
}
