// 全站資料設定與資料層共用的換算：資料來源（含各來源能做什麼）、更新頻率、成交量預估。
const STORAGE_KEY = 'dashboard.dataSource';
const CHANGE_EVENT = 'dashboard:data-source-change';

const POLL_STORAGE_KEY = 'dashboard.pollSeconds';
const POLL_CHANGE_EVENT = 'dashboard:poll-interval-change';
const DEFAULT_POLL_SECONDS = 5;

// 目前以 YAHOO 為主要資料來源；DDE 與 API 介面保留，標示為預留。新增來源只要在這裡加一列：
//   feed     marketFeed 會定時抓報價寫進 store（其他來源只有 C 區圖表會用）
//   stocks   有個股報價與市場地圖（Page2 市場統計、Page3 自選股報價、Page6 市場地圖）
//   bridge   本機橋接的 API 根網址，提供 /xq-quote（報價）與 /broker-candles（K 線）
//   futures  K 線是台指期本身的資料（可算月成本）
//   snapshot 每次只回最新一根 K，要接在既有 K 線後面
export const DASHBOARD_DATA_SOURCES = [
  { value: 'yahoo', label: 'YAHOO', feed: true, stocks: true },
  { value: 'mock', label: '模擬資料', feed: true },
  { value: 'finmind', label: 'FinMind（預留）', futures: true, snapshot: true },
  { value: 'taifex_csv', label: '期交所CSV（預留）', futures: true },
  { value: 'kgi_dde', label: '凱基DDE（預留）', feed: true, futures: true, bridge: 'http://127.0.0.1:8788/api' },
  { value: 'kgi_rtd', label: '凱基RTD（預留）', feed: true, futures: true, bridge: 'http://127.0.0.1:8789/api' },
  { value: 'taishin_dde', label: '台新DDE（預留）', feed: true, futures: true, bridge: 'http://127.0.0.1:8790/api' },
  { value: 'broker', label: '券商API（預留）', futures: true }
];

export const POLL_INTERVAL_OPTIONS = [5, 10, 30, 60];

const SOURCE_BY_VALUE = new Map(DASHBOARD_DATA_SOURCES.map((source) => [source.value, source]));
const VALID_SOURCES = new Set(SOURCE_BY_VALUE.keys());

// 來源的設定列（見上方欄位說明）；不認得的來源回傳空物件，所有能力都是 false。
export function sourceInfo(source = currentSource) {
  return SOURCE_BY_VALUE.get(source) || {};
}

function readStoredSource() {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return VALID_SOURCES.has(stored) ? stored : 'yahoo';
  } catch {
    return 'yahoo';
  }
}

let currentSource = readStoredSource();

export function getDashboardDataSource() {
  return currentSource;
}

export function getDashboardDataSourceLabel(source = currentSource) {
  return sourceInfo(source).label || source;
}

export function setDashboardDataSource(source) {
  if (!VALID_SOURCES.has(source) || source === currentSource) return currentSource;

  currentSource = source;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, source);
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }

  globalThis.dispatchEvent?.(new CustomEvent(CHANGE_EVENT, {
    detail: { source: currentSource }
  }));

  return currentSource;
}

export function subscribeDashboardDataSource(callback) {
  const handler = (event) => callback(event.detail.source);
  globalThis.addEventListener?.(CHANGE_EVENT, handler);
  return () => globalThis.removeEventListener?.(CHANGE_EVENT, handler);
}

// 全站共用的更新頻率（秒），所有輪詢器都從這裡讀，預設 5 秒。
function readStoredPollSeconds() {
  try {
    const stored = Number(globalThis.localStorage?.getItem(POLL_STORAGE_KEY));
    return POLL_INTERVAL_OPTIONS.includes(stored) ? stored : DEFAULT_POLL_SECONDS;
  } catch {
    return DEFAULT_POLL_SECONDS;
  }
}

let pollSeconds = readStoredPollSeconds();

export function getPollIntervalSeconds() {
  return pollSeconds;
}

export function getPollIntervalMs() {
  return pollSeconds * 1000;
}

export function setPollIntervalSeconds(seconds) {
  const next = Number(seconds);
  if (!POLL_INTERVAL_OPTIONS.includes(next) || next === pollSeconds) return pollSeconds;

  pollSeconds = next;
  try {
    globalThis.localStorage?.setItem(POLL_STORAGE_KEY, String(next));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }

  globalThis.dispatchEvent?.(new CustomEvent(POLL_CHANGE_EVENT, {
    detail: { ms: getPollIntervalMs() }
  }));

  return pollSeconds;
}

// callback 收到新的間隔毫秒數；回傳取消訂閱函式。
export function subscribePollInterval(callback) {
  const handler = (event) => callback(event.detail.ms);
  globalThis.addEventListener?.(POLL_CHANGE_EVENT, handler);
  return () => globalThis.removeEventListener?.(POLL_CHANGE_EVENT, handler);
}

// ---- 成交量預估：任何來源寫入加權報價時都經過 withVolumeEstimate，頁面只讀 volEstimate ----

const VOLUME_WEIGHT_URL = './volume_weight_5sec.csv';
let volumeWeights = [];
let volumeWeightPromise = null;

// 量能預估權重表（每 5 秒一列：時間,加權倍數,標準差）。只載入一次；失敗不快取，下次再試。
export function loadVolumeWeights() {
  volumeWeightPromise ||= fetch(VOLUME_WEIGHT_URL, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`volume weight HTTP ${response.status}`);
      return response.text();
    })
    .then((text) => {
      volumeWeights = text.trim().split(/\r?\n/).slice(1).map((line) => {
        const [time, weight, stddev] = line.split(',').map((cell) => String(cell || '').trim());
        const [hh, mm, ss = 0] = time.split(':').map(Number);
        return { secondOfDay: hh * 3600 + mm * 60 + ss, weight: Number(weight), stddev: Number(stddev) };
      }).filter((row) => Number.isFinite(row.secondOfDay) && Number.isFinite(row.weight));
      return volumeWeights;
    })
    .catch((error) => {
      console.warn('[dashboardDataSource] volume weight load failed:', error);
      volumeWeightPromise = null;
      return [];
    });
  return volumeWeightPromise;
}

// 預估全日量 = 目前累計量 × 該時點（台北時間，固定 UTC+8）的權重倍數。權重表還沒載入或量是 0 時回傳 null。
function estimateVolume(cumulativeVolume, time = Date.now()) {
  const volume = Number(cumulativeVolume);
  if (!Number.isFinite(volume) || volume <= 0 || !volumeWeights.length) return null;
  const second = Math.floor(time / 1000 + 8 * 3600) % 86400;
  let selected = null;
  for (const row of volumeWeights) {
    if (row.secondOfDay <= second) selected = row;
    else break;
  }
  if (!selected || !(selected.weight > 0)) return null;
  return { value: volume * selected.weight, weight: selected.weight };
}

// 拿到即時量就補上預估量欄位；算不出來就是 null（畫面顯示「--」），不留舊值。
export function withVolumeEstimate(taiex) {
  const estimate = estimateVolume(taiex.volume);
  return {
    ...taiex,
    volEstimate: estimate ? Math.round(estimate.value) : null,
    volumeEstimateWeight: estimate ? +estimate.weight.toFixed(6) : null
  };
}
