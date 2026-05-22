// 方塊圖 Canvas 元件：負責市場地圖繪製、滑鼠命中測試與互動事件。
import { layoutWithGroups, computeSectorAvg, SECTOR_HEADER_HEIGHT } from './TreemapLayout.js';
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

const GROUP_LABELS = {
  weighted: '加權',
  weighted2: '加權2',
  tw50: '台灣50',
  mid100: '中型100',
  other: '其他'
};

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

const YAHOO_SECTOR_COLORS = {
  半導體: '#1a2840',
  電子零組件: '#1a2030',
  電腦及週邊設備: '#1f2738',
  通信網路: '#153048',
  光電: '#20202a',
  其他電子: '#263046',
  金融保險: '#1a2820',
  航運: '#102025',
  電機機械: '#273222',
  塑膠: '#2a2010',
  水泥: '#3a2a17',
  食品: '#2b3a1d',
  鋼鐵: '#2f3238',
  生技醫療: '#2e2340',
  紡織纖維: '#3a2834',
  建材營造: '#3b3121',
  玻璃陶瓷: '#3c3c46',
  橡膠: '#27312d',
  汽車: '#2d3a21',
  居家生活: '#3b2f2a',
  綠能環保: '#1f3a31',
  其他: '#2b2b34'
};

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

// TreemapCanvas：類別用途註解，集中管理相關狀態與方法。
export class TreemapCanvas {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container) {
    this.container = container;
    // 段落說明：建立新的 DOM 節點。
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:crosshair';
    // 段落說明：將建立好的節點掛回頁面。
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
    // 段落說明：綁定使用者互動事件。
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    // 段落說明：綁定使用者互動事件。
    this.canvas.addEventListener('mouseleave', this._onMouseLeave);
    // 段落說明：綁定使用者互動事件。
    this.canvas.addEventListener('click', this._onClick);

    // 段落說明：監聽容器尺寸變化，重新計算或重繪內容。
    this._resizeObserver = new ResizeObserver(() => {
      this._computeLayout();
      this.render();
    });
    this._resizeObserver.observe(this.container);
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(stocks) {
    this.stocks = Array.isArray(stocks) ? stocks : [];
    this._computeLayout();
    this.render();
  }

  // setColorMetric：方法用途註解，處理此元件或類別的一段行為。
  setColorMetric(metric) {
    this.colorMetric = metric;
    this.render();
  }

  // setSizeMetric：方法用途註解，處理此元件或類別的一段行為。
  setSizeMetric(metric) {
    this.sizeMetric = metric;
    this._computeLayout();
    this.render();
  }

  // setGroupMode：方法用途註解，處理此元件或類別的一段行為。
  setGroupMode(mode) {
    this.groupMode = mode || 'sector';
    this.zoomedSector = null;
    this._computeLayout();
    this.render();
  }

  // setSearchQuery：方法用途註解，處理此元件或類別的一段行為。
  setSearchQuery(query) {
    this.searchQuery = String(query || '').trim().toUpperCase();
    this.render();
  }

  // zoomSector：方法用途註解，處理此元件或類別的一段行為。
  zoomSector(sectorName) {
    this.zoomedSector = sectorName || null;
    this._computeLayout();
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
    return this.sizeMetric === 'volume' ? Math.max(volume, 1) : Math.max(marketCap, 1);
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

  // _mid100Universe：方法用途註解，處理此元件或類別的一段行為。
  _mid100Universe(items) {
    const explicit = items
      .filter((stock) => Number(stock.mid100WeightPct) > 0 || stock.isInMid100 === true)
      .sort((a, b) => (Number(b.mid100WeightPct) || 0) - (Number(a.mid100WeightPct) || 0));
    if (explicit.length) return explicit;
    return items
      .filter((stock) => !stock.isIn0050 && stock.sector !== 'ETF')
      .sort((a, b) => (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0))
      .slice(0, 100);
  }

  // _normalizeWeightedSector：方法用途註解，處理此元件或類別的一段行為。
  _normalizeWeightedSector(stock, primarySectors = TAIEX_PRIMARY_SECTORS) {
    const sector = String(stock.taiexSector || '');
    return primarySectors.includes(sector) ? sector : GROUP_LABELS.other;
  }

  // _weightedUniverse：方法用途註解，處理此元件或類別的一段行為。
  _weightedUniverse(items) {
    return items
      .filter((stock) => Number(stock.taiexWeightPct) > 0)
      .sort((a, b) => (Number(b.taiexWeightPct) || 0) - (Number(a.taiexWeightPct) || 0));
  }

  // _computeSectorMetrics：方法用途註解，處理此元件或類別的一段行為。
  _computeSectorMetrics(stocks) {
    if (!stocks.length) return { changePct: 0, change5d: 0, volRatio: 1 };
    // weightedSum：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const weightedSum = (key) => {
      // totalWeight：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
      const totalWeight = stocks.reduce((sum, s) => sum + (Number(s.taiexWeightPct) || 0), 0);
      if (totalWeight <= 0) return 0;
      return stocks.reduce((sum, s) => sum + (Number(s[key]) || 0) * (Number(s.taiexWeightPct) || 0), 0) / totalWeight;
    };
    const changePct = weightedSum('changePct');
    const change5d = weightedSum('change5d');
    const volRatio = stocks.length
      ? stocks.reduce((sum, s) => sum + (Number(s.volRatio) || 1), 0) / stocks.length
      : 1;
    return { changePct, change5d, volRatio };
  }

  // _buildSectorOnlyGroups：方法用途註解，處理此元件或類別的一段行為。
  _buildSectorOnlyGroups(items) {
    // 「類股」模式不再拆個股，直接把每個類股當成最小 tile；
    // tile 面積使用期交所公告的產業權重，漲跌則用該產業成分加權平均。
    const weighted = this._weightedUniverse(items);
    // sectorOrder：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const sectorOrder = TAIEX_SECTOR_WEIGHTS.map((row) => row.name);
    // sectorWeightMap：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const sectorWeightMap = new Map(TAIEX_SECTOR_WEIGHTS.map((row) => [row.name, Number(row.weightPct) || 0]));
    // grouped：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const grouped = new Map(sectorOrder.map((name) => [name, []]));

    weighted.forEach((stock) => {
      const raw = String(stock.taiexSector || '');
      const sectorName = grouped.has(raw) ? raw : GROUP_LABELS.other;
      grouped.get(sectorName).push(stock);
    });

    return sectorOrder
      .map((sectorName) => {
        const members = (grouped.get(sectorName) || []).sort(
          (a, b) => (Number(b.taiexWeightPct) || 0) - (Number(a.taiexWeightPct) || 0)
        );
        const sectorWeight = Number(sectorWeightMap.get(sectorName) || 0);
        if (sectorWeight <= 0) return null;
        const metrics = this._computeSectorMetrics(members);
        return {
          name: sectorName,
          stocks: [
            {
              code: `SECTOR-${sectorName}`,
              name: sectorName,
              sector: sectorName,
              subSector: '類股',
              taiexSector: sectorName,
              taiexWeightPct: sectorWeight,
              value: sectorWeight,
              marketCap: sectorWeight,
              changePct: metrics.changePct,
              change5d: metrics.change5d,
              volRatio: metrics.volRatio,
              syntheticConstituentOnly: true,
              isSectorAggregate: true
            }
          ]
        };
      })
      .filter(Boolean);
  }

  // _buildWeightedGroups：方法用途註解，處理此元件或類別的一段行為。
  _buildWeightedGroups(items, options = {}) {
    const {
      primarySectors = TAIEX_PRIMARY_SECTORS,
      sectorOrder = TAIEX_WEIGHTED_SECTOR_ORDER,
      otherSectorWeight = TAIEX_OTHER_SECTOR_WEIGHT,
      subSectorLabel = GROUP_LABELS.weighted,
      stockThreshold = TAIEX_STOCK_THRESHOLD
    } = options;

    const weighted = this._weightedUniverse(items);
    if (!weighted.length) return [];

    // 加權/加權2 會先建立「產業 -> 成分股」對照。
    // 低於門檻的成分股合併成 REST，讓版面保持可讀又維持產業總權重。
    // sectorWeightMap：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const sectorWeightMap = new Map(TAIEX_SECTOR_WEIGHTS.map((row) => [row.name, Number(row.weightPct) || 0]));
    sectorWeightMap.set(GROUP_LABELS.other, Number(otherSectorWeight) || 0);

    // grouped：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const grouped = new Map(sectorOrder.map((name) => [name, []]));
    weighted.forEach((stock) => {
      const sector = this._normalizeWeightedSector(stock, primarySectors);
      if (!grouped.has(sector)) grouped.set(sector, []);
      grouped.get(sector).push(stock);
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
            sector: sectorName,
            subSector: subSectorLabel,
            taiexSector: sectorName,
            taiexWeightPct: remainder,
            value: remainder,
            marketCap: remainder,
            syntheticConstituentOnly: true,
            isWeightedRemainder: true
          });
        }

        return { name: sectorName, stocks };
      })
      .filter((group) => group.stocks.length);
  }

  // _buildYahooSectorGroups：方法用途註解，處理此元件或類別的一段行為。
  _buildYahooSectorGroups(items) {
    const weighted = items
      .filter((stock) => Number(stock.taiexWeightPct) > 0)
      .sort((a, b) => (Number(b.taiexWeightPct) || 0) - (Number(a.taiexWeightPct) || 0));
    if (!weighted.length) return [];

    const grouped = new Map();
    weighted.forEach((stock) => {
      const sectorName = this._resolveYahooSector(stock);
      if (!grouped.has(sectorName)) grouped.set(sectorName, []);
      grouped.get(sectorName).push(stock);
    });

    return YAHOO_SECTOR_ORDER
      .filter((name) => grouped.has(name))
      .map((name) => ({
        name,
        stocks: grouped.get(name).sort((a, b) => (Number(b.taiexWeightPct) || 0) - (Number(a.taiexWeightPct) || 0))
      }));
  }

  // _groupStocks：方法用途註解，處理此元件或類別的一段行為。
  _groupStocks() {
    // 所有控制列的「分組」最後都會在這裡轉成 layoutWithGroups 可吃的資料格式。
    // 後續 Canvas 不需要知道資料原本來自台灣50、中型100或加權權重表。
    const allowSynthetic =
      this.groupMode === 'sector' ||
      this.groupMode === 'weighted' ||
      this.groupMode === 'weighted2' ||
      this.groupMode === 'tw50' ||
      this.groupMode === 'mid100';
    // scoped：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const scoped = this.stocks.filter((stock) => allowSynthetic || !stock.syntheticConstituentOnly);
    // withSize：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const withSize = scoped.map((stock) => ({
      ...stock,
      value: this._resolveSizeValue(stock)
    }));

    if (this.groupMode === 'sector') return this._buildSectorOnlyGroups(withSize);
    if (this.groupMode === 'weighted') return this._buildWeightedGroups(withSize);
    if (this.groupMode === 'weighted2') {
      return this._buildWeightedGroups(withSize, {
        primarySectors: TAIEX2_PRIMARY_SECTORS,
        sectorOrder: TAIEX2_WEIGHTED_SECTOR_ORDER,
        otherSectorWeight: TAIEX2_OTHER_SECTOR_WEIGHT,
        subSectorLabel: GROUP_LABELS.weighted2,
        stockThreshold: TAIEX2_STOCK_THRESHOLD
      });
    }

    if (this.groupMode === 'tw50') {
      // tw50：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
      const tw50 = withSize.filter((stock) => Number(stock.tw50WeightPct) > 0);
      if (!tw50.length) return [];
      // grouped：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
      const grouped = new Map(TW50_MAJOR_GROUP_ORDER.map((name) => [name, []]));
      tw50.forEach((stock) => {
        const major = this._resolveTw50Major(stock);
        if (!grouped.has(major)) grouped.set(major, []);
        grouped.get(major).push(stock);
      });

      return TW50_MAJOR_GROUP_ORDER
        .map((name) => ({
          name,
          stocks: (grouped.get(name) || []).sort(
            (a, b) => (Number(b.tw50WeightPct) || 0) - (Number(a.tw50WeightPct) || 0)
          )
        }))
        .filter((group) => group.stocks.length);
    }

    if (this.groupMode === 'mid100') {
      const mid100 = this._mid100Universe(withSize);
      if (!mid100.length) return [];
      // grouped：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
      const grouped = new Map(MID100_MAJOR_GROUP_ORDER.map((name) => [name, []]));
      mid100.forEach((stock) => {
        const major = this._resolveMid100Major(stock);
        if (!grouped.has(major)) grouped.set(major, []);
        grouped.get(major).push(stock);
      });

      return MID100_MAJOR_GROUP_ORDER
        .map((name) => ({
          name,
          stocks: (grouped.get(name) || []).sort(
            (a, b) => (Number(b.mid100WeightPct) || 0) - (Number(a.mid100WeightPct) || 0)
          )
        }))
        .filter((group) => group.stocks.length);
    }

    return [];
  }

  // _computeLayout：方法用途註解，處理此元件或類別的一段行為。
  _computeLayout() {
    // 版面計算只在尺寸、群組、大小指標或縮放 sector 改變時重跑；
    // 顏色切換只需要 render，不需要重新 squarify。
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    if (!W || !H || !this.stocks.length) {
      this.layout = [];
      return;
    }

    const grouped = this._groupStocks();
    // filtered：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const filtered = this.zoomedSector ? grouped.filter((sector) => sector.name === this.zoomedSector) : grouped;
    this.layout = layoutWithGroups(filtered, W, H, 2, 1);
  }

  // render：方法用途註解，處理此元件或類別的一段行為。
  render() {
    // 每次重繪都根據 devicePixelRatio 重設 backing store，
    // 確保高 DPI 螢幕上的文字與邊線不會模糊。
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.offsetWidth;
    const H = this.canvas.offsetHeight;
    if (!W || !H) return;

    this.canvas.width = Math.floor(W * dpr);
    this.canvas.height = Math.floor(H * dpr);
    // 段落說明：取得 Canvas 2D context 進行繪圖。
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 段落說明：清除上一輪 Canvas 繪圖內容。
    ctx.clearRect(0, 0, W, H);

    if (!this.layout.length) return;
    this.layout.forEach((sector) => {
      this._drawSectorHeader(ctx, sector);
      sector.stocks.forEach((stock) => this._drawStockTile(ctx, stock));
    });

    if (this.hoveredStock) this._drawHoverHighlight(ctx, this.hoveredStock);
    this._drawColorLegend(ctx, W, H);
  }

  // _drawSectorHeader：方法用途註解，處理此元件或類別的一段行為。
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

    // 段落說明：保存 Canvas 狀態，避免局部樣式影響後續繪圖。
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, headerH - 2));
    ctx.clip();
    ctx.font = `700 ${nameFontSize}px "Noto Sans TC"`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5c842';
    ctx.fillText(sector.sectorName, x + 2, y + headerH / 2);
    // 段落說明：還原 Canvas 狀態。
    ctx.restore();

    const avg = computeSectorAvg(sector.stocks);
    const avgStr = `${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`;
    ctx.font = `700 ${this._clamp(nameFontSize - 1, 7, 9)}px "JetBrains Mono"`;
    ctx.textAlign = 'right';
    ctx.fillStyle = avg >= 0 ? '#f03a5f' : '#1fd67a';
    if (w >= 64) ctx.fillText(avgStr, x + w - 4, y + headerH / 2);
  }

  // _drawStockTile：方法用途註解，處理此元件或類別的一段行為。
  _drawStockTile(ctx, stock) {
    // 一個 tile 會同時負責背景熱度、邊框、搜尋高亮與文字裁切；
    // 文字大小跟 tile 面積連動，避免小格子硬塞文字造成重疊。
    const { x, y, w, h } = stock.rect;
    if (w < 2 || h < 2) return;

    const metricValue = this._resolveColorMetric(stock);
    ctx.fillStyle = this._getHeatColor(metricValue);
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#080a0d';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    if (stock.isSectorAggregate) {
      // 類股模式的 stock 其實是合成的 sector tile，只顯示類股名稱與平均漲跌。
      if (w > 34 && h > 22) {
        // 段落說明：保存 Canvas 狀態，避免局部樣式影響後續繪圖。
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
        ctx.clip();

        const minSide = Math.min(w, h);
        const nameFont = this._clamp(Math.floor(minSide * 0.16), 9, 24);
        const pctFont = this._clamp(nameFont - 3, 8, 16);
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const pctText = this._formatChangePct(stock);

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

        // 段落說明：還原 Canvas 狀態。
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

    // 段落說明：保存 Canvas 狀態，避免局部樣式影響後續繪圖。
    ctx.save();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = x + w / 2;
    const minSide = Math.min(w, h);
    const pctText = this._formatChangePct(stock);

    if (this._isNameFirstLabelMode() && !stock.isWeightedRemainder && w >= 54 && h >= 34) {
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

      // 段落說明：還原 Canvas 狀態。
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

    // 段落說明：還原 Canvas 狀態。
    ctx.restore();
  }

  // _isNameFirstLabelMode：方法用途註解，處理此元件或類別的一段行為。
  _isNameFirstLabelMode() {
    return (
      this.groupMode === 'sector' ||
      this.groupMode === 'weighted' ||
      this.groupMode === 'weighted2' ||
      this.groupMode === 'tw50' ||
      this.groupMode === 'mid100'
    );
  }

  // _formatChangePct：方法用途註解，處理此元件或類別的一段行為。
  _formatChangePct(stock) {
    const pct = Number(stock.changePct) || 0;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  }

  // _fitCenterText：方法用途註解，處理此元件或類別的一段行為。
  _fitCenterText(ctx, text, x, y, maxWidth) {
    const value = String(text || '').trim();
    if (!value || maxWidth <= 0) return;
    if (ctx.measureText(value).width <= maxWidth) return ctx.fillText(value, x, y);
    let clipped = value;
    while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) clipped = clipped.slice(0, -1);
    ctx.fillText(clipped.length < value.length ? `${clipped}...` : clipped, x, y);
  }

  // _clamp：方法用途註解，處理此元件或類別的一段行為。
  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // _drawHoverHighlight：方法用途註解，處理此元件或類別的一段行為。
  _drawHoverHighlight(ctx, stock) {
    const { x, y, w, h } = stock.rect;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  // _drawColorLegend：方法用途註解，處理此元件或類別的一段行為。
  _drawColorLegend(ctx, W, H) {
    // 色帶固定在右下角，對應台股慣例：紅漲、綠跌。
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

  // _resolveColorMetric：方法用途註解，處理此元件或類別的一段行為。
  _resolveColorMetric(stock) {
    if (this.colorMetric === 'volRatio') {
      const ratio = Number(stock.volRatio) || 1;
      return (ratio - 1) * 2;
    }
    return Number(stock[this.colorMetric]) || 0;
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

  // _isSearchHit：方法用途註解，處理此元件或類別的一段行為。
  _isSearchHit(stock) {
    const code = String(stock.code || '').toUpperCase();
    const name = String(stock.name || '').toUpperCase();
    return code.includes(this.searchQuery) || name.includes(this.searchQuery);
  }

  // _handleMouseMove：方法用途註解，處理此元件或類別的一段行為。
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

  // _handleMouseLeave：方法用途註解，處理此元件或類別的一段行為。
  _handleMouseLeave() {
    this.hoveredStock = null;
    this.render();
    this._onHover(null, null);
  }

  // _handleClick：方法用途註解，處理此元件或類別的一段行為。
  _handleClick(e) {
    // 點到個股開 detail；點到 sector 空白處則切換 sector zoom。
    // 類股模式因 tile 是合成類股，不開個股 detail。
    const pos = this._getCanvasPos(e);
    const hitStock = this._hitStock(pos);
    if (hitStock) return this._onClick(hitStock);

    const hitSector = this._hitSector(pos);
    if (!hitSector) return;
    const nextSector = this.zoomedSector === hitSector.sectorName ? null : hitSector.sectorName;
    this.zoomSector(nextSector);
    this._onSectorClick(nextSector);
  }

  // _getCanvasPos：方法用途註解，處理此元件或類別的一段行為。
  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // _hitStock：方法用途註解，處理此元件或類別的一段行為。
  _hitStock({ x, y }) {
    if (this.groupMode === 'sector') return null;
    for (const sector of this.layout) {
      for (const stock of sector.stocks) {
        const r = stock.rect;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return stock;
      }
    }
    return null;
  }

  // _hitSector：方法用途註解，處理此元件或類別的一段行為。
  _hitSector({ x, y }) {
    for (const sector of this.layout) {
      const r = sector.sectorRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return sector;
    }
    return null;
  }

  // _onHover：方法用途註解，處理此元件或類別的一段行為。
  _onHover(stock, event) {}
  // _onClick：方法用途註解，處理此元件或類別的一段行為。
  _onClick(stock) {}
  // _onSectorClick：方法用途註解，處理此元件或類別的一段行為。
  _onSectorClick(sectorName) {}

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.canvas.removeEventListener('click', this._onClick);
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.canvas.remove();
  }
}
