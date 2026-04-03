import { BaseMarketDataProvider } from './baseProvider.js';

export class YahooFinanceProvider extends BaseMarketDataProvider {
  constructor(options) {
    super({
      type: 'yahoo',
      name: 'Yahoo Finance',
      description: 'Single unofficial batch quote request. Good for quick testing, but the endpoint is unofficial and may break.',
      ...options
    });
    const symbols = this.quotes.map((item) => item.symbol).join(',');
    this.apiUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
  }

  mapQuote(raw) {
    return {
      symbol: raw.symbol,
      name: this.quotes.find((item) => item.symbol === raw.symbol)?.name || raw.shortName || raw.symbol,
      price: raw.regularMarketPrice,
      change: raw.regularMarketChange,
      changePercent: raw.regularMarketChangePercent
    };
  }

  async requestRemoteData() {
    const response = await fetch(this.apiUrl, {
      method: 'GET',
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

  async fetchQuotes(options = {}) {
    return this.withCache(options, () => this.requestRemoteData());
  }
}
