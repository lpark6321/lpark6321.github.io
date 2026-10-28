// 市場地圖明細面板：點選個股後顯示價格、量能與分類資訊。
function formatVol(vol) {
  const value = Number(vol);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}億`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(0)}萬`;
  return value.toLocaleString('zh-TW');
}

// TreemapDetail：類別用途註解，集中管理相關狀態與方法。
export class TreemapDetail {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.container = container;
    this.onClose = options.onClose || (() => {});
  }

  // show：方法用途註解，處理此元件或類別的一段行為。
  show(stock) {
    const pct = Number(stock.changePct) || 0;
    const change5d = Number(stock.change5d) || 0;

    // 段落說明：建立此區塊的 DOM 結構。
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
    // 段落說明：綁定使用者互動事件。
    this.container.querySelector('.p6-detail-close')?.addEventListener('click', () => this.hide());
  }

  // hide：方法用途註解，處理此元件或類別的一段行為。
  hide() {
    this.container.style.display = 'none';
    // 段落說明：建立此區塊的 DOM 結構。
    this.container.innerHTML = '';
    this.onClose();
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：建立此區塊的 DOM 結構。
    this.container.innerHTML = '';
  }
}
