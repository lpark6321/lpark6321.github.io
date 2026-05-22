// Page7 掛載邏輯：呈現指定頁面的交易/行情內容並訂閱 store 更新。
import { store } from '../../data/store.js';
import { IndexCard } from '../../components/IndexCard.js';
import { WorldClockStrip } from '../../components/WorldClockStrip.js';
import { isMarketOpen, setUsDstMode } from '../../services/marketCalendar.js';
import { simulateGlobalIndices } from '../../services/priceSimulator.js';

// cleanup：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
let cleanup = () => {};

const ASIA_IDS = new Set(['kospi', 'nikkei', 'hsi', 'shanghai']);
const US_IDS = new Set(['nasdaq', 'sox', 'dow', 'sp500', 'vix', 'gold', 'us10y', 'wti']);
const FX_IDS = new Set(['eurusd', 'usdjpy', 'gbpusd', 'audusd', 'usdtwd']);
const CRYPTO_IDS = new Set(['btcusd', 'ethusd', 'solusd', 'xrpusd']);

// mount：函式用途註解，說明此處封裝一段可重用的流程。
export function mount(container) {
  // 段落說明：建立此區塊的 DOM 結構。
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

  // renderSection：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const renderSection = (rows, wrap) => rows.forEach((row) => cards.push(new IndexCard(wrap, { data: row })));

  // render：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const render = (rows) => {
    cards.forEach((c) => c.destroy());
    cards = [];
    // 段落說明：更新 DOM 內容。
    asiaWrap.innerHTML = '';
    // 段落說明：更新 DOM 內容。
    usWrap.innerHTML = '';
    // 段落說明：更新 DOM 內容。
    fxWrap.innerHTML = '';
    // 段落說明：更新 DOM 內容。
    cryptoWrap.innerHTML = '';

    renderSection(rows.filter((r) => ASIA_IDS.has(r.id)), asiaWrap);
    renderSection(rows.filter((r) => US_IDS.has(r.id)), usWrap);
    renderSection(rows.filter((r) => FX_IDS.has(r.id)), fxWrap);
    renderSection(rows.filter((r) => CRYPTO_IDS.has(r.id)), cryptoWrap);
  };

  // 段落說明：綁定使用者互動事件。
  container.querySelector('#p7-dst').addEventListener('change', (e) => {
    setUsDstMode(e.target.value);
    render(store.get('globalIndices'));
  });

  render(store.get('globalIndices'));
  // 段落說明：訂閱 store 資料變化，資料更新時同步刷新畫面。
  const unsub = store.subscribe('globalIndices', render);

  cleanup = () => {
    unsub();
    cards.forEach((c) => c.destroy());
    strip.destroy();
  };

  // 段落說明：回傳目前頁面的清理函式。
  return cleanup;
}

// unmount：函式用途註解，說明此處封裝一段可重用的流程。
export function unmount() {
  cleanup();
  cleanup = () => {};
}
