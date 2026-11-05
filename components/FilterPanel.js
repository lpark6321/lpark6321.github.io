// 篩選面板元件：依 FILTER_REGISTRY 產生勾選框與參數欄位；設定存在瀏覽器。「載入自選」開檔案選擇視窗讀入自選股檔案。
import { DEFAULT_FILTER_SETTINGS, FILTER_REGISTRY } from '../services/filterEngine.js';
import { esc } from '../services/html.js';
import { loadSetting, saveSetting } from '../data/storage.js';

const KNOWN_IDS = new Set(FILTER_REGISTRY.map((f) => f.id));

export class FilterPanel {
  constructor(container, options = {}) {
    this.onRun = options.onRun || (() => {});
    this.onLoadWatchlist = options.onLoadWatchlist || (() => {});
    this.settings = { ...DEFAULT_FILTER_SETTINGS };
    this.enabled = new Set();
    const saved = loadSetting('screenFilters') || {};
    Object.keys(DEFAULT_FILTER_SETTINGS).forEach((key) => {
      if (Number.isFinite(Number(saved.settings?.[key]))) this.settings[key] = Number(saved.settings[key]);
    });
    (Array.isArray(saved.enabled) ? saved.enabled : []).filter((id) => KNOWN_IDS.has(id)).forEach((id) => this.enabled.add(id));

    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">F</span><h3 class="panel__title">策略篩選</h3></div>
      <div class="panel__body">
        <div class="filters filter-panel__list"></div>
        <div class="filter-panel__actions">
          <button class="run">執行篩選</button>
          <button class="load-watch" title="從檔案載入自選股（Page3 匯出的 watchlist.json）">載入自選</button>
        </div>
        <div class="filter-msg filter-panel__msg"></div>
      </div>
    `;
    container.appendChild(this.root);

    this.root.querySelector('.filters').innerHTML = FILTER_REGISTRY.map((f) => `
      <div ${f.needsHistory ? 'data-history' : ''}>
        <label class="filter-panel__check">
          <input type="checkbox" data-id="${f.id}" ${this.enabled.has(f.id) ? 'checked' : ''}> ${esc(f.name)}
        </label>
        <div class="filter-panel__params" style="--cols:${f.params.length}">
          ${f.params.map((p) => `<label class="filter-panel__param">${esc(p.label)}<input class="input" type="number" step="any" data-key="${p.key}" value="${esc(this.settings[p.key])}"></label>`).join('')}
        </div>
      </div>
    `).join('');

    this.root.querySelector('.run').addEventListener('click', () => this.onRun(this.collect()));
    this.root.querySelector('.load-watch').addEventListener('click', () => this.onLoadWatchlist());
  }

  // 技術指標條件要日 K，資料來源不支援時整組停用（勾選狀態照存，換回來還在）。
  setHistoryAvailable(available) {
    this.root.querySelectorAll('[data-history]').forEach((item) => {
      item.classList.toggle('is-disabled', !available);
      item.title = available ? '' : '需要公開資料來源';
      item.querySelectorAll('input').forEach((input) => { input.disabled = !available; });
    });
  }

  // 回傳的 enabled 不含停用中的條件；存檔則保留所有勾選。
  collect() {
    this.enabled = new Set([...this.root.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.dataset.id));
    this.root.querySelectorAll('input[data-key]').forEach((input) => {
      const value = Number(input.value);
      this.settings[input.dataset.key] = Number.isFinite(value) ? value : DEFAULT_FILTER_SETTINGS[input.dataset.key];
    });
    saveSetting('screenFilters', { enabled: [...this.enabled], settings: this.settings });
    const usable = [...this.root.querySelectorAll('input[type=checkbox]:checked:not(:disabled)')].map((x) => x.dataset.id);
    return { enabled: usable, settings: { ...this.settings } };
  }

  showMessage(text) {
    this.root.querySelector('.filter-msg').textContent = text;
  }

  destroy() { this.root.remove(); }
}
