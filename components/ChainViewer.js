import { store } from '../data/store.js';

export class ChainViewer {
  constructor(container, options = {}) {
    this.onStrike = options.onStrike || (() => {});
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">C</span><h3 class="panel__title">Option Chain</h3></div>
      <div class="panel__body table-wrap"><table><thead><tr><th>Call</th><th>履約價</th><th>Put</th></tr></thead><tbody></tbody></table></div>
    `;
    this.tbody = this.root.querySelector('tbody');
    container.appendChild(this.root);
  }

  update(chain = store.get('optionsChain')) {
    const rows = chain.calls.map((c, i) => ({ call: c, put: chain.puts[i] })).sort((a, b) => a.call.strike - b.call.strike);
    this.tbody.innerHTML = rows.map((r) => `
      <tr data-strike="${r.call.strike}">
        <td>${r.call.bid}/${r.call.ask}</td>
        <td>${r.call.strike}</td>
        <td>${r.put.bid}/${r.put.ask}</td>
      </tr>
    `).join('');
    this.tbody.querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => this.onStrike(Number(tr.dataset.strike))));
  }

  destroy() { this.root.remove(); }
}
