// 長條圖元件：以 Canvas 繪製簡易序列比較圖。
export class BarChart {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    // 段落說明：建立新的 DOM 節點。
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width || 360;
    this.canvas.height = options.height || 180;
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.canvas);
    // 段落說明：取得 Canvas 2D context 進行繪圖。
    this.ctx = this.canvas.getContext('2d');
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(items = []) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    // 段落說明：清除上一輪 Canvas 繪圖內容。
    ctx.clearRect(0, 0, w, h);
    if (!items.length) return;

    // maxAbs：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), 1);
    const mid = h / 2;
    const bw = Math.max(6, (w - 10) / items.length - 2);

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#263050';
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    ctx.setLineDash([]);

    items.forEach((item, i) => {
      const x = 4 + i * (bw + 2);
      const barH = Math.abs(item.value / maxAbs) * (h * 0.45);
      const up = item.value >= 0;
      const y = up ? mid - barH : mid;
      ctx.fillStyle = up ? '#f03a5f' : '#1fd67a';
      ctx.fillRect(x, y, bw, barH);
      ctx.fillStyle = '#6a7a99';
      ctx.font = '10px var(--font-ui)';
      ctx.fillText(item.label || '', x, h - 4);
    });
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.canvas.remove();
  }
}
