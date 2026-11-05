// Page7 全球指數看板：開頁時把卡片建好（大小固定），之後只依 store 的 globalIndices（由 marketFeed 寫入）改數字與顏色。
import { store } from '../../data/store.js';
import { IndexCard } from '../../components/IndexCard.js';
import { WorldClockStrip } from '../../components/WorldClockStrip.js';
import { subscribeSecond } from '../../services/feedClock.js';
import { isMarketOpen, setUsDstMode } from '../../services/marketCalendar.js';

const SECTIONS = [
  { id: 'asia', title: '亞洲股市', ids: ['kospi', 'nikkei', 'hsi', 'shanghai'] },
  { id: 'us', title: '美股 / 美系資產', ids: ['nasdaq', 'sox', 'dow', 'sp500', 'vix', 'gold', 'us10y', 'wti'] },
  { id: 'fx', title: '外匯', ids: ['eurusd', 'usdjpy', 'gbpusd', 'audusd', 'usdtwd'] },
  { id: 'crypto', title: '加密貨幣', ids: ['btcusd', 'ethusd', 'solusd', 'xrpusd'] }
];

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 7｜全球指數看板</h2></div>
    <div class="p7-grid">
      <div class="panel"><div class="panel__body p7-clockbar"><div id="p7-clock"></div><div><label>美股夏令時間模式 </label><select id="p7-dst"><option value="auto">自動</option><option value="on">固定夏令</option><option value="off">固定冬令</option></select></div></div></div>
      ${SECTIONS.map((section) => `<section><h3 class="p7-section-title">${section.title}</h3><div class="p7-cards" id="p7-cards-${section.id}"></div></section>`).join('')}
    </div>
  `;

  setUsDstMode('auto');

  const strip = new WorldClockStrip(container.querySelector('#p7-clock'), {
    isOpen: (id) => isMarketOpen(id)
  });

  // 卡片只建這一次，順序依 SECTIONS。
  const rowsById = new Map(store.get('globalIndices').map((row) => [row.id, row]));
  const cards = new Map();
  SECTIONS.forEach((section) => {
    const wrap = container.querySelector(`#p7-cards-${section.id}`);
    section.ids.filter((id) => rowsById.has(id)).forEach((id) => cards.set(id, new IndexCard(wrap, { data: rowsById.get(id) })));
  });

  const update = (rows) => rows.forEach((row) => cards.get(row.id)?.update(row));
  const tickAll = (now = new Date()) => {
    strip.tick(now);
    cards.forEach((card) => card.tick(now));
  };

  // 跟著全站的每秒時鐘更新時鐘、倒數與開收盤標籤；切換夏令模式也只需要重算這些。
  const stopClock = subscribeSecond(tickAll);
  container.querySelector('#p7-dst').addEventListener('change', (e) => {
    setUsDstMode(e.target.value);
    tickAll();
  });

  const unsub = store.subscribe('globalIndices', update);

  // 回傳清理函式，由 app.js 的路由在切頁時呼叫。
  return () => {
    unsub();
    stopClock();
    cards.forEach((card) => card.destroy());
    strip.destroy();
  };
}
