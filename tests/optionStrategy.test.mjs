// 選擇權策略（services/optionStrategy.js）：損益、最大損益、損平點、取價、Greeks 單位。
import assert from 'node:assert/strict';

const st = await import('../services/optionStrategy.js');
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

// Long call 20000 @ 100 points: payoff in NTD (50/pt)
const longCall = [{ type: 'call', action: 'buy', strike: 20000, qty: 1, premium: 100 }];
assert.equal(st.payoffAt(longCall, 19000), -5000);
assert.equal(st.payoffAt(longCall, 20300), 10000);
let r = st.analyzeStrategy(longCall, 20000);
assert.equal(r.profitUnbounded, true);
assert.equal(r.maxLoss, -5000);
near(r.breakevens[0], 20100, 1, 'long call breakeven');
assert.equal(r.net, -5000);

// Short put: max profit = premium, loss bounded at price 0
r = st.analyzeStrategy([{ type: 'put', action: 'sell', strike: 20000, qty: 2, premium: 80 }], 20000);
assert.equal(r.maxProfit, 8000);
assert.equal(r.profitUnbounded, false);
assert.equal(r.lossUnbounded, false);
near(r.maxLoss, -(20000 - 80) * 2 * 50, 1, 'short put max loss at 0');

// Bull call spread 20000/20100 @ 120/65: max profit (100-55)*50, max loss -55*50
r = st.analyzeStrategy([
  { type: 'call', action: 'buy', strike: 20000, qty: 1, premium: 120 },
  { type: 'call', action: 'sell', strike: 20100, qty: 1, premium: 65 }
], 20000);
near(r.maxProfit, 45 * 50, 1e-6, 'spread max profit');
near(r.maxLoss, -55 * 50, 1e-6, 'spread max loss');
near(r.breakevens[0], 20055, 1, 'spread breakeven');

// Futures leg uses contract point value: 小台 50, 大台 200, 微台 10; short call above makes profit bounded? (covered call)
assert.equal(st.payoffAt([{ type: 'future', action: 'buy', strike: 20000, qty: 1, premium: 0, contract: 'TX' }], 20010), 2000);
assert.equal(st.payoffAt([{ type: 'future', action: 'buy', strike: 20000, qty: 1, premium: 0, contract: 'MTX' }], 20010), 500);
assert.equal(st.payoffAt([{ type: 'future', action: 'sell', strike: 20000, qty: 1, premium: 0, contract: 'TMF' }], 20010), -100);
r = st.analyzeStrategy([
  { type: 'future', action: 'buy', strike: 20000, qty: 1, premium: 0, contract: 'MTX' },
  { type: 'call', action: 'sell', strike: 20100, qty: 1, premium: 85 }
], 20000);
assert.equal(r.profitUnbounded, false);
near(r.maxProfit, (100 + 85) * 50, 1e-6, 'covered call max profit');
// Naked short future (TX) -> unlimited loss upward
assert.equal(st.analyzeStrategy([{ type: 'future', action: 'sell', strike: 20000, qty: 1, premium: 0, contract: 'TX' }], 20000).lossUnbounded, true);

// Chain pricing: buy at ask, sell at bid, fallback settle
const chain = { spotPrice: 20000, expiry: '2099-12-16', calls: [{ strike: 20000, bid: 110, ask: 115 }, { strike: 20100, bid: 0, ask: 0, settle: 70 }], puts: [] };
assert.equal(st.chainPrice(chain, 'call', 20000, 'buy'), 115);
assert.equal(st.chainPrice(chain, 'call', 20000, 'sell'), 110);
assert.equal(st.chainPrice(chain, 'call', 20100, 'buy'), 70);
assert.equal(st.chainPrice(chain, 'put', 20000, 'buy'), null);

// Greeks scale: long 1 call -> positive delta (元/點) between 0 and 50; short doubles sign
const g = st.legGreeks({ type: 'call', action: 'buy', strike: 20000, qty: 1, premium: 112 }, { ...chain, expiry: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) });
assert.ok(g.delta > 0 && g.delta < 50, `delta ${g.delta}`);
assert.ok(g.iv > 0 && g.iv < 1, `iv ${g.iv}`);
assert.ok(g.theta < 0, 'long option theta negative');
assert.equal(st.legGreeks({ type: 'future', action: 'sell', strike: 20000, qty: 2, premium: 0, contract: 'TX' }, chain).delta, -400);
