export class Sparkline {
  constructor(container, options = {}) {
    this.options = { color: options.color || 'var(--red)', fill: true, width: options.width || 180, height: options.height || 56 };
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sparkline__canvas';
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.ctx = this.canvas.getContext('2d');
    container.appendChild(this.canvas);
  }

  update(data = [], baseline = null) {
    const { width, height, color, fill } = this.options;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);
    if (!data.length) return;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => ({
      x: (i / (data.length - 1 || 1)) * (width - 4) + 2,
      y: height - 2 - ((v - min) / range) * (height - 4)
    }));

    if (baseline !== null) {
      const y = height - 2 - ((baseline - min) / range) * (height - 4);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(220,228,245,.25)';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (fill) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, height);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points.at(-1).x, height);
      ctx.closePath();
      ctx.fillStyle = color.replace(')', ', 0.1)').replace('rgb', 'rgba');
      if (!ctx.fillStyle.includes('rgba')) ctx.fillStyle = 'rgba(240,58,95,.1)';
      ctx.fill();
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }

  destroy() {
    this.canvas.remove();
  }
}
