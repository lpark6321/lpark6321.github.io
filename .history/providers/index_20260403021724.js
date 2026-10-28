import { FinMindProvider } from './finMindProvider.js';
import { TaifexDailyTickProvider } from './taifexDailyTickProvider.js';
import { YahooFinanceProvider } from './yahooFinanceProvider.js';

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
