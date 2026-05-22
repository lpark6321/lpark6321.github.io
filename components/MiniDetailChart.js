// 小型明細圖元件：用 Canvas 呈現單一標的的簡要走勢。
export class MiniDetailChart {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container) {
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = '<div class="panel__header"><span class="panel__badge">M</span><h3 class="panel__title">個股細節</h3></div><div class="panel__body"><div class="ohlc"></div><canvas></canvas></div>';
    this.canvas = this.root.querySelector('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '220px';
    // 段落說明：取得 Canvas 2D context 進行繪圖。
    this.ctx = this.canvas.getContext('2d');
    this.ohlc = this.root.querySelector('.ohlc');
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
  }

  // ensureCanvasSize：方法用途註解，處理此元件或類別的一段行為。
  ensureCanvasSize() {
    const width = Math.max(220, Math.floor(this.canvas.clientWidth || 460));
    const height = 220;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update({ code, ohlc, series = [], markers = [] }) {
    this.ensureCanvasSize();
    this.ohlc.textContent = `${code} O:${ohlc.open} H:${ohlc.high} L:${ohlc.low} C:${ohlc.close} V:${ohlc.vol}`;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    // 段落說明：清除上一輪 Canvas 繪圖內容。
    ctx.clearRect(0, 0, w, h);
    if (!series.length) return;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    series.forEach((v, i) => {
      const x = (i / (series.length - 1 || 1)) * (w - 20) + 10;
      const y = h - 10 - ((v - min) / range) * (h - 20);
      if (i === 0) ctx.beginPath(), ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 2;
    ctx.stroke();
    markers.forEach((m) => {
      const x = (m.index / (series.length - 1 || 1)) * (w - 20) + 10;
      ctx.strokeStyle = '#3d84ff';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
