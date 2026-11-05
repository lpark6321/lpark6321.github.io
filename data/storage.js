// 瀏覽器設定的唯一讀寫點（localStorage）：鍵名統一為 gio.<名稱>，值一律存 JSON；瀏覽器不給存時讀回預設值、寫入靜默失敗。
// 讀出來的值由各模組自己驗證（例如 sanitizeWatchlist），這裡只負責存取與「設定備份／還原」。
const PREFIX = 'gio.';

// 名稱 → 舊版鍵名。shortcut: 讀不到新鍵時沿用舊鍵一次、寫入時刪掉舊鍵；大家都開過新版後可以把這張表拿掉。
const LEGACY_KEYS = {
  dataSource: 'dashboard.dataSource',
  pollSeconds: 'dashboard.pollSeconds',
  watchlist: 'tw_watchlist',
  strategyLegs: 'tw_strategy_legs',
  enabledPatterns: 'tw_patterns_enabled',
  patternNotify: 'tw_pattern_notify',
  screenFilters: 'tw_screen_filters',
  page1Levels: 'tw_p1_levels'
};

// 會進備份檔的設定（當日型態提醒這種資料不算設定，不備份）。
export const BACKUP_KEYS = [...Object.keys(LEGACY_KEYS), 'watchGroups'];
const BACKUP_APP = 'gio-dashboard-settings';

const storage = () => globalThis.localStorage;

function readRaw(name) {
  try {
    return storage()?.getItem(PREFIX + name) ?? (LEGACY_KEYS[name] ? storage()?.getItem(LEGACY_KEYS[name]) : null) ?? null;
  } catch {
    return null;
  }
}

// 沒存過或讀不到回傳 fallback；舊版存的非 JSON 字串（例如資料來源 'yahoo'）原樣回傳。
export function loadSetting(name, fallback = null) {
  const raw = readRaw(name);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function saveSetting(name, value) {
  try {
    storage()?.setItem(PREFIX + name, JSON.stringify(value));
    if (LEGACY_KEYS[name]) storage()?.removeItem(LEGACY_KEYS[name]);
  } catch {
    // 無痕視窗或封鎖網站資料時存不了，只影響下次開啟。
  }
}

export function exportSettings() {
  const settings = {};
  BACKUP_KEYS.forEach((name) => {
    const value = loadSetting(name);
    if (value !== null) settings[name] = value;
  });
  return { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), settings };
}

// 只寫入認得的設定名稱，內容等重新載入頁面時由各模組驗證；回傳寫入幾項。格式不對丟例外，訊息給畫面顯示。
export function importSettings(data) {
  if (data?.app !== BACKUP_APP || !data.settings || typeof data.settings !== 'object') {
    throw new Error('不是儀表板的設定備份檔');
  }
  const names = BACKUP_KEYS.filter((name) => name in data.settings);
  names.forEach((name) => saveSetting(name, data.settings[name]));
  return names.length;
}
