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

export function applyFilters(stocks, enabled, settings) {
  const active = FILTER_REGISTRY.filter((f) => enabled.includes(f.id));
  if (active.length === 0) return stocks;
  return stocks.filter((stock) => active.every((f) => f.fn(stock, settings)));
}
