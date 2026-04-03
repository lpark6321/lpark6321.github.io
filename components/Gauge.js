export class Gauge {
  constructor(container, options = {}) {
    this.options = {
      max: options.max || 100,
      color: options.color || 'var(--red)',
      label: options.label || '',
      width: options.width || 220,
      height: options.height || 120
    };
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  update(value = 0) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h - Math.max(14, Math.round(h * 0.12));
    const r = Math.max(28, h - Math.round(h * 0.2));
    const ratio = Math.max(0, Math.min(1, value / this.options.max));
    const angle = Math.PI + ratio * Math.PI;

    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = Math.max(10, Math.round(h * 0.11));
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.strokeStyle = '#1c2236';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, angle, false);
    ctx.strokeStyle = this.options.color;
    ctx.lineCap = 'round';
    ctx.stroke();

    const nx = cx + Math.cos(angle) * (r + 2);
    const ny = cy + Math.sin(angle) * (r + 2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.options.color;
    ctx.stroke();

    ctx.fillStyle = '#dce4f5';
    ctx.font = `${Math.max(14, Math.round(h * 0.11))}px var(--font-ui)`;
    ctx.textAlign = 'center';
    ctx.fillText(`${value.toFixed(2)} / ${this.options.max}`, cx, h - 6);
  }

  destroy() {
    this.canvas.remove();
  }
}
