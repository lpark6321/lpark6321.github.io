import { BaseMarketDataProvider } from './baseProvider.js';

export class BrokerApiProvider extends BaseMarketDataProvider {
  constructor(options) {
    super({ name: 'Broker API', ...options });
  }

  async fetchQuotes() {
    throw new Error('BrokerApiProvider 尚未實作，請接上券商 API 後替換 request 邏輯');
  }
}
