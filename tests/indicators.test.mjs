// 技術指標（services/indicators.js）與 Black-Scholes（services/blackScholes.js）對照手算／參考值。
import assert from 'node:assert/strict';

const ind = await import('../services/indicators.js');
const bs = await import('../services/blackScholes.js');
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

// SMA / EMA
assert.deepEqual(ind.sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
const e = ind.ema([1, 2, 3, 4, 5], 3);
assert.deepEqual(e.slice(0, 2), [null, null]);
near(e[2], 2, 1e-12, 'ema seed');
near(e[3], 3, 1e-12, 'ema step'); // 4*0.5 + 2*0.5
near(e[4], 4, 1e-12, 'ema step2');

// RSI: monotonically rising -> 100; alternating equal moves -> 50
assert.equal(ind.rsi([1, 2, 3, 4, 5, 6], 3)[5], 100);
near(ind.rsi([10, 11, 10, 11, 10, 11, 10], 2)[6], 50 - 0, 50, 'rsi bounded'); // sanity: within 0..100
const alt = ind.rsi([10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11], 14);
near(alt[14], 50, 1e-9, 'rsi alternating = 50');

// KD: flat market -> RSV 50 -> K, D stay 50
const flat = Array.from({ length: 12 }, () => ({ high: 10, low: 10, close: 10 }));
const kdFlat = ind.kd(flat);
near(kdFlat.k[11], 50, 1e-9, 'kd flat k');
near(kdFlat.d[11], 50, 1e-9, 'kd flat d');
// close at 9-day high -> RSV 100 -> K = 2/3*50 + 100/3
const up = Array.from({ length: 9 }, (_, i) => ({ high: 10 + i, low: 9 + i, close: 10 + i }));
near(ind.kd(up).k[8], 2 / 3 * 50 + 100 / 3, 1e-9, 'kd first k');

// Bollinger on constant series: bands collapse to the mean
const bb = ind.bollinger(Array(20).fill(5));
near(bb.upper[19], 5, 1e-12, 'bb upper');
near(bb.lower[19], 5, 1e-12, 'bb lower');

// MACD of a constant series is 0
const m = ind.macd(Array(40).fill(100));
near(m.dif[39], 0, 1e-9, 'macd dif');
near(m.signal[39], 0, 1e-9, 'macd signal');

// Pivots: H=110 L=90 C=100 -> P=100, R1=110, S1=90, R2=120, S2=80, R3=130, S3=70
const pv = ind.pivotLevels({ high: 110, low: 90, close: 100 });
assert.deepEqual([pv.pivot, ...pv.resistance, ...pv.support], [100, 110, 120, 130, 90, 80, 70]);

// Black-Scholes reference: S=100 K=100 T=1 r=0.05 sigma=0.2 -> call 10.4506, put 5.5735, call delta 0.6368
near(bs.bsPrice('call', 100, 100, 1, 0.2, 0.05), 10.4506, 1e-3, 'bs call');
near(bs.bsPrice('put', 100, 100, 1, 0.2, 0.05), 5.5735, 1e-3, 'bs put');
const g = bs.bsGreeks('call', 100, 100, 1, 0.2, 0.05);
near(g.delta, 0.6368, 1e-3, 'delta');
near(g.gamma, 0.018762, 1e-5, 'gamma');
near(g.vega, 0.37524, 1e-4, 'vega per 1%');
near(g.theta, -6.414 / 365, 1e-4, 'theta per day');
// put-call parity on greeks: put delta = call delta - 1
near(bs.bsGreeks('put', 100, 100, 1, 0.2, 0.05).delta, g.delta - 1, 1e-9, 'put delta');
// implied vol round trip
near(bs.impliedVol('call', 10.4506, 100, 100, 1, 0.05), 0.2, 1e-4, 'iv round trip');
assert.equal(bs.impliedVol('call', 10, 100, 50, 0.5, 0.05), null, 'premium below intrinsic -> null');
near(bs.impliedVol('put', bs.bsPrice('put', 100, 110, 0.25, 0.35, 0.05), 100, 110, 0.25, 0.05), 0.35, 1e-4, 'put iv round trip');
// expiry helper
assert.equal(bs.yearsToExpiry('2020-01-01'), 0);
