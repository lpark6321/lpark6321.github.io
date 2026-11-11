// 主儀表板外殼（index_hide.html）：分頁路由、標頭的資料來源／更新頻率／手動更新、台股與期貨狀態倒數、
// 提示（服務連不上、資料延遲、設定檔過期）、通知中心（鈴鐺）、「⋯」選單（設定備份／還原）與鍵盤快捷鍵（1–8 切頁、R 手動更新）。
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
import { TAIEX_DATA_DATE } from './data/taiexWeightedConstituents.js';
import { subscribeSecond } from './services/feedClock.js';
import { esc } from './services/html.js';
import { createFilePicker, downloadJson } from './services/jsonFile.js';
import {
  getTwFuturesStatus,
  getTwMarketStatus,
  isTwFuturesDaySession,
  isTwFuturesNightSession,
  isTwQuoteSession
} from './services/marketCalendar.js';
import { refreshMarketFeed, startMarketFeed } from './services/marketFeed.js';
import { amountNotice, foreignOiNotice } from './services/chipAlerts.js';
import { DISK_CACHE_GROUPS, diskCacheEnabled, setDiskCache } from './services/chipMonitor.js';
import { clearNotices, getNotices, markAllRead, pushNotice, subscribeNotices, unreadCount } from './services/notifications.js';
import { SERVICE_LABELS, failingServices, subscribeHealth } from './services/serviceHealth.js';

const app = document.getElementById('app');
const tabs = [...document.querySelectorAll('.tabbar__tab')];
const dataSourceSelect = document.getElementById('dashboard-data-source');
const pollSelect = document.getElementById('dashboard-poll-interval');
const dataSourceStatus = document.getElementById('dashboard-data-source-status');
const marketStatus = document.getElementById('dashboard-market-status');
const futuresStatus = document.getElementById('dashboard-futures-status');
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
  page7: () => import('./pages/page7/page7.js'),
  page8: () => import('./pages/page8/page8.js')
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
    const updated = Number.isFinite(lastUpdatedAt)
      ? `更新 ${new Date(lastUpdatedAt).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}`
      : '尚未更新';
    status = expectLiveData() ? updated : `${updated}（非交易時段）`;
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
  renderNotes();
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

// ---- 台股與期貨狀態、倒數（每秒） ----

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

// 「台股 盤中 距收 00:38:21」；超過一天寫日期，例如「休市（週六） 開 11/09（一）09:00」。
function statusText(name, status, now) {
  const left = status.next.at - now.getTime();
  const what = status.next.type === 'open' ? '開' : '收';
  const when = left < 86400000 ? `距${what} ${formatCountdown(left)}` : `${what} ${formatNextTime(status.next.at)}`;
  return `${name} ${status.label}${status.reason ? `（${status.reason}）` : ''} ${when}`;
}

function renderMarketStatus(now = new Date()) {
  const spot = getTwMarketStatus(now.getTime());
  const futures = getTwFuturesStatus(now.getTime());
  marketStatus.textContent = statusText('台股', spot, now);
  marketStatus.dataset.state = spot.state;
  futuresStatus.textContent = statusText('期貨', futures, now);
  futuresStatus.dataset.state = futures.state;
  renderStatusText(); // 開收盤時「非交易時段」自動切換
  renderNotes();
}

// ---- 提示：服務連不上、資料延遲、設定檔過期（休市表沒有今年、加權權重超過一個月） ----

const isOnlineSite = location.hostname.endsWith('github.io');
const taipeiYear = () => new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
const WEIGHTS_STALE_MS = 31 * 86400000;

// 目前的來源此刻應該有即時資料嗎：台股盤中，或有期貨報價的來源在期貨交易時段；模擬資料隨時都有。
function expectLiveData(source = getDashboardDataSource()) {
  const info = sourceInfo(source);
  if (!info.feed) return false;
  if (source === 'mock') return true;
  return isTwQuoteSession() || ((info.futures || info.mis) && (isTwFuturesDaySession() || isTwFuturesNightSession()));
}

// 問題「開始」時記一則通知（持續中不重複記，恢復後再發生才再記）。
const activeProblems = new Set();
function trackProblem(id, active, notice) {
  if (active && !activeProblems.has(id)) pushNotice(notice());
  if (active) activeProblems.add(id);
  else activeProblems.delete(id);
}
function trackProblems(failing) {
  Object.keys(SERVICE_LABELS).forEach((name) => trackProblem(`conn|${name}`, failing.includes(name), () => ({ kind: 'connection', title: '連不上', body: SERVICE_LABELS[name] })));
}

function renderNotes() {
  // 券商橋接只有在選了橋接來源時才算數（切走之後舊的失敗不再提示）。
  const failing = failingServices().filter((name) => name !== 'bridge' || sourceInfo().bridge);
  const notes = [];
  trackProblems(failing);
  if (failing.length) {
    const labels = failing.map((name) => (name === 'bridge' ? `${SERVICE_LABELS.bridge}（${new URL(sourceInfo().bridge).port}）` : SERVICE_LABELS[name]));
    notes.push(`連不上：${labels.join('、')}`);
    if (failing.includes('proxy') && isOnlineSite) notes.push('線上版需要在本機執行 GIO.cmd');
  }
  // 盤中超過更新頻率 3 倍沒有新資料就提示（例如來源卡住、代理沒回應但沒有斷線）。
  const lag = Date.now() - lastUpdatedAt;
  const delayed = expectLiveData() && Number.isFinite(lag) && lag > getPollIntervalSeconds() * 3000;
  if (delayed) notes.push(`資料延遲 ${Math.round(lag / 1000)} 秒`);
  trackProblem('delay', delayed, () => ({ kind: 'delay', title: '資料延遲', body: `超過 ${Math.round(lag / 1000)} 秒沒有新資料` }));
  if (!TW_HOLIDAY_YEARS.includes(taipeiYear())) notes.push(`休市表沒有 ${taipeiYear()} 年，需要重算設定檔（data/config/README.md）`);
  if (Date.now() - Date.parse(`${TAIEX_DATA_DATE}T00:00:00+08:00`) > WEIGHTS_STALE_MS) {
    notes.push(`加權權重資料 ${TAIEX_DATA_DATE} 已超過一個月，需要重算設定檔`);
  }
  const text = notes.join('｜');
  if (healthStatus.textContent !== text) healthStatus.textContent = text;
  healthStatus.hidden = !notes.length;
}

// ---- 通知中心（鈴鐺）：今天的型態提醒、資料延遲、連線問題；之後的大單提醒也用 pushNotice 送進來 ----

const bell = document.getElementById('dashboard-notices');
const bellBadge = document.getElementById('dashboard-notices-badge');
const bellList = document.getElementById('dashboard-notices-list');
const NOTICE_KIND_LABEL = { pattern: '型態', delay: '延遲', connection: '連線', bigOrder: '大單', chips: '籌碼', info: '訊息' };
const noticeTime = (at) => new Date(at).toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });

// 徽章每秒更新一次（跨日時通知清空，數字要跟著歸零）。
function renderBellBadge() {
  const count = unreadCount();
  const text = count > 99 ? '99+' : String(count);
  if (bellBadge.textContent !== text) bellBadge.textContent = text;
  bellBadge.hidden = !count;
}

function renderBell() {
  renderBellBadge();
  if (!bell.open) return;
  const items = getNotices();
  bellList.innerHTML = items.length
    ? items.map((item) => `<li class="shell-bell__item${item.read ? '' : ' is-unread'}"><span class="shell-bell__time">${esc(noticeTime(item.at))}</span><span class="shell-bell__kind">${esc(NOTICE_KIND_LABEL[item.kind] || item.kind)}</span><span class="shell-bell__text">${esc(item.title)}${item.body ? `：${esc(item.body)}` : ''}</span></li>`).join('')
    : '<li class="shell-bell__empty">今天還沒有通知</li>';
}

bell.addEventListener('toggle', renderBell);
document.addEventListener('click', (event) => {
  if (bell.open && !bell.contains(event.target)) bell.open = false;
});
document.getElementById('dashboard-notices-read').addEventListener('click', () => markAllRead());
document.getElementById('dashboard-notices-clear').addEventListener('click', () => clearNotices());
subscribeNotices(renderBell);

// 型態提醒：key 用日期＋代碼＋型態，重新整理後還原的同一則不會再記一次；舊的先記，最新的才會在最上面。
const pushPatternNotices = (alerts) => [...alerts].reverse().forEach((alert) => pushNotice({
  kind: 'pattern',
  title: `${alert.code} ${alert.name || ''}`.trim(),
  body: `${(alert.patterns || []).join('、')}（${alert.price}）`,
  key: `pattern|${alert.date}|${alert.code}|${alert.patternId}`
}));
store.subscribe('patternAlerts', pushPatternNotices);
pushPatternNotices(store.get('patternAlerts'));

// 籌碼提醒：外資台指期淨未平倉單日大增減（盤後）、盤中預估成交金額爆量（門檻在 services/chipAlerts.js）。
const pushChipNotice = (notice) => notice && pushNotice(notice);
store.subscribe('institutional', (data) => pushChipNotice(foreignOiNotice(data?.foreign)));
store.subscribe('taiex', (taiex) => {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  pushChipNotice(amountNotice(taiex, store.peek('marketAmountHistory'), now.toISOString().slice(0, 10), now.getUTCHours() * 60 + now.getUTCMinutes()));
});

subscribeHealth(renderNotes);
subscribeSecond((now) => {
  renderMarketStatus(now);
  renderBellBadge();
});
renderMarketStatus();
renderBell();

// ---- 「⋯」選單：設定備份／還原（匯出所有瀏覽器設定成一個檔，還原後重新載入讓各頁重新讀取） ----

const menu = document.getElementById('dashboard-menu');
// 點選單外面或選了項目就收起來。
document.addEventListener('click', (event) => {
  if (menu.open && (!menu.contains(event.target) || event.target.closest('.shell-menu__item'))) menu.open = false;
});

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

// 盤後資料存本機（代理的 bridges/.cache/）：只存不會再變的過去月份／日期，依資料群組勾選。
const diskList = document.getElementById('dashboard-disk-cache');
diskList.innerHTML = Object.entries(DISK_CACHE_GROUPS)
  .map(([group, label]) => `<label class="shell-menu__check"><input type="checkbox" data-group="${esc(group)}"${diskCacheEnabled(group) ? ' checked' : ''}> ${esc(label)}</label>`)
  .join('');
diskList.addEventListener('change', (event) => setDiskCache(event.target.dataset.group, event.target.checked));

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
  store.set('activePage', page);

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

// 瀏覽器縮放（或把視窗拖到另一個縮放比例的螢幕）會改變 devicePixelRatio；固定大小的 canvas 不會觸發 resize，
// 所以重新掛載目前頁面，讓所有圖用新的解析度重畫，不會糊掉。
function watchPixelRatio() {
  const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  query.addEventListener('change', () => {
    const page = activePage;
    activePage = null;
    navigate(page, { pushHash: false });
    watchPixelRatio();
  }, { once: true });
}
watchPixelRatio();

// 快捷鍵：1–8 切頁、R 手動更新；在輸入框裡打字或按著 Ctrl/Alt/Meta 時不攔。
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
