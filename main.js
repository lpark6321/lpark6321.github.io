// Data Lab（index.html）進入點：切換資料提供者、跟著全站節拍（feedClock）抓報價並顯示。
import { createMarketDataProvider } from './providers/index.js';
import {
  POLL_INTERVAL_OPTIONS,
  getPollIntervalSeconds,
  setPollIntervalSeconds,
  subscribePollInterval
} from './services/dashboardDataSource.js';
import { subscribeFeedTick } from './services/feedClock.js';
import { esc } from './services/html.js';

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

const state = {
  providerType: 'yahoo',
  provider: null
};

const elements = {
  majorGrid: document.getElementById('major-grid'),
  stocksGrid: document.getElementById('stocks-grid'),
  statusPill: document.getElementById('status-pill'),
  lastUpdated: document.getElementById('last-updated'),
  refreshButton: document.getElementById('refresh-button'),
  providerSelect: document.getElementById('provider-select'),
  pollSelect: document.getElementById('poll-select'),
  pollLabel: document.getElementById('poll-label'),
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
    // 每個節拍都重抓，間隔由「更新頻率」決定。FinMind 例外：每輪 12 個請求，5 分鐘快取 = 每小時 144 次，
    // 低於免費額度（未帶 token 300 次/小時），節拍太密時沿用快取。
    cacheTtl: state.providerType === 'finmind' ? 300000 : 0,
    minRequestGap: 0,
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
        <h3 class="quote-card__name">${esc(quote?.name || 'Unknown')}</h3>
        <div class="quote-card__symbol">${esc(quote?.symbol || '--')}</div>
        <div class="quote-card__empty">${esc(quote?.note || 'Data unavailable')}</div>
      </article>
    `;
  }

  const direction = getDirection(quote.change);
  return `
    <article class="quote-card is-${direction}">
      <h3 class="quote-card__name">${esc(quote.name)}</h3>
      <div class="quote-card__symbol">${esc(quote.symbol)}</div>
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

function setRefreshing(isRefreshing) {
  if (!elements.refreshButton) return;
  elements.refreshButton.disabled = isRefreshing;
  elements.refreshButton.textContent = isRefreshing ? 'Refreshing...' : 'Refresh now';
}

async function updateDashboard(options = {}) {
  const isManualRefresh = options.force === true;
  if (isManualRefresh) {
    setRefreshing(true);
  }

  // 切換資料源後，舊資料源晚到的結果（成功或失敗）都要丟掉，不能蓋掉新資料源的畫面。失敗就等下一個節拍重試。
  const provider = state.provider;
  try {
    const result = await provider.fetchQuotes(options);
    if (provider !== state.provider) return;
    renderUI(result.data, { cached: result.cached });
    if (elements.providerNote) elements.providerNote.textContent = provider.description;
  } catch (error) {
    if (provider !== state.provider) return;
    console.error(`${provider.name} fetch failed:`, error);
    const fallback = provider.getLastData() || QUOTES.map((item) => ({ symbol: item.symbol, name: item.name }));
    renderUI(fallback, { error: true });
    if (elements.providerNote) {
      elements.providerNote.textContent = `${provider.description} Error: ${error.message}`;
    }
  } finally {
    if (isManualRefresh) {
      setRefreshing(false);
    }
  }
}

function applyProvider(type) {
  state.providerType = type;
  renderProviderFields();
  createProvider();
  renderUI(QUOTES.map((item) => ({ symbol: item.symbol, name: item.name })), { error: true });
  updateDashboard();
}

// 更新頻率與主儀表板共用同一個設定（localStorage dashboard.pollSeconds）。
function renderPollControl() {
  const seconds = getPollIntervalSeconds();
  if (elements.pollSelect) elements.pollSelect.value = String(seconds);
  if (elements.pollLabel) elements.pollLabel.textContent = `${seconds} sec`;
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

if (elements.pollSelect) {
  elements.pollSelect.innerHTML = POLL_INTERVAL_OPTIONS.map((seconds) => `<option value="${seconds}">${seconds} sec</option>`).join('');
  elements.pollSelect.addEventListener('change', () => setPollIntervalSeconds(elements.pollSelect.value));
}
subscribePollInterval(renderPollControl);
renderPollControl();

renderProviderFields();
createProvider();
renderUI(QUOTES.map((item) => ({ symbol: item.symbol, name: item.name })), { error: true });
updateDashboard();
subscribeFeedTick(() => updateDashboard());
