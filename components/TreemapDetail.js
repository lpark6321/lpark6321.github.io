// 市場地圖明細面板：點選個股後顯示價格、量能與分類資訊。
import { esc } from '../services/html.js';
import { formatVol } from './TreemapTooltip.js';

export class TreemapDetail {
  constructor(container, options = {}) {
    this.container = container;
    this.onClose = options.onClose || (() => {});
  }

  show(stock) {
    const has = (value) => value != null && Number.isFinite(Number(value));
    const pct = Number(stock.changePct);

    this.container.innerHTML = `
      <div class="p6-detail-header">
        <button class="p6-detail-close" title="關閉詳情">✕</button>
        <div style="font-size:14px;font-weight:700;color:#e8ecf5;margin-bottom:2px">${esc(stock.code)}</div>
        <div style="font-size:12px;color:#4a5a7a">${esc(stock.name)}</div>
      </div>
      <div class="p6-detail-content">
        <div class="p6-info-row">
          <span class="p6-label">類股</span>
          <span class="p6-value">${esc(stock.sector || '--')}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">現價</span>
          <span class="p6-value">${has(stock.price) ? Number(stock.price).toFixed(1) : '--'}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">漲跌</span>
          <span class="p6-value" style="color:${!has(stock.changePct) ? '#8da0bf' : pct >= 0 ? '#f03a5f' : '#1fd67a'}">${has(stock.changePct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '--'}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">成交量</span>
          <span class="p6-value">${formatVol(stock.volume)}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">量比</span>
          <span class="p6-value">${has(stock.volRatio) ? `${Number(stock.volRatio).toFixed(2)}x` : '--'}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">0050</span>
          <span class="p6-value">${stock.isIn0050 ? '✓ 成分股' : '非成分股'}</span>
        </div>
      </div>
    `;

    this.container.style.display = 'block';
    this.container.querySelector('.p6-detail-close')?.addEventListener('click', () => this.hide());
  }

  hide() {
    this.container.style.display = 'none';
    this.container.innerHTML = '';
    this.onClose();
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
