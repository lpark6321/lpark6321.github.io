// 條件篩選登錄表：集中定義選股條件、預設參數與判斷函式。
export const FILTER_REGISTRY = [
  {
    id: 'ma_bullish',
    name: '均線多頭排列',
    defaultEnabled: false,
    fn: (stock) => stock.ma5 > stock.ma20 && stock.ma20 > stock.ma60
  },
  {
    id: 'rsi_range',
    name: 'RSI 30~70',
    defaultEnabled: false,
    fn: (stock, settings) => stock.rsi >= settings.rsiMin && stock.rsi <= settings.rsiMax
  },
  {
    id: 'dividend_min',
    name: '殖利率門檻',
    defaultEnabled: false,
    fn: (stock, settings) => stock.dividendYield >= settings.dividendMin
  }
];

// applyFilters：函式用途註解，說明此處封裝一段可重用的流程。
export function applyFilters(stocks, enabled, settings) {
  // active：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const active = FILTER_REGISTRY.filter((f) => enabled.includes(f.id));
  if (active.length === 0) return stocks;
  return stocks.filter((stock) => active.every((f) => f.fn(stock, settings)));
}
