// 台灣50成分股（市場地圖分組與權重）：資料在設定檔（data/config/marketConfig.json），原始檔是 data/config/source/tw50/ 的 CSV。
import { MARKET_CONFIG } from './marketConfig.js';

export const TW50_DATA_DATE = MARKET_CONFIG.tw50.dataDate;
export const TW50_MAJOR_GROUP_ORDER = ['電子', '金融', '傳產'];
export const TW50_CONSTITUENTS = MARKET_CONFIG.tw50.constituents;
export const TW50_BY_CODE = Object.fromEntries(TW50_CONSTITUENTS.map((row) => [row.code, row]));
