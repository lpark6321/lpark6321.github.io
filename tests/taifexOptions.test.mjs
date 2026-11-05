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
assert.deepEqual(rows[0], { contractMonth: '202611', strike: 44000, type: 'call', bid: 500, ask: 510, settle: 505, last: null, volume: 0, openInterest: 0 });
assert.equal(rows[2].ask, null, "'-' → null");
assert.equal(rows[3].bid, null, "'' → null");

const chain = buildChain(rows, '202611', 44050);
assert.equal(chain.underlying, 'TX');
assert.equal(chain.expiry, '2026-11-18');
assert.deepEqual(chain.calls.map((r) => r.strike), [44000, 44100]);
// 鏈上照實保留成交價、買賣價、結算價；取價優先序在 optionStrategy.chainPrice。
assert.deepEqual(chain.puts[0], { strike: 44000, last: null, bid: null, ask: null, settle: 300 });
assert.deepEqual(chain.calls[1], { strike: 44100, last: null, bid: 450, ask: null, settle: 455 });
assert.deepEqual(chain.puts[1], { strike: 44100, last: null, bid: null, ask: null, settle: null });
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


// 期交所 MIS 選擇權（代理精簡格式）：月選用 YYYYMM、週選用到期日當序列；成交價優先
const { parseMisOptions, parseMisFutures, parseMisIndex } = await import('../services/misQuotes.js');
const { chainPrice } = await import('../services/optionStrategy.js');
const misRows = parseMisOptions([
  ['TXO-Q', '', '41574.72', '42948.91', '', '', '345169'],
  ['TXO44000K6-O', '', '141.000', '53.000', '120.000', '140.000', '402'],
  ['TXO44000W6-O', '', '0.000', '300.000', '0.000', '0.000', '0'],
  ['TXU44000K6-O', '2026/11/06', '27.5', '3.4', '23', '28.5', '2387']
], new Date('2026-11-05T00:00:00Z'));
assert.deepEqual(misRows.map((r) => [r.contractMonth, r.type, r.strike, r.last]), [
  ['202611', 'call', 44000, 141], ['202611', 'put', 44000, null], ['TXU-2026-11-06', 'call', 44000, 27.5]
]);
assert.deepEqual(listExpiries(misRows).map((e) => [e.contractMonth, e.expiry, e.kind]), [
  ['TXU-2026-11-06', '2026-11-06', 'week-fri'], ['202611', '2026-11-18', 'month']
]);
const misChain = buildChain(misRows, '202611', 44000);
assert.equal(chainPrice(misChain, 'call', 44000, 'buy'), 141, '有成交用成交價');
assert.equal(chainPrice(misChain, 'call', 44000, 'sell'), 141);
assert.equal(chainPrice(misChain, 'put', 44000, 'buy'), 300, '沒成交也沒買賣價用參考價');

// 近月台指期：跳過現貨與遠月；沒有成交時 price 是 null
const fut = parseMisFutures([
  { SymbolID: 'TXF-S', CLastPrice: '41596.59' },
  { SymbolID: 'TXFL6-F', CLastPrice: '41917', CRefPrice: '43287' },
  { SymbolID: 'TXFK6-F', CLastPrice: '41816.00', CRefPrice: '43203.00', COpenPrice: '43013', CHighPrice: '43114', CLowPrice: '41751', CTotalVolume: '83674' }
]);
assert.deepEqual([fut.symbol, fut.price, fut.prevClose, fut.change, fut.volume], ['TXFK6-F', 41816, 43203, -1387, 83674]);
assert.equal(parseMisFutures([{ SymbolID: 'TXFK6-M', CLastPrice: '', CRefPrice: '41882' }]).price, null);
assert.equal(parseMisFutures([{ SymbolID: 'TXFA0-F', CLastPrice: '1' }, { SymbolID: 'TXFL9-F', CLastPrice: '2' }]).price, 2, '2029/12 比 2030/01 近');

// 加權：累積成交金額與每分鐘資料
const idx = parseMisIndex({ staticObj: { tz: '854873020980', tv: '13767845', tr: '3456951' }, ohlcArray: [{ c: '42596.43', s: '15729', t: '1793840520000' }, { c: '42551.59', s: '38693', t: '1793840460000' }] });
assert.equal(idx.amount, 854873020980);
assert.deepEqual(idx.minutes.map((m) => m.close), [42551.59, 42596.43], '依時間排序');
