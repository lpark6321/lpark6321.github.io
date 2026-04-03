// Floating tooltip component for treemap tiles

export class TreemapTooltip {
  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'tm-tooltip'
    this.el.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      display: none;
      background: #111520;
      border: 1px solid #2a3550;
      padding: 8px 12px;
      min-width: 160px;
      font-family: 'JetBrains Mono', monospace;
      border-radius: 3px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `
    document.body.appendChild(this.el)
  }

  show(stock, mouseEvent) {
    if (!stock) {
      this.hide()
      return
    }

    const pct = stock.changePct || 0
    const pctStr = (pct >= 0 ? '▲ +' : '▼ ') + pct.toFixed(2) + '%'
    const pctColor = pct >= 0 ? '#f03a5f' : '#1fd67a'

    const formatVol = (vol) => {
      if (!vol) return '—'
      if (vol >= 1e8) return (vol / 1e8).toFixed(1) + '億'
      if (vol >= 1e4) return (vol / 1e4).toFixed(0) + '萬'
      return vol.toString()
    }

    this.el.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#e8ecf5">${stock.code} ${stock.name}</div>
      <div style="font-size:9px;color:#4a5a7a;margin-bottom:6px">${stock.sector} · ${stock.subSector || '—'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:10px">
        <span style="color:#4a5a7a">現價</span>
        <span style="color:#e8ecf5;text-align:right">${stock.price ? stock.price.toFixed(1) : '—'}</span>
        <span style="color:#4a5a7a">漲跌</span>
        <span style="color:${pctColor};text-align:right">${pctStr}</span>
        <span style="color:#4a5a7a">市值(億)</span>
        <span style="color:#e8ecf5;text-align:right">${stock.marketCap ? stock.marketCap.toLocaleString() : '—'}</span>
        <span style="color:#4a5a7a">成交量</span>
        <span style="color:#00c8d4;text-align:right">${formatVol(stock.volume)}</span>
      </div>
    `

    // Position tooltip near cursor, keep within viewport
    const vw = window.innerWidth
    const vh = window.innerHeight
    let tx = mouseEvent.clientX + 16
    let ty = mouseEvent.clientY + 16
    if (tx + 180 > vw) tx = mouseEvent.clientX - 180
    if (ty + 120 > vh) ty = mouseEvent.clientY - 120

    this.el.style.left = Math.max(0, tx) + 'px'
    this.el.style.top = Math.max(0, ty) + 'px'
    this.el.style.display = 'block'
  }

  hide() {
    this.el.style.display = 'none'
  }

  destroy() {
    this.el.remove()
  }
}
