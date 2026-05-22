const STORAGE_KEY = 'dashboard.dataSource';
const CHANGE_EVENT = 'dashboard:data-source-change';

export const DASHBOARD_DATA_SOURCES = [
  { value: 'yahoo', label: 'YAHOO' },
  { value: 'mock', label: '模擬資料' },
  { value: 'finmind', label: 'FinMind' },
  { value: 'taifex_csv', label: '期交所CSV' },
  { value: 'broker', label: '券商API' }
];

const VALID_SOURCES = new Set(DASHBOARD_DATA_SOURCES.map((source) => source.value));

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
  return DASHBOARD_DATA_SOURCES.find((item) => item.value === source)?.label || source;
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
