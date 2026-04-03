export class MiniDetailChart {
  constructor(container) {
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = '<div class="panel__header"><span class="panel__badge">M</span><h3 class="panel__title">個股細節</h3></div><div class="panel__body"><div class="ohlc"></div><canvas></canvas></div>';
    this.canvas = this.root.querySelector('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '220px';
    this.ctx = this.canvas.getContext('2d');
    this.ohlc = this.root.querySelector('.ohlc');
    container.appendChild(this.root);
  }

  ensureCanvasSize() {
    const width = Math.max(320, Math.floor(this.canvas.clientWidth || 460));
    const height = 220;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  update({ code, ohlc, series = [], markers = [] }) {
    this.ensureCanvasSize();
    this.ohlc.textContent = `${code} O:${ohlc.open} H:${ohlc.high} L:${ohlc.low} C:${ohlc.close} V:${ohlc.vol}`;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
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

  destroy() { this.root.remove(); }
}
