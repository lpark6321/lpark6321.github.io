import { store } from '../../data/store.js'
import { TW_STOCK_UNIVERSE, SECTOR_ORDER } from '../../data/twStocks.js'
import { TreemapCanvas } from '../../components/TreemapCanvas.js'
import { TreemapControls } from '../../components/TreemapControls.js'
import { TreemapTooltip } from '../../components/TreemapTooltip.js'
import { simulateMarketMap, stopMarketMapSimulator } from '../../services/priceSimulator.js'

export function mount(container) {
  container.innerHTML = `
    <div class="p6-layout">
      <div class="p6-controls" id="p6-ctrl"></div>
      <div class="p6-map" id="p6-map"></div>
      <div class="p6-detail" id="p6-detail" style="display:none"></div>
    </div>`

  const tooltip = new TreemapTooltip()
  const treemap = new TreemapCanvas(container.querySelector('#p6-map'))
  const controls = new TreemapControls(container.querySelector('#p6-ctrl'), {
    onGroupChange: mode => {
      treemap.setGroupMode(mode)
      treemap.render()
    },
    onColorChange: metric => treemap.setColorMetric(metric),
    onSizeChange: metric => treemap.setSizeMetric(metric),
    onSearch: query => treemap.setSearchQuery(query)
  })

  // Wire tooltip
  treemap._onHover = (stock, e) => {
    if (stock && e) {
      tooltip.show(stock, e)
    } else {
      tooltip.hide()
    }
  }

  // Wire detail panel
  treemap._onClick = stock => {
    showDetailPanel(container.querySelector('#p6-detail'), stock)
  }

  // Merge static universe with live prices from store
  function mergeData() {
    const prices = store.get('marketMap') || []
    const priceMap = Object.fromEntries(prices.map(p => [p.code, p]))
    return TW_STOCK_UNIVERSE.map(s => ({
      ...s,
      price: priceMap[s.code]?.price ?? null,
      changePct: priceMap[s.code]?.changePct ?? (Math.random() - 0.5) * 4,  // mock
      change5d: priceMap[s.code]?.change5d ?? (Math.random() - 0.5) * 6,
      volume: priceMap[s.code]?.volume ?? null,
      volRatio: priceMap[s.code]?.volRatio ?? (Math.random() * 2)
    }))
  }

  treemap.update(mergeData())

  // Subscribe to live price updates
  const unsub = store.subscribe('marketMap', () => {
    treemap.update(mergeData())
  })

  // Start market simulator
  simulateMarketMap()

  return () => {
    unsub()
    stopMarketMapSimulator()
    treemap.destroy()
    tooltip.destroy()
    controls.destroy()
  }
}

function showDetailPanel(panelEl, stock) {
  const layout = panelEl.parentElement
  if (!layout.classList.contains('detail-open')) {
    layout.classList.add('detail-open')
  }

  const pct = stock.changePct || 0
  const pctColor = pct >= 0 ? '#f03a5f' : '#1fd67a'

  panelEl.innerHTML = `
    <div class="p6-detail-header">
      <button class="p6-detail-close" title="關閉詳情">✕</button>
      <div style="font-size:14px;font-weight:700;color:#e8ecf5;margin-bottom:2px">${stock.code}</div>
      <div style="font-size:12px;color:#4a5a7a">${stock.name}</div>
    </div>
    <div class="p6-detail-content">
      <div class="p6-info-row">
        <span class="p6-label">類股</span>
        <span class="p6-value">${stock.sector} · ${stock.subSector || '—'}</span>
      </div>
      <div class="p6-info-row">
        <span class="p6-label">現價</span>
        <span class="p6-value">${stock.price ? stock.price.toFixed(1) : '—'}</span>
      </div>
      <div class="p6-info-row">
        <span class="p6-label">漲跌</span>
        <span class="p6-value" style="color:${pctColor}">
          ${pct >= 0 ? '▲ +' : '▼ '}${pct.toFixed(2)}%
        </span>
      </div>
      <div class="p6-info-row">
        <span class="p6-label">5日</span>
        <span class="p6-value" style="color:${stock.change5d >= 0 ? '#f03a5f' : '#1fd67a'}">
          ${stock.change5d >= 0 ? '+' : ''}${stock.change5d.toFixed(2)}%
        </span>
      </div>
      <div class="p6-info-row">
        <span class="p6-label">市值(億)</span>
        <span class="p6-value">${stock.marketCap ? stock.marketCap.toLocaleString() : '—'}</span>
      </div>
      <div class="p6-info-row">
        <span class="p6-label">成交量</span>
        <span class="p6-value">${stock.volume ? formatVol(stock.volume) : '—'}</span>
      </div>
      <div class="p6-info-row">
        <span class="p6-label">量比</span>
        <span class="p6-value">${stock.volRatio ? stock.volRatio.toFixed(2) + 'x' : '—'}</span>
      </div>
      <div class="p6-info-row">
        <span class="p6-label">0050</span>
        <span class="p6-value">${stock.isIn0050 ? '✓ 成分股' : '非成分股'}</span>
      </div>
    </div>
  `

  panelEl.style.display = 'block'
  panelEl.querySelector('.p6-detail-close').addEventListener('click', () => {
    panelEl.style.display = 'none'
    layout.classList.remove('detail-open')
  })
}

function formatVol(vol) {
  if (!vol) return '—'
  if (vol >= 1e8) return (vol / 1e8).toFixed(1) + '億'
  if (vol >= 1e4) return (vol / 1e4).toFixed(0) + '萬'
  return vol.toString()
}
