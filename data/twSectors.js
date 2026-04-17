import { SECTOR_COLORS, SECTOR_ORDER } from './twStocks.js';

export const TW_SECTORS = SECTOR_ORDER.map((name) => ({
  name,
  color: SECTOR_COLORS[name]
}));

export { SECTOR_ORDER, SECTOR_COLORS };
