// 選股技術指標條件（services/filterEngine.js）：用小段合成日 K 檢查成立／不成立，以及量 ≤ 1000 張不符合。
import assert from 'node:assert/strict';

const { FILTER_REGISTRY, DEFAULT_FILTER_SETTINGS, applyFilters, applyHistoryFilters, hasHistoryFilters } = await import('../services/filterEngine.js');

const byId = Object.fromEntries(FILTER_REGISTRY.map((f) => [f.id, f]));
const settings = { ...DEFAULT_FILTER_SETTINGS };
const bars = (closes, volumes = []) => closes.map((close, i) => ({ open: close, high: close + 0.5, low: close - 0.5, close, volume: volumes[i] ?? 1000 }));
const check = (id, candles, extra = {}) => byId[id].fn({ code: '2330', volume: 5000 }, { ...settings, ...extra }, candles);

// 下跌一段後最後一根大漲：K 由下往上穿過 D。
const kdUp = bars([...Array.from({ length: 15 }, (_, i) => 30 - i), 30]);
assert.equal(check('kd_golden_cross', kdUp), true, 'kd cross');
assert.equal(check('kd_golden_cross', kdUp, { kdKMax: 10 }), false, 'kd cross above K limit');
assert.equal(check('kd_golden_cross', bars(Array.from({ length: 16 }, (_, i) => 30 - i))), false, 'kd no cross');
assert.equal(check('kd_golden_cross', bars([10, 11])), false, 'kd too short');

// 加速下跌後最後一根大漲：DIF 穿越訊號線。
const macdUp = bars([...Array.from({ length: 40 }, (_, i) => 100 - (i * i) / 20), 100]);
assert.equal(check('macd_golden_cross', macdUp), true, 'macd cross');
assert.equal(check('macd_golden_cross', bars(Array.from({ length: 41 }, (_, i) => 100 - (i * i) / 20))), false, 'macd no cross');
assert.equal(check('macd_golden_cross', macdUp, { macdFast: 26, macdSlow: 12 }), false, 'macd bad params');

// 量增：前 5 日均量 1000，今日 1500 成立、1400 不成立。
const flat = Array(6).fill(10);
assert.equal(check('volume_surge', bars(flat, [1000, 1000, 1000, 1000, 1000, 1500])), true, 'volume surge');
assert.equal(check('volume_surge', bars(flat, [1000, 1000, 1000, 1000, 1000, 1400])), false, 'volume not enough');
assert.equal(check('volume_surge', bars(flat.slice(0, 5))), false, 'volume too short');

// 站上 SMA／EMA：最後收盤高於 / 低於均線。
const rising = bars(Array.from({ length: 25 }, (_, i) => 10 + i));
const falling = bars(Array.from({ length: 25 }, (_, i) => 40 - i));
for (const id of ['above_sma', 'above_ema']) {
  assert.equal(check(id, rising), true, `${id} above`);
  assert.equal(check(id, falling), false, `${id} below`);
  assert.equal(check(id, rising.slice(0, 10)), false, `${id} too short`);
}
assert.equal(check('above_sma', rising, { smaDays: 0 }), false, 'sma bad period');

// 布林：橫盤後最後一根暴漲／暴跌。
const spikeUp = bars([...Array(19).fill(10), 10.2, 20]);
const spikeDown = bars([...Array(19).fill(10), 9.8, 1]);
assert.equal(check('bb_upper_break', spikeUp), true, 'bb upper');
assert.equal(check('bb_upper_break', spikeDown), false, 'bb upper no');
assert.equal(check('bb_lower_break', spikeDown), true, 'bb lower');
assert.equal(check('bb_lower_break', spikeUp), false, 'bb lower no');
assert.equal(check('bb_upper_break', spikeUp.slice(-10)), false, 'bb too short');

// 一般條件不受日 K 條件影響；日 K 條件只放行量 > 1000 張且有日 K 的股票。
const stocks = [
  { code: '1111', volume: 5000, pe: 10 },
  { code: '2222', volume: 1000, pe: 10 },
  { code: '3333', volume: 5000, pe: 10 }
];
const enabled = ['pe_max', 'above_sma'];
assert.equal(hasHistoryFilters(enabled), true);
assert.equal(hasHistoryFilters(['pe_max']), false);
assert.equal(applyFilters(stocks, enabled, settings).length, 3, 'basic filters ignore history conditions');
const candles = new Map([['1111', rising], ['2222', rising]]);
assert.deepEqual(applyHistoryFilters(stocks, enabled, settings, candles).map((s) => s.code), ['1111'], 'volume ≤ 1000 or no candles → not matched');
assert.equal(applyHistoryFilters(stocks, ['pe_max'], settings, new Map()).length, 3, 'no history conditions → unchanged');
