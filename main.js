// 應用程式進入點：初始化資料提供者、頁面路由、模擬資料與全域 UI。
import { createMarketDataProvider } from './providers/index.js';

const QUOTES = [
  { symbol: '^TWII', name: 'Taiwan Weighted Index', group: 'major' },
  { symbol: 'TXF=F', name: 'Taiwan Index Futures', group: 'major' },
  { symbol: '2330.TW', name: 'TSMC', group: 'stocks' },
  { symbol: '2317.TW', name: 'Hon Hai', group: 'stocks' },
  { symbol: '2454.TW', name: 'MediaTek', group: 'stocks' },
  { symbol: '2308.TW', name: 'Delta', group: 'stocks' },
  { symbol: '2303.TW', name: 'UMC', group: 'stocks' },
  { symbol: '2891.TW', name: 'CTBC Financial', group: 'stocks' },
  { symbol: '2881.TW', name: 'Fubon Financial', group: 'stocks' },
  { symbol: '1303.TW', name: 'Nan Ya Plastics', group: 'stocks' },
  { symbol: '1301.TW', name: 'Formosa Plastics', group: 'stocks' },
  { symbol: '2412.TW', name: 'Chunghwa Telecom', group: 'stocks' }
];

const POLL_INTERVAL = 10000;
const ERROR_RETRY_DELAY = 30000;

const state = {
  providerType: 'yahoo',
  provider: null,
  intervalId: null,
  retryTimeoutId: null
};

const elements = {
  majorGrid: document.getElementById('major-grid'),
  stocksGrid: document.getElementById('stocks-grid'),
  statusPill: document.getElementById('status-pill'),
  lastUpdated: document.getElementById('last-updated'),
  refreshButton: document.getElementById('refresh-button'),
  providerSelect: document.getElementById('provider-select'),
  providerName: document.getElementById('provider-name'),
  providerNote: document.getElementById('provider-note'),
  finmindTokenField: document.getElementById('finmind-token-field'),
  finmindTokenInput: document.getElementById('finmind-token'),
  taifexUrlField: document.getElementById('taifex-url-field'),
  taifexUrlInput: document.getElementById('taifex-url')
};

// formatPrice：函式用途註解，說明此處封裝一段可重用的流程。
function formatPrice(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Data unavailable';
  const digits = value >= 100 ? 2 : value >= 1 ? 3 : 4;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

// formatSigned：函式用途註解，說明此處封裝一段可重用的流程。
function formatSigned(value, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Data unavailable';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
}

// getDirection：函式用途註解，說明此處封裝一段可重用的流程。
function getDirection(change) {
  if (typeof change !== 'number' || Number.isNaN(change)) return 'flat';
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

// getProviderOptions：函式用途註解，說明此處封裝一段可重用的流程。
function getProviderOptions() {
  return {
    type: state.providerType,
    quotes: QUOTES,
    cacheTtl: state.providerType === 'yahoo' ? 8000 : 15000,
    minRequestGap: 5000,
    token: elements.finmindTokenInput?.value?.trim(),
    dataUrl: elements.taifexUrlInput?.value?.trim()
  };
}

// createProvider：函式用途註解，說明此處封裝一段可重用的流程。
function createProvider() {
  state.provider = createMarketDataProvider(getProviderOptions());
  if (elements.providerName) {
    elements.providerName.textContent = state.provider.name;
  }
  if (elements.providerNote) {
    elements.providerNote.textContent = state.provider.description;
  }
}

// createQuoteCard：函式用途註解，說明此處封裝一段可重用的流程。
function createQuoteCard(quote) {
  if (!quote || typeof quote.price !== 'number') {
    return `
      <article class="quote-card">
        <h3 class="quote-card__name">${quote?.name || 'Unknown'}</h3>
        <div class="quote-card__symbol">${quote?.symbol || '--'}</div>
        <div class="quote-card__empty">${quote?.note || 'Data unavailable'}</div>
      </article>
    `;
  }

  const direction = getDirection(quote.change);
  return `
    <article class="quote-card is-${direction}">
      <h3 class="quote-card__name">${quote.name}</h3>
      <div class="quote-card__symbol">${quote.symbol}</div>
      <div class="quote-card__price">${formatPrice(quote.price)}</div>
      <div class="quote-card__change is-${direction}">
        <span>${formatSigned(quote.change, 2)}</span>
        <span>${formatSigned(quote.changePercent, 2)}%</span>
      </div>
    </article>
  `;
}

// renderUI：函式用途註解，說明此處封裝一段可重用的流程。
function renderUI(data, options = {}) {
  // records：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const records = Array.isArray(data) ? data : QUOTES.map((item) => ({ ...item }));
  // major：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const major = records.filter((item) => QUOTES.find((quote) => quote.symbol === item.symbol)?.group === 'major');
  // stocks：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const stocks = records.filter((item) => QUOTES.find((quote) => quote.symbol === item.symbol)?.group === 'stocks');

  // 段落說明：更新 DOM 內容。
  elements.majorGrid.innerHTML = major.map(createQuoteCard).join('');
  // 段落說明：更新 DOM 內容。
  elements.stocksGrid.innerHTML = stocks.map(createQuoteCard).join('');

  if (options.error) {
    elements.statusPill.textContent = 'Data unavailable';
    elements.lastUpdated.textContent = 'Retry pending';
    return;
  }

  elements.statusPill.textContent = options.cached ? `${state.provider.name} cache` : `${state.provider.name} live`;
  elements.lastUpdated.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
}

// renderProviderFields：函式用途註解，說明此處封裝一段可重用的流程。
function renderProviderFields() {
  elements.finmindTokenField?.classList.toggle('is-hidden', state.providerType !== 'finmind');
  elements.taifexUrlField?.classList.toggle('is-hidden', state.providerType !== 'taifex');
}

// setRefreshing：函式用途註解，說明此處封裝一段可重用的流程。
function setRefreshing(isRefreshing) {
  if (!elements.refreshButton) return;
  elements.refreshButton.disabled = isRefreshing;
  elements.refreshButton.textContent = isRefreshing ? 'Refreshing...' : 'Refresh now';
}

// scheduleRetry：函式用途註解，說明此處封裝一段可重用的流程。
function scheduleRetry() {
  // 段落說明：清除定時器，避免頁面卸載後繼續執行。
  clearInterval(state.intervalId);
  state.intervalId = null;
  clearTimeout(state.retryTimeoutId);
  state.retryTimeoutId = setTimeout(() => {
    state.retryTimeoutId = null;
    startPolling();
  }, ERROR_RETRY_DELAY);
}

// fetchData：函式用途註解，說明此處封裝一段可重用的流程。
async function fetchData(options = {}) {
  return state.provider.fetchQuotes(options);
}

// updateDashboard：函式用途註解，說明此處封裝一段可重用的流程。
async function updateDashboard(options = {}) {
  const isManualRefresh = options.force === true;
  if (isManualRefresh) {
    setRefreshing(true);
  }

  try {
    clearTimeout(state.retryTimeoutId);
    state.retryTimeoutId = null;
    const result = await fetchData(options);
    renderUI(result.data, { cached: result.cached });
  } catch (error) {
    console.error(`${state.provider.name} fetch failed:`, error);
    // fallback：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const fallback = state.provider.getLastData() || QUOTES.map((item) => ({ symbol: item.symbol, name: item.name }));
    renderUI(fallback, { error: true });
    if (elements.providerNote) {
      elements.providerNote.textContent = `${state.provider.description} Error: ${error.message}`;
    }
    scheduleRetry();
  } finally {
    if (isManualRefresh) {
      setRefreshing(false);
    }
  }
}

// stopPolling：函式用途註解，說明此處封裝一段可重用的流程。
function stopPolling() {
  // 段落說明：清除定時器，避免頁面卸載後繼續執行。
  clearInterval(state.intervalId);
  state.intervalId = null;
  clearTimeout(state.retryTimeoutId);
  state.retryTimeoutId = null;
}

// startPolling：函式用途註解，說明此處封裝一段可重用的流程。
function startPolling() {
  if (state.intervalId) return;
  updateDashboard();
  // 段落說明：建立定時更新流程。
  state.intervalId = setInterval(() => {
    updateDashboard();
  }, POLL_INTERVAL);
}

// applyProvider：函式用途註解，說明此處封裝一段可重用的流程。
function applyProvider(type) {
  state.providerType = type;
  stopPolling();
  renderProviderFields();
  createProvider();
  renderUI(QUOTES.map((item) => ({ symbol: item.symbol, name: item.name })), { error: true });
  startPolling();
}

// 段落說明：綁定使用者互動事件。
elements.providerSelect?.addEventListener('change', (event) => {
  applyProvider(event.target.value);
});

// 段落說明：綁定使用者互動事件。
elements.finmindTokenInput?.addEventListener('change', () => {
  if (state.providerType === 'finmind') {
    applyProvider('finmind');
  }
});

// 段落說明：綁定使用者互動事件。
elements.taifexUrlInput?.addEventListener('change', () => {
  if (state.providerType === 'taifex') {
    applyProvider('taifex');
  }
});

// 段落說明：綁定使用者互動事件。
elements.refreshButton?.addEventListener('click', () => {
  updateDashboard({ force: true });
});

renderProviderFields();
createProvider();
renderUI(QUOTES.map((item) => ({ symbol: item.symbol, name: item.name })), { error: true });
startPolling();
