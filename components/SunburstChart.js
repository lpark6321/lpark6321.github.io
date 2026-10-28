// 旭日圖元件：依群組與成分權重繪製內外圈市場結構。
import { TW50_MAJOR_GROUP_ORDER } from '../data/tw50Constituents.js';
import { MID100_MAJOR_GROUP_ORDER } from '../data/twMid100Constituents.js';
import {
  TAIEX_PRIMARY_SECTORS,
  TAIEX2_PRIMARY_SECTORS,
  TAIEX_OTHER_SECTOR_WEIGHT,
  TAIEX2_OTHER_SECTOR_WEIGHT,
  TAIEX_STOCK_THRESHOLD,
  TAIEX2_STOCK_THRESHOLD,
  TAIEX_WEIGHTED_SECTOR_ORDER,
  TAIEX2_WEIGHTED_SECTOR_ORDER,
  TAIEX_SECTOR_WEIGHTS
} from '../data/taiexWeightedConstituents.js';

const GROUP_LABELS = { other: '其他' };

const YAHOO_SECTOR_ORDER = [
  '半導體',
  '電子零組件',
  '電腦及週邊設備',
  '通信網路',
  '光電',
  '其他電子',
  '金融保險',
  '航運',
  '電機機械',
  '塑膠',
  '水泥',
  '食品',
  '鋼鐵',
  '生技醫療',
  '紡織纖維',
  '建材營造',
  '玻璃陶瓷',
  '橡膠',
  '汽車',
  '居家生活',
  '綠能環保',
  '其他'
];

const ELECTRONIC_SECTOR_SET = new Set([
  '電子',
  '半導體',
  '半導體業',
  '電子零組件',
  '電子零組件業',
  '電腦及週邊設備',
  '電腦及週邊設備業',
  '通信網路',
  '通信網路業',
  '光電',
  '光電業',
  '其他電子',
  '其他電子業'
]);

// SunburstChart：類別用途註解，集中管理相關狀態與方法。
export class SunburstChart {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container) {
    this.container = container;
    // 段落說明：建立新的 DOM 節點。
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair';
    // 段落說明：將建立好的節點掛回頁面。
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
    // 段落說明：綁定使用者互動事件。
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    // 段落說明：綁定使用者互動事件。
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);

    // 段落說明：監聽容器尺寸變化，重新計算或重繪內容。
    this._resizeObserver = new ResizeObserver(() => this.render());
    this._resizeObserver.observe(this.container);
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(stocks) {
    this.stocks = Array.isArray(stocks) ? stocks : [];
    this.render();
  }

  // setGroupMode：方法用途註解，處理此元件或類別的一段行為。
  setGroupMode(mode) {
    this.groupMode = mode || 'sector';
    this.hoveredSegment = null;
    this.render();
  }

  // setColorMetric：方法用途註解，處理此元件或類別的一段行為。
  setColorMetric(metric) {
    this.colorMetric = metric || 'changePct';
    this.render();
  }

  // setSizeMetric：方法用途註解，處理此元件或類別的一段行為。
  setSizeMetric(metric) {
    this.sizeMetric = metric || 'marketCap';
    this.render();
  }

  // _resolveSizeValue：方法用途註解，處理此元件或類別的一段行為。
  _resolveSizeValue(stock) {
    if (this.groupMode === 'sector' || this.groupMode === 'weighted' || this.groupMode === 'weighted2') {
      const weight = Number(stock.taiexWeightPct);
      return weight > 0 ? weight : 0;
    }
    if (this.groupMode === 'tw50') {
      const weight = Number(stock.tw50WeightPct);
      return weight > 0 ? weight : 0;
    }
    if (this.groupMode === 'mid100') {
      const weight = Number(stock.mid100WeightPct);
      return weight > 0 ? weight : 0;
    }
    const volume = Number(stock.volume) || 0;
    const marketCap = Number(stock.marketCap) || 0;
    return this.sizeMetric === 'volume' ? Math.max(volume, 0) : Math.max(marketCap, 0);
  }

  // _resolveColorValue：方法用途註解，處理此元件或類別的一段行為。
  _resolveColorValue(stock) {
    if (this.colorMetric === 'volRatio') {
      const ratio = Number(stock.volRatio) || 1;
      return (ratio - 1) * 2;
    }
    return Number(stock[this.colorMetric]) || 0;
  }

  // _resolveYahooSector：方法用途註解，處理此元件或類別的一段行為。
  _resolveYahooSector(stock) {
    const yahoo = String(stock.yahooSector || '').trim();
    if (yahoo) return yahoo;
    const taiexSector = String(stock.taiexSector || '');
    if (taiexSector.includes('半導體')) return '半導體';
    if (taiexSector.includes('電子零組件')) return '電子零組件';
    if (taiexSector.includes('電腦及週邊設備')) return '電腦及週邊設備';
    if (taiexSector.includes('通信網路')) return '通信網路';
    if (taiexSector.includes('光電')) return '光電';
    if (taiexSector.includes('其他電子')) return '其他電子';
    if (taiexSector.includes('金融')) return '金融保險';
    if (taiexSector.includes('航運')) return '航運';
    if (taiexSector.includes('電機機械')) return '電機機械';
    if (taiexSector.includes('塑膠')) return '塑膠';
    if (taiexSector.includes('水泥')) return '水泥';
    if (taiexSector.includes('食品')) return '食品';
    if (taiexSector.includes('鋼鐵')) return '鋼鐵';
    if (taiexSector.includes('生技')) return '生技醫療';
    if (taiexSector.includes('紡織')) return '紡織纖維';
    if (taiexSector.includes('建材')) return '建材營造';
    if (taiexSector.includes('玻璃')) return '玻璃陶瓷';
    if (taiexSector.includes('橡膠')) return '橡膠';
    if (taiexSector.includes('汽車')) return '汽車';
    if (taiexSector.includes('居家')) return '居家生活';
    if (taiexSector.includes('綠能')) return '綠能環保';
    return '其他';
  }

  // _classifyMajorBySector：方法用途註解，處理此元件或類別的一段行為。
  _classifyMajorBySector(stock) {
    const sector = String(stock.sector || stock.taiexSector || '');
    if (sector.includes('金融')) return '金融';
    if (sector.includes('航運') || sector.includes('航空')) return '航運';
    if (ELECTRONIC_SECTOR_SET.has(sector) || sector.includes('電子') || sector.includes('半導體')) return '電子';
    if (sector && sector !== GROUP_LABELS.other) return '傳產';
    return '其他';
  }

  // _resolveTw50Major：方法用途註解，處理此元件或類別的一段行為。
  _resolveTw50Major(stock) {
    const explicit = stock.tw50Major;
    if (explicit && TW50_MAJOR_GROUP_ORDER.includes(explicit)) return explicit;
    const major = this._classifyMajorBySector(stock);
    return major === '電子' || major === '金融' ? major : '傳產';
  }

  // _resolveMid100Major：方法用途註解，處理此元件或類別的一段行為。
  _resolveMid100Major(stock) {
    const explicit = stock.mid100Major;
    if (explicit && MID100_MAJOR_GROUP_ORDER.includes(explicit)) return explicit;
    return this._classifyMajorBySector(stock);
  }

  // _getScopedStocks：方法用途註解，處理此元件或類別的一段行為。
  _getScopedStocks() {
    const allowSynthetic =
      this.groupMode === 'sector' ||
      this.groupMode === 'weighted' ||
      this.groupMode === 'weighted2' ||
      this.groupMode === 'tw50' ||
      this.groupMode === 'mid100';
    // base：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const base = this.stocks.filter((stock) => allowSynthetic || !stock.syntheticConstituentOnly);

    if (this.groupMode === 'sector' || this.groupMode === 'weighted' || this.groupMode === 'weighted2') {
      return base
        .filter((stock) => Number(stock.taiexWeightPct) > 0)
        .sort((a, b) => (Number(b.taiexWeightPct) || 0) - (Number(a.taiexWeightPct) || 0));
    }
    if (this.groupMode === 'tw50') return base.filter((stock) => Number(stock.tw50WeightPct) > 0);
    if (this.groupMode === 'mid100') {
      const explicit = base
        .filter((stock) => Number(stock.mid100WeightPct) > 0 || stock.isInMid100 === true)
        .sort((a, b) => (Number(b.mid100WeightPct) || 0) - (Number(a.mid100WeightPct) || 0));
      if (explicit.length) return explicit;
      return base
        .filter((stock) => !stock.isIn0050 && stock.sector !== 'ETF')
        .sort((a, b) => (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0))
        .slice(0, 100);
    }
    return base;
  }

  // _computeSectorMetrics：方法用途註解，處理此元件或類別的一段行為。
  _computeSectorMetrics(stocks) {
    if (!stocks.length) return { changePct: 0 };
    // totalWeight：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const totalWeight = stocks.reduce((sum, s) => sum + (Number(s.taiexWeightPct) || 0), 0);
    if (totalWeight <= 0) return { changePct: 0 };
    const changePct = stocks.reduce(
      (sum, s) => sum + (Number(s.changePct) || 0) * (Number(s.taiexWeightPct) || 0),
      0
    ) / totalWeight;
    return { changePct };
  }

  // _buildSectorOnlySectors：方法用途註解，處理此元件或類別的一段行為。
  _buildSectorOnlySectors(scoped) {
    // sectorOrder：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const sectorOrder = TAIEX_SECTOR_WEIGHTS.map((row) => row.name);
    // sectorWeightMap：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const sectorWeightMap = new Map(TAIEX_SECTOR_WEIGHTS.map((row) => [row.name, Number(row.weightPct) || 0]));
    // grouped：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const grouped = new Map(sectorOrder.map((name) => [name, []]));

    scoped.forEach((stock) => {
      const raw = String(stock.taiexSector || '');
      const sectorName = grouped.has(raw) ? raw : GROUP_LABELS.other;
      grouped.get(sectorName).push(stock);
    });

    return sectorOrder
      .map((name) => {
        const value = Number(sectorWeightMap.get(name) || 0);
        if (value <= 0) return null;
        const metrics = this._computeSectorMetrics(grouped.get(name) || []);
        return {
          name,
          value,
          changePct: metrics.changePct,
          stocks: []
        };
      })
      .filter(Boolean);
  }

  // _weightedGroups：方法用途註解，處理此元件或類別的一段行為。
  _weightedGroups(scoped, options = {}) {
    const {
      primarySectors = TAIEX_PRIMARY_SECTORS,
      sectorOrder = TAIEX_WEIGHTED_SECTOR_ORDER,
      otherSectorWeight = TAIEX_OTHER_SECTOR_WEIGHT,
      stockThreshold = TAIEX_STOCK_THRESHOLD
    } = options;

    // sectorWeightMap：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const sectorWeightMap = new Map(TAIEX_SECTOR_WEIGHTS.map((row) => [row.name, Number(row.weightPct) || 0]));
    sectorWeightMap.set(GROUP_LABELS.other, Number(otherSectorWeight) || 0);

    // grouped：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const grouped = new Map(sectorOrder.map((name) => [name, []]));
    scoped.forEach((stock) => {
      const raw = String(stock.taiexSector || '');
      const sectorName = primarySectors.includes(raw) ? raw : GROUP_LABELS.other;
      if (!grouped.has(sectorName)) grouped.set(sectorName, []);
      grouped.get(sectorName).push(stock);
    });

    return sectorOrder
      .map((sectorName) => {
        const allStocks = (grouped.get(sectorName) || []).sort(
          (a, b) => (Number(b.taiexWeightPct) || 0) - (Number(a.taiexWeightPct) || 0)
        );
        // majorStocks：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
        const majorStocks = allStocks.filter((stock) => Number(stock.taiexWeightPct) >= Number(stockThreshold || 0));
        // majorSum：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
        const majorSum = majorStocks.reduce((sum, stock) => sum + (Number(stock.taiexWeightPct) || 0), 0);
        const configuredWeight = Number(sectorWeightMap.get(sectorName) || 0);
        const sectorWeight = Math.max(configuredWeight, majorSum);
        const remainder = +(sectorWeight - majorSum).toFixed(4);
        const stocks = [...majorStocks];

        if (remainder > 0.0001) {
          stocks.push({
            code: `REST-${sectorName}`,
            name: '其他(<0.1%)',
            taiexWeightPct: remainder,
            value: remainder,
            marketCap: remainder,
            taiexSector: sectorName,
            syntheticConstituentOnly: true,
            isWeightedRemainder: true
          });
        }

        return {
          name: sectorName,
          value: stocks.reduce((sum, stock) => sum + this._resolveSizeValue(stock), 0),
          stocks
        };
      })
      .filter((sector) => sector.value > 0);
  }

  // _sectorGroupsByYahoo：方法用途註解，處理此元件或類別的一段行為。
  _sectorGroupsByYahoo(scoped) {
    const grouped = new Map();
    scoped.forEach((stock) => {
      const sectorName = this._resolveYahooSector(stock);
      if (!grouped.has(sectorName)) grouped.set(sectorName, []);
      grouped.get(sectorName).push(stock);
    });

    return YAHOO_SECTOR_ORDER
      .filter((name) => grouped.has(name))
      .map((name) => {
        // stocks：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
        const stocks = grouped.get(name).sort((a, b) => (Number(b.taiexWeightPct) || 0) - (Number(a.taiexWeightPct) || 0));
        return {
          name,
          value: stocks.reduce((sum, stock) => sum + this._resolveSizeValue(stock), 0),
          stocks
        };
      })
      .filter((sector) => sector.value > 0);
  }

  // _buildSectors：方法用途註解，處理此元件或類別的一段行為。
  _buildSectors() {
    // 旭日圖和方塊圖共用同一套分組邏輯概念：
    // 內圈是分區，外圈是個股；類股模式則只畫分區本身。
    const scoped = this._getScopedStocks();
    if (this.groupMode === 'sector') return this._buildSectorOnlySectors(scoped);
    if (this.groupMode === 'weighted') return this._weightedGroups(scoped);
    if (this.groupMode === 'weighted2') {
      return this._weightedGroups(scoped, {
        primarySectors: TAIEX2_PRIMARY_SECTORS,
        sectorOrder: TAIEX2_WEIGHTED_SECTOR_ORDER,
        otherSectorWeight: TAIEX2_OTHER_SECTOR_WEIGHT,
        stockThreshold: TAIEX2_STOCK_THRESHOLD
      });
    }

    const sectorMap = new Map();
    scoped.forEach((stock) => {
      let sectorName = stock.sector || GROUP_LABELS.other;
      if (this.groupMode === 'tw50') sectorName = this._resolveTw50Major(stock);
      if (this.groupMode === 'mid100') sectorName = this._resolveMid100Major(stock);

      const size = this._resolveSizeValue(stock);
      if (size <= 0) return;
      if (!sectorMap.has(sectorName)) sectorMap.set(sectorName, { name: sectorName, value: 0, stocks: [] });
      const sector = sectorMap.get(sectorName);
      sector.value += size;
      sector.stocks.push(stock);
    });

    // sectors：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const sectors = [...sectorMap.values()].filter((sector) => sector.value > 0);
    if (this.groupMode === 'tw50') {
      return TW50_MAJOR_GROUP_ORDER.map((name) => sectors.find((sector) => sector.name === name)).filter(Boolean);
    }
    if (this.groupMode === 'mid100') {
      return MID100_MAJOR_GROUP_ORDER.map((name) => sectors.find((sector) => sector.name === name)).filter(Boolean);
    }
    return sectors.sort((a, b) => b.value - a.value);
  }

  // render：方法用途註解，處理此元件或類別的一段行為。
  render() {
    // Canvas 旭日圖每次都完整重繪，並同步重建 sectorArcs/stockArcs，
    // 這兩份 hit map 會被滑鼠 hover 用來找目前指到哪個弧段。
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    if (!W || !H) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(W * dpr);
    this.canvas.height = Math.floor(H * dpr);
    // 段落說明：取得 Canvas 2D context 進行繪圖。
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 段落說明：清除上一輪 Canvas 繪圖內容。
    ctx.clearRect(0, 0, W, H);

    const sectors = this._buildSectors();
    if (!sectors.length) return;
    // total：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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
        ? this._getHeatColor(Number(sector.changePct) || 0)
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
        .map((stock) => ({ stock, size: this._resolveSizeValue(stock), colorValue: this._resolveColorValue(stock) }))
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
            this._toRgba(this._getHeatColor(item.colorValue), hovered ? 1 : 0.92)
          );

          const pct = Number(item.stock.changePct) || 0;
          const pctText = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
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

  // _stockNameForLabel：方法用途註解，處理此元件或類別的一段行為。
  _stockNameForLabel(name) {
    const text = String(name || '');
    if (text.length <= 8) return text;
    return `${text.slice(0, 8)}...`;
  }

  // _resolveGroupWeightPct：方法用途註解，處理此元件或類別的一段行為。
  _resolveGroupWeightPct(stock) {
    if (this.groupMode === 'sector' || this.groupMode === 'weighted' || this.groupMode === 'weighted2') {
      return Number(stock.taiexWeightPct) || 0;
    }
    if (this.groupMode === 'tw50') return Number(stock.tw50WeightPct) || 0;
    if (this.groupMode === 'mid100') return Number(stock.mid100WeightPct) || 0;
    return 0;
  }

  // _shouldDrawStockLabel：方法用途註解，處理此元件或類別的一段行為。
  _shouldDrawStockLabel(stock) {
    if (!stock || stock.isWeightedRemainder) return false;
    if (
      this.groupMode === 'sector' ||
      this.groupMode === 'weighted' ||
      this.groupMode === 'weighted2' ||
      this.groupMode === 'tw50' ||
      this.groupMode === 'mid100'
    ) {
      return this._resolveGroupWeightPct(stock) >= 0.2;
    }
    return true;
  }

  // _drawArcTextBlock：方法用途註解，處理此元件或類別的一段行為。
  _drawArcTextBlock(ctx, arc, lines, style = {}) {
    // 文字會依弧長與環厚自動縮小；小於 6px 就不畫，
    // 避免旭日圖外圈的小權重個股出現無法辨識的文字噪音。
    // cleanLines：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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
    // maxChars：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const maxChars = Math.max(...cleanLines.map((line) => line.length), 1);
    fontSize = Math.min(fontSize, usableW / Math.max(maxChars * 0.62, 1));

    const fontFamily = style.fontFamily || '"JetBrains Mono", monospace';
    const fontWeight = style.weight || 700;

    while (fontSize >= 6) {
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      // widest：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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

    // 段落說明：保存 Canvas 狀態，避免局部樣式影響後續繪圖。
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
    // 段落說明：還原 Canvas 狀態。
    ctx.restore();
    return true;
  }

  // _drawRingArc：方法用途註解，處理此元件或類別的一段行為。
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

  // _sectorPalette：方法用途註解，處理此元件或類別的一段行為。
  _sectorPalette(index) {
    const colors = ['#35608e', '#3f6f8d', '#516d97', '#6a6a9a', '#6b5b8a', '#4f7a7f', '#6b7f5a'];
    return colors[index % colors.length];
  }

  // _toRgba：方法用途註解，處理此元件或類別的一段行為。
  _toRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // _getHeatColor：方法用途註解，處理此元件或類別的一段行為。
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

  // _handleMouseMove：方法用途註解，處理此元件或類別的一段行為。
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

    // hitStock：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const hitStock = this.stockArcs.find((arc) => this._isHitArc(normalized, dist, arc));
    // hitSector：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
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

  // _isHitArc：方法用途註解，處理此元件或類別的一段行為。
  _isHitArc(angle, dist, arc) {
    return angle >= arc.start && angle <= arc.end && dist >= arc.r0 && dist <= arc.r1;
  }

  // _handleMouseLeave：方法用途註解，處理此元件或類別的一段行為。
  _handleMouseLeave() {
    if (this.hoveredSegment !== null) {
      this.hoveredSegment = null;
      this.render();
    }
    this._onHover(null, null);
  }

  // _onHover：方法用途註解，處理此元件或類別的一段行為。
  _onHover(stock, event) {}

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.canvas.remove();
  }
}
