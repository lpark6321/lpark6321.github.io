// 第四輪資料計算：期交所台指期日 K、三大法人持倉成本、漲跌停價與市場寬度、貢獻點數、Page1 的結算月 K／振幅統計／比前一日 K 棒。
import assert from 'node:assert/strict';

const hist = await import('../services/taifexHistory.js');
const breadth = await import('../services/marketBreadth.js');
const overview = await import('../services/marketOverview.js');
const series = await import('../pages/page1/page1Series.js');

const unix = (iso) => Date.parse(`${iso}T01:00:00Z`) / 1000;

// ---- 台指期近月日 K：結算日當天近月仍是到期那一檔；全日盤＝夜盤開＋日盤收、高低取兩段 ----
const raw = [
  ['2026-10-21', '202610', 'day', 100, 110, 95, 105, 10, 104],
  ['2026-10-21', '202611', 'day', 101, 111, 96, 106, 1, 106],
  ['2026-10-22', '202611', 'night', 107, 120, 100, 115, 5, null],
  ['2026-10-22', '202611', 'day', 116, 118, 90, 92, 8, 93],
  ['2026-10-22', '202612', 'day', 117, 119, 91, 93, 1, 94]
];
const day = hist.buildFuturesDaily(raw, 'day');
assert.deepEqual(day.map((row) => [row.date, row.contract, row.open, row.high, row.low, row.close]), [
  ['2026-10-21', '202610', 100, 110, 95, 105],
  ['2026-10-22', '202611', 116, 118, 90, 92]
]);
const full = hist.buildFuturesDaily(raw, 'full');
assert.deepEqual([full[1].open, full[1].high, full[1].low, full[1].close, full[1].volume], [107, 120, 90, 92, 13]);

// ---- 持倉成本：同向加碼加權平均、減碼成本不變、翻轉用當天價格 ----
// [日期, 身份, 交易淨口數, 交易淨額(千元), 未平倉淨口數, 未平倉淨額(千元)]；價格＝金額×1000÷(口數×200)
const amt = (qty, price) => (qty * price * 200) / 1000;
const inst = [
  ['2026-01-01', 'foreign', 0, 0, -100, amt(-100, 1000)],
  ['2026-01-02', 'foreign', -100, amt(-100, 1300), -200, amt(-200, 1300)],
  ['2026-01-05', 'foreign', 50, amt(50, 1200), -150, amt(-150, 1200)],
  ['2026-01-06', 'foreign', 250, amt(250, 1100), 100, amt(100, 1100)],
  ['2026-01-06', 'trust', 1, amt(1, 1), 5, amt(5, 1)]
];
const cost = hist.buildPositionCost(inst, 'foreign');
assert.deepEqual(cost.map((row) => Math.round(row.cost)), [1000, 1150, 1150, 1100]);
assert.deepEqual(cost.map((row) => row.change), [0, -100, 50, 250]);
assert.equal(cost.length, 4);

// ---- 漲跌停價落在跳動單位上 ----
assert.deepEqual(breadth.limitPrices(100), { up: 110, down: 90 });
assert.deepEqual(breadth.limitPrices(46.3), { up: 50.9, down: 41.7 });
assert.deepEqual(breadth.limitPrices(9.5), { up: 10.45, down: 8.55 });

const closes = Array.from({ length: 60 }, (_, i) => 50 + i * 0.1); // 緩漲，最後 55.9
const stats = breadth.summarizeBreadth([
  { price: 60, prevClose: 55.9, closes }, // 漲停以上（61.45 才是漲停）→ 只算上漲；創各期新高
  { price: 61.45, prevClose: 55.9, closes: [] }, // 漲停、沒有歷史
  { price: 50.35, prevClose: 55.9, closes }, // 跌停、創新低
  { price: 55.9, prevClose: 55.9, closes: closes.slice(0, 3) }, // 平盤、歷史不足
  { price: null, prevClose: 10 }
]);
assert.equal(stats.total, 4);
assert.deepEqual([stats.up, stats.down, stats.flat, stats.limitUp, stats.limitDown], [2, 1, 1, 1, 1]);
assert.equal(stats.withHistory, 2);
assert.deepEqual([stats.newHigh[5], stats.newHigh[60], stats.newHigh[120], stats.newLow[20]], [1, 1, 0, 1]);
assert.deepEqual(stats.above, { week: 1, month: 1, quarter: 1 });
assert.equal(stats.bullish, 1);

// ---- 貢獻點數 ----
const contrib = overview.indexContributions([
  { code: '2330', name: '台積電', taiexWeightPct: 40, changePct: 2 },
  { code: '2317', name: '鴻海', taiexWeightPct: 5, changePct: -1 },
  { code: '9999', name: '無權重', changePct: 5 }
], 20000);
assert.deepEqual(contrib.map((row) => [row.code, Math.round(row.points)]), [['2330', 160], ['2317', -10]]);
assert.deepEqual(overview.topWeightSummary(contrib, 1), { points: contrib[0].points, up: 1, down: 0, count: 1 });
assert.equal(overview.recentAverage([1, 2, 3, NaN, 4], 2), 3.5);

// ---- Page1：振幅統計（期海任我行：大大＝高於平均者的平均、小小＝低於平均者的平均） ----
assert.deepEqual(series.amplitudeStats([100, 200, 300, 400]), { max: 400, big: 350, avg: 250, small: 150, min: 100 });
assert.equal(series.amplitudeStats([]), null);

const candles = [
  ['2026-11-02', 10, 20, 5], ['2026-11-03', 10, 30, 10], ['2026-11-09', 10, 15, 12], ['2026-11-10', 10, 40, 20]
].map(([iso, open, high, low]) => ({ time: unix(iso), open, high, low, close: open }));
const week = series.periodAmplitudes(candles, 'W', '2026-11-11', { high: 45, low: 30 });
assert.deepEqual(week, { history: [25], current: 33 }); // 上週 30-5；本週 45-12
const dayAmp = series.periodAmplitudes(candles, 'D', '2026-11-11', { high: 45, low: 30 });
assert.deepEqual(dayAmp, { history: [15, 20, 3, 20], current: 15 });

// ---- 結算月 K：2026/10 的結算日是 10/21（第三個星期三），從 10/22 起算 ----
const monthRows = [
  ['2026-10-21', 100, 500, 50], ['2026-10-22', 200, 260, 190], ['2026-11-10', 250, 300, 180]
].map(([iso, open, high, low]) => ({ time: unix(iso), open, high, low, close: open }));
const month = series.settlementMonth(monthRows, '2026-11-11', { open: 280, high: 320, low: 270 });
assert.deepEqual(month, { since: '2026-10-22', open: 200, high: 320, low: 180, cost: 250 });

// ---- 比前一日 K 棒顏色 ----
const prev = { high: 100, low: 90 };
assert.equal(series.compareWithPrevDay({ high: 101, low: 95 }, prev), 'red');
assert.equal(series.compareWithPrevDay({ high: 99, low: 89 }, prev), 'green');
assert.equal(series.compareWithPrevDay({ high: 100, low: 90 }, prev), 'yellow');
assert.equal(series.compareWithPrevDay({ high: 101, low: 89 }, prev), 'grey');
assert.equal(series.compareWithPrevDay({ high: 101, low: 89 }, null), null);

// ---- 第五輪：持倉成本每個結算月從結算日重算（2026/01 結算日 1/21） ----
assert.equal(hist.settlementCycle('2026-01-20'), '2025-12');
assert.equal(hist.settlementCycle('2026-01-21'), '2026-01');
assert.equal(hist.settlementCycle('2026-11-10'), '2026-10');
const cycle = hist.buildPositionCost([
  ['2026-01-20', 'foreign', 0, 0, -100, amt(-100, 1000)],
  ['2026-01-21', 'foreign', -100, amt(-100, 1300), -200, amt(-200, 1250)],
  ['2026-01-22', 'foreign', -100, amt(-100, 1400), -300, amt(-300, 1300)]
], 'foreign');
assert.deepEqual(cycle.map((row) => Math.round(row.cost)), [1000, 1250, 1300]); // 1/21 重算：用當天未平倉均價
assert.deepEqual(cycle.map((row) => row.change), [0, -100, -100]);

// ---- 台指(全)＝前一晚夜盤＋日盤；新夜盤開始後就是夜盤 ----
const mis = await import('../services/misQuotes.js');
const dayQ = { price: 105, open: 100, high: 110, low: 99, volume: 10, date: '20261111' };
const nightQ = { price: 101, open: 95, high: 103, low: 90, volume: 5, date: '20261110' };
assert.deepEqual(mis.mergeFullSession(dayQ, nightQ), { ...dayQ, open: 95, high: 110, low: 90, volume: 15 });
assert.equal(mis.mergeFullSession(dayQ, { ...nightQ, date: '20261111' }).price, 101);
assert.equal(mis.mergeFullSession(dayQ, { price: null }), dayQ);

// ---- 籌碼監控組表 ----
const chips = await import('../services/chipMonitor.js');
assert.deepEqual(chips.buildSpotFlows([['2026-11-10', 1e8, -2e8, 3e8, 2e8]]), [{ date: '2026-11-10', foreign: 1, trust: -2, dealer: 3, total: 2 }]);
const oi = chips.buildOpenInterest([['2026-11-10', 'TX', 100], ['2026-11-10', 'MTX', 40], ['2026-11-10', 'TMF', 200], ['2026-11-11', 'TX', 1]]);
assert.deepEqual(oi, [{ date: '2026-11-10', TX: 100, MTX: 40, TMF: 200, total: 120 }]);
const instRows = (n) => ['foreign', 'trust', 'dealer'].map((id, i) => ['2026-11-10', id, 0, 0, n * (i + 1), 0]);
const instOi = chips.buildInstitutionalOI({ TXF: instRows(-100), MXF: instRows(40), TMF: instRows(200) });
assert.deepEqual(instOi[0].foreign, { TX: -100, MTX: 40, TMF: 200, total: -80 });
assert.equal(instOi[0].trust.total, -160);
const opt = chips.buildOptionInstitutional([['2026-11-10', 'call', 'foreign', 5, 3, 2, 150000], ['2026-11-10', 'put', 'foreign', 1, 4, -3, -50000]]);
assert.deepEqual(opt[0].foreign, { call: 2, callAmt: 1.5, put: -3, putAmt: -0.5 });
assert.deepEqual(chips.lastWithChange([{ date: 'a', v: 1 }, { date: 'b', v: 4 }], (row) => row.v), { value: 4, change: 3, date: 'b' });
assert.equal(chips.lastWithChange([], (row) => row.v), null);
const nineAm = Date.parse('2026-11-11T01:00:00Z') / 1000; // 台北 09:00
assert.deepEqual(chips.cumulativeMinutes([{ time: nineAm, volume: 100 }, { time: nineAm + 60, volume: 50 }]), [{ minute: 540, amountYi: 1 }, { minute: 541, amountYi: 1.5 }]);

// ---- 籌碼提醒 ----
const alerts = await import('../services/chipAlerts.js');
assert.equal(alerts.foreignOiNotice([{ date: 'd', netOI: -100, change: -4999 }]), null);
assert.equal(alerts.foreignOiNotice([{ date: 'd', netOI: -100, change: -5000 }]).key, 'chips|foreign-oi|d');
const history = Array.from({ length: 20 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, amountYi: 1000 }));
assert.equal(alerts.amountNotice({ volEstimate: 1600 }, history, '2026-11-11', 9 * 60 + 29), null);
assert.equal(alerts.amountNotice({ volEstimate: 1499 }, history, '2026-11-11', 600), null);
assert.match(alerts.amountNotice({ volEstimate: 1500 }, [...history, { date: '2026-11-11', amountYi: 1 }], '2026-11-11', 600).body, /1\.50 倍/);
