// Greeks 表格元件（Page4）：每隻腳由 Black-Scholes 算出（權利金反推隱含波動率），單位新台幣。
import { legGreeks } from '../services/optionStrategy.js';
import { fmtNum } from '../services/quoteUtils.js';

export class GreeksTable {
  constructor(container) {
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">G</span><h3 class="panel__title">Greeks（元）</h3></div>
      <div class="panel__body table-wrap"><table><thead><tr>
        <th>腳</th><th title="隱含波動率">IV</th><th title="標的每漲 1 點的損益變化">Delta</th><th title="Delta 每點的變化">Gamma</th><th title="每過一天的時間價值變化">Theta/日</th><th title="波動率每升 1% 的損益變化">Vega/1%</th>
      </tr></thead><tbody></tbody><tfoot></tfoot></table></div>
    `;
    this.tbody = this.root.querySelector('tbody');
    this.tfoot = this.root.querySelector('tfoot');
    container.appendChild(this.root);
  }

  update(legs = [], chain) {
    const rows = legs.map((leg) => legGreeks(leg, chain));
    const keys = ['delta', 'gamma', 'theta', 'vega'];
    // 任何一隻腳算不出來，合計就不可信，顯示「--」。
    const total = Object.fromEntries(keys.map((key) => [key, rows.every((r) => r[key] != null) ? rows.reduce((sum, r) => sum + r[key], 0) : null]));
    const cells = (r) => keys.map((key) => `<td>${fmtNum(r[key], key === 'gamma' ? 3 : 1)}</td>`).join('');
    this.tbody.innerHTML = rows.map((r, i) => `<tr><td>Leg ${i + 1}</td><td>${r.iv == null ? '--' : `${(r.iv * 100).toFixed(1)}%`}</td>${cells(r)}</tr>`).join('');
    this.tfoot.innerHTML = `<tr><th>合計</th><th></th>${keys.map((key) => `<th>${fmtNum(total[key], key === 'gamma' ? 3 : 1)}</th>`).join('')}</tr>`;
  }

  destroy() { this.root.remove(); }
}
