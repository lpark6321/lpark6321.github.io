import { BaseMarketDataProvider } from './baseProvider.js';

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((item) => item.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((item) => item.trim());
    return headers.reduce((record, header, index) => {
      record[header] = values[index];
      return record;
    }, {});
  });
}

function pickValue(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== '') {
      return record[key];
    }
  }
  return undefined;
}

export class TaifexDailyTickProvider extends BaseMarketDataProvider {
  constructor(options) {
    super({
      type: 'taifex',
      name: 'TAIFEX Daily Tick',
      description: 'Official TAIFEX file path for daily tick exports. This browser version expects a hosted CSV or JSON file URL and maps the latest TX futures tick.',
      cacheTtl: 20000,
      ...options
    });
    this.dataUrl = options.dataUrl || '';
  }

  async requestRemoteData() {
    if (!this.dataUrl) {
      throw new Error('Provide a TAIFEX daily tick CSV or JSON URL first');
    }

    const response = await fetch(this.dataUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json,text/csv,text/plain,*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`TAIFEX source HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : parseCsv(await response.text());

    const rows = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('TAIFEX daily tick payload is empty');
    }

    const txRows = rows.filter((row) => {
      const contract = String(pickValue(row, ['contract', 'Contract', 'contract_id', '商品代號', '商品名稱']) || '');
      return contract.includes('TX');
    });

    const latestRow = txRows.at(-1) || rows.at(-1);
    const firstRow = txRows[0] || rows[0];
    const latestPrice = Number(pickValue(latestRow, ['price', 'Price', '成交價格', '成交價', 'match_price']));
    const firstPrice = Number(pickValue(firstRow, ['price', 'Price', '成交價格', '成交價', 'match_price']));

    const map = new Map();
    map.set('TXF=F', {
      symbol: 'TXF=F',
      name: this.quotes.find((item) => item.symbol === 'TXF=F')?.name || 'Taiwan Index Futures',
      price: Number.isFinite(latestPrice) ? latestPrice : undefined,
      change: Number.isFinite(latestPrice) && Number.isFinite(firstPrice) ? latestPrice - firstPrice : undefined,
      changePercent: Number.isFinite(latestPrice) && Number.isFinite(firstPrice) && firstPrice !== 0
        ? ((latestPrice - firstPrice) / firstPrice) * 100
        : undefined
    });

    return this.mergeRecords(map);
  }

  async fetchQuotes(options = {}) {
    return this.withCache(options, () => this.requestRemoteData());
  }
}
