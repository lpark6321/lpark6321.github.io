// 市場地圖的成分股名單：加權、台灣50、中型100 三份成分股合成一份，每檔帶各指數的權重、排名與分類。
// Yahoo 報價清單（services/yahooTwQuotes.js）與 Page6 市場地圖共用這一份。
import { TAIEX_BY_CODE } from './taiexWeightedConstituents.js';
import { TW50_BY_CODE } from './tw50Constituents.js';
import { MID100_BY_CODE } from './twMid100Constituents.js';
import { TW_STOCK_UNIVERSE } from './twStocks.js';

const STOCK_BY_CODE = Object.fromEntries(TW_STOCK_UNIVERSE.map((stock) => [stock.code, stock]));

function buildUniverse() {
  const map = new Map();
  const row = (code, name) => {
    if (!map.has(code)) map.set(code, { code, name, sector: STOCK_BY_CODE[code]?.sector || '', isIn0050: false, isInMid100: false });
    return map.get(code);
  };

  Object.values(TAIEX_BY_CODE).forEach((item) => {
    Object.assign(row(item.code, item.name), {
      sector: item.sector,
      taiexSector: item.sector,
      yahooSector: item.yahooSector,
      taiexWeightPct: item.weightPct,
      taiexRank: item.rank
    });
  });
  Object.values(TW50_BY_CODE).forEach((item) => {
    const target = row(item.code, item.name);
    Object.assign(target, { isIn0050: true, tw50WeightPct: item.weightPct, tw50Major: item.majorGroup, tw50Rank: item.rank });
    target.sector ||= item.majorGroup;
  });
  Object.values(MID100_BY_CODE).forEach((item) => {
    const target = row(item.code, item.name);
    Object.assign(target, { isInMid100: true, mid100WeightPct: item.weightPct, mid100Major: item.majorGroup, mid100Rank: item.rank });
    target.sector ||= item.majorGroup;
  });

  return [...map.values()].sort((a, b) => (b.taiexWeightPct || 0) - (a.taiexWeightPct || 0));
}

export const MARKET_UNIVERSE = buildUniverse();
export const UNIVERSE_BY_CODE = Object.fromEntries(MARKET_UNIVERSE.map((stock) => [stock.code, stock]));

// 內建名單裡的中文股名；查不到回傳空字串（全市場名稱由證交所資料補，見 services/quoteUtils.js 的 stockName）。
export function universeName(code) {
  return UNIVERSE_BY_CODE[code]?.name || STOCK_BY_CODE[code]?.name || '';
}
