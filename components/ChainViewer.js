// 選擇權鏈元件（Page4）：Call／Put 各顯示一個價格（有成交用成交價；沒成交退回買賣價或參考價，以灰字標示）。
// 點價格＝以該價買進一口，Shift＋點＝賣出一口。
import { chainPrice } from '../services/optionStrategy.js';
import { fmtNum } from '../services/quoteUtils.js';

export class ChainViewer {
  constructor(container, options = {}) {
    this.onPick = options.onPick || (() => {});
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">C</span><h3 class="panel__title">Option Chain</h3></div>
      <div class="panel__body table-wrap"><table class="chain-table"><thead>
        <tr><th title="點擊＝買進，Shift＋點擊＝賣出">Call</th><th>履約價</th><th title="點擊＝買進，Shift＋點擊＝賣出">Put</th></tr>
      </thead><tbody></tbody></table></div>
    `;
    this.tbody = this.root.querySelector('tbody');
    container.appendChild(this.root);
    this.tbody.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-type]');
      if (!cell || !this.chain) return;
      const action = e.shiftKey ? 'sell' : 'buy';
      const strike = Number(cell.dataset.strike);
      const premium = chainPrice(this.chain, cell.dataset.type, strike, action);
      if (premium > 0) this.onPick({ type: cell.dataset.type, action, strike, premium });
    });
  }

  update(chain) {
    this.chain = chain;
    const puts = new Map(chain.puts.map((row) => [row.strike, row]));
    const cell = (type, row) => {
      const price = chainPrice(chain, type, row.strike, 'buy');
      if (!(price > 0)) return '<td>--</td>';
      const traded = Number(row.last) > 0;
      return `<td class="chain-pick${traded ? '' : ' chain-pick--ref'}" data-type="${type}" data-strike="${row.strike}"
        title="${traded ? '成交價' : '今天沒有成交（買賣價或參考價）'}｜點擊買進，Shift＋點擊賣出">${fmtNum(price, 1)}</td>`;
    };
    this.tbody.innerHTML = [...chain.calls].sort((a, b) => a.strike - b.strike).map((call) => `<tr>
        ${cell('call', call)}
        <td><b>${fmtNum(call.strike, 0)}</b></td>
        ${cell('put', puts.get(call.strike) || { strike: call.strike })}
      </tr>`).join('');
  }

  destroy() { this.root.remove(); }
}
