// 瀏覽器設定（data/storage.js）：鍵名、舊鍵相容、備份與還原。用假的 localStorage。
import assert from 'node:assert/strict';

const backing = new Map();
globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => backing.set(key, String(value)),
  removeItem: (key) => backing.delete(key)
};
const { exportSettings, importSettings, loadSetting, saveSetting } = await import('../data/storage.js');

try {
  // 舊版鍵：非 JSON 字串原樣讀回；寫入新鍵後刪掉舊鍵
  backing.set('dashboard.dataSource', 'yahoo');
  backing.set('tw_pattern_notify', '1');
  assert.equal(loadSetting('dataSource'), 'yahoo');
  assert.equal(loadSetting('patternNotify'), 1);
  saveSetting('dataSource', 'mock');
  assert.equal(backing.get('gio.dataSource'), '"mock"');
  assert.equal(backing.has('dashboard.dataSource'), false);
  assert.equal(loadSetting('nothing', 'fallback'), 'fallback');

  // 備份只含設定（不含當日提醒），還原只寫認得的名稱
  saveSetting('watchlist', [{ code: '2330', name: '台積電', group: '自選1' }]);
  saveSetting('patternAlerts', { date: '2026-11-05', alerts: [] });
  const backup = exportSettings();
  assert.equal(backup.app, 'gio-dashboard-settings');
  assert.deepEqual(Object.keys(backup.settings).sort(), ['dataSource', 'patternNotify', 'watchlist']);
  backing.clear();
  assert.equal(importSettings({ ...backup, settings: { ...backup.settings, evil: 1 } }), 3);
  assert.equal(backing.has('gio.evil'), false);
  assert.deepEqual(loadSetting('watchlist'), backup.settings.watchlist);
  assert.throws(() => importSettings([1, 2]), /不是儀表板的設定備份檔/);
} finally {
  delete globalThis.localStorage;
}
