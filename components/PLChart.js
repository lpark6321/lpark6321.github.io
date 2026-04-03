function payoffAt(legs, spot) {
  return legs.reduce((sum, leg) => {
    if (leg.type === 'future') {
      const p = (spot - leg.strike) * leg.qty;
      return sum + (leg.action === 'buy' ? p : -p);
    }
    const intrinsic = leg.type === 'call' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
    const unit = leg.action === 'buy' ? intrinsic - leg.premium : leg.premium - intrinsic;
    return sum + unit * leg.qty;
  }, 0);
}

export class PLChart {
  constructor(container, options = {}) {
    this.options = { width: options.width || 740, height: options.height || 340 };
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = document.createElement('div');
    this.tooltip.style.cssText = 'position:absolute;pointer-events:none;background:#111520;border:1px solid #263050;padding:4px 6px;font-size:12px;display:none';
    container.style.position = 'relative';
    container.appendChild(this.canvas);
    container.appendChild(this.tooltip);
    this.points = [];
    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    this.canvas.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
  }

  update(legs = [], spot = 19850) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const minP = spot * 0.85;
    const maxP = spot * 1.15;
    const samples = 120;
    this.points = Array.from({ length: samples }, (_, i) => {
      const price = minP + (i / (samples - 1)) * (maxP - minP);
      return { price, pl: payoffAt(legs, price) };
    });
    const minY = Math.min(...this.points.map((p) => p.pl));
    const maxY = Math.max(...this.points.map((p) => p.pl));
    const mapX = (p) => ((p - minP) / (maxP - minP)) * (w - 50) + 30;
    const mapY = (y) => h - 30 - ((y - minY) / (maxY - minY || 1)) * (h - 60);

    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#263050';
    ctx.setLineDash([4, 4]);
    const zeroY = mapY(0);
    ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY); ctx.stroke();
    const spotX = mapX(spot);
    ctx.beginPath(); ctx.moveTo(spotX, 0); ctx.lineTo(spotX, h); ctx.stroke();
    ctx.setLineDash([]);

    this.points.forEach((p, i) => {
      const x = mapX(p.price);
      const y = mapY(p.pl);
      if (i === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#6a7a99';
    ctx.font = '12px var(--font-ui)';
    ctx.fillText('損益點數', 8, 14);
  }

  onMove(e) {
    if (!this.points.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(this.points.length - 1, Math.round((x / rect.width) * this.points.length)));
    const p = this.points[idx];
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${e.clientY - rect.top + 8}px`;
    this.tooltip.textContent = `價格 ${p.price.toFixed(0)} / P&L ${p.pl.toFixed(1)}`;
  }

  destroy() {
    this.tooltip.remove();
    this.canvas.remove();
  }
}

