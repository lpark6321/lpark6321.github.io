// Treemap Control Bar Component

export class TreemapControls {
  constructor(container, callbacks = {}) {
    // callbacks: { onGroupChange, onColorChange, onSizeChange, onSearch }
    this.el = document.createElement('div')
    this.el.className = 'tm-controls'
    container.appendChild(this.el)
    this.callbacks = callbacks
    this._render()
  }

  _render() {
    this.el.innerHTML = `
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">分組</span>
        <button class="tm-btn active" data-group="sector" title="按類股分組">類股</button>
        <button class="tm-btn" data-group="0050" title="0050成分股">0050成分</button>
        <button class="tm-btn" data-group="etf" title="ETF">ETF</button>
        <button class="tm-btn" data-group="none" title="不分組">不分組</button>
      </div>
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">顏色</span>
        <button class="tm-btn active" data-color="changePct" title="今日漲跌百分比">今日漲跌</button>
        <button class="tm-btn" data-color="change5d" title="5日漲跌百分比">5日漲跌</button>
        <button class="tm-btn" data-color="volRatio" title="量比">量比</button>
      </div>
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">大小</span>
        <button class="tm-btn active" data-size="marketCap" title="以市值決定大小">市值</button>
        <button class="tm-btn" data-size="volume" title="以成交金額決定大小">成交金額</button>
      </div>
      <div class="tm-ctrl-group" style="margin-left:auto">
        <input class="tm-search" type="text" placeholder="搜尋股票代碼或名稱..." />
      </div>
    `

    // Wire button groups
    this.el.querySelectorAll('[data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('[data-group]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.callbacks.onGroupChange?.(btn.dataset.group)
      })
    })

    this.el.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('[data-color]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.callbacks.onColorChange?.(btn.dataset.color)
      })
    })

    this.el.querySelectorAll('[data-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('[data-size]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.callbacks.onSizeChange?.(btn.dataset.size)
      })
    })

    const search = this.el.querySelector('.tm-search')
    search.addEventListener('input', e => {
      this.callbacks.onSearch?.(e.target.value.trim())
    })
  }

  destroy() {
    this.el.remove()
  }
}
