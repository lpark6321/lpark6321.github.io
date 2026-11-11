// 大單提醒（services/bigOrder.js）：內外盤判斷、門檻、訊息格式、期貨分鐘量累加與只提醒一次。
import assert from 'node:assert/strict';

const big = await import('../services/bigOrder.js');

// 內外盤
assert.equal(big.tradeSide({ price: 2400, bid: 2395, ask: 2400 }), '外盤');
assert.equal(big.tradeSide({ price: 2405, bid: 2395, ask: 2400 }), '外盤');
assert.equal(big.tradeSide({ price: 2395, bid: 2395, ask: 2400 }), '內盤');
assert.equal(big.tradeSide({ price: 2397, bid: 2395, ask: 2400 }), null);
assert.equal(big.tradeSide({ price: 2400 }), null);

// 門檻：個別覆寫，否則預設
assert.equal(big.resolveThreshold('2330', { 2330: 300 }), 300);
assert.equal(big.resolveThreshold('2317', { 2330: 300 }), big.DEFAULT_STOCK_THRESHOLD);
assert.equal(big.resolveThreshold('2317', {}, 50), 50);
assert.equal(big.resolveThreshold('2317', { 2317: 'x' }), big.DEFAULT_STOCK_THRESHOLD);

// 價格格式
assert.equal(big.formatPrice(2400.0), '2400');
assert.equal(big.formatPrice(1105.5), '1105.5');

// 個股大單：使用者範例訊息、低於門檻與不明略過、同一筆不重複
const t0 = Date.UTC(2026, 10, 5, 2, 31) / 1000; // 台北 10:31
const trades = [
  { time: t0, price: 2400, volume: 499, bid: 2395, ask: 2400 },
  { time: t0 + 1, price: 2395, volume: 120, bid: 2395, ask: 2400 },
  { time: t0 + 2, price: 2400, volume: 99, bid: 2395, ask: 2400 },
  { time: t0 + 3, price: 2397, volume: 800, bid: 2395, ask: 2400 },
  { time: t0, price: 2400, volume: 499, bid: 2395, ask: 2400 }
];
const alerts = big.stockBigOrders(trades, { code: '2330', name: '台積電', threshold: 100 });
assert.equal(alerts.length, 2);
assert.equal(alerts[0].message, '台積電外盤499張_2400元');
assert.equal(alerts[1].message, '台積電內盤120張_2395元');
assert.deepEqual(
  { kind: alerts[0].kind, code: alerts[0].code, side: alerts[0].side, volume: alerts[0].volume, price: alerts[0].price, time: alerts[0].time },
  { kind: 'stock', code: '2330', side: '外盤', volume: 499, price: 2400, time: t0 }
);

// 期貨一分鐘量：跨分鐘分開累加、每分鐘只提醒一次、未達門檻不提醒（日盤門檻 1500）
const fut = big.createMinuteVolumeTracker();
assert.equal(fut.push({ time: t0 + 5, volume: 800 }), null);
assert.equal(fut.push({ time: t0 + 65, volume: 900 }), null); // 10:32，不與 10:31 合併
const hit = fut.push({ time: t0 + 50, volume: 899 }); // 10:31 累計 1699
assert.equal(hit.message, '台指期一分鐘大量1699口');
assert.equal(hit.minute, '10:31');
assert.equal(hit.kind, 'futures');
assert.equal(hit.code, 'TXF');
assert.equal(hit.volume, 1699);
assert.equal(fut.push({ time: t0 + 59, volume: 500 }), null); // 同分鐘已提醒過
const next = fut.push({ time: t0 + 100, volume: 600 }); // 10:32 累計 1500
assert.equal(next.minute, '10:32');
assert.equal(next.volume, 1500);

// 日夜盤門檻依該筆時間判斷：台北 21:00 夜盤 400 口、凌晨 04:59 仍屬夜盤、10:31 日盤 1500 口
const night = Date.UTC(2026, 10, 5, 13, 0) / 1000; // 台北週四 21:00
assert.equal(big.futuresMinuteThreshold(night), 400);
assert.equal(big.futuresMinuteThreshold(Date.UTC(2026, 10, 5, 20, 59) / 1000), 400); // 台北週五 04:59
assert.equal(big.futuresMinuteThreshold(t0), 1500);
const nightFut = big.createMinuteVolumeTracker();
assert.equal(nightFut.push({ time: night, volume: 399 }), null);
assert.equal(nightFut.push({ time: night + 10, volume: 1 }).volume, 400);
// 自訂門檻
assert.equal(big.createMinuteVolumeTracker({ day: 10, night: 5 }).push({ time: night, volume: 5 }).volume, 5);
