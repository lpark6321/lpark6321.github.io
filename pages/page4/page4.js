// Page4 選擇權策略：策略組合、到期損益圖（元）、選擇權鏈、Greeks。選擇權鏈目前是示範資料，真資料等期交所盤後資料接上。
import { store } from '../../data/store.js';
import { StrategyBuilder } from '../../components/StrategyBuilder.js';
import { PLChart } from '../../components/PLChart.js';
import { GreeksTable } from '../../components/GreeksTable.js';
import { ChainViewer } from '../../components/ChainViewer.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';

// mount：建立頁面並回傳清理函式（由 index_hide.html 的路由在離開頁面時呼叫）。
export function mount(container) {
  // 選擇權鏈目前是內建示範資料，標題列明白標示。
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 4｜選擇權策略圖表 <span class="badge badge--mid">示範資料</span></h2></div>
    <div class="p4-grid">
      <div id="p4-builder"></div>
      <div class="p4-main" id="p4-main">
        <div class="panel p4-resize" id="p4-pl-panel"><div class="panel__header"><span class="panel__badge">PL</span><h3 class="panel__title">到期損益圖</h3></div><div class="panel__body" id="p4-chart"></div></div>
        <div class="grid-splitter-v p4-main-splitter" id="p4-main-split"></div>
        <div id="p4-chain"></div>
      </div>
      <div id="p4-greeks"></div>
    </div>
  `;

  const mainEl = container.querySelector('#p4-main');
  const readVar = (name, fallback) => {
    const value = parseFloat(getComputedStyle(mainEl).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const stopMainSplit = bindHorizontalSplitter(container.querySelector('#p4-main-split'), {
    getValue: () => readVar('--p4-right-w', 340),
    setValue: (px) => mainEl.style.setProperty('--p4-right-w', `${px}px`),
    min: 260,
    max: 680,
    deltaSign: -1
  });

  const builder = new StrategyBuilder(container.querySelector('#p4-builder'), { defaultCollapsed: true });
  builder.root.classList.add('p4-resize');
  const chart = new PLChart(container.querySelector('#p4-chart'));
  // 點選擇權鏈的價格：點賣價＝買進一口、點買價＝賣出一口。
  const chain = new ChainViewer(container.querySelector('#p4-chain'), {
    onPick: ({ type, action, strike, premium }) => {
      store.set('strategyLegs', [...store.get('strategyLegs'), { type, action, strike, qty: 1, premium }]);
    }
  });
  chain.root.classList.add('p4-resize');

  const greeks = new GreeksTable(container.querySelector('#p4-greeks'));
  greeks.root.classList.add('p4-resize');

  const render = () => {
    const chainData = store.get('optionsChain');
    const legs = store.get('strategyLegs');
    chart.update(legs, chainData.spotPrice);
    chain.update(chainData);
    greeks.update(legs, chainData);
    builder.update();
  };

  render();
  const unsubLegs = store.subscribe('strategyLegs', render);

  return () => {
    unsubLegs();
    stopMainSplit();
    builder.destroy();
    chart.destroy();
    chain.destroy();
    greeks.destroy();
  };
}
