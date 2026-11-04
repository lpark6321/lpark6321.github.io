// 台指期貨／選擇權的商品定義：全站唯一的一份（marketFeed、Page1、C 區圖表、Page4 共用）。

// 盤面上的兩個台指商品：代號是券商橋接用的代碼，storeKey 是 marketFeed 寫入的 store 鍵。
export const TW_FUTURES_PRODUCTS = [
  { label: '台指(全)', symbol: 'FITXN*1', storeKey: 'futuresFull', session: 'full' },
  { label: '台指', symbol: 'FITX*1', storeKey: 'futuresDay', session: 'day' }
];

export const TW_FUTURES_BY_LABEL = Object.fromEntries(TW_FUTURES_PRODUCTS.map((product) => [product.label, product]));
export const TW_FUTURES_BY_SYMBOL = Object.fromEntries(TW_FUTURES_PRODUCTS.map((product) => [product.symbol, product]));

// 每點價值（新台幣）。台指選擇權 50 元；期貨腳位可選契約，預設小台。
export const TXO_POINT_VALUE = 50;
export const FUTURES_CONTRACTS = [
  { value: 'MTX', label: '小台', pointValue: 50 },
  { value: 'TX', label: '大台', pointValue: 200 },
  { value: 'TMF', label: '微台', pointValue: 10 }
];
export const DEFAULT_FUTURES_CONTRACT = 'MTX';

export function futuresPointValue(contract) {
  return (FUTURES_CONTRACTS.find((item) => item.value === contract) || FUTURES_CONTRACTS[0]).pointValue;
}
