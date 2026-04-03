import { store } from '../../data/store.js';
import { IndexCard } from '../../components/IndexCard.js';
import { WorldClockStrip } from '../../components/WorldClockStrip.js';
import { isMarketOpen, setUsDstMode } from '../../services/marketCalendar.js';
import { simulateGlobalIndices } from '../../services/priceSimulator.js';

let cleanup = () => {};

const ASIA_IDS = new Set(['kospi', 'nikkei', 'hsi', 'shanghai']);
const US_IDS = new Set(['nasdaq', 'sox', 'dow', 'sp500', 'vix', 'gold', 'us10y', 'wti']);
const FX_IDS = new Set(['eurusd', 'usdjpy', 'gbpusd', 'audusd', 'usdtwd']);
const CRYPTO_IDS = new Set(['btcusd', 'ethusd', 'solusd', 'xrpusd']);

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 7｜全球指數看板</h2></div>
    <div class="p7-grid">
      <div class="panel"><div class="panel__body" style="display:flex;justify-content:space-between;align-items:center"><div id="p7-clock"></div><div><label>美股夏令時間模式 </label><select id="p7-dst"><option value="auto">自動</option><option value="on">固定夏令</option><option value="off">固定冬令</option></select></div></div></div>
      <section><h3 class="p7-section-title">亞洲股市</h3><div class="p7-cards" id="p7-cards-asia"></div></section>
      <section><h3 class="p7-section-title">美股 / 美系資產</h3><div class="p7-cards" id="p7-cards-us"></div></section>
      <section><h3 class="p7-section-title">外匯</h3><div class="p7-cards" id="p7-cards-fx"></div></section>
      <section><h3 class="p7-section-title">加密貨幣</h3><div class="p7-cards" id="p7-cards-crypto"></div></section>
    </div>
  `;

  simulateGlobalIndices();
  setUsDstMode('auto');

  const strip = new WorldClockStrip(container.querySelector('#p7-clock'), {
    isOpen: (id) => isMarketOpen(id, new Date())
  });

  let cards = [];
  const asiaWrap = container.querySelector('#p7-cards-asia');
  const usWrap = container.querySelector('#p7-cards-us');
  const fxWrap = container.querySelector('#p7-cards-fx');
  const cryptoWrap = container.querySelector('#p7-cards-crypto');

  const renderSection = (rows, wrap) => rows.forEach((row) => cards.push(new IndexCard(wrap, { data: row })));

  const render = (rows) => {
    cards.forEach((c) => c.destroy());
    cards = [];
    asiaWrap.innerHTML = '';
    usWrap.innerHTML = '';
    fxWrap.innerHTML = '';
    cryptoWrap.innerHTML = '';

    renderSection(rows.filter((r) => ASIA_IDS.has(r.id)), asiaWrap);
    renderSection(rows.filter((r) => US_IDS.has(r.id)), usWrap);
    renderSection(rows.filter((r) => FX_IDS.has(r.id)), fxWrap);
    renderSection(rows.filter((r) => CRYPTO_IDS.has(r.id)), cryptoWrap);
  };

  container.querySelector('#p7-dst').addEventListener('change', (e) => {
    setUsDstMode(e.target.value);
    render(store.get('globalIndices'));
  });

  render(store.get('globalIndices'));
  const unsub = store.subscribe('globalIndices', render);

  cleanup = () => {
    unsub();
    cards.forEach((c) => c.destroy());
    strip.destroy();
  };

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}
