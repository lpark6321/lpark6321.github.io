import { store } from '../../data/store.js';
import { applyFilters } from '../../services/filterEngine.js';
import { FilterPanel } from '../../components/FilterPanel.js';
import { ResultTable } from '../../components/ResultTable.js';
import { WatchlistAddBar } from '../../components/WatchlistAddBar.js';

let cleanup = () => {};

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 5｜策略選股</h2></div>
    <div class="p5-grid">
      <aside id="p5-filters"></aside>
      <section class="p5-right">
        <div id="p5-results"></div>
        <div id="p5-addbar"></div>
      </section>
    </div>
  `;

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
        localStorage.setItem('tw_watchlist', JSON.stringify(merged));
      }
    }
  });

  results.update(filtered);

  const unsub = store.subscribe('screenResults', (rows) => {
    filtered = rows;
    results.update(filtered);
  });

  cleanup = () => {
    unsub();
    filter.destroy();
    results.destroy();
    addBar.destroy();
  };

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}
