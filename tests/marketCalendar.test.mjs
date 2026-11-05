// 台股交易時段與休市日（services/marketCalendar.js）。
import assert from 'node:assert/strict';

const { isTwFuturesDaySession, isTwFuturesNightSession: night, isTwQuoteSession, isTwMarketHoliday } = await import('../services/marketCalendar.js');
const tpe = (s) => Date.parse(`${s}+08:00`);

assert.equal(isTwQuoteSession(tpe('2026-11-04T10:00:00')), true, 'normal Wednesday');
assert.equal(isTwQuoteSession(tpe('2026-02-16T10:00:00')), false, 'Lunar New Year');
assert.equal(isTwQuoteSession(tpe('2026-02-12T10:00:00')), false, 'settlement-only day');
assert.equal(isTwQuoteSession(tpe('2026-02-11T10:00:00')), true, 'last trading day before LNY');
assert.equal(isTwQuoteSession(tpe('2026-02-23T09:00:00')), true, 'first trading day after LNY');
assert.equal(isTwQuoteSession(tpe('2026-10-09T10:00:00')), false, 'National Day make-up holiday (Fri)');
assert.equal(isTwQuoteSession(tpe('2026-12-25T13:35:00')), false, 'Constitution Day');
assert.equal(isTwFuturesDaySession(tpe('2026-05-01T08:45:00')), false, 'Labour Day futures day session');
assert.equal(isTwMarketHoliday(tpe('2026-01-01T00:00:00')), true, 'holiday starts at Taipei midnight');
assert.equal(isTwMarketHoliday(tpe('2025-12-31T23:59:00')), false, 'day before is not');
assert.equal(night(tpe('2026-02-26T20:00:00')), true, 'night session on trading day before holiday');
assert.equal(night(tpe('2026-02-27T02:00:00')), true, 'early hours belong to the 02-26 session');
assert.equal(night(tpe('2026-02-27T20:00:00')), false, 'no night session starting on a holiday');
assert.equal(night(tpe('2026-02-28T02:00:00')), false, 'early hours after a holiday evening');

// 標頭的台股狀態：盤前／盤中／收盤／休市（附原因）與下一個開收盤時間。
const { getTwMarketStatus } = await import('../services/marketCalendar.js');
const status = (s) => {
  const r = getTwMarketStatus(tpe(s));
  return [r.label, r.reason, r.next.type, new Date(r.next.at + 8 * 3600e3).toISOString().slice(0, 16)];
};
assert.deepEqual(status('2026-11-05T08:30:00'), ['盤前', '', 'open', '2026-11-05T09:00']);
assert.deepEqual(status('2026-11-05T10:00:00'), ['盤中', '', 'close', '2026-11-05T13:30']);
assert.deepEqual(status('2026-11-05T13:30:00'), ['收盤', '', 'open', '2026-11-06T09:00']);
assert.deepEqual(status('2026-11-06T20:00:00'), ['收盤', '', 'open', '2026-11-09T09:00'], 'Friday evening -> Monday');
assert.deepEqual(status('2026-11-07T10:00:00'), ['休市', '週六', 'open', '2026-11-09T09:00']);
assert.deepEqual(status('2026-01-01T10:00:00'), ['休市', '中華民國開國紀念日', 'open', '2026-01-02T09:00']);
assert.deepEqual(status('2026-02-11T15:00:00'), ['收盤', '', 'open', '2026-02-23T09:00'], 'skips Lunar New Year');

// 台指期狀態：日盤、休息、夜盤（跨午夜）、週末與連假
const { getTwFuturesStatus } = await import('../services/marketCalendar.js');
const fut = (s) => {
  const r = getTwFuturesStatus(tpe(s));
  return [r.label, r.next.type, new Date(r.next.at + 8 * 3600e3).toISOString().slice(0, 16)];
};
assert.deepEqual(fut('2026-11-05T08:30:00'), ['盤前', 'open', '2026-11-05T08:45']);
assert.deepEqual(fut('2026-11-05T10:00:00'), ['日盤', 'close', '2026-11-05T13:45']);
assert.deepEqual(fut('2026-11-05T14:00:00'), ['休息', 'open', '2026-11-05T15:00']);
assert.deepEqual(fut('2026-11-05T20:00:00'), ['夜盤', 'close', '2026-11-06T05:00']);
assert.deepEqual(fut('2026-11-07T03:00:00'), ['夜盤', 'close', '2026-11-07T05:00'], '週五夜盤到週六清晨');
assert.deepEqual(fut('2026-11-07T10:00:00'), ['休市', 'open', '2026-11-09T08:45']);
assert.deepEqual(fut('2026-02-11T20:00:00'), ['夜盤', 'close', '2026-02-12T05:00'], '連假前最後交易日仍有夜盤');
assert.deepEqual(fut('2026-02-12T10:00:00'), ['休市', 'open', '2026-02-23T08:45']);
