import { FILTER_REGISTRY } from '../services/filterEngine.js';

const LS_KEY = 'tw_screen_filters';

export class FilterPanel {
  constructor(container, options = {}) {
    this.onRun = options.onRun || (() => {});
    this.settings = { rsiMin: 30, rsiMax: 70, dividendMin: 3, volMin: 1000 };
    this.enabled = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      this.settings = { ...this.settings, ...(saved.settings || {}) };
      (saved.enabled || []).forEach((id) => this.enabled.add(id));
    } catch {}

    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">F</span><h3 class="panel__title">策略篩選</h3></div>
      <div class="panel__body">
        <div class="filters"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
          <label>RSI Min<input class="input rsi-min" type="number" value="${this.settings.rsiMin}"></label>
          <label>RSI Max<input class="input rsi-max" type="number" value="${this.settings.rsiMax}"></label>
          <label>殖利率><input class="input div-min" type="number" value="${this.settings.dividendMin}"></label>
          <label>成交量><input class="input vol-min" type="number" value="${this.settings.volMin}"></label>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="run">執行篩選</button>
          <button class="load-watch">載入自選</button>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.root.querySelector('.filters').innerHTML = FILTER_REGISTRY.map((f) => `
      <label style="display:flex;align-items:center;gap:6px;margin:4px 0">
        <input type="checkbox" data-id="${f.id}" ${this.enabled.has(f.id) ? 'checked' : ''}> ${f.name}
      </label>
    `).join('');

    this.root.querySelector('.run').addEventListener('click', () => this.fire('run'));
    this.root.querySelector('.load-watch').addEventListener('click', () => this.fire('watch'));
  }

  collect() {
    this.enabled = new Set([...this.root.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.dataset.id));
    this.settings = {
      rsiMin: Number(this.root.querySelector('.rsi-min').value),
      rsiMax: Number(this.root.querySelector('.rsi-max').value),
      dividendMin: Number(this.root.querySelector('.div-min').value),
      volMin: Number(this.root.querySelector('.vol-min').value)
    };
    localStorage.setItem(LS_KEY, JSON.stringify({ enabled: [...this.enabled], settings: this.settings }));
    return { enabled: [...this.enabled], settings: this.settings };
  }

  fire(mode) {
    this.onRun({ mode, ...this.collect() });
  }

  destroy() { this.root.remove(); }
}
