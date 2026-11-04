// 選擇權鏈元件（Page4）：Call／Put 各顯示買價與賣價，點賣價＝以賣價買進一口，點買價＝以買價賣出一口。
import { fmtNum } from '../services/quoteUtils.js';

export class ChainViewer {
  constructor(container, options = {}) {
    this.onPick = options.onPick || (() => {});
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">C</span><h3 class="panel__title">Option Chain</h3></div>
      <div class="panel__body table-wrap"><table class="chain-table"><thead>
        <tr><th colspan="2">Call</th><th rowspan="2">履約價</th><th colspan="2">Put</th></tr>
        <tr><th title="點擊＝賣出">買價</th><th title="點擊＝買進">賣價</th><th title="點擊＝賣出">買價</th><th title="點擊＝買進">賣價</th></tr>
      </thead><tbody></tbody></table></div>
    `;
    this.tbody = this.root.querySelector('tbody');
    container.appendChild(this.root);
    this.tbody.addEventListener('click', (e) => {
      const cell = e.target.closest('[data-pick]');
      if (!cell) return;
      const [type, action, strike, premium] = cell.dataset.pick.split('|');
      this.onPick({ type, action, strike: Number(strike), premium: Number(premium) });
    });
  }

  update(chain) {
    const puts = new Map(chain.puts.map((row) => [row.strike, row]));
    const cell = (type, action, row, price) => (price > 0
      ? `<td class="chain-pick" data-pick="${type}|${action}|${row.strike}|${price}" title="${action === 'buy' ? '買進' : '賣出'}一口">${fmtNum(price, 1)}</td>`
      : '<td>--</td>');
    this.tbody.innerHTML = [...chain.calls].sort((a, b) => a.strike - b.strike).map((call) => {
      const put = puts.get(call.strike) || { strike: call.strike };
      return `<tr>
        ${cell('call', 'sell', call, call.bid)}${cell('call', 'buy', call, call.ask)}
        <td><b>${fmtNum(call.strike, 0)}</b></td>
        ${cell('put', 'sell', put, put.bid)}${cell('put', 'buy', put, put.ask)}
      </tr>`;
    }).join('');
  }

  destroy() { this.root.remove(); }
}
