function formatVol(vol) {
  const value = Number(vol);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}億`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(0)}萬`;
  return value.toLocaleString('zh-TW');
}

export class TreemapDetail {
  constructor(container, options = {}) {
    this.container = container;
    this.onClose = options.onClose || (() => {});
  }

  show(stock) {
    const pct = Number(stock.changePct) || 0;
    const change5d = Number(stock.change5d) || 0;

    this.container.innerHTML = `
      <div class="p6-detail-header">
        <button class="p6-detail-close" title="關閉詳情">✕</button>
        <div style="font-size:14px;font-weight:700;color:#e8ecf5;margin-bottom:2px">${stock.code}</div>
        <div style="font-size:12px;color:#4a5a7a">${stock.name}</div>
      </div>
      <div class="p6-detail-content">
        <div class="p6-info-row">
          <span class="p6-label">類股</span>
          <span class="p6-value">${stock.sector} · ${stock.subSector || '—'}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">現價</span>
          <span class="p6-value">${Number.isFinite(Number(stock.price)) ? Number(stock.price).toFixed(1) : '—'}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">漲跌</span>
          <span class="p6-value" style="color:${pct >= 0 ? '#f03a5f' : '#1fd67a'}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">5日</span>
          <span class="p6-value" style="color:${change5d >= 0 ? '#f03a5f' : '#1fd67a'}">${change5d >= 0 ? '+' : ''}${change5d.toFixed(2)}%</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">市值(億)</span>
          <span class="p6-value">${Number(stock.marketCap || 0).toLocaleString('zh-TW')}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">成交量</span>
          <span class="p6-value">${formatVol(stock.volume)}</span>
        </div>
        <div class="p6-info-row">
          <span class="p6-label">量比</span>
          <span class="p6-value">${Number(stock.volRatio || 0).toFixed(2)}x</span>
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
