// 策略建立器元件（Page4）：新增腳位、一鍵套用預設策略、腳位清單（改口數／刪除／清空）、匯出匯入、損益摘要。
// 腳位存在 store.strategyLegs（store 會自動存到瀏覽器，見 data/storage.js）。權利金一律從選擇權鏈取價：買進用賣價、賣出用買價。
import { store, sanitizeLegs } from '../data/store.js';
import { DEFAULT_FUTURES_CONTRACT, FUTURES_CONTRACTS } from '../data/twDerivatives.js';
import { esc } from '../services/html.js';
import { createFilePicker, downloadJson, readJsonArrayFile } from '../services/jsonFile.js';
import { analyzeStrategy, chainPrice } from '../services/optionStrategy.js';
import { fmtNum } from '../services/quoteUtils.js';

const TYPE_LABEL = { call: 'Call', put: 'Put', future: '期貨' };
const ACTION_LABEL = { buy: '買進', sell: '賣出' };
// 時間價差要兩個不同到期日，等有多個到期日的選擇權資料再開放。
const NEEDS_MULTI_EXPIRY = new Set(['買進時間價差', '賣出時間價差']);

function nearestStrike(strikes, target) {
  return strikes.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), strikes[0]);
}

const money = (value) => `${fmtNum(value, 0)} 元`;

export class StrategyBuilder {
  constructor(container, options = {}) {
    this.collapsed = false;
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">S</span><h3 class="panel__title">策略組合</h3><button class="sb-toggle">收合</button></div>
      <div class="panel__body sb-body">
        <div class="inputs sb-inputs"></div>
        <div class="presets sb-presets"></div>
        <div class="sb-legs"></div>
        <div class="sb-actions">
          <button class="sb-clear">清空</button>
          <button class="sb-export">匯出策略</button>
          <button class="sb-import">匯入策略</button>
          <span class="sb-msg"></span>
        </div>
      </div>
      <div class="summary sb-summary"></div>
    `;
    container.appendChild(this.root);
    this.root.querySelector('.sb-toggle').addEventListener('click', () => this.toggle());
    this.openImport = createFilePicker((file) => this.importFile(file));
    this.root.querySelector('.sb-clear').addEventListener('click', () => store.set('strategyLegs', []));
    this.root.querySelector('.sb-export').addEventListener('click', () => downloadJson('strategy.json', store.get('strategyLegs')));
    this.root.querySelector('.sb-import').addEventListener('click', () => this.openImport());
    this.renderInputs();
    this.renderPresets();
    this.update();
    if (options.defaultCollapsed) this.toggle();
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this.root.querySelector('.sb-body').style.display = this.collapsed ? 'none' : '';
    this.root.classList.toggle('is-collapsed', this.collapsed);
    this.root.querySelector('.sb-toggle').textContent = this.collapsed ? '展開' : '收合';
  }

  strikes() {
    const chain = store.get('optionsChain');
    return [...new Set([...chain.calls, ...chain.puts].map((row) => row.strike))].sort((a, b) => a - b);
  }

  renderInputs() {
    const wrap = this.root.querySelector('.inputs');
    wrap.innerHTML = `
      <select class="type"><option value="call">Call</option><option value="put">Put</option><option value="future">期貨</option></select>
      <select class="action"><option value="buy">買進</option><option value="sell">賣出</option></select>
      <select class="strike">${this.strikes().map((s) => `<option>${s}</option>`).join('')}</select>
      <select class="contract" hidden>${FUTURES_CONTRACTS.map((c) => `<option value="${c.value}" ${c.value === DEFAULT_FUTURES_CONTRACT ? 'selected' : ''}>${c.label}（${c.pointValue}元/點）</option>`).join('')}</select>
      <input class="input qty" type="number" value="1" min="1" step="1" title="口數" />
      <input class="input premium" type="number" value="0" min="0" step="any" title="權利金（點）／期貨成交價" />
      <button class="add">新增腳位</button>
    `;
    const $ = (selector) => wrap.querySelector(selector);
    // 選了類型、買賣、履約價後，權利金自動帶入鏈上價格；期貨腳帶入現價當成交價，並顯示契約選單。
    const fillPrice = () => {
      const chain = store.get('optionsChain');
      const type = $('.type').value;
      $('.contract').hidden = type !== 'future';
      $('.premium').value = type === 'future' ? chain.spotPrice : chainPrice(chain, type, Number($('.strike').value), $('.action').value) ?? 0;
    };
    ['.type', '.action', '.strike'].forEach((selector) => $(selector).addEventListener('change', fillPrice));
    fillPrice();
    $('.add').addEventListener('click', () => {
      const type = $('.type').value;
      const price = Number($('.premium').value);
      const leg = type === 'future'
        ? { type, action: $('.action').value, strike: price, qty: Number($('.qty').value), premium: 0, contract: $('.contract').value }
        : { type, action: $('.action').value, strike: Number($('.strike').value), qty: Number($('.qty').value), premium: price };
      store.set('strategyLegs', [...store.get('strategyLegs'), leg]);
    });
  }

  getPresets() {
    const chain = store.get('optionsChain');
    const spot = chain.spotPrice;
    const strikes = this.strikes();
    const atm = nearestStrike(strikes, spot);
    const up1 = nearestStrike(strikes, atm + 100);
    const up2 = nearestStrike(strikes, atm + 200);
    const dn1 = nearestStrike(strikes, atm - 100);
    const dn2 = nearestStrike(strikes, atm - 200);
    const leg = (type, action, strike, qty = 1) => ({ type, action, strike, qty });
    const future = (action) => ({ type: 'future', action, strike: spot, qty: 1, contract: DEFAULT_FUTURES_CONTRACT });
    return {
      '買進買權': [leg('call', 'buy', atm)],
      '買進賣權': [leg('put', 'buy', atm)],
      '賣出買權': [leg('call', 'sell', up1)],
      '賣出賣權': [leg('put', 'sell', dn1)],
      '買權多頭價差': [leg('call', 'buy', atm), leg('call', 'sell', up1)],
      '買權空頭價差': [leg('call', 'sell', atm), leg('call', 'buy', up1)],
      '賣權多頭價差': [leg('put', 'sell', atm), leg('put', 'buy', dn1)],
      '賣權空頭價差': [leg('put', 'buy', atm), leg('put', 'sell', dn1)],
      '買進跨式': [leg('call', 'buy', atm), leg('put', 'buy', atm)],
      '買進勒式': [leg('call', 'buy', up1), leg('put', 'buy', dn1)],
      '賣出跨式': [leg('call', 'sell', atm), leg('put', 'sell', atm)],
      '賣出勒式': [leg('call', 'sell', up1), leg('put', 'sell', dn1)],
      '買進期貨賣出買權': [future('buy'), leg('call', 'sell', up1)],
      '賣出期貨賣出賣權': [future('sell'), leg('put', 'sell', dn1)],
      '買進時間價差': [],
      '賣出時間價差': [],
      '買進蝶式價差策略': [leg('call', 'buy', dn1), leg('call', 'sell', atm, 2), leg('call', 'buy', up1)],
      '賣出蝶式價差策略': [leg('call', 'sell', dn1), leg('call', 'buy', atm, 2), leg('call', 'sell', up1)],
      '買進兀鷹價差策略': [leg('call', 'buy', dn2), leg('call', 'sell', dn1), leg('call', 'sell', up1), leg('call', 'buy', up2)],
      '賣出兀鷹價差策略': [leg('call', 'sell', dn2), leg('call', 'buy', dn1), leg('call', 'buy', up1), leg('call', 'sell', up2)],
      '轉換': [future('buy'), leg('put', 'buy', atm), leg('call', 'sell', atm)]
    };
  }

  renderPresets() {
    const presets = this.getPresets();
    const box = this.root.querySelector('.presets');
    box.innerHTML = Object.keys(presets).map((name) => (NEEDS_MULTI_EXPIRY.has(name)
      ? `<button class="is-disabled" disabled title="需要多個到期日的選擇權資料">${esc(name)}</button>`
      : `<button data-p="${esc(name)}">${esc(name)}</button>`)).join('');
    box.querySelectorAll('button[data-p]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chain = store.get('optionsChain');
        // 選擇權腳的權利金從鏈上取價；取不到的腳以 0 計並提示。
        let missing = 0;
        const legs = presets[btn.dataset.p].map((leg) => {
          if (leg.type === 'future') return { ...leg, premium: 0 };
          const premium = chainPrice(chain, leg.type, leg.strike, leg.action);
          if (premium == null) missing += 1;
          return { ...leg, premium: premium ?? 0 };
        });
        store.set('strategyLegs', legs);
        this.showMessage(missing ? `${missing} 隻腳在選擇權鏈上沒有價格，權利金以 0 計` : '');
      });
    });
  }

  // 腳位清單：口數可直接改，每列可刪除。
  renderLegs(legs) {
    const box = this.root.querySelector('.sb-legs');
    if (!legs.length) {
      box.innerHTML = '<div class="sb-empty">尚未加入腳位</div>';
      return;
    }
    box.innerHTML = `<table><thead><tr><th>腳</th><th>買賣</th><th>類型</th><th>履約價／成交價</th><th>權利金</th><th>口數</th><th></th></tr></thead><tbody>${legs.map((leg, i) => `
      <tr data-index="${i}">
        <td>${i + 1}</td>
        <td class="${leg.action === 'buy' ? 'metric-up' : 'metric-down'}">${ACTION_LABEL[leg.action]}</td>
        <td>${TYPE_LABEL[leg.type]}${leg.type === 'future' ? `（${esc(FUTURES_CONTRACTS.find((c) => c.value === leg.contract)?.label || '')}）` : ''}</td>
        <td>${fmtNum(leg.strike, 0)}</td>
        <td>${leg.type === 'future' ? '--' : fmtNum(leg.premium, 1)}</td>
        <td><input class="input sb-qty" type="number" min="1" step="1" value="${leg.qty}"></td>
        <td><button class="sb-remove" title="刪除這隻腳">刪除</button></td>
      </tr>`).join('')}</tbody></table>`;
    box.querySelectorAll('tr[data-index]').forEach((row) => {
      const index = Number(row.dataset.index);
      row.querySelector('.sb-qty').addEventListener('change', (e) => {
        const next = store.get('strategyLegs');
        next[index].qty = Math.max(1, Math.round(Number(e.target.value) || 1));
        store.set('strategyLegs', next);
      });
      row.querySelector('.sb-remove').addEventListener('click', () => {
        store.set('strategyLegs', store.get('strategyLegs').filter((_, i) => i !== index));
      });
    });
  }

  async importFile(file) {
    try {
      const data = await readJsonArrayFile(file);
      const legs = sanitizeLegs(data);
      store.set('strategyLegs', legs);
      const skipped = data.length - legs.length;
      this.showMessage(`已匯入 ${legs.length} 隻腳${skipped ? `，略過 ${skipped} 筆格式不符` : ''}`);
    } catch (error) {
      this.showMessage(`匯入失敗：${error.message}`);
    }
  }

  showMessage(text) {
    this.root.querySelector('.sb-msg').textContent = text;
  }

  // 摘要由到期損益曲線算出：沒有上限的顯示「無上限」。
  update() {
    const legs = store.get('strategyLegs');
    this.renderLegs(legs);
    const result = analyzeStrategy(legs, store.get('optionsChain').spotPrice);
    const maxProfit = result.profitUnbounded ? '無上限' : legs.length ? money(result.maxProfit) : '--';
    const maxLoss = result.lossUnbounded ? '無上限' : legs.length ? money(result.maxLoss) : '--';
    const breakevens = result.breakevens.length ? result.breakevens.map((p) => fmtNum(p, 0)).join('、') : '--';
    this.root.querySelector('.summary').innerHTML = `
      權利金${result.net >= 0 ? '收入' : '支出'}：<b>${money(Math.abs(result.net))}</b>｜最大獲利：<b>${maxProfit}</b>｜最大損失：<b>${maxLoss}</b>｜損益兩平：<b>${breakevens}</b>
    `;
  }

  destroy() {
    this.openImport.destroy();
    this.root.remove();
  }
}
