// Canvas-based Treemap Renderer
// Handles rendering, mouse interaction, and real-time updates

import { layoutWithGroups, computeSectorAvg, SECTOR_HEADER_HEIGHT_CONST } from './TreemapLayout.js'
import { SECTOR_COLORS } from '../data/twStocks.js'

export class TreemapCanvas {
  constructor(container) {
    this.container = container
    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair'
    container.appendChild(this.canvas)

    this.layout = []        // current computed layout
    this.hoveredStock = null
    this.searchQuery = ''
    this.colorMetric = 'changePct'
    this.sizeMetric = 'marketCap'
    this.groupMode = 'sector'

    this._bindEvents()
    this._resizeObserver = new ResizeObserver(() => this.render())
    this._resizeObserver.observe(container)
  }

  update(stocks) {
    // stocks: merged data from store (static universe + live prices)
    this.stocks = stocks
    this._computeLayout()
    this.render()
  }

  setColorMetric(metric) {
    // metric: 'changePct' | 'change5d' | 'volRatio'
    this.colorMetric = metric
    this.render()  // no re-layout needed, just re-color
  }

  setSizeMetric(metric) {
    // metric: 'marketCap' | 'volume'
    this.sizeMetric = metric
    this._computeLayout()  // size change requires re-layout
    this.render()
  }

  setGroupMode(mode) {
    // mode: 'sector' | '0050' | 'etf' | 'none'
    this.groupMode = mode
    this._computeLayout()
    this.render()
  }

  setSearchQuery(query) {
    this.searchQuery = query.toUpperCase()
    this.render()  // search highlighting doesn't need re-layout
  }

  _computeLayout() {
    // Force re-measure container dimensions
    const W = this.container.offsetWidth
    const H = this.container.offsetHeight
    if (!W || !H || !this.stocks) return

    // Group stocks based on mode
    const grouped = this._groupStocks(this.stocks)

    // Compute squarified layout
    this.layout = layoutWithGroups(grouped, W, H)
  }

  _groupStocks(stocks) {
    switch (this.groupMode) {
      case 'sector':
        return this._groupBySector(stocks)
      case '0050':
        return this._groupBy0050(stocks)
      case 'etf':
        return this._groupByETF(stocks)
      case 'none':
        // Single group with all stocks, sorted by size
        const all = [...stocks].sort((a, b) => (b[this.sizeMetric] || 0) - (a[this.sizeMetric] || 0))
        return [{ name: '全市場', stocks: all }]
      default:
        return this._groupBySector(stocks)
    }
  }

  _groupBySector(stocks) {
    const map = new Map()
    stocks.forEach(s => {
      const sector = s.sector || '其他'
      if (!map.has(sector)) map.set(sector, [])
      map.get(sector).push(s)
    })
    return Array.from(map.entries()).map(([name, stocks]) => ({
      name,
      stocks: stocks.sort((a, b) => (b[this.sizeMetric] || 0) - (a[this.sizeMetric] || 0))
    }))
  }

  _groupBy0050(stocks) {
    const in0050 = stocks.filter(s => s.isIn0050)
    const notIn0050 = stocks.filter(s => !s.isIn0050)
    return [
      {
        name: '0050成分股',
        stocks: in0050.sort((a, b) => (b[this.sizeMetric] || 0) - (a[this.sizeMetric] || 0))
      },
      {
        name: '其他',
        stocks: notIn0050.sort((a, b) => (b[this.sizeMetric] || 0) - (a[this.sizeMetric] || 0))
      }
    ].filter(g => g.stocks.length > 0)
  }

  _groupByETF(stocks) {
    const etfs = stocks.filter(s => s.sector === 'ETF')
    return etfs.length
      ? [
          {
            name: 'ETF',
            stocks: etfs.sort((a, b) => (b[this.sizeMetric] || 0) - (a[this.sizeMetric] || 0))
          }
        ]
      : []
  }

  render() {
    const canvas = this.canvas
    const dpr = window.devicePixelRatio || 1
    
    // Use container dimensions, not canvas offsetWidth
    const W = this.container.offsetWidth
    const H = this.container.offsetHeight
    
    // Set canvas pixel dimensions
    canvas.width = W * dpr
    canvas.height = H * dpr
    
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, W, H)

    if (!this.layout.length) return

    // Draw each sector
    this.layout.forEach(sector => {
      this._drawSectorHeader(ctx, sector)

      // Draw each stock tile
      sector.stocks.forEach(stock => {
        this._drawStockTile(ctx, stock)
      })
    })

    // Draw hovered stock highlight on top
    if (this.hoveredStock) {
      this._drawHoverHighlight(ctx, this.hoveredStock)
    }

    // Draw color legend
    this._drawColorLegend(ctx, W, H)
  }

  _drawStockTile(ctx, stock) {
    const { x, y, w, h } = stock
    if (w < 2 || h < 2) return  // skip invisible tiles

    // Background color based on colorMetric
    ctx.fillStyle = this._getHeatColor(stock[this.colorMetric] || 0)
    ctx.fillRect(x, y, w, h)

    // Border (1px dark separator)
    ctx.strokeStyle = '#080a0d'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

    // Search highlight
    if (this.searchQuery && (stock.code.includes(this.searchQuery) || stock.name.includes(this.searchQuery))) {
      ctx.strokeStyle = '#f5c842'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3)
    }

    // Labels — only draw if tile is large enough
    if (w > 28 && h > 20) {
      ctx.save()
      ctx.rect(x + 1, y + 1, w - 2, h - 2)
      ctx.clip()

      // Stock code
      const fontSize = Math.min(Math.floor(Math.min(w, h) * 0.22), 14)
      ctx.font = `700 ${fontSize}px 'JetBrains Mono'`
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labelY = h > 36 ? y + h * 0.42 : y + h * 0.5
      ctx.fillText(stock.code, x + w / 2, labelY)

      // changePct (only if tile tall enough)
      if (h > 36) {
        const pct = stock.changePct || 0
        const pctStr = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%'
        ctx.font = `${Math.max(fontSize - 3, 8)}px 'JetBrains Mono'`
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.fillText(pctStr, x + w / 2, y + h * 0.65)
      }

      ctx.restore()
    }
  }

  _drawSectorHeader(ctx, sector) {
    const { x, y, w, h } = sector.sectorRect

    // Sector background tint
    ctx.fillStyle = SECTOR_COLORS[sector.sectorName] || '#141820'
    ctx.fillRect(x, y, w, h)

    // Sector header bar
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(x, y, w, SECTOR_HEADER_HEIGHT_CONST)

    // Sector name
    ctx.font = 'bold 10px "Noto Sans TC"'
    ctx.fillStyle = '#f5c842'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(sector.sectorName, x + 6, y + SECTOR_HEADER_HEIGHT_CONST / 2)

    // Sector total change (right side of header)
    const sectorAvgChg = computeSectorAvg(sector.stocks)
    const chgStr = (sectorAvgChg >= 0 ? '+' : '') + sectorAvgChg.toFixed(2) + '%'
    ctx.font = 'bold 9px "JetBrains Mono"'
    ctx.fillStyle = sectorAvgChg >= 0 ? '#f03a5f' : '#1fd67a'
    ctx.textAlign = 'right'
    ctx.fillText(chgStr, x + w - 6, y + SECTOR_HEADER_HEIGHT_CONST / 2)
  }

  _drawHoverHighlight(ctx, stock) {
    const { x, y, w, h } = stock
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
  }

  _drawColorLegend(ctx, W, H) {
    // Draw horizontal color legend at bottom-right
    const legendW = 200
    const legendH = 12
    const legendX = W - legendW - 10
    const legendY = H - legendH - 10

    const bands = [
      { color: '#00a86b', label: '-5%' },
      { color: '#2ecc71', label: '-3%' },
      { color: '#27ae60', label: '-1%' },
      { color: '#1c2236', label: '0%' },
      { color: '#922b21', label: '+1%' },
      { color: '#e74c3c', label: '+3%' },
      { color: '#8b0000', label: '+5%' }
    ]

    const bandW = legendW / bands.length

    bands.forEach((band, i) => {
      const bx = legendX + i * bandW
      ctx.fillStyle = band.color
      ctx.fillRect(bx, legendY, bandW, legendH)
      ctx.strokeStyle = '#1c2236'
      ctx.lineWidth = 0.5
      ctx.strokeRect(bx, legendY, bandW, legendH)
    })
  }

  _getHeatColor(changePct) {
    // Taiwan convention: RED = up, GREEN = down
    // 7-band color scale matching Finviz intensity
    if (changePct > 5) return '#8b0000'    // extreme up (dark red)
    if (changePct > 3) return '#c0392b'    // strong up
    if (changePct > 1) return '#e74c3c'    // moderate up
    if (changePct > 0) return '#922b21'    // slight up (muted)
    if (changePct === 0) return '#1c2236'  // unchanged (neutral dark)
    if (changePct > -1) return '#1a5c35'   // slight down
    if (changePct > -3) return '#27ae60'   // moderate down
    if (changePct > -5) return '#2ecc71'   // strong down
    return '#00a86b'                        // extreme down (bright green)
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', e => {
      const pos = this._getCanvasPos(e)
      const hit = this._hitTest(pos)
      if (hit !== this.hoveredStock) {
        this.hoveredStock = hit
        this.render()
        this._onHover(hit, e)
      }
    })

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredStock = null
      this.render()
      this._onHover(null, null)
    })

    this.canvas.addEventListener('click', e => {
      const pos = this._getCanvasPos(e)
      const hit = this._hitTest(pos)
      if (hit) this._onClick(hit)
    })
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  _hitTest({ x, y }) {
    // Check all stock rects, return first match
    for (const sector of this.layout) {
      for (const stock of sector.stocks) {
        const r = stock
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          return stock
        }
      }
    }
    return null
  }

  // Callbacks — override in page6.js
  _onHover(stock, event) {}
  _onClick(stock) {}

  destroy() {
    this._resizeObserver.disconnect()
    this.canvas.remove()
  }
}
