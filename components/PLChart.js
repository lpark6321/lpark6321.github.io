// 損益圖元件（Page4）：依腳位畫到期損益曲線，單位新台幣（選擇權 50 元/點，期貨依契約）。
import { setupHiDpiCanvas } from '../services/canvas.js';
import { analyzeStrategy } from '../services/optionStrategy.js';
import { fmtNum } from '../services/quoteUtils.js';

export class PLChart {
  constructor(container, options = {}) {
    this.options = { width: options.width || 740, height: options.height || 340 };
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = `${this.options.width}px`;
    this.canvas.style.height = `${this.options.height}px`;
    this.ctx = setupHiDpiCanvas(this.canvas, this.options.width, this.options.height);
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
    const { width: w, height: h } = this.options;
    const { points, breakevens } = analyzeStrategy(legs, spot);
    this.points = points;
    const minP = points[0].price;
    const maxP = points.at(-1).price;
    const minY = Math.min(0, ...points.map((p) => p.pl));
    const maxY = Math.max(0, ...points.map((p) => p.pl));
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

    if (legs.length) {
      points.forEach((p, i) => {
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

      // 損益兩平點
      ctx.fillStyle = '#25d6ff';
      breakevens.filter((p) => p >= minP && p <= maxP).forEach((p) => {
        ctx.beginPath();
        ctx.arc(mapX(p), zeroY, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.fillStyle = '#6a7a99';
    ctx.font = '12px var(--font-ui)';
    ctx.fillText('到期損益（元）', 8, 14);
    ctx.textAlign = 'right';
    ctx.fillText(fmtNum(maxY, 0), w - 8, 14);
    ctx.fillText(fmtNum(minY, 0), w - 8, h - 8);
    ctx.textAlign = 'left';
  }

  onMove(e) {
    if (!this.points.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // 曲線畫在 x = 30 ~ (width - 20)，要用同一段區間換算回取樣點。
    const plotX = (x * this.options.width) / rect.width - 30;
    const idx = Math.max(0, Math.min(this.points.length - 1, Math.round((plotX / (this.options.width - 50)) * (this.points.length - 1))));
    const p = this.points[idx];
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${e.clientY - rect.top + 8}px`;
    this.tooltip.textContent = `價格 ${fmtNum(p.price, 0)}／損益 ${fmtNum(p.pl, 0)} 元`;
  }

  destroy() {
    this.tooltip.remove();
    this.canvas.remove();
  }
}
