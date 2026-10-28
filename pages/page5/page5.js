// Page5 掛載邏輯：呈現頁面內容並依 store 資料變化更新 UI。
import { store } from '../../data/store.js';
import { applyFilters } from '../../services/filterEngine.js';
import { FilterPanel } from '../../components/FilterPanel.js';
import { ResultTable } from '../../components/ResultTable.js';
import { WatchlistAddBar } from '../../components/WatchlistAddBar.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';

// cleanup：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
let cleanup = () => {};

// mount：函式用途註解，說明此處封裝一段可重用的流程。
export function mount(container) {
  // 段落說明：建立此區塊的 DOM 結構。
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 5｜策略選股</h2></div>
    <div class="p5-grid" id="p5-grid">
      <aside id="p5-filters"></aside>
      <div class="grid-splitter-v p5-main-splitter" id="p5-main-split"></div>
      <section class="p5-right">
        <div id="p5-results"></div>
        <div id="p5-addbar"></div>
      </section>
    </div>
  `;

  const gridEl = container.querySelector('#p5-grid');
  // readVar：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const readVar = (name, fallback) => {
    const value = parseFloat(getComputedStyle(gridEl).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const stopMainSplit = bindHorizontalSplitter(container.querySelector('#p5-main-split'), {
    getValue: () => readVar('--p5-left-w', 320),
    setValue: (px) => gridEl.style.setProperty('--p5-left-w', `${px}px`),
    min: 260,
    max: 620
  });

  let filtered = store.get('screenResults');

  const results = new ResultTable(container.querySelector('#p5-results'), {
    onSelectionChange: (codes) => addBar.updateCount(codes.length)
  });
  const addBar = new WatchlistAddBar(container.querySelector('#p5-addbar'), {
    getCodes: () => results.getSelectedCodes()
  });

  const filter = new FilterPanel(container.querySelector('#p5-filters'), {
    onRun: ({ mode, enabled, settings }) => {
      filtered = applyFilters(store.get('screenResults'), enabled, settings)
        .filter((s) => s.vol >= settings.volMin);
      results.update(filtered);
      if (mode === 'watch') {
        const list = store.get('watchlist');
        const merged = [...list];
        filtered.slice(0, 30).forEach((x) => {
          if (!merged.some((m) => m.code === x.code)) merged.push({ code: x.code, name: x.name, group: '自選1' });
        });
        store.set('watchlist', merged);
        // 段落說明：讀寫 localStorage，保留使用者設定。
        localStorage.setItem('tw_watchlist', JSON.stringify(merged));
      }
    }
  });

  results.update(filtered);

  // unsub：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsub = store.subscribe('screenResults', (rows) => {
    filtered = rows;
    results.update(filtered);
  });

  cleanup = () => {
    unsub();
    stopMainSplit();
    filter.destroy();
    results.destroy();
    addBar.destroy();
  };

  // 段落說明：回傳目前頁面的清理函式。
  return cleanup;
}

// unmount：函式用途註解，說明此處封裝一段可重用的流程。
export function unmount() {
  cleanup();
  cleanup = () => {};
}
