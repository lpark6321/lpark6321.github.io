// 市場資料提供者工廠：依設定建立 FinMind、Yahoo、券商或期交所資料源。
import { FinMindProvider } from './finMindProvider.js';
import { TaifexDailyTickProvider } from './taifexDailyTickProvider.js';
import { YahooFinanceProvider } from './yahooFinanceProvider.js';

// createMarketDataProvider：函式用途註解，說明此處封裝一段可重用的流程。
export function createMarketDataProvider(options) {
  switch (options.type) {
    case 'yahoo':
      return new YahooFinanceProvider(options);
    case 'finmind':
      return new FinMindProvider(options);
    case 'taifex':
      return new TaifexDailyTickProvider(options);
    default:
      throw new Error(`Unsupported provider type: ${options.type}`);
  }
}
