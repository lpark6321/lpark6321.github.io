export class SunburstChart {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair';
    container.appendChild(this.canvas);

    this.stocks = [];
    this.groupMode = 'sector';
    this.colorMetric = 'changePct';
    this.sizeMetric = 'marketCap';
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

  setSizeMetric(metric) {
    this.sizeMetric = metric || 'marketCap';
    this.render();
  }

  _resolveSizeValue(stock) {
    const volume = Number(stock.volume) || 0;
    const marketCap = Number(stock.marketCap) || 0;
    return this.sizeMetric === 'volume' ? Math.max(volume, 0) : Math.max(marketCap, 0);
  }

  _resolveColorValue(stock) {
    if (this.colorMetric === 'volRatio') {
      const ratio = Number(stock.volRatio) || 1;
      return (ratio - 1) * 2;
    }
    return Number(stock[this.colorMetric]) || 0;
  }

  _getScopedStocks() {
    if (this.groupMode === 'weighted') {
      return this.stocks.filter((stock) => stock.sector !== 'ETF');
    }

    if (this.groupMode === 'tw50') {
      return this.stocks.filter((stock) => stock.isIn0050);
    }

    if (this.groupMode === 'mid100') {
      const explicit = this.stocks.filter((stock) => stock.isInMid100 === true);
      if (explicit.length) return explicit;
      return this.stocks
        .filter((stock) => !stock.isIn0050 && stock.sector !== 'ETF')
        .sort((a, b) => (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0))
        .slice(0, 100);
    }

    return this.stocks;
  }

  _buildSectors() {
    const scoped = this._getScopedStocks();
    const sectorMap = new Map();

    scoped.forEach((stock) => {
      const sectorName = stock.sector || '其他';
      const size = this._resolveSizeValue(stock);
      if (size <= 0) return;
      if (!sectorMap.has(sectorName)) {
        sectorMap.set(sectorName, { name: sectorName, value: 0, stocks: [] });
      }
      const sector = sectorMap.get(sectorName);
      sector.value += size;
      sector.stocks.push(stock);
    });

    return [...sectorMap.values()]
      .filter((sector) => sector.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  render() {
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
      const sweep = (sector.value / total) * Math.PI * 2;
      const end = start + sweep;

      const sectorColor = this._sectorPalette(index);
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
        .map((stock) => ({
          stock,
          size: this._resolveSizeValue(stock),
          colorValue: this._resolveColorValue(stock)
        }))
        .filter((item) => item.size > 0)
        .sort((a, b) => b.size - a.size)
        .forEach((item) => {
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
            this._toRgba(this._getHeatColor(item.colorValue), hovered ? 1 : 0.92)
          );

          const pct = Number(item.stock.changePct) || 0;
          const pctText = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
          this._drawArcTextBlock(
            ctx,
            { cx, cy, start: stockStart, end: stockEnd, r0: stockInnerR, r1: outerR },
            [item.stock.code, this._shortName(item.stock.name), pctText],
            { fontFamily: '"Noto Sans TC", sans-serif', color: 'rgba(255,255,255,0.92)', weight: 700 }
          );

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

  _shortName(name) {
    const text = String(name || '');
    if (text.length <= 8) return text;
    return `${text.slice(0, 8)}…`;
  }

  _drawArcTextBlock(ctx, arc, lines, style = {}) {
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

  _handleMouseMove(e) {
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

    if (hitStock?.stock) {
      this._onHover(hitStock.stock, e);
    } else {
      this._onHover(null, null);
    }
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
