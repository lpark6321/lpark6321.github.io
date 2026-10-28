// 市場地圖控制列：提供分組、顏色、大小與圖形切換按鈕。
export class TreemapControls {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, callbacks = {}) {
    // 段落說明：建立新的 DOM 節點。
    this.el = document.createElement('div');
    this.el.className = 'tm-controls';
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.el);
    this.callbacks = callbacks;
    this._render();
  }

  // _render：方法用途註解，處理此元件或類別的一段行為。
  _render() {
    // 段落說明：更新 DOM 內容。
    this.el.innerHTML = `
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">分組</span>
        <button class="tm-btn active" data-group="sector">類股</button>
        <button class="tm-btn" data-group="weighted">加權</button>
        <button class="tm-btn" data-group="weighted2">加權2</button>
        <button class="tm-btn" data-group="tw50">台灣50</button>
        <button class="tm-btn" data-group="mid100">中型100</button>
      </div>
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">顏色</span>
        <button class="tm-btn active" data-color="changePct">今日漲跌</button>
        <button class="tm-btn" data-color="change5d" disabled>5日漲跌</button>
        <button class="tm-btn" data-color="volRatio" disabled>量比</button>
      </div>
      <div class="tm-ctrl-group">
        <span class="tm-ctrl-label">大小</span>
        <button class="tm-btn active" data-size="marketCap">市值</button>
        <button class="tm-btn" data-size="volume" disabled>成交金額</button>
      </div>
      <div class="tm-ctrl-group tm-ctrl-group--chart" style="margin-left:auto">
        <span class="tm-ctrl-label">圖形</span>
        <button class="tm-btn active" data-chart="treemap">方塊圖</button>
        <button class="tm-btn" data-chart="sunburst">旭日圖</button>
      </div>
    `;

    this.el.querySelectorAll('[data-group]').forEach((btn) => {
      // 段落說明：綁定使用者互動事件。
      btn.addEventListener('click', () => {
        // 段落說明：移除 DOM 節點或釋放畫面資源。
        this.el.querySelectorAll('[data-group]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onGroupChange?.(btn.dataset.group);
      });
    });

    this.el.querySelectorAll('[data-color]').forEach((btn) => {
      // 段落說明：綁定使用者互動事件。
      btn.addEventListener('click', () => {
        // 段落說明：移除 DOM 節點或釋放畫面資源。
        this.el.querySelectorAll('[data-color]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onColorChange?.(btn.dataset.color);
      });
    });

    this.el.querySelectorAll('[data-size]').forEach((btn) => {
      // 段落說明：綁定使用者互動事件。
      btn.addEventListener('click', () => {
        // 段落說明：移除 DOM 節點或釋放畫面資源。
        this.el.querySelectorAll('[data-size]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onSizeChange?.(btn.dataset.size);
      });
    });

    this.el.querySelectorAll('[data-chart]').forEach((btn) => {
      // 段落說明：綁定使用者互動事件。
      btn.addEventListener('click', () => {
        // 段落說明：移除 DOM 節點或釋放畫面資源。
        this.el.querySelectorAll('[data-chart]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onChartChange?.(btn.dataset.chart);
      });
    });
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.el.remove();
  }
}
