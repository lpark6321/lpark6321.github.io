// FinMind 資料提供者：取得台股行情並轉成專案共用資料結構。
import { BaseMarketDataProvider } from './baseProvider.js';

// formatDate：函式用途註解，說明此處封裝一段可重用的流程。
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// shiftDays：函式用途註解，說明此處封裝一段可重用的流程。
function shiftDays(base, offset) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + offset);
  return copy;
}

// FinMindProvider：類別用途註解，集中管理相關狀態與方法。
export class FinMindProvider extends BaseMarketDataProvider {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(options) {
    super({
      type: 'finmind',
      name: 'FinMind',
      description: 'Structured API path for Taiwan market data. Stocks and TAIEX can be mapped from confirmed datasets. Some intraday or tick datasets may require a paid tier or token.',
      cacheTtl: 15000,
      ...options
    });
    this.apiUrl = 'https://api.finmindtrade.com/api/v4/data';
    this.token = options.token || '';
  }

  // buildHeaders：方法用途註解，處理此元件或類別的一段行為。
  buildHeaders() {
    if (!this.token) return { Accept: 'application/json' };
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`
    };
  }

  // requestDataset：方法用途註解，處理此元件或類別的一段行為。
  async requestDataset(params) {
    const url = new URL(this.apiUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    // 段落說明：呼叫外部資料來源並等待回應。
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.buildHeaders()
    });

    if (!response.ok) {
      throw new Error(`FinMind HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload?.data)) {
      throw new Error('Malformed FinMind response');
    }
    return payload.data;
  }

  // buildTaiexRecord：方法用途註解，處理此元件或類別的一段行為。
  async buildTaiexRecord(today, startDate) {
    const [taiexSeries, taiexDaily] = await Promise.all([
      this.requestDataset({
        dataset: 'TaiwanVariousIndicators5Seconds',
        start_date: today
      }),
      this.requestDataset({
        dataset: 'TaiwanStockTotalReturnIndex',
        data_id: 'TAIEX',
        start_date: startDate,
        end_date: today
      })
    ]);

    const latestIntraday = taiexSeries.at(-1);
    const lastTwoDaily = taiexDaily.slice(-2);
    const latestDaily = lastTwoDaily.at(-1);
    const previousDaily = lastTwoDaily.length > 1 ? lastTwoDaily.at(-2) : null;
    const price = latestIntraday?.TAIEX ?? latestDaily?.price;
    const prevClose = previousDaily?.price;

    if (typeof price !== 'number') {
      return this.createFallbackRecord(this.quotes.find((item) => item.symbol === '^TWII'), {
        note: 'FinMind TAIEX data unavailable'
      });
    }

    const change = typeof prevClose === 'number' ? price - prevClose : undefined;
    return {
      symbol: '^TWII',
      name: 'Taiwan Weighted Index',
      price,
      change,
      changePercent: typeof prevClose === 'number' && prevClose !== 0 ? (change / prevClose) * 100 : undefined
    };
  }

  // buildFutureRecord：方法用途註解，處理此元件或類別的一段行為。
  async buildFutureRecord() {
    // quote：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const quote = this.quotes.find((item) => item.symbol === 'TXF=F');
    return this.createFallbackRecord(quote, {
      note: 'FinMind futures mapping is prepared but not enabled until the exact futures dataset is confirmed'
    });
  }

  // buildStockRecords：方法用途註解，處理此元件或類別的一段行為。
  async buildStockRecords(today, startDate) {
    // stockQuotes：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const stockQuotes = this.quotes.filter((item) => item.symbol.endsWith('.TW'));
    // rows：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const rows = await Promise.all(stockQuotes.map(async (quote) => {
      const stockId = quote.symbol.replace('.TW', '');
      const series = await this.requestDataset({
        dataset: 'TaiwanStockPrice',
        data_id: stockId,
        start_date: startDate,
        end_date: today
      });
      const lastTwo = series.slice(-2);
      const latest = lastTwo.at(-1);
      const previous = lastTwo.length > 1 ? lastTwo.at(-2) : null;

      if (!latest) {
        return this.createFallbackRecord(quote, { note: 'FinMind stock data unavailable' });
      }

      const price = latest.close;
      const change = typeof latest.spread === 'number'
        ? latest.spread
        : typeof previous?.close === 'number'
          ? price - previous.close
          : undefined;
      const base = typeof previous?.close === 'number' ? previous.close : price - (change || 0);

      return {
        symbol: quote.symbol,
        name: quote.name,
        price,
        change,
        changePercent: typeof base === 'number' && base !== 0 && typeof change === 'number'
          ? (change / base) * 100
          : undefined
      };
    }));

    const map = new Map();
    rows.forEach((row) => map.set(row.symbol, row));
    return map;
  }

  // requestRemoteData：方法用途註解，處理此元件或類別的一段行為。
  async requestRemoteData() {
    const now = new Date();
    const today = formatDate(now);
    const startDate = formatDate(shiftDays(now, -10));

    const [taiexRecord, futureRecord, stockMap] = await Promise.all([
      this.buildTaiexRecord(today, startDate),
      this.buildFutureRecord(),
      this.buildStockRecords(today, startDate)
    ]);

    stockMap.set(taiexRecord.symbol, taiexRecord);
    stockMap.set(futureRecord.symbol, futureRecord);
    return this.mergeRecords(stockMap);
  }

  // fetchQuotes：方法用途註解，處理此元件或類別的一段行為。
  async fetchQuotes(options = {}) {
    return this.withCache(options, () => this.requestRemoteData());
  }
}
