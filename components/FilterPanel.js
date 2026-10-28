// 篩選面板元件：依 FILTER_REGISTRY 產生條件表單並觸發篩選。
import { FILTER_REGISTRY } from '../services/filterEngine.js';

const LS_KEY = 'tw_screen_filters';

// FilterPanel：類別用途註解，集中管理相關狀態與方法。
export class FilterPanel {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.onRun = options.onRun || (() => {});
    this.settings = { rsiMin: 30, rsiMax: 70, dividendMin: 3, volMin: 1000 };
    this.enabled = new Set();
    try {
      // 段落說明：讀寫 localStorage，保留使用者設定。
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      this.settings = { ...this.settings, ...(saved.settings || {}) };
      (saved.enabled || []).forEach((id) => this.enabled.add(id));
    } catch {}

    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
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
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);

    // 段落說明：更新 DOM 內容。
    this.root.querySelector('.filters').innerHTML = FILTER_REGISTRY.map((f) => `
      <label style="display:flex;align-items:center;gap:6px;margin:4px 0">
        <input type="checkbox" data-id="${f.id}" ${this.enabled.has(f.id) ? 'checked' : ''}> ${f.name}
      </label>
    `).join('');

    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.run').addEventListener('click', () => this.fire('run'));
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.load-watch').addEventListener('click', () => this.fire('watch'));
  }

  // collect：方法用途註解，處理此元件或類別的一段行為。
  collect() {
    this.enabled = new Set([...this.root.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.dataset.id));
    this.settings = {
      rsiMin: Number(this.root.querySelector('.rsi-min').value),
      rsiMax: Number(this.root.querySelector('.rsi-max').value),
      dividendMin: Number(this.root.querySelector('.div-min').value),
      volMin: Number(this.root.querySelector('.vol-min').value)
    };
    // 段落說明：讀寫 localStorage，保留使用者設定。
    localStorage.setItem(LS_KEY, JSON.stringify({ enabled: [...this.enabled], settings: this.settings }));
    return { enabled: [...this.enabled], settings: this.settings };
  }

  // fire：方法用途註解，處理此元件或類別的一段行為。
  fire(mode) {
    this.onRun({ mode, ...this.collect() });
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
