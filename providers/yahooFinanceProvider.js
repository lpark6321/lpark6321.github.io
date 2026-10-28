// Yahoo Finance 資料提供者：把 Yahoo API 回應轉成專案共用行情格式。
import { BaseMarketDataProvider } from './baseProvider.js';

const DEFAULT_YAHOO_PROXY_BASE = 'http://127.0.0.1:8787/api';

function yahooProxyUrl(endpoint, proxyBase) {
  const base =
    proxyBase ||
    globalThis.window?.YAHOO_PROXY_BASE ||
    globalThis.YAHOO_PROXY_BASE ||
    DEFAULT_YAHOO_PROXY_BASE;
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return new URL(endpoint, normalized);
}

// YahooFinanceProvider：類別用途註解，集中管理相關狀態與方法。
export class YahooFinanceProvider extends BaseMarketDataProvider {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(options) {
    super({
      type: 'yahoo',
      name: 'Yahoo Finance',
      description: 'Yahoo quote data through the same local proxy used by Page1, avoiding browser CORS blocks.',
      ...options
    });
    // symbols：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    this.symbols = this.quotes.map((item) => item.symbol).join(',');
    this.proxyBase = options.yahooProxyBase || options.proxyBase || '';
  }

  // mapQuote：方法用途註解，處理此元件或類別的一段行為。
  mapQuote(raw) {
    const price = Number(raw.regularMarketPrice);
    const change = Number(raw.regularMarketChange);
    const changePercent = Number(raw.regularMarketChangePercent);
    return {
      symbol: raw.symbol,
      name: this.quotes.find((item) => item.symbol === raw.symbol)?.name || raw.shortName || raw.symbol,
      price: Number.isFinite(price) ? price : undefined,
      change: Number.isFinite(change) ? change : undefined,
      changePercent: Number.isFinite(changePercent) ? changePercent : undefined,
      note: raw.error || raw.note
    };
  }

  // requestRemoteData：方法用途註解，處理此元件或類別的一段行為。
  async requestRemoteData() {
    const url = yahooProxyUrl('yahoo-quote', this.proxyBase);
    url.searchParams.set('symbols', this.symbols);
    url.searchParams.set('_ts', String(Date.now()));

    // 段落說明：呼叫外部資料來源並等待回應。
    const response = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo HTTP ${response.status}`);
    }

    const payload = await response.json();
    const result = payload?.quoteResponse?.result;
    if (!Array.isArray(result)) {
      throw new Error('Malformed Yahoo Finance response');
    }

    const map = new Map();
    result.forEach((raw) => {
      map.set(raw.symbol, this.mapQuote(raw));
    });
    return this.mergeRecords(map);
  }

  // fetchQuotes：方法用途註解，處理此元件或類別的一段行為。
  async fetchQuotes(options = {}) {
    return this.withCache(options, () => this.requestRemoteData());
  }
}
