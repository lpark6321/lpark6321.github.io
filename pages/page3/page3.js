import { store } from '../../data/store.js';
import { WatchlistSidebar } from '../../components/WatchlistSidebar.js';
import { AlertTable } from '../../components/AlertTable.js';
import { PatternTogglePanel } from '../../components/PatternTogglePanel.js';
import { MiniDetailChart } from '../../components/MiniDetailChart.js';

let cleanup = () => {};

function fakeIntraday(price) {
  return Array.from({ length: 60 }, (_, i) => +(price * (0.995 + i * 0.0002 + (Math.random() - 0.5) * 0.004)).toFixed(2));
}

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 3｜自選列表 + 型態提醒</h2></div>
    <div class="p3-grid9">
      <section class="p3-col-left">
        <div class="p3-cell p3-w" id="p3-left"></div>
        <div class="p3-cell p3-a" id="p3-alert"></div>
      </section>
      <section class="p3-cell p3-p" id="p3-toggle"></section>
      <section class="p3-cell p3-m" id="p3-detail"></section>
    </div>
  `;

  const side = new WatchlistSidebar(container.querySelector('#p3-left'));
  const table = new AlertTable(container.querySelector('#p3-alert'), { onSelect: (code) => store.set('selectedStock', code) });
  const toggles = new PatternTogglePanel(container.querySelector('#p3-toggle'), { onChange: (enabled) => store.set('enabledPatterns', enabled) });
  const detail = new MiniDetailChart(container.querySelector('#p3-detail'));

  side.root.classList.add('p3-resize-panel');
  table.root.classList.add('p3-resize-panel');
  detail.root.classList.add('p3-resize-panel');

  if (!store.get('enabledPatterns').length) store.set('enabledPatterns', toggles.getEnabled());

  const renderDetail = (code) => {
    const all = [...store.get('topStocks'), ...store.get('screenResults')];
    const hit = all.find((x) => x.code === code) || { code, price: 100 };
    const series = fakeIntraday(hit.price);
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

  const unsub1 = store.subscribe('watchlist', (d) => side.update(d));
  const unsub2 = store.subscribe('patternAlerts', (d) => table.update(d));
  const unsub3 = store.subscribe('selectedStock', renderDetail);

  cleanup = () => {
    unsub1(); unsub2(); unsub3();
    side.destroy(); table.destroy(); toggles.destroy(); detail.destroy();
  };

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}
