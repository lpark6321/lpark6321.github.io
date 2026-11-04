// Page3 自選列表 + 型態提醒：自選股（含即時報價）、型態開關、提醒表、個股細節（當日 1 分 K 走勢 + 觸發點）。
// 只讀 store：報價、選取個股的 1 分 K 由 marketFeed 寫入，型態由 services/patternEngine.js 計算。
import { store, isValidStockCode } from '../../data/store.js';
import { WatchlistSidebar } from '../../components/WatchlistSidebar.js';
import { AlertTable } from '../../components/AlertTable.js';
import { PatternTogglePanel } from '../../components/PatternTogglePanel.js';
import { MiniDetailChart } from '../../components/MiniDetailChart.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';
import { isTwSpotSession } from '../../services/marketCalendar.js';
import { orDash, quoteByCode } from '../../services/quoteUtils.js';

// mount：建立頁面並回傳清理函式（由 index_hide.html 的路由在離開頁面時呼叫）。
export function mount(container) {
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

  // 新增自選股前先驗代碼：格式不符就攔下並提示（capture 階段先於元件自己的 click 處理）。
  const codeInput = side.root.querySelector('.code-input');
  const onAddClick = (event) => {
    if (!event.target.closest('.add-btn') || !codeInput) return;
    const code = codeInput.value.trim();
    if (!code || isValidStockCode(code)) return;
    event.stopPropagation();
    codeInput.setCustomValidity(`「${code}」不是有效代碼：需 4-6 碼英數字，例如 2330、00631L`);
    codeInput.reportValidity();
  };
  const clearValidity = () => codeInput?.setCustomValidity('');
  side.root.addEventListener('click', onAddClick, true);
  codeInput?.addEventListener('input', clearValidity);


  // 個股細節：開高低收量取自目前來源的報價；走勢是該股當日現貨盤的 1 分 K 收盤價，型態觸發點標成直線。
  const renderDetail = () => {
    const code = store.get('selectedStock');
    const q = quoteByCode(code) || {};
    const intraday = store.get('selectedIntraday');
    const candles = intraday?.code === code
      ? intraday.candles.filter((row) => typeof row.time === 'number' && isTwSpotSession(row.time * 1000))
      : [];
    const markers = store.get('patternAlerts')
      .filter((alert) => alert.code === code && candles.length)
      .map((alert) => ({ index: Math.max(0, candles.findLastIndex((row) => row.time * 1000 <= alert.triggeredAt)) }));
    detail.update({
      code,
      ohlc: { open: orDash(q.open), high: orDash(q.high), low: orDash(q.low), close: orDash(q.price), vol: orDash(q.volume) },
      series: candles.map((row) => row.close),
      markers
    });
  };

  side.update(store.get('watchlist'));
  table.update(store.get('patternAlerts'));
  renderDetail();

  // 報價更新時自選清單只改價格格子；個股細節跟著選取股票、1 分 K、報價與觸發重畫。
  const onQuotes = () => {
    side.updateQuotes();
    renderDetail();
  };
  const unsubs = [
    store.subscribe('watchlist', (d) => side.update(d)),
    store.subscribe('patternAlerts', (d) => {
      table.update(d);
      renderDetail();
    }),
    store.subscribe('selectedStock', renderDetail),
    store.subscribe('selectedIntraday', renderDetail),
    ...['marketMap', 'topStocks', 'watchQuotes'].map((key) => store.subscribe(key, onQuotes))
  ];

  return () => {
    unsubs.forEach((unsub) => unsub());
    side.root.removeEventListener('click', onAddClick, true);
    codeInput?.removeEventListener('input', clearValidity);
    stopMainSplit();
    side.destroy(); table.destroy(); toggles.destroy(); detail.destroy();
  };
}
