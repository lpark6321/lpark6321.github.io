// Yahoo Finance 資料提供者：把 Yahoo API 回應轉成專案共用行情格式。
import { fetchYahooQuoteChunk, yahooNumber } from '../services/yahooApi.js';
import { BaseMarketDataProvider } from './baseProvider.js';

export class YahooFinanceProvider extends BaseMarketDataProvider {
  constructor(options) {
    super({
      type: 'yahoo',
      name: 'Yahoo Finance',
      description: 'Yahoo quote data through the same local proxy used by Page1, avoiding browser CORS blocks.',
      ...options
    });
  }

  mapQuote(raw) {
    const price = yahooNumber(raw.regularMarketPrice);
    const change = yahooNumber(raw.regularMarketChange);
    const changePercent = yahooNumber(raw.regularMarketChangePercent);
    return {
      symbol: raw.symbol,
      name: this.quotes.find((item) => item.symbol === raw.symbol)?.name || raw.shortName || raw.symbol,
      price: Number.isFinite(price) ? price : undefined,
      change: Number.isFinite(change) ? change : undefined,
      changePercent: Number.isFinite(changePercent) ? changePercent : undefined,
      note: raw.error || raw.note
    };
  }

  // 與主儀表板共用 services/yahooApi.js 的代理位址與請求逾時。
  async requestRemoteData() {
    const result = await fetchYahooQuoteChunk(this.quotes.map((item) => item.symbol));
    const map = new Map();
    result.forEach((raw) => {
      map.set(raw.symbol, this.mapQuote(raw));
    });
    return this.mergeRecords(map);
  }
}
