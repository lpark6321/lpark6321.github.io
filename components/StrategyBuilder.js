import { store } from '../data/store.js';

function calcSummary(legs) {
  const net = legs.reduce((acc, l) => {
    if (l.type === 'future') return acc;
    return acc + (l.action === 'buy' ? -1 : 1) * l.premium * l.qty;
  }, 0);
  return {
    net,
    maxProfit: '依策略到期損益曲線而定',
    maxLoss: '依策略組合而定',
    breakeven: '請參考下方損益曲線零交點'
  };
}

function nearestStrike(strikes, target) {
  return strikes.reduce((best, s) => Math.abs(s - target) < Math.abs(best - target) ? s : best, strikes[0]);
}

export class StrategyBuilder {
  constructor(container) {
    this.collapsed = false;
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">S</span><h3 class="panel__title">策略組合</h3><button class="sb-toggle" style="margin-left:auto">收合</button></div>
      <div class="panel__body sb-body">
        <div class="inputs" style="display:grid;grid-template-columns:repeat(6,minmax(80px,1fr));gap:6px"></div>
        <div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px" class="presets"></div>
        <div class="summary" style="margin-top:8px;color:var(--text2)"></div>
      </div>
    `;
    container.appendChild(this.root);
    this.root.querySelector('.sb-toggle').addEventListener('click', () => this.toggle());
    this.renderInputs();
    this.renderPresets();
    this.updateSummary();
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this.root.querySelector('.sb-body').style.display = this.collapsed ? 'none' : '';
    this.root.querySelector('.sb-toggle').textContent = this.collapsed ? '展開' : '收合';
  }

  renderInputs() {
    const chain = store.get('optionsChain');
    const strikes = [...new Set([...chain.calls.map((x) => x.strike), ...chain.puts.map((x) => x.strike)])];
    const wrap = this.root.querySelector('.inputs');
    wrap.innerHTML = `
      <select class="type"><option value="call">Call</option><option value="put">Put</option></select>
      <select class="action"><option value="buy">Buy</option><option value="sell">Sell</option></select>
      <select class="strike">${strikes.map((s) => `<option>${s}</option>`).join('')}</select>
      <input class="input qty" type="number" value="1" min="1" />
      <input class="input premium" type="number" value="100" min="1" />
      <button class="add">新增腳位</button>
    `;
    wrap.querySelector('.add').addEventListener('click', () => {
      const legs = store.get('strategyLegs');
      legs.push({
        type: wrap.querySelector('.type').value,
        action: wrap.querySelector('.action').value,
        strike: Number(wrap.querySelector('.strike').value),
        qty: Number(wrap.querySelector('.qty').value),
        premium: Number(wrap.querySelector('.premium').value)
      });
      store.set('strategyLegs', legs);
      this.updateSummary();
    });
  }

  getPresets() {
    const chain = store.get('optionsChain');
    const spot = chain.spotPrice;
    const strikes = [...new Set([...chain.calls.map((x) => x.strike), ...chain.puts.map((x) => x.strike)])].sort((a, b) => a - b);
    const atm = nearestStrike(strikes, spot);
    const up1 = nearestStrike(strikes, atm + 100);
    const up2 = nearestStrike(strikes, atm + 200);
    const dn1 = nearestStrike(strikes, atm - 100);
    const dn2 = nearestStrike(strikes, atm - 200);

    return {
      '買進買權': [{ type: 'call', action: 'buy', strike: atm, qty: 1, premium: 120 }],
      '買進賣權': [{ type: 'put', action: 'buy', strike: atm, qty: 1, premium: 115 }],
      '賣出買權': [{ type: 'call', action: 'sell', strike: up1, qty: 1, premium: 85 }],
      '賣出賣權': [{ type: 'put', action: 'sell', strike: dn1, qty: 1, premium: 80 }],
      '買權多頭價差': [
        { type: 'call', action: 'buy', strike: atm, qty: 1, premium: 120 },
        { type: 'call', action: 'sell', strike: up1, qty: 1, premium: 65 }
      ],
      '買權空頭價差': [
        { type: 'call', action: 'sell', strike: atm, qty: 1, premium: 120 },
        { type: 'call', action: 'buy', strike: up1, qty: 1, premium: 65 }
      ],
      '賣權多頭價差': [
        { type: 'put', action: 'sell', strike: atm, qty: 1, premium: 115 },
        { type: 'put', action: 'buy', strike: dn1, qty: 1, premium: 62 }
      ],
      '賣權空頭價差': [
        { type: 'put', action: 'buy', strike: atm, qty: 1, premium: 115 },
        { type: 'put', action: 'sell', strike: dn1, qty: 1, premium: 62 }
      ],
      '買進跨式': [
        { type: 'call', action: 'buy', strike: atm, qty: 1, premium: 120 },
        { type: 'put', action: 'buy', strike: atm, qty: 1, premium: 115 }
      ],
      '買進勒式': [
        { type: 'call', action: 'buy', strike: up1, qty: 1, premium: 70 },
        { type: 'put', action: 'buy', strike: dn1, qty: 1, premium: 65 }
      ],
      '賣出跨式': [
        { type: 'call', action: 'sell', strike: atm, qty: 1, premium: 120 },
        { type: 'put', action: 'sell', strike: atm, qty: 1, premium: 115 }
      ],
      '賣出勒式': [
        { type: 'call', action: 'sell', strike: up1, qty: 1, premium: 70 },
        { type: 'put', action: 'sell', strike: dn1, qty: 1, premium: 65 }
      ],
      '買進期貨賣出買權': [
        { type: 'future', action: 'buy', strike: spot, qty: 1, premium: 0 },
        { type: 'call', action: 'sell', strike: up1, qty: 1, premium: 85 }
      ],
      '賣出期貨賣出賣權': [
        { type: 'future', action: 'sell', strike: spot, qty: 1, premium: 0 },
        { type: 'put', action: 'sell', strike: dn1, qty: 1, premium: 80 }
      ],
      '買進時間價差': [
        { type: 'call', action: 'buy', strike: atm, qty: 1, premium: 140 },
        { type: 'call', action: 'sell', strike: atm, qty: 1, premium: 95 }
      ],
      '賣出時間價差': [
        { type: 'call', action: 'sell', strike: atm, qty: 1, premium: 140 },
        { type: 'call', action: 'buy', strike: atm, qty: 1, premium: 95 }
      ],
      '買進蝶式價差策略': [
        { type: 'call', action: 'buy', strike: dn1, qty: 1, premium: 150 },
        { type: 'call', action: 'sell', strike: atm, qty: 2, premium: 110 },
        { type: 'call', action: 'buy', strike: up1, qty: 1, premium: 70 }
      ],
      '賣出蝶式價差策略': [
        { type: 'call', action: 'sell', strike: dn1, qty: 1, premium: 150 },
        { type: 'call', action: 'buy', strike: atm, qty: 2, premium: 110 },
        { type: 'call', action: 'sell', strike: up1, qty: 1, premium: 70 }
      ],
      '買進兀鷹價差策略': [
        { type: 'call', action: 'buy', strike: dn2, qty: 1, premium: 170 },
        { type: 'call', action: 'sell', strike: dn1, qty: 1, premium: 130 },
        { type: 'call', action: 'sell', strike: up1, qty: 1, premium: 85 },
        { type: 'call', action: 'buy', strike: up2, qty: 1, premium: 55 }
      ],
      '賣出兀鷹價差策略': [
        { type: 'call', action: 'sell', strike: dn2, qty: 1, premium: 170 },
        { type: 'call', action: 'buy', strike: dn1, qty: 1, premium: 130 },
        { type: 'call', action: 'buy', strike: up1, qty: 1, premium: 85 },
        { type: 'call', action: 'sell', strike: up2, qty: 1, premium: 55 }
      ],
      '轉換': [
        { type: 'future', action: 'buy', strike: spot, qty: 1, premium: 0 },
        { type: 'put', action: 'buy', strike: atm, qty: 1, premium: 115 },
        { type: 'call', action: 'sell', strike: atm, qty: 1, premium: 120 }
      ]
    };
  }

  renderPresets() {
    const presets = this.getPresets();
    const box = this.root.querySelector('.presets');
    box.innerHTML = Object.keys(presets).map((p) => `<button data-p="${p}">${p}</button>`).join('');
    box.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const legs = presets[btn.dataset.p].map((x) => ({ ...x }));
        store.set('strategyLegs', legs);
        this.updateSummary();
      });
    });
  }

  updateSummary() {
    const summary = calcSummary(store.get('strategyLegs'));
    this.root.querySelector('.summary').innerHTML = `
      Net ${summary.net >= 0 ? 'Credit' : 'Debit'}: <b>${summary.net}</b> | Max Profit: <b>${summary.maxProfit}</b> | Max Loss: <b>${summary.maxLoss}</b> | Breakeven: <b>${summary.breakeven}</b>
    `;
  }

  destroy() { this.root.remove(); }
}
