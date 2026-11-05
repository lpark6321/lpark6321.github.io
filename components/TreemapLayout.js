// 市場地圖布局演算法：計算方塊圖、類股群組與旭日圖所需的比例資料。
import { weightedAverage } from '../services/quoteUtils.js';
import { TW50_MAJOR_GROUP_ORDER } from '../data/tw50Constituents.js';
import { MID100_MAJOR_GROUP_ORDER } from '../data/twMid100Constituents.js';
import {
  TAIEX_PRIMARY_SECTORS,
  TAIEX2_PRIMARY_SECTORS,
  TAIEX_OTHER_SECTOR_WEIGHT,
  TAIEX2_OTHER_SECTOR_WEIGHT,
  TAIEX_STOCK_THRESHOLD,
  TAIEX2_STOCK_THRESHOLD,
  TAIEX_WEIGHTED_SECTOR_ORDER,
  TAIEX2_WEIGHTED_SECTOR_ORDER,
  TAIEX_SECTOR_WEIGHTS
} from '../data/taiexWeightedConstituents.js';

export const SECTOR_HEADER_HEIGHT = 22;

const OTHER = '其他';

const ELECTRONIC_SECTOR_SET = new Set([
  '電子',
  '半導體',
  '半導體業',
  '電子零組件',
  '電子零組件業',
  '電腦及週邊設備',
  '電腦及週邊設備業',
  '通信網路',
  '通信網路業',
  '光電',
  '光電業',
  '其他電子',
  '其他電子業',
  // 證交所「電子工業」也包含資訊服務業（與 page2 的分類一致）。
  '資訊服務',
  '資訊服務業'
]);

// 各分組模式的面積都用該指數的成分權重。
const WEIGHT_KEY = {
  sector: 'taiexWeightPct',
  weighted: 'taiexWeightPct',
  weighted2: 'taiexWeightPct',
  tw50: 'tw50WeightPct',
  mid100: 'mid100WeightPct'
};

export function groupWeight(stock, groupMode) {
  const weight = Number(stock[WEIGHT_KEY[groupMode]]);
  return weight > 0 ? weight : 0;
}

// 台股慣例：紅漲、綠跌。
export function getHeatColor(changePct) {
  if (changePct > 5) return '#8b0000';
  if (changePct > 3) return '#c0392b';
  if (changePct > 1) return '#e74c3c';
  if (changePct > 0) return '#922b21';
  if (changePct === 0) return '#1c2236';
  if (changePct > -1) return '#1a5c35';
  if (changePct > -3) return '#27ae60';
  if (changePct > -5) return '#2ecc71';
  return '#00a86b';
}

// 沒有報價時的底色（方塊圖另外疊斜線）。
export const NO_DATA_COLOR = '#262b36';

// 量比：1 倍附近是中性色，越大越亮（爆量），小於 1 偏藍（量縮）。
export function getVolumeColor(ratio) {
  if (ratio >= 3) return '#ff8c00';
  if (ratio >= 2) return '#e67e22';
  if (ratio >= 1.5) return '#b8860b';
  if (ratio >= 1.2) return '#7a5a12';
  if (ratio >= 0.8) return '#1c2236';
  if (ratio >= 0.5) return '#22507a';
  return '#1c3d5a';
}

// 方塊／弧段的顏色：metric 是 'changePct' 或 'volRatio'；沒有該指標的資料回傳 null（畫成「無資料」）。
export function metricColor(stock, metric) {
  const value = stock?.[metric];
  if (value == null || !Number.isFinite(Number(value))) return null;
  return metric === 'volRatio' ? getVolumeColor(Number(value)) : getHeatColor(Number(value));
}

// 類股平均：依權重（stock.value）加權；沒有報價的股票不算進去，全部沒有就回傳 null。
export const sectorAverage = (stocks, key) => weightedAverage(stocks, (stock) => stock[key], (stock) => stock.value);

function classifyMajorBySector(stock) {
  const sector = String(stock.sector || stock.taiexSector || '');
  if (sector.includes('金融')) return '金融';
  if (sector.includes('航運') || sector.includes('航空')) return '航運';
  if (ELECTRONIC_SECTOR_SET.has(sector) || sector.includes('電子') || sector.includes('半導體')) return '電子';
  if (sector && sector !== OTHER) return '傳產';
  return OTHER;
}

function resolveMajor(stock, groupMode) {
  if (groupMode === 'tw50') {
    if (TW50_MAJOR_GROUP_ORDER.includes(stock.tw50Major)) return stock.tw50Major;
    const major = classifyMajorBySector(stock);
    return major === '電子' || major === '金融' ? major : '傳產';
  }
  if (MID100_MAJOR_GROUP_ORDER.includes(stock.mid100Major)) return stock.mid100Major;
  return classifyMajorBySector(stock);
}

const byValueDesc = (a, b) => b.value - a.value;

// 產業名單裡沒有的產業併入「其他」。
function sectorOf(stock) {
  return TAIEX_SECTOR_WEIGHTS.some((row) => row.name === stock.taiexSector) ? stock.taiexSector : OTHER;
}

// 「類股」模式：每個產業一個合成 tile，面積用期交所公告的產業權重，漲跌與量比用有報價的成分股加權平均。
function buildSectorOnlyGroups(taiexStocks) {
  const members = new Map(TAIEX_SECTOR_WEIGHTS.map((row) => [row.name, []]));
  taiexStocks.forEach((stock) => members.get(sectorOf(stock))?.push(stock));
  return TAIEX_SECTOR_WEIGHTS
    .filter((row) => row.weightPct > 0)
    .map((row) => ({
      name: row.name,
      stocks: [{
        code: `SECTOR-${row.name}`,
        name: row.name,
        sector: row.name,
        subSector: '類股',
        taiexSector: row.name,
        taiexWeightPct: row.weightPct,
        value: row.weightPct,
        marketCap: row.weightPct,
        changePct: sectorAverage(members.get(row.name), 'changePct'),
        volRatio: sectorAverage(members.get(row.name), 'volRatio'),
        syntheticConstituentOnly: true,
        isSectorAggregate: true
      }]
    }));
}

// 「加權/加權2」：產業 -> 成分股；低於門檻的成分併成 REST，維持產業總權重。
function buildWeightedGroups(taiexStocks, { primarySectors, sectorOrder, otherSectorWeight, stockThreshold, label }) {
  const sectorWeight = new Map(TAIEX_SECTOR_WEIGHTS.map((row) => [row.name, row.weightPct]));
  sectorWeight.set(OTHER, otherSectorWeight);
  const grouped = new Map(sectorOrder.map((name) => [name, []]));
  taiexStocks.forEach((stock) => {
    grouped.get(primarySectors.includes(stock.taiexSector) ? stock.taiexSector : OTHER).push(stock);
  });

  return sectorOrder
    .map((name) => {
      const stocks = grouped.get(name).filter((stock) => stock.value >= stockThreshold);
      const minors = grouped.get(name).filter((stock) => stock.value < stockThreshold);
      const majorSum = stocks.reduce((sum, stock) => sum + stock.value, 0);
      const remainder = +(Math.max(sectorWeight.get(name) || 0, majorSum) - majorSum).toFixed(4);
      if (remainder > 0.0001) {
        stocks.push({
          code: `REST-${name}`,
          name: '其他(<0.1%)',
          sector: name,
          subSector: label,
          taiexSector: name,
          taiexWeightPct: remainder,
          value: remainder,
          marketCap: remainder,
          changePct: sectorAverage(minors, 'changePct'),
          volRatio: sectorAverage(minors, 'volRatio'),
          syntheticConstituentOnly: true,
          isWeightedRemainder: true
        });
      }
      return { name, stocks };
    })
    .filter((group) => group.stocks.length);
}

// 「台灣50/中型100」：依大類（電子/金融/…）分組。
function buildMajorGroups(stocks, groupMode) {
  const order = groupMode === 'tw50' ? TW50_MAJOR_GROUP_ORDER : MID100_MAJOR_GROUP_ORDER;
  const grouped = new Map(order.map((name) => [name, []]));
  stocks.forEach((stock) => grouped.get(resolveMajor(stock, groupMode))?.push(stock));
  return order.map((name) => ({ name, stocks: grouped.get(name) })).filter((group) => group.stocks.length);
}

// 方塊圖與旭日圖共用的分組：回傳 [{ name, stocks }]，每檔 stock.value 為該模式的權重（依權重大到小）。
// 「類股」模式點進某個產業（drillSector）時，回傳該產業的個股。
export function buildGroups(stocks, groupMode, { drillSector = null } = {}) {
  const weighted = stocks
    .map((stock) => ({ ...stock, value: groupWeight(stock, groupMode) }))
    .filter((stock) => stock.value > 0)
    .sort(byValueDesc);
  if (groupMode === 'sector' && drillSector) return [{ name: drillSector, stocks: weighted.filter((stock) => sectorOf(stock) === drillSector) }];
  if (groupMode === 'sector') return buildSectorOnlyGroups(weighted);
  if (groupMode === 'weighted') {
    return buildWeightedGroups(weighted, {
      primarySectors: TAIEX_PRIMARY_SECTORS,
      sectorOrder: TAIEX_WEIGHTED_SECTOR_ORDER,
      otherSectorWeight: TAIEX_OTHER_SECTOR_WEIGHT,
      stockThreshold: TAIEX_STOCK_THRESHOLD,
      label: '加權'
    });
  }
  if (groupMode === 'weighted2') {
    return buildWeightedGroups(weighted, {
      primarySectors: TAIEX2_PRIMARY_SECTORS,
      sectorOrder: TAIEX2_WEIGHTED_SECTOR_ORDER,
      otherSectorWeight: TAIEX2_OTHER_SECTOR_WEIGHT,
      stockThreshold: TAIEX2_STOCK_THRESHOLD,
      label: '加權2'
    });
  }
  if (groupMode === 'tw50' || groupMode === 'mid100') return buildMajorGroups(weighted, groupMode);
  return [];
}

function rowSum(row) {
  return row.reduce((sum, value) => sum + value, 0);
}

function worstRatio(row, rowLength) {
  if (!row.length || rowLength <= 0) return Number.POSITIVE_INFINITY;
  const sum = rowSum(row);
  if (sum <= 0) return Number.POSITIVE_INFINITY;
  const maxArea = Math.max(...row);
  const minArea = Math.min(...row);
  return Math.max(
    (rowLength * rowLength * maxArea) / (sum * sum),
    (sum * sum) / (rowLength * rowLength * Math.max(minArea, 1e-9))
  );
}

function normalizeAreas(items, container) {
  const positive = items
    .map((item) => ({ ...item, value: Number(item.value) || 0 }))
    .filter((item) => item.value > 0);
  if (!positive.length) return [];

  const totalValue = positive.reduce((sum, item) => sum + item.value, 0);
  const totalArea = Math.max(container.w, 0) * Math.max(container.h, 0);
  return positive.map((item) => ({
    ...item,
    area: (item.value / totalValue) * totalArea
  }));
}

function layoutRow(rowItems, rowAreas, rect, horizontal) {
  const result = [];
  const totalArea = rowSum(rowAreas);
  if (totalArea <= 0) return { result, rect };

  if (horizontal) {
    const rowWidth = totalArea / rect.h;
    let y = rect.y;
    rowItems.forEach((item, index) => {
      const h = rowAreas[index] / rowWidth;
      result.push({
        ...item,
        x: rect.x,
        y,
        w: rowWidth,
        h
      });
      y += h;
    });
    return {
      result,
      rect: { x: rect.x + rowWidth, y: rect.y, w: rect.w - rowWidth, h: rect.h }
    };
  }

  const rowHeight = totalArea / rect.w;
  let x = rect.x;
  rowItems.forEach((item, index) => {
    const w = rowAreas[index] / rowHeight;
    result.push({
      ...item,
      x,
      y: rect.y,
      w,
      h: rowHeight
    });
    x += w;
  });
  return {
    result,
    rect: { x: rect.x, y: rect.y + rowHeight, w: rect.w, h: rect.h - rowHeight }
  };
}

export function squarify(items, container) {
  if (!Array.isArray(items) || !items.length) return [];
  if (container.w <= 0 || container.h <= 0) return [];

  const sorted = normalizeAreas(items, container).sort((a, b) => b.area - a.area);
  if (!sorted.length) return [];

  const output = [];
  let remaining = { ...container };
  let rowItems = [];
  let rowAreas = [];
  let index = 0;

  while (index < sorted.length) {
    const next = sorted[index];
    const nextAreas = [...rowAreas, next.area];
    const shortSide = Math.min(remaining.w, remaining.h);
    if (!rowAreas.length || worstRatio(nextAreas, shortSide) <= worstRatio(rowAreas, shortSide)) {
      rowItems.push(next);
      rowAreas = nextAreas;
      index += 1;
    } else {
      const horizontal = remaining.w >= remaining.h;
      const laidOut = layoutRow(rowItems, rowAreas, remaining, horizontal);
      output.push(...laidOut.result);
      remaining = laidOut.rect;
      rowItems = [];
      rowAreas = [];
    }
  }

  if (rowItems.length) {
    const horizontal = remaining.w >= remaining.h;
    const laidOut = layoutRow(rowItems, rowAreas, remaining, horizontal);
    output.push(...laidOut.result);
  }

  return output.map((item) => {
    const { area, ...rest } = item;
    return rest;
  });
}

function shrinkRect(rect, inset) {
  const x = rect.x + inset;
  const y = rect.y + inset;
  const w = rect.w - inset * 2;
  const h = rect.h - inset * 2;
  return {
    x,
    y,
    w: Math.max(0, w),
    h: Math.max(0, h)
  };
}

export function layoutWithGroups(sectors, containerW, containerH, gapBetweenSectors = 2, gapBetweenTiles = 1) {
  if (!Array.isArray(sectors) || !sectors.length) return [];

  const sectorItems = sectors
    .map((sector) => {
      const value = sector.stocks.reduce((sum, stock) => {
        return sum + (Number(stock.value) || Number(stock.marketCap) || 0);
      }, 0);
      return { id: sector.name, value, stocks: sector.stocks };
    })
    .filter((sector) => sector.value > 0);

  const sectorRects = squarify(sectorItems, { x: 0, y: 0, w: containerW, h: containerH });

  return sectorRects.map((sectorRect) => {
    const paddedSectorRect = shrinkRect(sectorRect, gapBetweenSectors / 2);
    const stockContainer = {
      x: paddedSectorRect.x + gapBetweenTiles / 2,
      y: paddedSectorRect.y + SECTOR_HEADER_HEIGHT + gapBetweenTiles / 2,
      w: paddedSectorRect.w - gapBetweenTiles,
      h: paddedSectorRect.h - SECTOR_HEADER_HEIGHT - gapBetweenTiles
    };

    const stockItems = (sectorRect.stocks || [])
      .map((stock) => ({
        ...stock,
        id: stock.code,
        value: Number(stock.value) || Number(stock.marketCap) || 0
      }))
      .filter((stock) => stock.value > 0)
      .sort((a, b) => b.value - a.value);

    const stockRects = squarify(stockItems, stockContainer).map((stockRect) => ({
      ...stockRect,
      rect: shrinkRect(stockRect, gapBetweenTiles / 2)
    }));

    return {
      sectorName: sectorRect.id,
      sectorRect: paddedSectorRect,
      stocks: stockRects
    };
  });
}
