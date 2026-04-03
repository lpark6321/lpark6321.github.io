export class BarChart {
  constructor(container, options = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width || 360;
    this.canvas.height = options.height || 180;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  update(items = []) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    if (!items.length) return;

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

  destroy() {
    this.canvas.remove();
  }
}
