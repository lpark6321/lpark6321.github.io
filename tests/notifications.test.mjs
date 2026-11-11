// 通知中心（services/notifications.js）：最新在前、未讀數、同 key 不重複、全部已讀、清除、跨日清空。
import assert from 'node:assert/strict';

const n = await import('../services/notifications.js');

const day1 = Date.parse('2026-11-05T10:00:00+08:00');
const day2 = Date.parse('2026-11-06T00:00:01+08:00');

n.clearNotices(day1);
let calls = 0;
const unsub = n.subscribeNotices(() => { calls += 1; });
assert.equal(n.pushNotice({ kind: 'delay', title: '資料延遲' }, day1), true);
assert.equal(n.pushNotice({ kind: 'pattern', title: '2330', body: 'MA20 突破', key: 'p|2330' }, day1 + 1000), true);
assert.equal(n.pushNotice({ kind: 'pattern', title: '2330', key: 'p|2330' }, day1 + 2000), false);
assert.equal(calls, 2);
assert.deepEqual(n.getNotices(day1).map((item) => item.kind), ['pattern', 'delay']);
assert.equal(n.unreadCount(day1), 2);
n.markAllRead(day1);
assert.equal(n.unreadCount(day1), 0);
n.pushNotice({ kind: 'connection', title: '連不上' }, day1);
assert.equal(n.unreadCount(day1), 1);

// 跨日：前一天的全部清掉
assert.equal(n.getNotices(day2).length, 0);
n.pushNotice({ kind: 'delay', title: 'x' }, day2);
n.clearNotices(day2);
assert.equal(n.getNotices(day2).length, 0);
unsub();
