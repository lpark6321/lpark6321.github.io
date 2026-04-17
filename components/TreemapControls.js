export class TreemapControls {
  constructor(container, callbacks = {}) {
    this.el = document.createElement('div');
    this.el.className = 'tm-controls';
    container.appendChild(this.el);
    this.callbacks = callbacks;
    this._render();
  }

  _render() {
    this.el.innerHTML = `
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">分組</span>
        <button class="tm-btn" data-group="weighted">加權</button>
        <button class="tm-btn" data-group="tw50">台灣50</button>
        <button class="tm-btn" data-group="mid100">中型100</button>
        <button class="tm-btn active" data-group="sector">類股</button>
      </div>
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">顏色</span>
        <button class="tm-btn active" data-color="changePct">今日漲跌</button>
        <button class="tm-btn" data-color="change5d">5日漲跌</button>
        <button class="tm-btn" data-color="volRatio">量比</button>
      </div>
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">大小</span>
        <button class="tm-btn active" data-size="marketCap">市值</button>
        <button class="tm-btn" data-size="volume">成交金額</button>
      </div>
      <div class="tm-ctrl-group tm-ctrl-group--chart" style="margin-left:auto">
        <span class="tm-ctrl-label">圖形</span>
        <button class="tm-btn active" data-chart="treemap">方塊圖</button>
        <button class="tm-btn" data-chart="sunburst">旭日圖</button>
      </div>
    `;

    this.el.querySelectorAll('[data-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('[data-group]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onGroupChange?.(btn.dataset.group);
      });
    });

    this.el.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('[data-color]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onColorChange?.(btn.dataset.color);
      });
    });

    this.el.querySelectorAll('[data-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('[data-size]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onSizeChange?.(btn.dataset.size);
      });
    });

    this.el.querySelectorAll('[data-chart]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.el.querySelectorAll('[data-chart]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onChartChange?.(btn.dataset.chart);
      });
    });
  }

  destroy() {
    this.el.remove();
  }
}
