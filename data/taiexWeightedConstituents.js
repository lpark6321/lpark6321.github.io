// 加權指數成分與產業權重：資料在設定檔（data/config/marketConfig.json，來源期交所權重頁 + 證交所產業別），
// 這裡只負責衍生出市場地圖要用的分區與門檻。
import { MARKET_CONFIG } from './marketConfig.js';

export const TAIEX_DATA_DATE = MARKET_CONFIG.taiex.dataDate;

// 市場地圖「加權」只畫 0.1% 以上個股，「加權2」到 0.01%（設定檔保留 ≥ 0.1% 的成分股）
export const TAIEX_STOCK_THRESHOLD = 0.1;
export const TAIEX2_STOCK_THRESHOLD = 0.01;

// 產業權重：全部成分股依產業別加總（設定檔重算時算好）。
export const TAIEX_SECTOR_WEIGHTS = MARKET_CONFIG.taiex.sectorWeights;

// 規則：只取 1% 以上產業為獨立分區，其餘全部歸入「其他」
export const TAIEX_PRIMARY_SECTORS = TAIEX_SECTOR_WEIGHTS
  .filter((row) => row.weightPct >= 1 && row.name !== '其他')
  .map((row) => row.name);

export const TAIEX_WEIGHTED_SECTOR_ORDER = [...TAIEX_PRIMARY_SECTORS, '其他'];

const PRIMARY_SECTOR_SET = new Set(TAIEX_PRIMARY_SECTORS);
export const TAIEX_OTHER_SECTOR_WEIGHT = +TAIEX_SECTOR_WEIGHTS
  .filter((row) => !PRIMARY_SECTOR_SET.has(row.name))
  .reduce((sum, row) => sum + row.weightPct, 0)
  .toFixed(4);

// 加權2：前 19 大產業（不含原始「其他」）+ 其餘併到「其他」
export const TAIEX2_PRIMARY_SECTORS = [...TAIEX_SECTOR_WEIGHTS]
  .filter((row) => row.name !== '其他')
  .sort((a, b) => b.weightPct - a.weightPct)
  .slice(0, 19)
  .map((row) => row.name);

export const TAIEX2_WEIGHTED_SECTOR_ORDER = [...TAIEX2_PRIMARY_SECTORS, '其他'];

const PRIMARY2_SECTOR_SET = new Set(TAIEX2_PRIMARY_SECTORS);
export const TAIEX2_OTHER_SECTOR_WEIGHT = +TAIEX_SECTOR_WEIGHTS
  .filter((row) => row.name === '其他' || !PRIMARY2_SECTOR_SET.has(row.name))
  .reduce((sum, row) => sum + row.weightPct, 0)
  .toFixed(4);

const YAHOO_SECTOR_BY_TAIEX_SECTOR = {
  半導體業: '半導體',
  電子零組件業: '電子零組件',
  金融保險: '金融',
  電腦及週邊設備業: '電腦及週邊設備',
  其他電子業: '其他電子業',
  通信網路業: '通信網路業',
  航運業: '航運',
  電機機械: '電機機械',
  光電業: '光電',
  塑膠工業: '塑膠工業',
  其他: '其他'
};

function resolveYahooSector(taiexSector) {
  return YAHOO_SECTOR_BY_TAIEX_SECTOR[taiexSector] || '其他';
}

export const TAIEX_WEIGHTED_CONSTITUENTS = MARKET_CONFIG.taiex.constituents.map((row) => ({
  ...row,
  yahooSector: resolveYahooSector(row.sector)
}));

export const TAIEX_BY_CODE = Object.fromEntries(
  TAIEX_WEIGHTED_CONSTITUENTS.map((row) => [row.code, row])
);

// 權重前十大：Page1 卡片、Page2 統計與 Yahoo 報價清單共用，權重表更新時自動跟著變。
export const TAIEX_TOP10 = [...TAIEX_WEIGHTED_CONSTITUENTS].sort((a, b) => b.weightPct - a.weightPct).slice(0, 10);
