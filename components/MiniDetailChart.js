// 小型明細圖元件（Page3 個股細節）：當日走勢線，型態觸發點以藍色直線標出（markers 的 index 對應 series）。
import { setupHiDpiCanvas } from '../services/canvas.js';

export class MiniDetailChart {
  constructor(container) {
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = '<div class="panel__header"><span class="panel__badge">M</span><h3 class="panel__title">個股細節</h3></div><div class="panel__body"><div class="ohlc"></div><canvas></canvas></div>';
    this.canvas = this.root.querySelector('canvas');
    this.canvas.className = 'mini-detail__canvas';
    this.ohlc = this.root.querySelector('.ohlc');
    container.appendChild(this.root);
  }

  ensureCanvasSize() {
    this.width = Math.max(220, Math.floor(this.canvas.clientWidth || 460));
    this.height = 220;
    this.ctx = setupHiDpiCanvas(this.canvas, this.width, this.height);
  }

  update({ code, ohlc, series = [], markers = [] }) {
    this.ensureCanvasSize();
    this.ohlc.textContent = `${code}　開 ${ohlc.open}　高 ${ohlc.high}　低 ${ohlc.low}　收 ${ohlc.close}　量 ${ohlc.vol}`;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);
    if (!series.length) {
      ctx.fillStyle = '#8ea0be';
      ctx.font = '13px "Noto Sans TC"';
      ctx.textAlign = 'center';
      ctx.fillText('無當日走勢資料', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }
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
