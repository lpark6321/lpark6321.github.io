// 共用技術訊號（services/technicalSignals.js）：交叉、布林進入上半／下半、量縮，以及 Page5 選股與 Page3 型態用同一規則。
import assert from 'node:assert/strict';

const ts = await import('../services/technicalSignals.js');
const { FILTER_REGISTRY, DEFAULT_FILTER_SETTINGS, historyCandidates } = await import('../services/filterEngine.js');

const bars = (closes, volumes = []) => closes.map((close, i) => ({ time: i, open: close, high: close + 0.5, low: close - 0.5, close, volume: volumes[i] ?? 1000 }));
const filterFn = Object.fromEntries(FILTER_REGISTRY.map((f) => [f.id, (candles) => f.fn({ code: '2330', volume: 5000 }, DEFAULT_FILTER_SETTINGS, candles)]));

// 交叉：等於時算「還沒穿越」，最後一根嚴格大於（小於）才成立；null 不成立。
assert.equal(ts.crossUp([1, 3], [2, 2]), true);
assert.equal(ts.crossUp([2, 3], [2, 2]), true, 'prev equal counts as below');
assert.equal(ts.crossUp([1, 2], [2, 2]), false, 'last equal is not a cross');
assert.equal(ts.crossUp([3, 4], [2, 2]), false, 'already above');
assert.equal(ts.crossUp([null, 3], [2, 2]), false, 'null');
assert.equal(ts.crossUp([3], [2]), false, 'one bar');
assert.equal(ts.crossDown([3, 1], [2, 2]), true);
assert.equal(ts.crossDown([1, 0], [2, 2]), false);

// 收盤穿越均線：橫盤 10 後最後一根拉到 11。
assert.equal(ts.closeCrossAboveSma(bars([...Array(20).fill(10), 11]), 20), true);
assert.equal(ts.closeCrossAboveSma(bars(Array(21).fill(10)), 20), false);

// 布林進入上半／下半：中軌＝20 日均。
const flat = Array(19).fill(10);
const enterUp = bars([...flat, 9, 11]);      // 前一根 9 < 中軌、最後 11 ≥ 中軌
const enterDown = bars([...flat, 11, 9]);
const stayUp = bars([...flat, 11, 12]);
assert.equal(ts.bollingerEnterUpperHalf(enterUp), true, 'enter upper');
assert.equal(ts.bollingerEnterUpperHalf(enterDown), false);
assert.equal(ts.bollingerEnterUpperHalf(stayUp), false, 'already upper');
assert.equal(ts.bollingerEnterLowerHalf(enterDown), true, 'enter lower');
assert.equal(ts.bollingerEnterLowerHalf(enterUp), false);
assert.equal(ts.bollingerEnterLowerHalf(stayUp), false);
// 前一根剛好等於中軌、最後跌破算進入下半（不算進入上半）。
assert.equal(ts.bollingerEnterLowerHalf(bars([...Array(20).fill(10), 9])), true, 'prev equal mid → lower');
assert.equal(ts.bollingerEnterUpperHalf(enterUp.slice(-19)), false, 'too short');
assert.equal(ts.bollingerEnterUpperHalf(enterUp, 0), false, 'bad period');

// 量縮／量增：前 5 日均量 1000。
const vol = (today) => bars(Array(6).fill(10), [1000, 1000, 1000, 1000, 1000, today]);
assert.equal(ts.volumeShrink(vol(500)), true, 'shrink at ratio');
assert.equal(ts.volumeShrink(vol(501)), false);
assert.equal(ts.volumeShrink(vol(300), 5, 0.2), false, 'custom ratio');
assert.equal(ts.volumeShrink(vol(300).slice(1)), false, 'too short');
assert.equal(ts.volumeShrink(bars(Array(6).fill(10), [0, 0, 0, 0, 0, 0])), false, 'zero average');
assert.equal(ts.volumeSurge(vol(1500)), true);
assert.equal(ts.volumeSurge(vol(1499)), false);

// Page5 條件就是呼叫同一個函式，答案一致。
for (const [id, fn] of [['bb_enter_upper', ts.bollingerEnterUpperHalf], ['bb_enter_lower', ts.bollingerEnterLowerHalf]]) {
  for (const c of [enterUp, enterDown, stayUp]) assert.equal(filterFn[id](c), fn(c), id);
}
assert.equal(filterFn.volume_shrink(vol(500)), true);
assert.equal(filterFn.volume_shrink(vol(800)), false);
assert.equal(DEFAULT_FILTER_SETTINGS.volShrinkDays, 5);
assert.equal(DEFAULT_FILTER_SETTINGS.volShrinkRatio, 0.5);

// 抓日 K 上限：量 > 1000 張的才算，依量由大到小取前 N 檔。
const stocks = [{ code: 'a', volume: 2000 }, { code: 'b', volume: 900 }, { code: 'c', volume: 9000 }, { code: 'd', volume: 5000 }];
assert.deepEqual(historyCandidates(stocks, 2).map((s) => s.code), ['c', 'd']);
assert.deepEqual(historyCandidates(stocks).map((s) => s.code), ['c', 'd', 'a']);

// RSI 超賣反彈：RSI 由 30 以下向上穿出才成立（跌破 30 的那一根不算）。
const { rsi } = await import('../services/indicators.js');
const slide = [...Array.from({ length: 20 }, (_, i) => 100 - i * 2), ...Array.from({ length: 10 }, (_, i) => 62 + i * 2)];
const rsiValues = rsi(slide, 14);
const upAt = rsiValues.findIndex((v, i) => i > 0 && rsiValues[i - 1] <= 30 && v > 30);
assert.ok(upAt > 0, 'series crosses RSI 30 upward');
assert.equal(ts.rsiCrossAbove(bars(slide.slice(0, upAt + 1))), true);
assert.equal(ts.rsiCrossAbove(bars(slide.slice(0, upAt))), false);
