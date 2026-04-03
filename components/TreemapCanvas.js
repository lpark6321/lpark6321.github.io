function colorByPct(pct) {
  if (pct > 3) return '#c0392b';
  if (pct > 1) return '#e74c3c';
  if (pct > 0) return '#f1948a';
  if (pct === 0) return '#2a3550';
  if (pct > -1) return '#82e0aa';
  if (pct > -3) return '#27ae60';
  return '#1a5c35';
}

function makeSquares(items, width, height, sizeBy) {
  const total = items.reduce((s, x) => s + Math.max(1, x[sizeBy] || x.marketCap || 1), 0) || 1;
  const area = width * height;
  const withSize = items.map((x) => ({ ...x, side: Math.sqrt((Math.max(1, x[sizeBy] || x.marketCap || 1) / total) * area) }));

  let x = 0;
  let y = 0;
  let rowH = 0;
  const boxes = [];

  withSize.forEach((it) => {
    const side = Math.max(18, it.side);
    if (x + side > width) {
      x = 0;
      y += rowH;
      rowH = 0;
    }

    if (y + side > height) return;

    boxes.push({ ...it, x, y, w: side, h: side });
    x += side;
    rowH = Math.max(rowH, side);
  });

  return boxes;
}

export class TreemapCanvas {
  constructor(container, options = {}) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width || 1200;
    this.canvas.height = options.height || 680;
    this.ctx = this.canvas.getContext('2d');
    container.appendChild(this.canvas);

    this.onClick = options.onClick || (() => {});
    this.boxes = [];
    this.lastData = [];
    this.lastOpts = {};

    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.resizeObserver = new ResizeObserver(() => this.redraw());
    this.resizeObserver.observe(container);
  }

  resizeToContainer() {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(520, Math.floor(rect.width));
    const h = Math.max(420, Math.floor(rect.height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  update(data, opts = {}) {
    this.lastData = data || [];
    this.lastOpts = opts || {};
    this.redraw();
  }

  redraw() {
    this.resizeToContainer();
    const { sizeBy = 'marketCap', colorBy = 'changePct', search = '' } = this.lastOpts;
    const items = [...this.lastData].sort((a, b) => (b[sizeBy] || b.marketCap) - (a[sizeBy] || a.marketCap));
    this.boxes = makeSquares(items, this.canvas.width, this.canvas.height, sizeBy);

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.boxes.forEach((b) => {
      const cv = b[colorBy] ?? b.changePct;
      ctx.fillStyle = colorByPct(cv);
      ctx.fillRect(b.x, b.y, b.w, b.h);

      ctx.strokeStyle = '#0a0d14';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, Math.max(0, b.w - 1), Math.max(0, b.h - 1));

      if (b.w > 42 && b.h > 32) {
        const fs = Math.max(11, Math.min(20, Math.floor(b.w * 0.18)));
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${fs}px Noto Sans TC`;
        ctx.fillText(`${b.code}`, b.x + 6, b.y + fs + 1);

        if (b.w > 60) {
          ctx.font = `${Math.max(10, fs - 3)}px Noto Sans TC`;
          ctx.fillText(`${String(b.name).slice(0, 6)}`, b.x + 6, b.y + fs * 2 + 2);
          ctx.font = `${Math.max(10, fs - 4)}px JetBrains Mono`;
          ctx.fillText(`${b.changePct > 0 ? '+' : ''}${b.changePct}%`, b.x + 6, b.y + fs * 2 + 18);
        }
      }

      if (search && (String(b.code).includes(search) || String(b.name).includes(search))) {
        ctx.strokeStyle = '#f5c842';
        ctx.lineWidth = 3;
        ctx.strokeRect(b.x + 2, b.y + 2, Math.max(0, b.w - 4), Math.max(0, b.h - 4));
      }
    });
  }

  handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = this.boxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) this.onClick(hit);
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.canvas.remove();
  }
}
