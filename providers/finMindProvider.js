// FinMind 資料提供者：取得台股行情並轉成專案共用資料結構。
import { BaseMarketDataProvider } from './baseProvider.js';

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDays(base, offset) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + offset);
  return copy;
}

export class FinMindProvider extends BaseMarketDataProvider {
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

  buildHeaders() {
    if (!this.token) return { Accept: 'application/json' };
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`
    };
  }

  async requestDataset(params) {
    const url = new URL(this.apiUrl);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    });

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

  async buildTaiexRecord(today, startDate) {
    // 兩個資料集都是「加權股價指數」本身；TaiwanStockTotalReturnIndex 是報酬指數（約兩倍高），不能拿來當昨收。
    const [taiexSeries, taiexDaily] = await Promise.all([
      this.requestDataset({
        dataset: 'TaiwanVariousIndicators5Seconds',
        start_date: today
      }),
      this.requestDataset({
        dataset: 'TaiwanStockPrice',
        data_id: 'TAIEX',
        start_date: startDate,
        end_date: today
      })
    ]);

    const latestIntraday = taiexSeries.at(-1);
    const daily = taiexDaily.filter((row) => typeof row.close === 'number');
    // 盤中：昨收 = 今天以前最後一筆日線；沒有盤中資料時：顯示最新日線收盤，昨收取它前一筆。
    const previousRows = typeof latestIntraday?.TAIEX === 'number'
      ? daily.filter((row) => row.date < today)
      : daily.slice(0, -1);
    const price = latestIntraday?.TAIEX ?? daily.at(-1)?.close;
    const prevClose = previousRows.at(-1)?.close;

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

  async buildFutureRecord() {
    const quote = this.quotes.find((item) => item.symbol === 'TXF=F');
    return this.createFallbackRecord(quote, {
      note: 'FinMind futures mapping is prepared but not enabled until the exact futures dataset is confirmed'
    });
  }

  async buildStockRecords(today, startDate) {
    const stockQuotes = this.quotes.filter((item) => item.symbol.endsWith('.TW'));
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
}
