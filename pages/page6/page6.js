// Page6 台股市場地圖：掛載方塊圖/旭日圖控制列、提示框與明細面板。只讀 store 的 marketMap（由 marketFeed 寫入）。
import { store } from '../../data/store.js';
import { MARKET_UNIVERSE } from '../../data/marketUniverse.js';
import { TreemapCanvas } from '../../components/TreemapCanvas.js';
import { TreemapControls } from '../../components/TreemapControls.js';
import { TreemapTooltip } from '../../components/TreemapTooltip.js';
import { TreemapDetail } from '../../components/TreemapDetail.js';
import { SunburstChart } from '../../components/SunburstChart.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';
import { sourceInfo, subscribeDashboardDataSource } from '../../services/dashboardDataSource.js';
import { liveMarketMapQuotes } from '../../services/quoteUtils.js';

// 成分股名單（data/marketUniverse.js）負責名稱、分類與權重，版面比例因此不受報價缺漏影響；
// marketMap 只覆蓋即時價格、漲跌、量與量比。沒有報價的股票這些欄位留空，圖上畫成「無資料」。
const QUOTE_FIELDS = ['price', 'change', 'changePct', 'open', 'high', 'low', 'prevClose', 'volume', 'volRatio'];

function mergeData() {
  const quotes = liveMarketMapQuotes();
  return MARKET_UNIVERSE.map((stock) => {
    const quote = quotes.get(stock.code);
    return quote ? { ...stock, ...Object.fromEntries(QUOTE_FIELDS.map((key) => [key, quote[key] ?? null])) } : stock;
  });
}

// mount：建立頁面並回傳清理函式（由 index_hide.html 的路由在離開頁面時呼叫）。
export function mount(container) {
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
    onClose: () => layoutEl.classList.remove('detail-open')
  });

  let currentChart = null;
  const chartState = {
    groupMode: 'sector',
    colorMetric: 'changePct',
    searchQuery: ''
  };

  // TreemapCanvas 與 SunburstChart 都實作 _onHover，所以 tooltip wiring 共用同一段。
  const bindHoverCallbacks = (chart) => {
    chart._onHover = (stock, event) => {
      if (stock && event) tooltip.show(stock, event);
      else tooltip.hide();
    };
  };

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

  const applySearch = () => currentChart?.setSearchQuery?.(chartState.searchQuery);

  const createChart = (type) => {
    // 切換方塊圖/旭日圖時先銷毀舊 Canvas，避免 ResizeObserver 和事件監聽殘留。
    if (currentChart && typeof currentChart.destroy === 'function') {
      currentChart.destroy();
    }

    mapEl.innerHTML = '';
    detail.hide();
    tooltip.hide();
    layoutEl.classList.remove('detail-open');

    if (type === 'sunburst') {
      currentChart = new SunburstChart(mapEl);
      bindHoverCallbacks(currentChart);
      return;
    }

    currentChart = new TreemapCanvas(mapEl);
    bindTreemapCallbacks(currentChart);
  };

  const applyChartState = () => {
    // 控制列狀態獨立保存，換圖形後可以重新套回目前分組與顏色設定。
    currentChart?.setGroupMode?.(chartState.groupMode);
    currentChart?.setColorMetric?.(chartState.colorMetric);
    applySearch();
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
    onSearch: (query) => {
      chartState.searchQuery = query;
      applySearch();
    },
    onChartChange: (type) => {
      createChart(type);
      applyChartState();
      currentChart?.update?.(mergeData());
    }
  });

  currentChart.update?.(mergeData());

  // 市場地圖只有提供個股報價的來源（目前只有 Yahoo）才有；其他來源整張圖灰掉並說明。
  const renderSourceNote = () => {
    mapEl.classList.toggle('is-unsupported', !sourceInfo().stocks);
  };
  mapEl.dataset.note = '此資料來源沒有市場地圖';
  renderSourceNote();

  // 報價由 marketFeed 寫進 marketMap，這裡只訂閱。
  const unsubs = [
    store.subscribe('marketMap', () => currentChart?.update?.(mergeData())),
    subscribeDashboardDataSource(renderSourceNote)
  ];

  return () => {
    unsubs.forEach((unsub) => unsub());
    stopDetailSplit();
    controls.destroy();
    currentChart?.destroy?.();
    tooltip.destroy();
    detail.destroy();
  };
}
