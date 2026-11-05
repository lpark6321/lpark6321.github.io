// services/taifexOptions.js：到期日推算、盤別篩選、缺值、結算價備援、到期序列挑選。
import assert from 'node:assert/strict';
import { parseTxoReport, contractExpiry, listExpiries, pickExpiry, buildChain } from '../services/taifexOptions.js';

const row = (month, strike, callPut, bid, ask, settle, session = '一般', contract = 'TXO') => ({
  Date: '20261103', Contract: contract, 'ContractMonth(Week)': month, StrikePrice: String(strike), CallPut: callPut,
  Open: '-', High: '-', Low: '-', Close: '-', Volume: '0', SettlementPrice: settle, OpenInterest: '0',
  BestBid: bid, BestAsk: ask, HistoricalHigh: '-', HistoricalLow: '-', TradingHalt: '', TradingSession: session
});

// 2026-11-01 是星期日：第一個星期三 11/4、第一個星期五 11/6。
assert.equal(contractExpiry('202611'), '2026-11-18');
assert.equal(contractExpiry('202611W1'), '2026-11-04');
assert.equal(contractExpiry('202611W2'), '2026-11-11');
assert.equal(contractExpiry('202611F1'), '2026-11-06');
assert.equal(contractExpiry('202612'), '2026-12-16');
assert.equal(contractExpiry('bad'), null);
// 2026-02-18 第三個星期三是春節休市，順延到下一個交易日（不是 2/18）。
assert.ok(contractExpiry('202602') > '2026-02-18');

const json = [
  row('202611', 44000, '買權', '500', '510', '505'),
  row('202611', 44000, '賣權', '-', '-', '300'),
  row('202611', 44100, '買權', '450', '-', '455'),
  row('202611', 44100, '賣權', '', '', '-'),
  row('202611', 44000, '買權', '1', '2', '3', '盤後'),
  row('202611', 44000, '買權', '1', '2', '3', '一般', 'TEO'),
  row('202611W1', 44000, '買權', '90', '95', '92'),
  row('202611F1', 44000, '買權', '120', '125', '122'),
  row('202612', 44000, '買權', '900', '910', '905')
];

const rows = parseTxoReport(json);
assert.equal(rows.length, 7, '只留 TXO 日盤');
assert.equal(parseTxoReport(json, { session: '盤後' }).length, 1);
assert.deepEqual(rows[0], { contractMonth: '202611', strike: 44000, type: 'call', bid: 500, ask: 510, settle: 505, close: null, volume: 0, openInterest: 0 });
assert.equal(rows[2].ask, null, "'-' → null");
assert.equal(rows[3].bid, null, "'' → null");

const chain = buildChain(rows, '202611', 44050);
assert.equal(chain.underlying, 'TX');
assert.equal(chain.expiry, '2026-11-18');
assert.deepEqual(chain.calls.map((r) => r.strike), [44000, 44100]);
assert.deepEqual(chain.puts[0], { strike: 44000, bid: 300, ask: 300, settle: 300 }, '買賣價都缺用結算價');
assert.deepEqual(chain.calls[1], { strike: 44100, bid: 450, ask: null, settle: 455 }, '只缺一邊照實留 null');
assert.deepEqual(chain.puts[1], { strike: 44100, bid: null, ask: null, settle: null });
assert.deepEqual(buildChain(rows, '202611', 44000, { range: 0 }).calls.map((r) => r.strike), [44000], '只留價平');

const expiries = listExpiries(rows);
assert.deepEqual(expiries.map((e) => [e.contractMonth, e.kind]), [
  ['202611W1', 'week-wed'], ['202611F1', 'week-fri'], ['202611', 'month'], ['202612', 'month']
]);
assert.equal(pickExpiry(expiries, '2026-11-04').contractMonth, '202611W1', '到期日當天仍可選');
assert.equal(pickExpiry(expiries, '2026-11-05').contractMonth, '202611F1');
assert.equal(pickExpiry(expiries, '2026-11-05', 'month').contractMonth, '202611');
assert.equal(pickExpiry(expiries, '2026-11-19', 'month').contractMonth, '202612');
assert.equal(pickExpiry(expiries, '2027-01-01'), null);

