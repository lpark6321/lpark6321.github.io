// 標頭通知中心的資料：當天的通知（型態提醒、資料延遲、連線問題，之後的大單提醒也用 pushNotice 送進來）。
// 每則 { at, kind, title, body, read, key? }，最新的在前；存在瀏覽器，台北日期換了就清空。
import { loadSetting, saveSetting } from '../data/storage.js';

const SETTING = 'notices';
const MAX_NOTICES = 200;
const listeners = new Set();

const taipeiDate = (now) => new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10);

let log = (() => {
  const saved = loadSetting(SETTING);
  return saved && typeof saved.date === 'string' && Array.isArray(saved.items) ? saved : { date: '', items: [] };
})();

function save() {
  saveSetting(SETTING, log);
  listeners.forEach((cb) => cb());
}

// 跨日（或第一次）就換一份空的。
function today(now) {
  const date = taipeiDate(now);
  if (log.date !== date) log = { date, items: [] };
  return log.items;
}

// key 有給的話同一天同 key 只記一次（例如重新整理後還原的型態提醒）；回傳是否有新增。
export function pushNotice({ kind = 'info', title = '', body = '', key = '' } = {}, now = Date.now()) {
  const items = today(now);
  if (key && items.some((item) => item.key === key)) return false;
  items.unshift({ at: now, kind, title: String(title), body: String(body), read: false, ...(key ? { key } : {}) });
  items.length = Math.min(items.length, MAX_NOTICES);
  save();
  return true;
}

// 回傳今天的通知複本（最新在前）。
export function getNotices(now = Date.now()) {
  return today(now).map((item) => ({ ...item }));
}

export function unreadCount(now = Date.now()) {
  return today(now).filter((item) => !item.read).length;
}

export function markAllRead(now = Date.now()) {
  today(now).forEach((item) => { item.read = true; });
  save();
}

export function clearNotices(now = Date.now()) {
  log = { date: taipeiDate(now), items: [] };
  save();
}

export function subscribeNotices(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
