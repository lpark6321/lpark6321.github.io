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

function formatPrice(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Data unavailable';
  const digits = value >= 100 ? 2 : value >= 1 ? 3 : 4;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatSigned(value, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Data unavailable';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
}

function getDirection(change) {
  if (typeof change !== 'number' || Number.isNaN(change)) return 'flat';
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

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

function createProvider() {
  state.provider = createMarketDataProvider(getProviderOptions());
  if (elements.providerName) {
    elements.providerName.textContent = state.provider.name;
  }
  if (elements.providerNote) {
    elements.providerNote.textContent = state.provider.description;
  }
}

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

function renderUI(data, options = {}) {
  const records = Array.isArray(data) ? data : QUOTES.map((item) => ({ ...item }));
  const major = records.filter((item) => QUOTES.find((quote) => quote.symbol === item.symbol)?.group === 'major');
  const stocks = records.filter((item) => QUOTES.find((quote) => quote.symbol === item.symbol)?.group === 'stocks');

  elements.majorGrid.innerHTML = major.map(createQuoteCard).join('');
  elements.stocksGrid.innerHTML = stocks.map(createQuoteCard).join('');

  if (options.error) {
    elements.statusPill.textContent = 'Data unavailable';
    elements.lastUpdated.textContent = 'Retry pending';
    return;
  }

  elements.statusPill.textContent = options.cached ? `${state.provider.name} cache` : `${state.provider.name} live`;
  elements.lastUpdated.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function renderProviderFields() {
  elements.finmindTokenField?.classList.toggle('is-hidden', state.providerType !== 'finmind');
  elements.taifexUrlField?.classList.toggle('is-hidden', state.providerType !== 'taifex');
}

function scheduleRetry() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  clearTimeout(state.retryTimeoutId);
  state.retryTimeoutId = setTimeout(() => {
    state.retryTimeoutId = null;
    startPolling();
  }, ERROR_RETRY_DELAY);
}

async function fetchData(options = {}) {
  return state.provider.fetchQuotes(options);
}

async function updateDashboard(options = {}) {
  try {
    clearTimeout(state.retryTimeoutId);
    state.retryTimeoutId = null;
    const result = await fetchData(options);
    renderUI(result.data, { cached: result.cached });
  } catch (error) {
    console.error(`${state.provider.name} fetch failed:`, error);
    const fallback = state.provider.getLastData() || QUOTES.map((item) => ({ symbol: item.symbol, name: item.name }));
    renderUI(fallback, { error: true });
    if (elements.providerNote) {
      elements.providerNote.textContent = `${state.provider.description} Error: ${error.message}`;
    }
    scheduleRetry();
  }
}

function stopPolling() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  clearTimeout(state.retryTimeoutId);
  state.retryTimeoutId = null;
}

function startPolling() {
  if (state.intervalId) return;
  updateDashboard();
  state.intervalId = setInterval(() => {
    updateDashboard();
  }, POLL_INTERVAL);
}

function applyProvider(type) {
  state.providerType = type;
  stopPolling();
  renderProviderFields();
  createProvider();
  renderUI(QUOTES.map((item) => ({ symbol: item.symbol, name: item.name })), { error: true });
  startPolling();
}

elements.providerSelect?.addEventListener('change', (event) => {
  applyProvider(event.target.value);
});

elements.finmindTokenInput?.addEventListener('change', () => {
  if (state.providerType === 'finmind') {
    applyProvider('finmind');
  }
});

elements.taifexUrlInput?.addEventListener('change', () => {
  if (state.providerType === 'taifex') {
    applyProvider('taifex');
  }
});

elements.refreshButton?.addEventListener('click', () => {
  updateDashboard({ force: true });
});

renderProviderFields();
createProvider();
renderUI(QUOTES.map((item) => ({ symbol: item.symbol, name: item.name })), { error: true });
startPolling();
