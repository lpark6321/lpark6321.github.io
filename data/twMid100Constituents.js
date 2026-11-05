// 中型100成分股（市場地圖分組與權重）：資料在設定檔（data/config/marketConfig.json），原始檔是 data/config/source/mid100/ 的 CSV。
import { MARKET_CONFIG } from './marketConfig.js';

export const MID100_DATA_DATE = MARKET_CONFIG.mid100.dataDate;
export const MID100_MAJOR_GROUP_ORDER = ['電子', '金融', '航運', '傳產', '其他'];
export const MID100_CONSTITUENTS = MARKET_CONFIG.mid100.constituents;
export const MID100_BY_CODE = Object.fromEntries(MID100_CONSTITUENTS.map((row) => [row.code, row]));
