// 台股類股定義：集中管理類股排序、顏色與分類輔助資料。
import { SECTOR_COLORS, SECTOR_ORDER } from './twStocks.js';

export const TW_SECTORS = SECTOR_ORDER.map((name) => ({
  name,
  color: SECTOR_COLORS[name]
}));

export { SECTOR_ORDER, SECTOR_COLORS };
