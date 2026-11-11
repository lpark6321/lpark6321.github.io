// Page4 選擇權策略：策略組合、到期損益圖（元）、選擇權鏈、Greeks。公開資料來源用期交所的成交價（盤中 MIS、盤後每日行情），其他來源是示範資料。
import { store } from '../../data/store.js';
import { StrategyBuilder } from '../../components/StrategyBuilder.js';
import { PLChart } from '../../components/PLChart.js';
import { GreeksTable } from '../../components/GreeksTable.js';
import { ChainViewer } from '../../components/ChainViewer.js';
import { bindCssVarSplitter } from '../../services/splitter.js';
import { esc } from '../../services/html.js';
import { loadSetting } from '../../data/storage.js';
import { chainPrice } from '../../services/optionStrategy.js';

const KIND_LABEL = { month: '月選', 'week-wed': '週三', 'week-fri': '週五' };

// 選擇權鏈的來源標籤：期交所即時、期交所盤後（附資料日期），或示範資料。
function originLabel(origin) {
  if (origin?.kind === 'mis') return '期交所即時（成交價）';
  if (origin?.kind === 'taifex-daily') return `期交所盤後 ${origin.date || ''}`;
  return '示範資料';
}

// 內建預設腳位（示範用）在拿到期交所真資料後換成「買進 1 口價平 Call」。
// store 每次 set 腳位都會存到瀏覽器，所以「沒存過」＝使用者沒動過；瀏覽器不給存時靠 defaultReplaced 只換一次。
let defaultReplaced = false;
function replaceDefaultLeg(chainData) {
  const real = ['mis', 'taifex-daily'].includes(chainData.origin?.kind);
  if (defaultReplaced || !real || loadSetting('strategyLegs') !== null || !chainData.calls?.length) return;
  const strike = chainData.calls.reduce((best, row) => (Math.abs(row.strike - chainData.spotPrice) < Math.abs(best - chainData.spotPrice) ? row.strike : best), chainData.calls[0].strike);
  const premium = chainPrice(chainData, 'call', strike, 'buy');
  if (premium === null) return;
  defaultReplaced = true;
  store.set('strategyLegs', [{ type: 'call', action: 'buy', strike, qty: 1, premium }]);
}

// mount：建立頁面並回傳清理函式（由 app.js 的路由在離開頁面時呼叫）。
export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar">
      <h2>PAGE 4｜選擇權策略圖表 <span class="badge badge--mid" id="p4-origin">示範資料</span></h2>
      <label class="p4-expiry">到期 <select id="p4-expiry" aria-label="到期序列"></select></label>
    </div>
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
  const stopMainSplit = bindCssVarSplitter(container.querySelector('#p4-main-split'), mainEl, '--p4-right-w', { fallback: 340, min: 260, max: 680, deltaSign: -1 });

  const builder = new StrategyBuilder(container.querySelector('#p4-builder'), { defaultCollapsed: true });
  builder.root.classList.add('p4-resize');
  const chart = new PLChart(container.querySelector('#p4-chart'));
  // 點選擇權鏈的價格：點擊＝買進一口、Shift＋點擊＝賣出一口。
  const chain = new ChainViewer(container.querySelector('#p4-chain'), {
    onPick: ({ type, action, strike, premium }) => {
      store.set('strategyLegs', [...store.get('strategyLegs'), { type, action, strike, qty: 1, premium }]);
    }
  });
  chain.root.classList.add('p4-resize');

  const greeks = new GreeksTable(container.querySelector('#p4-greeks'));
  greeks.root.classList.add('p4-resize');

  const originEl = container.querySelector('#p4-origin');
  const expiryEl = container.querySelector('#p4-expiry');
  expiryEl.addEventListener('change', () => store.set('optionsExpiry', expiryEl.value));

  // 到期序列選單：清單變了才重填，避免使用者正打開時被換掉。
  let expiryKey = '';
  const renderExpiries = (chainData) => {
    const expiries = chainData.expiries || [];
    const key = expiries.map((item) => item.contractMonth).join('|');
    if (key !== expiryKey) {
      expiryKey = key;
      expiryEl.innerHTML = expiries.length
        ? expiries.map((item) => `<option value="${esc(item.contractMonth)}">${esc(item.expiry)}（${KIND_LABEL[item.kind] || item.kind}）</option>`).join('')
        : `<option value="">${esc(chainData.expiry || '--')}</option>`;
    }
    expiryEl.disabled = !expiries.length;
    if (chainData.contractMonth) expiryEl.value = chainData.contractMonth;
    originEl.textContent = originLabel(chainData.origin);
  };

  const render = () => {
    const chainData = store.get('optionsChain');
    replaceDefaultLeg(chainData);
    renderExpiries(chainData);
    const legs = store.get('strategyLegs');
    chart.update(legs, chainData.spotPrice);
    chain.update(chainData);
    greeks.update(legs, chainData);
    builder.update();
  };

  render();
  const unsubs = ['strategyLegs', 'optionsChain'].map((key) => store.subscribe(key, render));

  return () => {
    unsubs.forEach((unsub) => unsub());
    stopMainSplit();
    builder.destroy();
    chart.destroy();
    chain.destroy();
    greeks.destroy();
  };
}
