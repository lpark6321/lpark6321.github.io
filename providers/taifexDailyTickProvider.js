// 期交所每日逐筆資料提供者：解析逐筆資料並產出期貨行情。
import { parseCsv } from '../services/csv.js';
import { BaseMarketDataProvider } from './baseProvider.js';

const CONTRACT_KEYS = ['contract', 'Contract', 'contract_id', '商品代號'];
const MONTH_KEYS = ['expiry', 'contract_month', '到期月份(週別)', '到期月份'];
const PRICE_KEYS = ['price', 'Price', '成交價格', '成交價', 'match_price'];

function pickValue(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== '') {
      return record[key];
    }
  }
  return undefined;
}

// 只取台指期 TX（不含 MTX 小台），排除價差單（到期月份含 "/"），並只用最近月份。
// 沒有商品欄位的檔案視為已是單一商品的逐筆資料。
export function selectNearMonthTx(rows) {
  if (!rows.some((row) => pickValue(row, CONTRACT_KEYS) !== undefined)) return rows;
  const tx = rows.filter((row) => String(pickValue(row, CONTRACT_KEYS)).trim() === 'TX'
    && !String(pickValue(row, MONTH_KEYS) ?? '').includes('/'));
  const months = tx.map((row) => String(pickValue(row, MONTH_KEYS) ?? '').trim());
  const nearMonth = months.filter(Boolean).sort()[0];
  return nearMonth === undefined ? tx : tx.filter((row, index) => months[index] === nearMonth);
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

  // 期交所官網的逐筆檔是 zip 包的 Big5 CSV；瀏覽器以 UTF-8 解碼，必須先轉成 UTF-8 再放到可跨域讀取的位置。
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

    const txRows = selectNearMonthTx(rows);
    const latestPrice = Number(txRows.length ? pickValue(txRows.at(-1), PRICE_KEYS) : NaN);
    const firstPrice = Number(txRows.length ? pickValue(txRows[0], PRICE_KEYS) : NaN);

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
}
