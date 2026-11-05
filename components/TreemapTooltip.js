// 市場地圖提示框：滑鼠懸停股票或圖形區塊時顯示詳細資訊。
import { esc } from '../services/html.js';

export function formatVol(vol) {
  const value = Number(vol);
  if (!Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}億`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(0)}萬`;
  return value.toLocaleString('zh-TW');
}

export class TreemapTooltip {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'tm-tooltip';
    document.body.appendChild(this.el);
  }

  show(stock, mouseEvent) {
    const hasPct = stock.changePct != null && Number.isFinite(Number(stock.changePct));
    const pct = Number(stock.changePct);
    const pctStr = hasPct ? `${pct >= 0 ? '▲ +' : '▼ '}${pct.toFixed(2)}%` : '--';
    const pctColor = !hasPct ? '#8da0bf' : pct >= 0 ? '#f03a5f' : '#1fd67a';
    const price = Number(stock.price);
    const ratio = stock.volRatio != null && Number.isFinite(Number(stock.volRatio)) ? `${Number(stock.volRatio).toFixed(2)}x` : '--';

    this.el.innerHTML = `
      <div class="tm-tooltip__title">${esc(stock.code)} ${esc(stock.name)}</div>
      <div class="tm-tooltip__sector">${esc(stock.sector || '--')}</div>
      <div class="tm-tooltip__grid">
        <span class="tm-tooltip__label">現價</span>
        <span class="tm-tooltip__value">${stock.price != null && Number.isFinite(price) ? price.toFixed(1) : '--'}</span>
        <span class="tm-tooltip__label">漲跌</span>
        <span class="tm-tooltip__value" style="color:${pctColor}">${pctStr}</span>
        <span class="tm-tooltip__label">量比</span>
        <span class="tm-tooltip__value">${ratio}</span>
        <span class="tm-tooltip__label">成交量</span>
        <span class="tm-tooltip__value tm-tooltip__value--vol">${formatVol(stock.volume)}</span>
      </div>
    `;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let tx = mouseEvent.clientX + 16;
    let ty = mouseEvent.clientY + 16;
    if (tx + 190 > vw) tx = mouseEvent.clientX - 190;
    if (ty + 130 > vh) ty = mouseEvent.clientY - 130;

    this.el.style.left = `${Math.max(0, tx)}px`;
    this.el.style.top = `${Math.max(0, ty)}px`;
    this.el.style.display = 'block';
  }

  hide() {
    this.el.style.display = 'none';
  }

  destroy() {
    this.el.remove();
  }
}
