// 篩選面板元件：依 FILTER_REGISTRY 產生勾選框與參數欄位；設定存在瀏覽器。「載入自選」開檔案選擇視窗讀入自選股檔案。
import { DEFAULT_FILTER_SETTINGS, FILTER_REGISTRY } from '../services/filterEngine.js';
import { esc } from '../services/html.js';

const LS_KEY = 'tw_screen_filters';
const KNOWN_IDS = new Set(FILTER_REGISTRY.map((f) => f.id));

export class FilterPanel {
  constructor(container, options = {}) {
    this.onRun = options.onRun || (() => {});
    this.onLoadWatchlist = options.onLoadWatchlist || (() => {});
    this.settings = { ...DEFAULT_FILTER_SETTINGS };
    this.enabled = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      Object.keys(DEFAULT_FILTER_SETTINGS).forEach((key) => {
        if (Number.isFinite(Number(saved.settings?.[key]))) this.settings[key] = Number(saved.settings[key]);
      });
      (saved.enabled || []).filter((id) => KNOWN_IDS.has(id)).forEach((id) => this.enabled.add(id));
    } catch {}

    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">F</span><h3 class="panel__title">策略篩選</h3></div>
      <div class="panel__body">
        <div class="filters" style="display:grid;gap:8px"></div>
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="run">執行篩選</button>
          <button class="load-watch" title="從檔案載入自選股（Page3 匯出的 watchlist.json）">載入自選</button>
        </div>
        <div class="filter-msg" style="margin-top:6px;color:var(--text2);min-height:1.2em"></div>
      </div>
    `;
    container.appendChild(this.root);

    this.root.querySelector('.filters').innerHTML = FILTER_REGISTRY.map((f) => `
      <div>
        <label style="display:flex;align-items:center;gap:6px">
          <input type="checkbox" data-id="${f.id}" ${this.enabled.has(f.id) ? 'checked' : ''}> ${esc(f.name)}
        </label>
        <div style="display:grid;grid-template-columns:repeat(${f.params.length},1fr);gap:6px;margin:4px 0 0 22px">
          ${f.params.map((p) => `<label style="font-size:12px;color:var(--text2)">${esc(p.label)}<input class="input" type="number" step="any" data-key="${p.key}" value="${esc(this.settings[p.key])}"></label>`).join('')}
        </div>
      </div>
    `).join('');

    this.root.querySelector('.run').addEventListener('click', () => this.onRun(this.collect()));
    this.root.querySelector('.load-watch').addEventListener('click', () => this.onLoadWatchlist());
  }

  collect() {
    this.enabled = new Set([...this.root.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.dataset.id));
    this.root.querySelectorAll('input[data-key]').forEach((input) => {
      const value = Number(input.value);
      this.settings[input.dataset.key] = Number.isFinite(value) ? value : DEFAULT_FILTER_SETTINGS[input.dataset.key];
    });
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ enabled: [...this.enabled], settings: this.settings }));
    } catch {}
    return { enabled: [...this.enabled], settings: { ...this.settings } };
  }

  showMessage(text) {
    this.root.querySelector('.filter-msg').textContent = text;
  }

  destroy() { this.root.remove(); }
}
