// 旭日圖元件：依群組與成分權重繪製內外圈市場結構。
import { NO_DATA_COLOR, buildGroups, metricColor } from './TreemapLayout.js';

export class SunburstChart {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair';
    container.appendChild(this.canvas);

    this.stocks = [];
    this.groupMode = 'sector';
    this.colorMetric = 'changePct';
    this.hoveredSegment = null;
    this.sectorArcs = [];
    this.stockArcs = [];

    this._onMouseMove = (e) => this._handleMouseMove(e);
    this._onMouseLeave = () => this._handleMouseLeave();
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);

    this._resizeObserver = new ResizeObserver(() => this.render());
    this._resizeObserver.observe(this.container);
  }

  update(stocks) {
    this.stocks = Array.isArray(stocks) ? stocks : [];
    this.render();
  }

  setGroupMode(mode) {
    this.groupMode = mode || 'sector';
    this.hoveredSegment = null;
    this.render();
  }

  setColorMetric(metric) {
    this.colorMetric = metric || 'changePct';
    this.render();
  }

  // 沒有該指標資料的弧段用「無資料」底色，不當成 0。
  _colorOf(item) {
    return metricColor(item, this.colorMetric) || NO_DATA_COLOR;
  }

  // _buildSectors：內圈是分區，外圈是個股（stock.value 為權重）；類股模式只畫分區本身。
  _buildSectors() {
    return buildGroups(this.stocks, this.groupMode).map((group) => {
      if (this.groupMode === 'sector') {
        const [tile] = group.stocks;
        return { name: group.name, value: tile.value, changePct: tile.changePct, volRatio: tile.volRatio, stocks: [] };
      }
      return { name: group.name, value: group.stocks.reduce((sum, stock) => sum + stock.value, 0), stocks: group.stocks };
    });
  }

  render() {
    // Canvas 旭日圖每次都完整重繪，並同步重建 sectorArcs/stockArcs，
    // 這兩份 hit map 會被滑鼠 hover 用來找目前指到哪個弧段。
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    if (!W || !H) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(W * dpr);
    this.canvas.height = Math.floor(H * dpr);
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const sectors = this._buildSectors();
    if (!sectors.length) return;
    const total = sectors.reduce((sum, sector) => sum + sector.value, 0);
    if (!total) return;

    const cx = W / 2;
    const cy = H / 2;
    const outerR = Math.min(W, H) * 0.46;
    const stockInnerR = outerR * 0.56;
    const sectorOuterR = outerR * 0.5;
    const sectorInnerR = outerR * 0.2;

    this.sectorArcs = [];
    this.stockArcs = [];

    let start = -Math.PI / 2;
    sectors.forEach((sector, index) => {
      // sector.value 決定內圈弧長，sector 內各 stock 的 size 再切外圈弧長。
      const sweep = (sector.value / total) * Math.PI * 2;
      const end = start + sweep;

      const sectorColor = this.groupMode === 'sector'
        ? this._colorOf(sector)
        : this._sectorPalette(index);
      const sectorHovered = this.hoveredSegment === `sector:${sector.name}`;
      const sectorFill = this._toRgba(sectorColor, sectorHovered ? 0.95 : 0.78);
      this._drawRingArc(ctx, cx, cy, sectorInnerR, sectorOuterR, start, end, sectorFill);
      this.sectorArcs.push({ id: `sector:${sector.name}`, start, end, r0: sectorInnerR, r1: sectorOuterR });

      const sectorPct = (sector.value / total) * 100;
      this._drawArcTextBlock(
        ctx,
        { cx, cy, start, end, r0: sectorInnerR, r1: sectorOuterR },
        [sector.name, `${sectorPct.toFixed(1)}%`],
        { fontFamily: '"Noto Sans TC", sans-serif', color: 'rgba(255,255,255,0.9)', weight: 700 }
      );

      const sectorTotal = sector.value;
      let stockStart = start;
      sector.stocks
        .map((stock) => ({ stock, size: stock.value, color: this._colorOf(stock) }))
        .filter((item) => item.size > 0)
        .sort((a, b) => b.size - a.size)
        .forEach((item) => {
          // 外圈每個個股弧段的比例只在自己的 sector 內分配，
          // 但 sector 本身已經先依總權重占整個圓的比例。
          const stockSweep = (item.size / sectorTotal) * sweep;
          const stockEnd = stockStart + stockSweep;
          const stockId = `stock:${item.stock.code}`;
          const hovered = this.hoveredSegment === stockId;

          this._drawRingArc(
            ctx,
            cx,
            cy,
            stockInnerR,
            outerR,
            stockStart,
            stockEnd,
            this._toRgba(item.color, hovered ? 1 : 0.92)
          );

          const value = item.stock[this.colorMetric];
          const hasMetric = value != null && Number.isFinite(Number(value));
          const pctText = !hasMetric ? '--'
            : this.colorMetric === 'volRatio' ? `${Number(value).toFixed(2)}x`
              : `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
          if (this._shouldDrawStockLabel(item.stock)) {
            this._drawArcTextBlock(
              ctx,
              { cx, cy, start: stockStart, end: stockEnd, r0: stockInnerR, r1: outerR },
              [this._stockNameForLabel(item.stock.name), item.stock.code, pctText],
              { fontFamily: '"Noto Sans TC", sans-serif', color: 'rgba(255,255,255,0.92)', weight: 700 }
            );
          }

          this.stockArcs.push({
            id: stockId,
            stock: item.stock,
            start: stockStart,
            end: stockEnd,
            r0: stockInnerR,
            r1: outerR
          });

          stockStart = stockEnd;
        });

      start = end;
    });

    ctx.beginPath();
    ctx.arc(cx, cy, sectorInnerR * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = '#132031';
    ctx.fill();
    ctx.strokeStyle = '#2a3d59';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _stockNameForLabel(name) {
    const text = String(name || '');
    if (text.length <= 8) return text;
    return `${text.slice(0, 8)}...`;
  }

  // _shouldDrawStockLabel：權重 0.2% 以下的小弧段不畫字，避免雜訊。
  _shouldDrawStockLabel(stock) {
    return Boolean(stock) && !stock.isWeightedRemainder && stock.value >= 0.2;
  }

  _drawArcTextBlock(ctx, arc, lines, style = {}) {
    // 文字會依弧長與環厚自動縮小；小於 6px 就不畫，
    // 避免旭日圖外圈的小權重個股出現無法辨識的文字噪音。
    const cleanLines = lines.map((line) => String(line || '').trim()).filter(Boolean);
    if (!cleanLines.length) return false;

    const theta = Math.max(arc.end - arc.start, 0);
    const midR = (arc.r0 + arc.r1) / 2;
    const arcLen = theta * midR;
    const ringThickness = arc.r1 - arc.r0;
    const usableW = arcLen - 6;
    const usableH = ringThickness - 6;
    if (usableW <= 0 || usableH <= 0) return false;

    const lineCount = cleanLines.length;
    let fontSize = Math.min(14, usableH / (lineCount * 1.15));
    const maxChars = Math.max(...cleanLines.map((line) => line.length), 1);
    fontSize = Math.min(fontSize, usableW / Math.max(maxChars * 0.62, 1));

    const fontFamily = style.fontFamily || '"JetBrains Mono", monospace';
    const fontWeight = style.weight || 700;

    while (fontSize >= 6) {
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      const widest = Math.max(...cleanLines.map((line) => ctx.measureText(line).width));
      const lineHeight = fontSize * 1.12;
      const textH = lineHeight * lineCount;
      if (widest <= usableW && textH <= usableH) break;
      fontSize -= 0.5;
    }
    if (fontSize < 6) return false;

    const mid = (arc.start + arc.end) / 2;
    const tx = arc.cx + Math.cos(mid) * midR;
    const ty = arc.cy + Math.sin(mid) * midR;
    let rot = mid + Math.PI / 2;
    if (rot > Math.PI / 2 && rot < (3 * Math.PI) / 2) rot += Math.PI;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(rot);
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = style.color || 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lineHeight = fontSize * 1.12;
    const y0 = -((lineCount - 1) * lineHeight) / 2;
    cleanLines.forEach((line, idx) => {
      ctx.fillText(line, 0, y0 + idx * lineHeight);
    });
    ctx.restore();
    return true;
  }

  _drawRingArc(ctx, cx, cy, r0, r1, start, end, fill) {
    ctx.beginPath();
    ctx.arc(cx, cy, r1, start, end);
    ctx.arc(cx, cy, r0, end, start, true);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = '#0a1018';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  _sectorPalette(index) {
    const colors = ['#35608e', '#3f6f8d', '#516d97', '#6a6a9a', '#6b5b8a', '#4f7a7f', '#6b7f5a'];
    return colors[index % colors.length];
  }

  _toRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  _handleMouseMove(e) {
    // hover 判斷先把滑鼠座標轉成極座標，再比對角度區間與半徑區間。
    // 命中個股時才送 tooltip；只命中 sector 時只做高亮。
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    const cx = W / 2;
    const cy = H / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const normalized = angle < -Math.PI / 2 ? angle + Math.PI * 2 : angle;

    const hitStock = this.stockArcs.find((arc) => this._isHitArc(normalized, dist, arc));
    const hitSector = this.sectorArcs.find((arc) => this._isHitArc(normalized, dist, arc));
    const next = hitStock?.id || hitSector?.id || null;

    if (next !== this.hoveredSegment) {
      this.hoveredSegment = next;
      this.render();
      this._onHover(hitStock?.stock || null, hitStock ? e : null);
      return;
    }

    if (hitStock?.stock) this._onHover(hitStock.stock, e);
    else this._onHover(null, null);
  }

  _isHitArc(angle, dist, arc) {
    return angle >= arc.start && angle <= arc.end && dist >= arc.r0 && dist <= arc.r1;
  }

  _handleMouseLeave() {
    if (this.hoveredSegment !== null) {
      this.hoveredSegment = null;
      this.render();
    }
    this._onHover(null, null);
  }

  _onHover(stock, event) {}

  destroy() {
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.canvas.remove();
  }
}
