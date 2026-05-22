// Page6 台股市場地圖：掛載方塊圖/旭日圖控制列、提示框與明細面板。
import { store } from '../../data/store.js';
import { TW_STOCK_UNIVERSE } from '../../data/twStocks.js';
import { TW50_BY_CODE } from '../../data/tw50Constituents.js';
import { MID100_BY_CODE } from '../../data/twMid100Constituents.js';
import { TAIEX_BY_CODE } from '../../data/taiexWeightedConstituents.js';
import { TreemapCanvas } from '../../components/TreemapCanvas.js';
import { TreemapControls } from '../../components/TreemapControls.js';
import { TreemapTooltip } from '../../components/TreemapTooltip.js';
import { TreemapDetail } from '../../components/TreemapDetail.js';
import { SunburstChart } from '../../components/SunburstChart.js';
import { simulateMarketMap, stopMarketMapSimulator } from '../../services/priceSimulator.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';

// cleanup：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
let cleanup = () => {};

// buildPage6Universe：函式用途註解，說明此處封裝一段可重用的流程。
function buildPage6Universe() {
  // map：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const map = new Map(TW_STOCK_UNIVERSE.map((stock) => [stock.code, { ...stock }]));

  Object.values(TW50_BY_CODE).forEach((item) => {
    const existing = map.get(item.code);
    if (existing) {
      map.set(item.code, {
        ...existing,
        name: item.name || existing.name,
        isIn0050: true,
        tw50WeightPct: item.weightPct,
        tw50Major: item.majorGroup,
        tw50Rank: item.rank,
        syntheticConstituentOnly: false
      });
      return;
    }

    map.set(item.code, {
      code: item.code,
      name: item.name,
      sector: item.majorGroup,
      subSector: '台灣50',
      marketCap: Math.max(item.weightPct * 100, 1),
      isIn0050: true,
      tw50WeightPct: item.weightPct,
      tw50Major: item.majorGroup,
      tw50Rank: item.rank,
      syntheticConstituentOnly: true
    });
  });

  Object.values(MID100_BY_CODE).forEach((item) => {
    const existing = map.get(item.code);
    if (existing) {
      map.set(item.code, {
        ...existing,
        name: item.name || existing.name,
        isInMid100: true,
        mid100WeightPct: item.weightPct,
        mid100Major: item.majorGroup,
        mid100Rank: item.rank,
        syntheticConstituentOnly: existing.syntheticConstituentOnly || false
      });
      return;
    }

    map.set(item.code, {
      code: item.code,
      name: item.name,
      sector: '中型100',
      subSector: '中型100',
      marketCap: Math.max(item.weightPct * 100, 1),
      isInMid100: true,
      mid100WeightPct: item.weightPct,
      mid100Major: item.majorGroup,
      mid100Rank: item.rank,
      syntheticConstituentOnly: true
    });
  });

  Object.values(TAIEX_BY_CODE).forEach((item) => {
    const existing = map.get(item.code);
    if (existing) {
      map.set(item.code, {
        ...existing,
        name: item.name || existing.name,
        yahooSector: item.yahooSector || existing.yahooSector,
        taiexWeightPct: item.weightPct,
        taiexSector: item.sector,
        taiexRank: item.rank,
        syntheticConstituentOnly: existing.syntheticConstituentOnly || false
      });
      return;
    }

    map.set(item.code, {
      code: item.code,
      name: item.name,
      sector: item.sector,
      yahooSector: item.yahooSector || null,
      subSector: '加權',
      marketCap: Math.max(item.weightPct * 100, 1),
      taiexWeightPct: item.weightPct,
      taiexSector: item.sector,
      taiexRank: item.rank,
      syntheticConstituentOnly: true
    });
  });

  return [...map.values()];
}

const PAGE6_UNIVERSE = buildPage6Universe();

// mergeData：函式用途註解，說明此處封裝一段可重用的流程。
function mergeData() {
  // 靜態 universe 負責名稱、分類與權重；store.marketMap 只覆蓋即時價格、漲跌與量。
  // 這樣 Page6 的版面比例不會因模擬報價缺資料而消失。
  const marketRows = store.get('marketMap') || [];
  // map：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const map = new Map(marketRows.map((row) => [String(row.code), row]));

  return PAGE6_UNIVERSE.map((stock) => {
    const live = map.get(stock.code) || {};
    const price = Number(live.price);
    const changePct = Number(live.changePct);
    const change5d = Number(live.change5d ?? live.fiveDayPct);
    const volume = Number(live.volume ?? live.turnover);
    const volRatio = Number(live.volRatio ?? live.volumeRatio);

    return {
      ...stock,
      price: Number.isFinite(price) ? price : null,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      change5d: Number.isFinite(change5d) ? change5d : 0,
      volume: Number.isFinite(volume) ? volume : null,
      volRatio: Number.isFinite(volRatio) ? volRatio : 1
    };
  });
}

// mount：函式用途註解，說明此處封裝一段可重用的流程。
export function mount(container) {
  // 段落說明：建立此區塊的 DOM 結構。
  container.innerHTML = `
    <div class="p6-layout" id="p6-layout">
      <div class="p6-controls" id="p6-ctrl"></div>
      <div class="p6-map" id="p6-map"></div>
      <div class="grid-splitter-v p6-splitter" id="p6-split"></div>
      <aside class="p6-detail" id="p6-detail" style="display:none"></aside>
    </div>
  `;

  const layoutEl = container.querySelector('#p6-layout');
  const mapEl = container.querySelector('#p6-map');
  const detailEl = container.querySelector('#p6-detail');

  // readVar：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const readVar = (name, fallback) => {
    const value = parseFloat(getComputedStyle(layoutEl).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };

  const stopDetailSplit = bindHorizontalSplitter(container.querySelector('#p6-split'), {
    getValue: () => readVar('--p6-detail-w', 280),
    setValue: (px) => layoutEl.style.setProperty('--p6-detail-w', `${px}px`),
    min: 220,
    max: 560,
    deltaSign: -1
  });

  const tooltip = new TreemapTooltip();
  const detail = new TreemapDetail(detailEl, {
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    onClose: () => layoutEl.classList.remove('detail-open')
  });

  let currentChart = null;
  const chartState = {
    groupMode: 'sector',
    colorMetric: 'changePct',
    sizeMetric: 'marketCap'
  };

  // TreemapCanvas 與 SunburstChart 都實作 _onHover，所以 tooltip wiring 共用同一段。
  // bindHoverCallbacks：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const bindHoverCallbacks = (chart) => {
    chart._onHover = (stock, event) => {
      if (stock && event) tooltip.show(stock, event);
      else tooltip.hide();
    };
  };

  // bindTreemapCallbacks：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const bindTreemapCallbacks = (treemap) => {
    bindHoverCallbacks(treemap);

    treemap._onClick = (stock) => {
      detail.show(stock);
      layoutEl.classList.add('detail-open');
    };

    treemap._onSectorClick = (sectorName) => {
      if (sectorName) return;
      detail.hide();
    };
  };

  // createChart：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const createChart = (type) => {
    // 切換方塊圖/旭日圖時先銷毀舊 Canvas，避免 ResizeObserver 和事件監聽殘留。
    if (currentChart && typeof currentChart.destroy === 'function') {
      currentChart.destroy();
    }

    // 段落說明：更新 DOM 內容。
    mapEl.innerHTML = '';
    detail.hide();
    tooltip.hide();
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    layoutEl.classList.remove('detail-open');

    if (type === 'sunburst') {
      currentChart = new SunburstChart(mapEl);
      bindHoverCallbacks(currentChart);
      return;
    }

    currentChart = new TreemapCanvas(mapEl);
    bindTreemapCallbacks(currentChart);
  };

  // applyChartState：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const applyChartState = () => {
    // 控制列狀態獨立保存，換圖形後可以重新套回目前分組、顏色與大小設定。
    currentChart?.setGroupMode?.(chartState.groupMode);
    currentChart?.setColorMetric?.(chartState.colorMetric);
    currentChart?.setSizeMetric?.(chartState.sizeMetric);
  };

  createChart('treemap');
  applyChartState();

  const controls = new TreemapControls(container.querySelector('#p6-ctrl'), {
    onGroupChange: (mode) => {
      chartState.groupMode = mode;
      currentChart?.setGroupMode?.(mode);
    },
    onColorChange: (metric) => {
      chartState.colorMetric = metric;
      currentChart?.setColorMetric?.(metric);
    },
    onSizeChange: (metric) => {
      chartState.sizeMetric = metric;
      currentChart?.setSizeMetric?.(metric);
    },
    onChartChange: (type) => {
      createChart(type);
      applyChartState();
      currentChart?.update?.(mergeData());
    }
  });

  currentChart.update?.(mergeData());
  simulateMarketMap();

  // unsub：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsub = store.subscribe('marketMap', () => {
    currentChart?.update?.(mergeData());
  });

  cleanup = () => {
    unsub();
    stopMarketMapSimulator();
    stopDetailSplit();
    controls.destroy();
    currentChart?.destroy?.();
    tooltip.destroy();
    detail.destroy();
  };

  // 段落說明：回傳目前頁面的清理函式。
  return cleanup;
}

// unmount：函式用途註解，說明此處封裝一段可重用的流程。
export function unmount() {
  cleanup();
  cleanup = () => {};
}
