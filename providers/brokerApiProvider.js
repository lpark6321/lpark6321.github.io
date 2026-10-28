// 券商 API 資料提供者：預留串接券商行情端點的標準介面。
import { BaseMarketDataProvider } from './baseProvider.js';

// BrokerApiProvider：類別用途註解，集中管理相關狀態與方法。
export class BrokerApiProvider extends BaseMarketDataProvider {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(options) {
    super({ name: 'Broker API', ...options });
  }

  // fetchQuotes：方法用途註解，處理此元件或類別的一段行為。
  async fetchQuotes() {
    throw new Error('BrokerApiProvider 尚未實作，請接上券商 API 後替換 request 邏輯');
  }
}
