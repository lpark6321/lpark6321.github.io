export class TreemapControls {
  constructor(container, options = {}) {
    this.onChange = options.onChange || (() => {});
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__body" style="display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:6px">
        <select class="groupBy"><option value="none">不分組</option><option value="sector">類股</option><option value="capBand">市值規模</option></select>
        <select class="colorBy"><option value="changePct">漲跌幅</option><option value="volumeRatio">成交量比</option><option value="fiveDayPct">近5日漲跌</option></select>
        <select class="sizeBy"><option value="marketCap">市值</option><option value="turnover">成交金額</option></select>
        <select class="marketFilter"><option value="all">全部</option><option value="上市">上市</option><option value="上櫃">上櫃</option><option value="ETF">ETF</option></select>
        <input class="input search" placeholder="搜尋代碼/名稱">
      </div>
    `;
    container.appendChild(this.root);
    this.root.querySelectorAll('select,input').forEach((el) => el.addEventListener('change', () => this.emit()));
    this.root.querySelector('.search').addEventListener('input', () => this.emit());
  }

  emit() {
    this.onChange({
      groupBy: this.root.querySelector('.groupBy').value,
      colorBy: this.root.querySelector('.colorBy').value,
      sizeBy: this.root.querySelector('.sizeBy').value,
      marketFilter: this.root.querySelector('.marketFilter').value,
      search: this.root.querySelector('.search').value.trim()
    });
  }

  destroy() { this.root.remove(); }
}
