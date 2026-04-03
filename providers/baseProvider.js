export class BaseMarketDataProvider {
  constructor({
    type,
    name,
    description,
    quotes,
    cacheTtl = 8000,
    minRequestGap = 5000
  }) {
    this.type = type;
    this.name = name;
    this.description = description;
    this.quotes = quotes;
    this.cacheTtl = cacheTtl;
    this.minRequestGap = minRequestGap;
    this.cache = {
      timestamp: 0,
      data: null
    };
    this.inFlight = null;
    this.lastRequestAt = 0;
  }

  getLastData() {
    return this.cache.data;
  }

  isCacheFresh(now = Date.now()) {
    return Boolean(this.cache.data) && now - this.cache.timestamp < this.cacheTtl;
  }

  shouldThrottle(now = Date.now()) {
    return now - this.lastRequestAt < this.minRequestGap;
  }

  setCache(data) {
    this.cache = {
      timestamp: Date.now(),
      data
    };
  }

  createFallbackRecord(quote, extra = {}) {
    return {
      symbol: quote.symbol,
      name: quote.name,
      ...extra
    };
  }

  mergeRecords(recordsBySymbol) {
    return this.quotes.map((quote) => recordsBySymbol.get(quote.symbol) || this.createFallbackRecord(quote));
  }

  async withCache({ force = false } = {}, requestFn) {
    const now = Date.now();

    if (!force && this.isCacheFresh(now)) {
      return { data: this.cache.data, cached: true, provider: this.name };
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    if (!force && this.shouldThrottle(now) && this.cache.data) {
      return { data: this.cache.data, cached: true, provider: this.name };
    }

    this.lastRequestAt = now;
    this.inFlight = Promise.resolve()
      .then(requestFn)
      .then((data) => {
        this.setCache(data);
        return { data, cached: false, provider: this.name };
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  async fetchQuotes() {
    throw new Error('fetchQuotes() must be implemented by a concrete provider');
  }
}
