export class PieChart {
  constructor(container, options = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.size || 140;
    this.canvas.height = options.size || 140;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.colors = options.colors || ['#f03a5f', '#1fd67a', '#2a3550'];
  }

  update(values = [1, 1, 1]) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 3;
    const total = values.reduce((a, b) => a + b, 0) || 1;
    let start = -Math.PI / 2;

    ctx.clearRect(0, 0, w, h);
    values.forEach((v, i) => {
      const ang = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + ang);
      ctx.closePath();
      ctx.fillStyle = this.colors[i % this.colors.length];
      ctx.fill();
      start += ang;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1018';
    ctx.fill();
  }

  destroy() {
    this.canvas.remove();
  }
}
