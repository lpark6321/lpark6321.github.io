import { store } from '../../data/store.js';
import { TW_STOCK_UNIVERSE } from '../../data/twStocks.js';
import { TreemapCanvas } from '../../components/TreemapCanvas.js';
import { TreemapControls } from '../../components/TreemapControls.js';
import { TreemapTooltip } from '../../components/TreemapTooltip.js';
import { TreemapDetail } from '../../components/TreemapDetail.js';
import { SunburstChart } from '../../components/SunburstChart.js';
import { simulateMarketMap, stopMarketMapSimulator } from '../../services/priceSimulator.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';

let cleanup = () => {};

function mergeData() {
  const marketRows = store.get('marketMap') || [];
  const map = new Map(marketRows.map((row) => [String(row.code), row]));

  return TW_STOCK_UNIVERSE.map((stock) => {
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
    sizeMetric: 'marketCap'
  };

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

  const createChart = (type) => {
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

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}
