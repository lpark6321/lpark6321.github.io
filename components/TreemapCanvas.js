// 方塊圖 Canvas 元件：負責市場地圖繪製、滑鼠命中測試與互動事件。
// 版面（方塊位置大小）只在開頁、切換分組、點進類股、視窗縮放時重排；報價更新只換顏色與數字。
import { setupHiDpiCanvas } from '../services/canvas.js';
import {
  NO_DATA_COLOR,
  SECTOR_HEADER_HEIGHT,
  buildGroups,
  getHeatColor,
  getVolumeColor,
  layoutWithGroups,
  metricColor,
  sectorAverage
} from './TreemapLayout.js';

const TW50_MAJOR_COLORS = {
  電子: '#1a2840',
  金融: '#1a2820',
  傳產: '#2a2010'
};

const MID100_MAJOR_COLORS = {
  電子: '#1a2840',
  金融: '#1a2820',
  航運: '#102025',
  傳產: '#2a2010',
  其他: '#2b2b34'
};

const WEIGHTED_SECTOR_COLORS = {
  半導體業: '#1a2840',
  電子零組件業: '#1a2030',
  電腦及週邊設備業: '#1f2738',
  通信網路業: '#153048',
  光電業: '#20202a',
  金融保險: '#1a2820',
  航運業: '#102025',
  電機機械: '#273222',
  塑膠工業: '#2a2010',
  水泥工業: '#3a2a17',
  食品工業: '#2b3a1d',
  鋼鐵工業: '#2f3238',
  生技醫療業: '#2e2340',
  建材營造: '#3b3121',
  電子通路業: '#3c3c46',
  汽車工業: '#3b2f2a',
  油電燃氣業: '#27312d',
  紡織纖維: '#3a2834',
  化學工業: '#2d3a21',
  其他: '#2b2b34'
};

export class TreemapCanvas {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair';
    this.container.appendChild(this.canvas);

    this.stocks = [];
    this.layout = [];
    this.hoveredStock = null;
    this.zoomedSector = null;
    this.drillSector = null;
    this.layoutKey = '';
    this.colorMetric = 'changePct';
    this.groupMode = 'sector';
    this.searchQuery = '';

    this._onMouseMove = (e) => this._handleMouseMove(e);
    this._onMouseLeave = () => this._handleMouseLeave();
    this._onClickEvt = (e) => this._handleClick(e);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    this.canvas.addEventListener('click', this._onClickEvt);

    this._resizeObserver = new ResizeObserver(() => {
      this._computeLayout();
      this.render();
    });
    this._resizeObserver.observe(this.container);
  }

  update(stocks) {
    this.stocks = Array.isArray(stocks) ? stocks : [];
    if (this.layout.length && this._layoutKey() === this.layoutKey) this._patchLayout();
    else this._computeLayout();
    this.render();
  }

  setColorMetric(metric) {
    this.colorMetric = metric;
    this.render();
  }

  setGroupMode(mode) {
    this.groupMode = mode || 'sector';
    this.zoomedSector = null;
    this.drillSector = null;
    this._computeLayout();
    this.render();
  }

  setSearchQuery(query) {
    this.searchQuery = String(query || '').trim().toUpperCase();
    this.render();
  }

  zoomSector(sectorName) {
    this.zoomedSector = sectorName || null;
    this._computeLayout();
    this.render();
  }

  _layoutKey() {
    return [this.canvas.offsetWidth, this.canvas.offsetHeight, this.groupMode, this.zoomedSector, this.drillSector, this.stocks.length].join('|');
  }

  _groups() {
    return buildGroups(this.stocks, this.groupMode, { drillSector: this.drillSector });
  }

  // 方塊大小只看權重，報價更新時把新數字套到原本的方塊上，不重新 squarify。
  _patchLayout() {
    const byCode = new Map(this._groups().flatMap((group) => group.stocks).map((stock) => [stock.code, stock]));
    this.layout.forEach((sector) => {
      sector.stocks = sector.stocks.map((item) => ({ ...item, ...byCode.get(item.code), rect: item.rect }));
    });
  }

  _computeLayout() {
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    this.layoutKey = this._layoutKey();
    if (!W || !H || !this.stocks.length) {
      this.layout = [];
      return;
    }

    const grouped = this._groups();
    const filtered = this.zoomedSector ? grouped.filter((sector) => sector.name === this.zoomedSector) : grouped;
    this.layout = layoutWithGroups(filtered, W, H, 2, 1);
  }

  render() {
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    if (!W || !H) return;

    const ctx = setupHiDpiCanvas(this.canvas, W, H);
    ctx.clearRect(0, 0, W, H);

    if (!this.layout.length) return;
    this.layout.forEach((sector) => {
      this._drawSectorHeader(ctx, sector);
      sector.stocks.forEach((stock) => this._drawStockTile(ctx, stock));
    });

    if (this.hoveredStock) this._drawHoverHighlight(ctx, this.hoveredStock);
    this._drawColorLegend(ctx, W, H);
  }

  _drawSectorHeader(ctx, sector) {
    const { x, y, w, h } = sector.sectorRect;
    if (w <= 0 || h <= 0) return;
    const headerH = Math.max(8, Math.min(SECTOR_HEADER_HEIGHT, h));
    const nameFontSize = this._clamp(Math.floor(headerH * 0.5), 7, 10);

    let bgColor = '#141820';
    if (this.groupMode === 'sector') bgColor = WEIGHTED_SECTOR_COLORS[sector.sectorName] || bgColor;
    if (this.groupMode === 'weighted' || this.groupMode === 'weighted2') {
      bgColor = WEIGHTED_SECTOR_COLORS[sector.sectorName] || bgColor;
    }
    if (this.groupMode === 'tw50') bgColor = TW50_MAJOR_COLORS[sector.sectorName] || bgColor;
    if (this.groupMode === 'mid100') bgColor = MID100_MAJOR_COLORS[sector.sectorName] || bgColor;

    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, w, headerH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, headerH - 2));
    ctx.clip();
    ctx.font = `700 ${nameFontSize}px "Noto Sans TC"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5c842';
    ctx.fillText(sector.sectorName, x + 2, y + headerH / 2);
    ctx.restore();

    const avg = sectorAverage(sector.stocks, this.colorMetric);
    ctx.font = `700 ${this._clamp(nameFontSize - 1, 7, 9)}px "JetBrains Mono"`;
    ctx.textAlign = 'right';
    ctx.fillStyle = avg == null ? '#8da0bf' : this.colorMetric === 'volRatio' ? '#f5c842' : avg >= 0 ? '#f03a5f' : '#1fd67a';
    if (w >= 64) ctx.fillText(this._formatMetricValue(avg), x + w - 4, y + headerH / 2);
  }

  _drawStockTile(ctx, stock) {
    // 一個 tile 會同時負責背景熱度、邊框、搜尋高亮與文字裁切；
    // 文字大小跟 tile 面積連動，避免小格子硬塞文字造成重疊。
    const { x, y, w, h } = stock.rect;
    if (w < 2 || h < 2) return;

    const color = metricColor(stock, this.colorMetric);
    ctx.fillStyle = color || NO_DATA_COLOR;
    ctx.fillRect(x, y, w, h);
    if (!color) this._drawHatch(ctx, x, y, w, h);

    ctx.strokeStyle = '#080a0d';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (stock.isSectorAggregate) {
      // 類股模式的 stock 其實是合成的 sector tile，只顯示類股名稱與平均漲跌。
      if (w > 34 && h > 22) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        ctx.clip();

        const minSide = Math.min(w, h);
        const nameFont = this._clamp(Math.floor(minSide * 0.16), 9, 24);
        const pctFont = this._clamp(nameFont - 3, 8, 16);
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const pctText = this._formatMetric(stock);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${nameFont}px "Noto Sans TC"`;
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        this._fitCenterText(ctx, String(stock.name || stock.sector || ''), centerX, centerY - nameFont * 0.22, w - 8);

        if (h > 34) {
          ctx.font = `700 ${pctFont}px "JetBrains Mono"`;
          ctx.fillStyle = 'rgba(255,255,255,0.82)';
          this._fitCenterText(ctx, pctText, centerX, centerY + pctFont * 0.95, w - 10);
        }

        ctx.restore();
      }
      return;
    }

    if (this.searchQuery && this._isSearchHit(stock)) {
      ctx.strokeStyle = '#f5c842';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    if (w <= 24 || h <= 16) return;

    ctx.save();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = x + w / 2;
    const minSide = Math.min(w, h);
    const pctText = this._formatMetric(stock);

    if (!stock.isWeightedRemainder && w >= 54 && h >= 34) {
      // 加權/台灣50/中型100 優先顯示「名稱、代號、漲跌」三行，
      // 讓大權重個股接近 Finviz 的閱讀方式。
      const nameFont = this._clamp(Math.floor(minSide * 0.14), 8, 18);
      const codeFont = this._clamp(Math.floor(minSide * 0.21), 10, 26);
      const pctFont = this._clamp(Math.floor(codeFont * 0.62), 8, 15);
      const nameY = y + (h >= 56 ? h * 0.24 : h * 0.28);
      const codeY = y + (h >= 56 ? h * 0.49 : h * 0.52);
      const pctY = y + (h >= 56 ? h * 0.72 : h * 0.74);
      const textMaxW = Math.max(w - 8, 0);

      ctx.font = `600 ${nameFont}px "Noto Sans TC"`;
      ctx.fillStyle = 'rgba(232,236,245,0.86)';
      this._fitCenterText(ctx, String(stock.name || ''), centerX, nameY, textMaxW);

      ctx.font = `700 ${codeFont}px "JetBrains Mono"`;
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      this._fitCenterText(ctx, String(stock.code || ''), centerX, codeY, textMaxW);

      if (h >= 42) {
        ctx.font = `${pctFont}px "JetBrains Mono"`;
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        this._fitCenterText(ctx, pctText, centerX, pctY, textMaxW);
      }

      ctx.restore();
      return;
    }

    const codeFont = this._clamp(Math.floor(minSide * 0.22), 9, 20);
    ctx.font = `700 ${codeFont}px "JetBrains Mono"`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    const codeY = h > 36 ? y + h * 0.43 : y + h * 0.52;
    this._fitCenterText(ctx, String(stock.code || ''), centerX, codeY, Math.max(w - 6, 0));

    if (h > 34) {
      ctx.font = `${this._clamp(codeFont - 3, 8, 14)}px "JetBrains Mono"`;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      this._fitCenterText(ctx, pctText, centerX, y + h * 0.68, Math.max(w - 8, 0));
    }

    ctx.restore();
  }

  // 目前顏色指標的數值文字；沒有資料顯示「--」。
  _formatMetricValue(value) {
    if (value == null || !Number.isFinite(Number(value))) return '--';
    const number = Number(value);
    return this.colorMetric === 'volRatio' ? `${number.toFixed(2)}x` : `${number >= 0 ? '+' : ''}${number.toFixed(2)}%`;
  }

  _formatMetric(stock) {
    return this._formatMetricValue(stock[this.colorMetric]);
  }

  // 沒有報價的方塊疊斜線，跟「平盤」的顏色區分開。
  _drawHatch(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let offset = -h; offset < w; offset += 6) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y + h);
      ctx.lineTo(x + offset + h, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _fitCenterText(ctx, text, x, y, maxWidth) {
    const value = String(text || '').trim();
    if (!value || maxWidth <= 0) return;
    if (ctx.measureText(value).width <= maxWidth) return ctx.fillText(value, x, y);
    let clipped = value;
    while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) clipped = clipped.slice(0, -1);
    ctx.fillText(clipped.length < value.length ? `${clipped}...` : clipped, x, y);
  }

  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  _drawHoverHighlight(ctx, stock) {
    const { x, y, w, h } = stock.rect;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  _drawColorLegend(ctx, W, H) {
    // 色帶固定在右下角。漲跌：紅漲綠跌（-5/-1 與 +1/+5 是門檻，0 是中間那一格）；量比：1 倍附近中性，越亮量越大。
    const isVolume = this.colorMetric === 'volRatio';
    const samples = isVolume ? [0.3, 0.6, 1, 1.3, 1.7, 2.5, 3.5] : [-6, -4, -2, -0.5, 0, 0.5, 2, 4, 6];
    const legendW = samples.length * 24;
    const legendH = 12;
    const legendX = W - legendW - 12;
    const legendY = H - legendH - 30;
    const labelsY = legendY + legendH + 10;
    const bands = samples.map(isVolume ? getVolumeColor : getHeatColor);
    const labels = isVolume
      ? [[1, '0.5x'], [2.5, '1x'], [4, '1.5x'], [5, '2x'], [6, '3x']]
      : [[1, '-5%'], [3, '-1%'], [4.5, '0%'], [6, '+1%'], [8, '+5%']];

    const bandW = legendW / bands.length;
    bands.forEach((color, index) => {
      const x = legendX + index * bandW;
      ctx.fillStyle = color;
      ctx.fillRect(x, legendY, bandW, legendH);
      ctx.strokeStyle = '#111822';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x + 0.5, legendY + 0.5, bandW - 1, legendH - 1);
    });
    ctx.font = '9px "JetBrains Mono"';
    ctx.fillStyle = '#8da0bf';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    labels.forEach(([at, text]) => ctx.fillText(text, legendX + at * bandW, labelsY));
  }

  _isSearchHit(stock) {
    if (stock.isSectorAggregate || stock.isWeightedRemainder) return false;
    const code = String(stock.code || '').toUpperCase();
    const name = String(stock.name || '').toUpperCase();
    return code.includes(this.searchQuery) || name.includes(this.searchQuery);
  }

  _handleMouseMove(e) {
    const pos = this._getCanvasPos(e);
    const hit = this._hitStock(pos);
    if (hit !== this.hoveredStock) {
      this.hoveredStock = hit;
      this.render();
      this._onHover(hit, e);
    } else if (hit) {
      this._onHover(hit, e);
    }
  }

  _handleMouseLeave() {
    this.hoveredStock = null;
    this.render();
    this._onHover(null, null);
  }

  _handleClick(e) {
    // 點到個股開 detail；類股模式點類股方塊會點進去看該類股的個股，再點標題列回到全部類股；
    // 其他分組點 sector 空白處切換 sector zoom。
    const pos = this._getCanvasPos(e);
    const hitStock = this._hitStock(pos);
    if (hitStock?.isSectorAggregate) {
      this.drillSector = hitStock.sector;
      this._computeLayout();
      this.render();
      this._onSectorClick(this.drillSector);
      return;
    }
    if (hitStock) return this._onClick(hitStock);

    const hitSector = this._hitSector(pos);
    if (!hitSector) return;
    if (this.drillSector) {
      this.drillSector = null;
      this._computeLayout();
      this.render();
      this._onSectorClick(null);
      return;
    }
    const nextSector = this.zoomedSector === hitSector.sectorName ? null : hitSector.sectorName;
    this.zoomSector(nextSector);
    this._onSectorClick(nextSector);
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _hitStock({ x, y }) {
    for (const sector of this.layout) {
      for (const stock of sector.stocks) {
        const r = stock.rect;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return stock;
      }
    }
    return null;
  }

  _hitSector({ x, y }) {
    for (const sector of this.layout) {
      const r = sector.sectorRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return sector;
    }
    return null;
  }

  _onHover(stock, event) {}
  _onClick(stock) {}
  _onSectorClick(sectorName) {}

  destroy() {
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.canvas.removeEventListener('click', this._onClickEvt);
    this.canvas.remove();
  }
}
