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
    this.el.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      display: none;
      background: #111520;
      border: 1px solid #2a3550;
      padding: 8px 12px;
      min-width: 170px;
      font-family: "JetBrains Mono", monospace;
    `;
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
      <div style="font-size:13px;font-weight:700;color:#e8ecf5">${esc(stock.code)} ${esc(stock.name)}</div>
      <div style="font-size:9px;color:#4a5a7a;margin-bottom:6px">${esc(stock.sector || '--')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;font-size:10px">
        <span style="color:#4a5a7a">現價</span>
        <span style="color:#e8ecf5;text-align:right">${stock.price != null && Number.isFinite(price) ? price.toFixed(1) : '--'}</span>
        <span style="color:#4a5a7a">漲跌</span>
        <span style="color:${pctColor};text-align:right">${pctStr}</span>
        <span style="color:#4a5a7a">量比</span>
        <span style="color:#e8ecf5;text-align:right">${ratio}</span>
        <span style="color:#4a5a7a">成交量</span>
        <span style="color:#00c8d4;text-align:right">${formatVol(stock.volume)}</span>
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
