// 型態切換面板：依 PATTERN_REGISTRY 產生可勾選的技術型態條件。
import { PATTERN_REGISTRY } from '../services/patternEngine.js';

const LS_KEY = 'tw_patterns_enabled';

// getSaved：函式用途註解，說明此處封裝一段可重用的流程。
function getSaved() {
  try {
    // 段落說明：讀寫 localStorage，保留使用者設定。
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

// PatternTogglePanel：類別用途註解，集中管理相關狀態與方法。
export class PatternTogglePanel {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.onChange = options.onChange || (() => {});
    this.enabled = new Set(getSaved());
    this.collapsed = false;
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">P</span><h3 class="panel__title">型態開關</h3><button class="toggle" style="margin-left:auto">收合</button></div>
      <div class="panel__body">
        <select class="cat-filter"><option value="all">全部分類</option></select>
        <div class="list" style="margin-top:8px;display:grid;gap:8px"></div>
      </div>
    `;
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    this.fillCategories();
    this.render('all');
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.cat-filter').addEventListener('change', (e) => this.render(e.target.value));
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.toggle').addEventListener('click', () => this.toggle());
    if (options.defaultCollapsed) {
      this.toggle();
    }
  }

  // toggle：方法用途註解，處理此元件或類別的一段行為。
  toggle() {
    this.collapsed = !this.collapsed;
    this.root.querySelector('.panel__body').style.display = this.collapsed ? 'none' : '';
    this.root.querySelector('.toggle').textContent = this.collapsed ? '展開' : '收合';
  }

  // fillCategories：方法用途註解，處理此元件或類別的一段行為。
  fillCategories() {
    const sel = this.root.querySelector('.cat-filter');
    [...new Set(PATTERN_REGISTRY.map((p) => p.category))].forEach((cat) => {
      // 段落說明：建立新的 DOM 節點。
      const op = document.createElement('option');
      op.value = cat;
      op.textContent = cat;
      // 段落說明：將建立好的節點掛回頁面。
      sel.appendChild(op);
    });
  }

  // render：方法用途註解，處理此元件或類別的一段行為。
  render(category) {
    const list = this.root.querySelector('.list');
    // rows：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const rows = PATTERN_REGISTRY.filter((p) => category === 'all' || p.category === category);
    // 段落說明：更新 DOM 內容。
    list.innerHTML = rows.map((p) => `
      <label style="display:block;border:1px solid var(--border);padding:6px;border-radius:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <strong>${p.name}</strong>
          <input type="checkbox" data-id="${p.id}" ${this.enabled.has(p.id) ? 'checked' : ''}>
        </div>
        <div style="font-size:12px;color:var(--text2)">${p.description}</div>
      </label>
    `).join('');

    list.querySelectorAll('input[type=checkbox]').forEach((ck) => {
      // 段落說明：綁定使用者互動事件。
      ck.addEventListener('change', () => {
        if (ck.checked) this.enabled.add(ck.dataset.id);
        else this.enabled.delete(ck.dataset.id);
        const enabled = [...this.enabled];
        // 段落說明：讀寫 localStorage，保留使用者設定。
        localStorage.setItem(LS_KEY, JSON.stringify(enabled));
        this.onChange(enabled);
      });
    });
  }

  // getEnabled：方法用途註解，處理此元件或類別的一段行為。
  getEnabled() {
    return [...this.enabled];
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
