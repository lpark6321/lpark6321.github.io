import { layoutWithGroups, computeSectorAvg, SECTOR_HEADER_HEIGHT } from './TreemapLayout.js';
import { SECTOR_COLORS, SECTOR_ORDER } from '../data/twStocks.js';

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
    this.colorMetric = 'changePct';
    this.sizeMetric = 'marketCap';
    this.groupMode = 'sector';
    this.searchQuery = '';

    this._onMouseMove = (e) => this._handleMouseMove(e);
    this._onMouseLeave = () => this._handleMouseLeave();
    this._onClick = (e) => this._handleClick(e);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    this.canvas.addEventListener('click', this._onClick);

    this._resizeObserver = new ResizeObserver(() => {
      this._computeLayout();
      this.render();
    });
    this._resizeObserver.observe(this.container);
  }

  update(stocks) {
    this.stocks = Array.isArray(stocks) ? stocks : [];
    this._computeLayout();
    this.render();
  }

  setColorMetric(metric) {
    this.colorMetric = metric;
    this.render();
  }

  setSizeMetric(metric) {
    this.sizeMetric = metric;
    this._computeLayout();
    this.render();
  }

  setGroupMode(mode) {
    this.groupMode = mode || 'sector';
    this.zoomedSector = null;
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

  _resolveSizeValue(stock) {
    const volume = Number(stock.volume) || 0;
    const marketCap = Number(stock.marketCap) || 0;
    return this.sizeMetric === 'volume' ? Math.max(volume, 1) : Math.max(marketCap, 1);
  }

  _mid100Universe(items) {
    const explicit = items.filter((stock) => stock.isInMid100 === true);
    if (explicit.length) return explicit;
    return items
      .filter((stock) => !stock.isIn0050 && stock.sector !== 'ETF')
      .sort((a, b) => (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0))
      .slice(0, 100);
  }

  _groupStocks() {
    const withSize = this.stocks.map((stock) => ({
      ...stock,
      value: this._resolveSizeValue(stock)
    }));

    if (this.groupMode === 'weighted') {
      const weighted = withSize.filter((stock) => stock.sector !== 'ETF');
      return weighted.length
        ? [{ name: '加權', stocks: weighted.sort((a, b) => b.value - a.value) }]
        : [];
    }

    if (this.groupMode === 'tw50') {
      const tw50 = withSize.filter((stock) => stock.isIn0050);
      return tw50.length
        ? [{ name: '台灣50', stocks: tw50.sort((a, b) => b.value - a.value) }]
        : [];
    }

    if (this.groupMode === 'mid100') {
      const mid100 = this._mid100Universe(withSize);
      return mid100.length
        ? [{ name: '中型100', stocks: mid100.sort((a, b) => b.value - a.value) }]
        : [];
    }

    const map = new Map();
    withSize.forEach((stock) => {
      const sector = stock.sector || '其他';
      if (!map.has(sector)) map.set(sector, []);
      map.get(sector).push(stock);
    });

    return [...map.entries()]
      .sort(([a], [b]) => {
        const ia = SECTOR_ORDER.indexOf(a);
        const ib = SECTOR_ORDER.indexOf(b);
        const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
        const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
        return ra - rb;
      })
      .map(([name, stocks]) => ({ name, stocks: stocks.sort((a, b) => b.value - a.value) }));
  }

  _computeLayout() {
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    if (!W || !H || !this.stocks.length) {
      this.layout = [];
      return;
    }

    const grouped = this._groupStocks();
    const filtered = this.zoomedSector
      ? grouped.filter((sector) => sector.name === this.zoomedSector)
      : grouped;

    this.layout = layoutWithGroups(filtered, W, H, 2, 1);
  }

  render() {
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    if (!W || !H) return;

    this.canvas.width = Math.floor(W * dpr);
    this.canvas.height = Math.floor(H * dpr);
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (!this.layout.length) return;

    this.layout.forEach((sector) => {
      this._drawSectorHeader(ctx, sector);
      sector.stocks.forEach((stock) => this._drawStockTile(ctx, stock));
    });

    if (this.hoveredStock) {
      this._drawHoverHighlight(ctx, this.hoveredStock);
    }

    this._drawColorLegend(ctx, W, H);
  }

  _drawSectorHeader(ctx, sector) {
    const { x, y, w, h } = sector.sectorRect;
    if (w <= 0 || h <= 0) return;

    ctx.fillStyle = SECTOR_COLORS[sector.sectorName] || '#141820';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, w, SECTOR_HEADER_HEIGHT);

    ctx.font = '700 10px "Noto Sans TC"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5c842';
    ctx.fillText(sector.sectorName, x + 6, y + SECTOR_HEADER_HEIGHT / 2);

    const avg = computeSectorAvg(sector.stocks);
    const avgStr = `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`;
    ctx.font = '700 9px "JetBrains Mono"';
    ctx.textAlign = 'right';
    ctx.fillStyle = avg >= 0 ? '#f03a5f' : '#1fd67a';
    ctx.fillText(avgStr, x + w - 6, y + SECTOR_HEADER_HEIGHT / 2);
  }

  _drawStockTile(ctx, stock) {
    const { x, y, w, h } = stock.rect;
    if (w < 2 || h < 2) return;

    const metricValue = this._resolveColorMetric(stock);
    ctx.fillStyle = this._getHeatColor(metricValue);
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#080a0d';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (this.searchQuery && this._isSearchHit(stock)) {
      ctx.strokeStyle = '#f5c842';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    if (w <= 28 || h <= 20) return;

    ctx.save();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();

    const codeFont = Math.min(Math.floor(Math.min(w, h) * 0.22), 14);
    ctx.font = `700 ${codeFont}px "JetBrains Mono"`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = h > 36 ? y + h * 0.42 : y + h * 0.5;
    ctx.fillText(stock.code, x + w / 2, labelY);

    if (h > 36) {
      const pct = Number(stock.changePct) || 0;
      const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
      ctx.font = `${Math.max(codeFont - 3, 8)}px "JetBrains Mono"`;
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText(pctStr, x + w / 2, y + h * 0.66);
    }

    ctx.restore();
  }

  _drawHoverHighlight(ctx, stock) {
    const { x, y, w, h } = stock.rect;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  _drawColorLegend(ctx, W, H) {
    const legendW = 200;
    const legendH = 12;
    const legendX = W - legendW - 12;
    const legendY = H - legendH - 30;
    const labelsY = legendY + legendH + 10;

    const bands = [
      { color: '#00a86b', label: '-5%' },
      { color: '#2ecc71', label: '' },
      { color: '#27ae60', label: '-1%' },
      { color: '#1c2236', label: '0%' },
      { color: '#e74c3c', label: '+1%' },
      { color: '#c0392b', label: '' },
      { color: '#8b0000', label: '+5%' }
    ];

    const bandW = legendW / bands.length;
    bands.forEach((band, index) => {
      const x = legendX + index * bandW;
      ctx.fillStyle = band.color;
      ctx.fillRect(x, legendY, bandW, legendH);
      ctx.strokeStyle = '#111822';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x + 0.5, legendY + 0.5, bandW - 1, legendH - 1);
      if (band.label) {
        ctx.font = '9px "JetBrains Mono"';
        ctx.fillStyle = '#8da0bf';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(band.label, x + bandW / 2, labelsY);
      }
    });
  }

  _resolveColorMetric(stock) {
    if (this.colorMetric === 'volRatio') {
      const ratio = Number(stock.volRatio) || 1;
      return (ratio - 1) * 2;
    }
    return Number(stock[this.colorMetric]) || 0;
  }

  _getHeatColor(changePct) {
    if (changePct > 5) return '#8b0000';
    if (changePct > 3) return '#c0392b';
    if (changePct > 1) return '#e74c3c';
    if (changePct > 0) return '#922b21';
    if (changePct === 0) return '#1c2236';
    if (changePct > -1) return '#1a5c35';
    if (changePct > -3) return '#27ae60';
    if (changePct > -5) return '#2ecc71';
    return '#00a86b';
  }

  _isSearchHit(stock) {
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
    const pos = this._getCanvasPos(e);
    const hitStock = this._hitStock(pos);
    if (hitStock) {
      this._onClick(hitStock);
      return;
    }

    const hitSector = this._hitSector(pos);
    if (hitSector) {
      const nextSector = this.zoomedSector === hitSector.sectorName ? null : hitSector.sectorName;
      this.zoomSector(nextSector);
      this._onSectorClick(nextSector);
    }
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _hitStock({ x, y }) {
    for (const sector of this.layout) {
      for (const stock of sector.stocks) {
        const r = stock.rect;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          return stock;
        }
      }
    }
    return null;
  }

  _hitSector({ x, y }) {
    for (const sector of this.layout) {
      const r = sector.sectorRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return sector;
      }
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
    this.canvas.removeEventListener('click', this._onClick);
    this.canvas.remove();
  }
}
