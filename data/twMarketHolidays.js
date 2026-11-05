// 台股休市日（平日才列；週末本來就不開市）：證交所公布的國定假日與春節前後「僅辦理結算交割、市場無交易」日。
// 期貨日盤與現貨同休。資料在設定檔（data/config/marketConfig.json），證交所公布新年度後重算設定檔即可。
import { MARKET_CONFIG } from './marketConfig.js';

export const TW_HOLIDAY_YEARS = MARKET_CONFIG.holidays.years;
// 日期 'YYYY-MM-DD' → 休市名稱（例如「中華民國開國紀念日」）。
export const TW_MARKET_HOLIDAYS = new Map(MARKET_CONFIG.holidays.days);
