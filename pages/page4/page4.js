import { store } from '../../data/store.js';
import { StrategyBuilder } from '../../components/StrategyBuilder.js';
import { PLChart } from '../../components/PLChart.js';
import { GreeksTable } from '../../components/GreeksTable.js';
import { ChainViewer } from '../../components/ChainViewer.js';

let cleanup = () => {};

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 4｜選擇權策略圖表</h2></div>
    <div class="p4-grid">
      <div id="p4-builder"></div>
      <div class="p4-main">
        <div class="panel p4-resize" id="p4-pl-panel"><div class="panel__header"><span class="panel__badge">PL</span><h3 class="panel__title">到期損益圖</h3></div><div class="panel__body" id="p4-chart"></div></div>
        <div id="p4-chain"></div>
      </div>
      <div id="p4-greeks"></div>
    </div>
  `;

  const builder = new StrategyBuilder(container.querySelector('#p4-builder'));
  const chart = new PLChart(container.querySelector('#p4-chart'));
  const chain = new ChainViewer(container.querySelector('#p4-chain'), {
    onStrike: (strike) => {
      const legs = store.get('strategyLegs');
      legs.push({ type: 'call', action: 'buy', strike, qty: 1, premium: 100 });
      store.set('strategyLegs', legs);
    }
  });
  chain.root.classList.add('p4-resize');

  const greeks = new GreeksTable(container.querySelector('#p4-greeks'));

  const render = () => {
    const chainData = store.get('optionsChain');
    const legs = store.get('strategyLegs');
    chart.update(legs, chainData.spotPrice);
    chain.update(chainData);
    greeks.update(legs, chainData);
    builder.updateSummary();
  };

  render();
  const unsub1 = store.subscribe('strategyLegs', render);
  const unsub2 = store.subscribe('optionsChain', render);

  cleanup = () => {
    unsub1();
    unsub2();
    builder.destroy();
    chart.destroy();
    chain.destroy();
    greeks.destroy();
  };

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}
