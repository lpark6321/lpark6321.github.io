// 市場地圖布局演算法：計算方塊圖、類股群組與旭日圖所需的比例資料。
export const SECTOR_HEADER_HEIGHT = 22;

// rowSum：函式用途註解，說明此處封裝一段可重用的流程。
function rowSum(row) {
  return row.reduce((sum, value) => sum + value, 0);
}

// worstRatio：函式用途註解，說明此處封裝一段可重用的流程。
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

// normalizeAreas：函式用途註解，說明此處封裝一段可重用的流程。
function normalizeAreas(items, container) {
  const positive = items
    .map((item) => ({ ...item, value: Number(item.value) || 0 }))
    .filter((item) => item.value > 0);
  if (!positive.length) return [];

  // totalValue：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const totalValue = positive.reduce((sum, item) => sum + item.value, 0);
  const totalArea = Math.max(container.w, 0) * Math.max(container.h, 0);
  return positive.map((item) => ({
    ...item,
    area: (item.value / totalValue) * totalArea
  }));
}

// layoutRow：函式用途註解，說明此處封裝一段可重用的流程。
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

// squarify：函式用途註解，說明此處封裝一段可重用的流程。
export function squarify(items, container) {
  if (!Array.isArray(items) || !items.length) return [];
  if (container.w <= 0 || container.h <= 0) return [];

  // sorted：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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

// shrinkRect：函式用途註解，說明此處封裝一段可重用的流程。
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

// computeSectorAvg：函式用途註解，說明此處封裝一段可重用的流程。
export function computeSectorAvg(stocks) {
  if (!stocks.length) return 0;
  // total：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const total = stocks.reduce((sum, stock) => sum + (Number(stock.changePct) || 0), 0);
  return total / stocks.length;
}

// layoutWithGroups：函式用途註解，說明此處封裝一段可重用的流程。
export function layoutWithGroups(sectors, containerW, containerH, gapBetweenSectors = 2, gapBetweenTiles = 1) {
  if (!Array.isArray(sectors) || !sectors.length) return [];

  const sectorItems = sectors
    .map((sector) => {
      // value：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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

    // stockRects：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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
