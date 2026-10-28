// Page3 掛載邏輯：呈現 watchlist、篩選結果與可收合面板。
import { store } from '../../data/store.js';
import { WatchlistSidebar } from '../../components/WatchlistSidebar.js';
import { AlertTable } from '../../components/AlertTable.js';
import { PatternTogglePanel } from '../../components/PatternTogglePanel.js';
import { MiniDetailChart } from '../../components/MiniDetailChart.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';

// cleanup：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
let cleanup = () => {};

// fakeIntraday：函式用途註解，說明此處封裝一段可重用的流程。
function fakeIntraday(price) {
  return Array.from({ length: 60 }, (_, i) => +(price * (0.995 + i * 0.0002 + (Math.random() - 0.5) * 0.004)).toFixed(2));
}

// mount：函式用途註解，說明此處封裝一段可重用的流程。
export function mount(container) {
  // 段落說明：建立此區塊的 DOM 結構。
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 3｜自選列表 + 型態提醒</h2></div>
    <div class="p3-grid9">
      <section class="p3-col-left">
        <div class="p3-cell p3-w" id="p3-left"></div>
        <div class="p3-cell p3-a" id="p3-alert"></div>
      </section>
      <div class="grid-splitter-v p3-main-splitter" id="p3-main-split"></div>
      <section class="p3-cell p3-p" id="p3-toggle"></section>
      <section class="p3-cell p3-m" id="p3-detail"></section>
    </div>
  `;

  const gridEl = container.querySelector('.p3-grid9');
  // readVar：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const readVar = (name, fallback) => {
    const value = parseFloat(getComputedStyle(gridEl).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const stopMainSplit = bindHorizontalSplitter(container.querySelector('#p3-main-split'), {
    getValue: () => readVar('--p3-left-w', 420),
    setValue: (px) => gridEl.style.setProperty('--p3-left-w', `${px}px`),
    min: 280,
    max: 700
  });

  const side = new WatchlistSidebar(container.querySelector('#p3-left'));
  // table：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const table = new AlertTable(container.querySelector('#p3-alert'), { onSelect: (code) => store.set('selectedStock', code) });
  const toggles = new PatternTogglePanel(container.querySelector('#p3-toggle'), {
    onChange: (enabled) => store.set('enabledPatterns', enabled),
    defaultCollapsed: true
  });
  const detail = new MiniDetailChart(container.querySelector('#p3-detail'));

  side.root.classList.add('p3-resize-panel');
  side.root.classList.add('p3-panel-w');
  table.root.classList.add('p3-resize-panel');
  table.root.classList.add('p3-panel-a');
  toggles.root.classList.add('p3-resize-panel');
  detail.root.classList.add('p3-resize-panel');

  if (!store.get('enabledPatterns').length) store.set('enabledPatterns', toggles.getEnabled());

  // renderDetail：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const renderDetail = (code) => {
    const all = [...store.get('topStocks'), ...store.get('screenResults')];
    // hit：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const hit = all.find((x) => x.code === code) || { code, price: 100 };
    const series = fakeIntraday(hit.price);
    // alerts：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const alerts = store.get('patternAlerts').filter((a) => a.code === code);
    detail.update({
      code,
      ohlc: { open: series[0], high: Math.max(...series), low: Math.min(...series), close: series.at(-1), vol: Math.round(Math.random() * 80000) },
      series,
      markers: alerts.map((_, i) => ({ index: Math.max(5, 10 + i * 12) }))
    });
  };

  side.update(store.get('watchlist'));
  table.update(store.get('patternAlerts'));
  renderDetail(store.get('selectedStock'));

  // unsub1：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsub1 = store.subscribe('watchlist', (d) => side.update(d));
  // unsub2：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsub2 = store.subscribe('patternAlerts', (d) => table.update(d));
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsub3 = store.subscribe('selectedStock', renderDetail);

  cleanup = () => {
    unsub1(); unsub2(); unsub3();
    stopMainSplit();
    side.destroy(); table.destroy(); toggles.destroy(); detail.destroy();
  };

  // 段落說明：回傳目前頁面的清理函式。
  return cleanup;
}

// unmount：函式用途註解，說明此處封裝一段可重用的流程。
export function unmount() {
  cleanup();
  cleanup = () => {};
}
