// Pure Squarified Treemap Layout Algorithm
// No DOM, no Canvas, no side effects
// Reference: Bruls, Huizing, van Wijk (2000)

const SECTOR_HEADER_HEIGHT = 22
const GAP_BETWEEN_SECTORS = 3
const GAP_BETWEEN_TILES = 1

/**
 * Compute worst aspect ratio in a row
 * row: array of normalized areas
 * rowLength: the shorter dimension of the row's bounding box
 */
function worstRatio(row, rowLength) {
  if (row.length === 0) return Infinity
  const sum = row.reduce((a, b) => a + b, 0)
  const maxArea = Math.max(...row)
  const minArea = Math.min(...row)

  return Math.max(
    (rowLength * rowLength * maxArea) / (sum * sum),
    (sum * sum) / (rowLength * rowLength * minArea)
  )
}

/**
 * Core Squarified Treemap Layout
 * items: [{ id, value, ...rest }] sorted descending by value
 * container: { x, y, w, h }
 * returns: [{ id, x, y, w, h, value, ...rest }]
 */
export function squarify(items, container) {
  if (!items.length) return []
  if (container.w <= 0 || container.h <= 0) return []

  // Normalize values so sum = container area
  const total = items.reduce((s, i) => s + Math.max(0, i.value || 0), 0)
  if (total === 0) return []

  const area = container.w * container.h
  const normalized = items.map(i => ({
    ...i,
    normalizedValue: Math.max(0, (i.value || 0) / total) * area
  }))

  const result = []
  const layoutRows = squarifyRows(normalized, container, 0)
  result.push(...layoutRows)

  return result
}

function squarifyRows(items, container, depth = 0) {
  if (!items.length) return []

  let minX = container.x
  let minY = container.y
  let width = container.w
  let height = container.h

  const result = []
  let currentIndex = 0

  while (currentIndex < items.length && width > 1 && height > 1) {
    const isHorizontal = width >= height

    // Determine row length (shorter dimension)
    const rowLength = isHorizontal ? height : width

    // Greedily grow row while aspect ratio improves
    let row = []
    let rowSum = 0
    let candidate = currentIndex

    while (candidate < items.length) {
      const currentWorst = worstRatio(
        [...row, items[candidate].normalizedValue],
        rowLength
      )
      const nextWorst =
        candidate + 1 < items.length
          ? worstRatio(
              [...row, items[candidate].normalizedValue, items[candidate + 1].normalizedValue],
              rowLength
            )
          : Infinity

      if (currentWorst <= nextWorst) {
        row.push(items[candidate].normalizedValue)
        rowSum += items[candidate].normalizedValue
        candidate++
      } else {
        break
      }
    }

    // Layout this row
    const rowItems = items.slice(currentIndex, currentIndex + row.length)
    const rowRects = layoutRow(
      rowItems,
      row,
      { x: minX, y: minY, w: width, h: height },
      isHorizontal,
      rowLength
    )

    result.push(...rowRects)

    // Update container for next row
    if (isHorizontal) {
      const rowHeightUsed = rowLength > 0 ? rowSum / rowLength : 0
      minY += rowHeightUsed
      height -= rowHeightUsed
    } else {
      const rowWidthUsed = rowLength > 0 ? rowSum / rowLength : 0
      minX += rowWidthUsed
      width -= rowWidthUsed
    }

    currentIndex += row.length
  }

  return result
}

function layoutRow(items, normalizedValues, container, isHorizontal, rowLength) {
  const result = []
  const sum = normalizedValues.reduce((a, b) => a + b, 0)

  let pos = 0

  items.forEach((item, i) => {
    const normVal = normalizedValues[i]
    let x, y, w, h

    if (isHorizontal) {
      w = rowLength > 0 ? sum / rowLength : 0
      h = sum > 0 ? normVal / w : 0
      x = container.x
      y = container.y + pos
      pos += h
    } else {
      h = rowLength > 0 ? sum / rowLength : 0
      w = sum > 0 ? normVal / h : 0
      x = container.x + pos
      y = container.y
      pos += w
    }

    result.push({
      ...item,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h)
    })
  })

  return result
}

/**
 * Layout with Sector Grouping
 * sectors: [{ name, stocks: [{code, name, value, ...}] }]
 * Returns: [{ sectorName, sectorRect, stocks: [{...stockData, rect}] }]
 */
export function layoutWithGroups(sectors, containerW, containerH) {
  // Step 1: compute total marketCap per sector
  const sectorItems = sectors.map(s => ({
    id: s.name,
    value: s.stocks.reduce((sum, st) => sum + (st.marketCap || 0), 0),
    name: s.name,
    stocks: s.stocks
  }))

  // Step 2: squarify sectors into full container
  const sectorRects = squarify(sectorItems, {
    x: 0,
    y: 0,
    w: containerW,
    h: containerH
  })

  // Step 3: for each sector, squarify stocks within that sector's rect
  return sectorRects.map(sr => {
    const innerRect = {
      x: sr.x + GAP_BETWEEN_SECTORS,
      y: sr.y + SECTOR_HEADER_HEIGHT + GAP_BETWEEN_SECTORS,
      w: Math.max(0, sr.w - GAP_BETWEEN_SECTORS * 2),
      h: Math.max(0, sr.h - SECTOR_HEADER_HEIGHT - GAP_BETWEEN_SECTORS * 2)
    }

    const stockItems = sr.stocks.map(s => ({
      id: s.code,
      code: s.code,
      name: s.name,
      value: s.marketCap || 0,
      sector: s.sector,
      subSector: s.subSector,
      marketCap: s.marketCap,
      price: s.price,
      changePct: s.changePct,
      volume: s.volume,
      isIn0050: s.isIn0050
    }))

    const stockRects = squarify(stockItems, innerRect)

    return {
      sectorName: sr.id,
      sectorRect: { x: sr.x, y: sr.y, w: sr.w, h: sr.h },
      stocks: stockRects
    }
  })
}

/**
 * Compute sector average change percentage
 */
export function computeSectorAvg(stocks) {
  if (!stocks.length) return 0
  const sum = stocks.reduce((s, st) => s + (st.changePct || 0), 0)
  return sum / stocks.length
}

export const SECTOR_HEADER_HEIGHT_CONST = SECTOR_HEADER_HEIGHT
export const GAP_BETWEEN_SECTORS_CONST = GAP_BETWEEN_SECTORS
export const GAP_BETWEEN_TILES_CONST = GAP_BETWEEN_TILES
