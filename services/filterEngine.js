// 選股條件登錄表（Page5）：每個條件定義名稱、參數欄位與判斷函式；資料欄位來自證交所盤後資料（services/twseData.js）。
// 新增條件只要在這裡加一筆，篩選面板會自動產生勾選框與參數欄位。缺資料的股票不符合條件（不當成 0）。
const has = (value) => value != null && Number.isFinite(Number(value));

export const FILTER_REGISTRY = [
  {
    id: 'pe_max',
    name: '本益比上限',
    params: [{ key: 'peMax', label: '本益比 ≤', defaultValue: 15 }],
    fn: (stock, settings) => has(stock.pe) && stock.pe > 0 && stock.pe <= settings.peMax
  },
  {
    id: 'yield_min',
    name: '殖利率下限',
    params: [{ key: 'yieldMin', label: '殖利率(%) ≥', defaultValue: 4 }],
    fn: (stock, settings) => has(stock.dividendYield) && stock.dividendYield >= settings.yieldMin
  },
  {
    id: 'pb_max',
    name: '股價淨值比上限',
    params: [{ key: 'pbMax', label: '股價淨值比 ≤', defaultValue: 1.5 }],
    fn: (stock, settings) => has(stock.pb) && stock.pb <= settings.pbMax
  },
  {
    id: 'volume_min',
    name: '成交量下限',
    params: [{ key: 'volumeMin', label: '成交量(張) ≥', defaultValue: 1000 }],
    fn: (stock, settings) => has(stock.volume) && stock.volume >= settings.volumeMin
  },
  {
    id: 'change_range',
    name: '漲跌幅區間',
    params: [
      { key: 'changeMin', label: '漲跌幅(%) ≥', defaultValue: -3 },
      { key: 'changeMax', label: '漲跌幅(%) ≤', defaultValue: 3 }
    ],
    fn: (stock, settings) => has(stock.changePct) && stock.changePct >= settings.changeMin && stock.changePct <= settings.changeMax
  }
];

export const DEFAULT_FILTER_SETTINGS = Object.fromEntries(
  FILTER_REGISTRY.flatMap((filter) => filter.params.map((param) => [param.key, param.defaultValue]))
);

export function applyFilters(stocks, enabled, settings) {
  const active = FILTER_REGISTRY.filter((f) => enabled.includes(f.id));
  if (active.length === 0) return stocks;
  return stocks.filter((stock) => active.every((f) => f.fn(stock, settings)));
}
