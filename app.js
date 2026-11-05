// 主儀表板外殼（index_hide.html）：分頁路由、右上角的資料來源／更新頻率／手動更新、台股狀態倒數、服務連線狀態、
// 設定備份／還原與鍵盤快捷鍵（1–7 切頁、R 手動更新）。
import {
  DASHBOARD_DATA_SOURCES,
  POLL_INTERVAL_OPTIONS,
  getDashboardDataSource,
  getDashboardDataSourceLabel,
  getPollIntervalSeconds,
  setDashboardDataSource,
  setPollIntervalSeconds,
  sourceInfo,
  subscribeDashboardDataSource,
  subscribePollInterval
} from './services/dashboardDataSource.js';
import { store } from './data/store.js';
import { exportSettings, importSettings } from './data/storage.js';
import { TW_HOLIDAY_YEARS } from './data/twMarketHolidays.js';
import { subscribeSecond } from './services/feedClock.js';
import { esc } from './services/html.js';
import { createFilePicker, downloadJson } from './services/jsonFile.js';
import { getTwMarketStatus, isTwQuoteSession } from './services/marketCalendar.js';
import { refreshMarketFeed, startMarketFeed } from './services/marketFeed.js';
import { SERVICE_LABELS, failingServices, subscribeHealth } from './services/serviceHealth.js';

const app = document.getElementById('app');
const tabs = [...document.querySelectorAll('.tabbar__tab')];
const dataSourceSelect = document.getElementById('dashboard-data-source');
const pollSelect = document.getElementById('dashboard-poll-interval');
const dataSourceStatus = document.getElementById('dashboard-data-source-status');
const marketStatus = document.getElementById('dashboard-market-status');
const healthStatus = document.getElementById('dashboard-health');
const manualRefreshButton = document.getElementById('dashboard-manual-refresh');
let manualRefreshRunning = false;
let manualRefreshStatus = '';
let manualRefreshStatusTimer = null;
let lastUpdatedAt = NaN;

const pageModules = {
  page1: () => import('./pages/page1/page1.js'),
  page2: () => import('./pages/page2/page2.js'),
  page3: () => import('./pages/page3/page3.js'),
  page4: () => import('./pages/page4/page4.js'),
  page5: () => import('./pages/page5/page5.js'),
  page6: () => import('./pages/page6/page6.js'),
  page7: () => import('./pages/page7/page7.js')
};
const PAGE_KEYS = Object.keys(pageModules);

// ---- 資料來源、更新頻率、手動更新 ----

// 選項只建一次；之後只改選取值，避免重繪時把使用者正打開的下拉選單整個換掉。
dataSourceSelect.innerHTML = DASHBOARD_DATA_SOURCES
  .map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`)
  .join('');
pollSelect.innerHTML = POLL_INTERVAL_OPTIONS
  .map((seconds) => `<option value="${seconds}">${seconds} 秒</option>`)
  .join('');

function renderDataSourceControl() {
  dataSourceSelect.value = getDashboardDataSource();
  pollSelect.value = String(getPollIntervalSeconds());
  renderStatusText();
}

function renderStatusText() {
  const source = getDashboardDataSource();
  let status = `全站共用：${getDashboardDataSourceLabel(source)}`;
  if (sourceInfo(source).feed) {
    const paused = source === 'yahoo' && !isTwQuoteSession() ? '（台股非交易時段暫停）' : '';
    const updated = Number.isFinite(lastUpdatedAt)
      ? `最後更新 ${new Date(lastUpdatedAt).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}`
      : '尚未更新';
    status = `每 ${getPollIntervalSeconds()} 秒更新${paused}｜${updated}`;
  }
  dataSourceStatus.textContent = manualRefreshStatus ? `${status}｜${manualRefreshStatus}` : status;
  manualRefreshButton.disabled = !sourceInfo(source).feed || manualRefreshRunning;
  manualRefreshButton.textContent = manualRefreshRunning ? '更新中' : '手動更新';
}

function setManualRefreshStatus(message, clearDelay = 0) {
  manualRefreshStatus = message;
  clearTimeout(manualRefreshStatusTimer);
  if (clearDelay > 0) {
    manualRefreshStatusTimer = setTimeout(() => {
      manualRefreshStatus = '';
      renderStatusText();
    }, clearDelay);
  }
  renderStatusText();
}

// 切換來源時 marketFeed 會自己立刻抓一輪；這個按鈕只是不等下一個節拍。
async function refreshNow() {
  if (manualRefreshRunning || !sourceInfo().feed) return;
  manualRefreshRunning = true;
  setManualRefreshStatus('手動更新中');
  const ok = await refreshMarketFeed();
  manualRefreshRunning = false;
  setManualRefreshStatus(ok ? '手動更新完成' : '手動更新失敗', ok ? 1800 : 2500);
}

dataSourceSelect.addEventListener('change', () => setDashboardDataSource(dataSourceSelect.value));
pollSelect.addEventListener('change', () => setPollIntervalSeconds(pollSelect.value));
manualRefreshButton.addEventListener('click', refreshNow);

subscribeDashboardDataSource(() => {
  renderDataSourceControl();
  renderHealth();
});
subscribePollInterval(renderDataSourceControl);
// 「最後更新」取所有行情裡最新的一筆（DDE 收盤後只有期貨在更新，不能只看加權）；切換來源清空後回到「尚未更新」。
const UPDATE_KEYS = ['taiex', 'futuresDay', 'futuresFull', 'topStocks', 'globalIndices'];
const updatedAt = (value) => (Array.isArray(value)
  ? Math.max(0, ...value.map((row) => row.sourceUpdatedAt || 0))
  : value?.sourceUpdatedAt || 0);
UPDATE_KEYS.forEach((key) => store.subscribe(key, () => {
  lastUpdatedAt = Math.max(...UPDATE_KEYS.map((k) => updatedAt(store.get(k)))) || NaN;
  renderStatusText();
}));

// ---- 台股狀態與倒數（每秒）；休市表沒有今年時提醒重算設定檔 ----

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAY_ZH = '日一二三四五六';

function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

// 超過一天就寫日期時間，例如「11/09（一）09:00」。
function formatNextTime(at) {
  const t = new Date(at + 8 * 3600 * 1000);
  return `${t.getUTCMonth() + 1}/${t.getUTCDate()}（${WEEKDAY_ZH[t.getUTCDay()]}）${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function renderMarketStatus(now = new Date()) {
  const status = getTwMarketStatus(now.getTime());
  const left = status.next.at - now.getTime();
  const what = status.next.type === 'open' ? '開盤' : '收盤';
  const when = left < 86400000 ? `距${what} ${formatCountdown(left)}` : `下次${what} ${formatNextTime(status.next.at)}`;
  const reason = status.reason ? `（${status.reason}）` : '';
  marketStatus.textContent = `台股 ${status.label}${reason}｜${when}`;
  marketStatus.dataset.state = status.state;
  renderStatusText(); // 「非交易時段暫停」在開收盤時自動切換
}

subscribeSecond(renderMarketStatus);
renderMarketStatus();

// ---- 服務連線狀態（F1）；休市表過期提醒（F2） ----

const isOnlineSite = location.hostname.endsWith('github.io');
const taipeiYear = () => new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();

function renderHealth() {
  // 券商橋接只有在選了橋接來源時才算數（切走之後舊的失敗不再提示）。
  const failing = failingServices().filter((name) => name !== 'bridge' || sourceInfo().bridge);
  const notes = [];
  if (failing.length) {
    const labels = failing.map((name) => (name === 'bridge' ? `${SERVICE_LABELS.bridge}（${new URL(sourceInfo().bridge).port}）` : SERVICE_LABELS[name]));
    notes.push(`連不上：${labels.join('、')}`);
    if (failing.includes('proxy') && isOnlineSite) notes.push('線上版需要在本機執行 GIO.cmd');
  }
  if (!TW_HOLIDAY_YEARS.includes(taipeiYear())) notes.push(`休市表沒有 ${taipeiYear()} 年，需要重算設定檔（data/config/README.md）`);
  healthStatus.textContent = notes.join('｜');
  healthStatus.hidden = !notes.length;
}

subscribeHealth(renderHealth);
renderHealth();

// ---- 設定備份／還原：匯出所有瀏覽器設定成一個檔，還原後重新載入讓各頁重新讀取 ----

document.getElementById('dashboard-settings-export').addEventListener('click', () => {
  downloadJson(`dashboard-settings-${new Date().toISOString().slice(0, 10)}.json`, exportSettings());
});
const openSettingsFile = createFilePicker(async (file) => {
  try {
    const count = importSettings(JSON.parse(await file.text()));
    if (confirm(`已還原 ${count} 項設定，重新載入頁面後生效。現在重新載入？`)) location.reload();
  } catch (error) {
    alert(`還原失敗：${error.message}`);
  }
});
document.getElementById('dashboard-settings-import').addEventListener('click', openSettingsFile);

renderDataSourceControl();
startMarketFeed();

// ---- 分頁路由 ----

let activePage = null;
let activeUnmount = null;
let navigationSeq = 0;

function setActiveTab(page) {
  tabs.forEach((tab) => {
    const isActive = tab.dataset.page === page;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
}

function normalize(hash) {
  const key = (hash || '').replace('#', '');
  return key in pageModules ? key : 'page1';
}

async function navigate(page, { pushHash = true } = {}) {
  if (page === activePage) return;
  const seq = ++navigationSeq;

  const unmount = activeUnmount;
  activeUnmount = null;
  try {
    if (typeof unmount === 'function') unmount();
  } catch (err) {
    // 前一頁清理失敗也要能切頁，否則會一直卡在同一頁。
    console.error(err);
  }

  app.innerHTML = '';
  activePage = page;
  setActiveTab(page);

  try {
    const mod = await pageModules[page]();
    // 模組載入期間使用者又切了頁：放棄這次掛載，否則兩頁會疊在一起且前一頁的清理函式遺失。
    if (seq !== navigationSeq) return;
    if (typeof mod.mount !== 'function') {
      throw new Error(`${page} is missing mount()`);
    }
    if (pushHash && location.hash !== `#${page}`) {
      location.hash = `#${page}`;
    }
    activeUnmount = mod.mount(app) || null;
  } catch (err) {
    console.error(err);
    if (seq === navigationSeq) {
      app.innerHTML = `<section class="panel"><div class="panel__body">Failed to load ${esc(page)}</div></section>`;
    }
  }
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => navigate(tab.dataset.page));
});

window.addEventListener('hashchange', () => {
  navigate(normalize(location.hash), { pushHash: false });
});

// 快捷鍵：1–7 切頁、R 手動更新；在輸入框裡打字或按著 Ctrl/Alt/Meta 時不攔。
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
  if (event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
  const page = PAGE_KEYS[Number(event.key) - 1];
  if (page) navigate(page);
  else if (event.key === 'r' || event.key === 'R') refreshNow();
});

const initial = normalize(location.hash);
if (location.hash !== `#${initial}`) {
  history.replaceState(null, '', `#${initial}`);
}
navigate(initial, { pushHash: false });
