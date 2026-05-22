// 自選股側欄元件：管理自選清單顯示與群組操作。
import { store } from '../data/store.js';

const LS_KEY = 'tw_watchlist';
const DEFAULT_GROUPS = ['page1分組', '自選1', '自選2', '自選3'];

// groupBy：函式用途註解，說明此處封裝一段可重用的流程。
function groupBy(list) {
  return list.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});
}

// WatchlistSidebar：類別用途註解，集中管理相關狀態與方法。
export class WatchlistSidebar {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container) {
    this.zoom = 1;
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = `
      <div class="panel__header">
        <span class="panel__badge">W</span>
        <h3 class="panel__title">自選列表</h3>
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button class="zoom-out" title="縮小">A-</button>
          <button class="zoom-in" title="放大">A+</button>
        </div>
      </div>
      <div class="panel__body wl-body">
        <div style="display:grid;grid-template-columns:1fr 130px 44px;gap:6px;margin-bottom:8px">
          <input class="input code-input" placeholder="輸入代碼" />
          <select class="group-select"></select>
          <button class="add-btn">+</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <button class="export-btn">匯出</button>
          <input type="file" class="import-file" accept="application/json" style="display:none" />
          <button class="import-btn">匯入</button>
        </div>
        <div class="groups"></div>
      </div>
    `;
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    this.groupsEl = this.root.querySelector('.groups');
    this.fillGroupSelect();
    this.bindEvents();
    this.applyZoom();
    this.render(store.get('watchlist'));
  }

  // applyZoom：方法用途註解，處理此元件或類別的一段行為。
  applyZoom() {
    this.root.querySelector('.wl-body').style.zoom = String(this.zoom);
  }

  // adjustZoom：方法用途註解，處理此元件或類別的一段行為。
  adjustZoom(delta) {
    this.zoom = Math.min(1.4, Math.max(0.8, +(this.zoom + delta).toFixed(2)));
    this.applyZoom();
  }

  // fillGroupSelect：方法用途註解，處理此元件或類別的一段行為。
  fillGroupSelect() {
    const sel = this.root.querySelector('.group-select');
    // groups：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const groups = [...new Set([...DEFAULT_GROUPS, ...store.get('watchlist').map((x) => x.group)])];
    // 段落說明：更新 DOM 內容。
    sel.innerHTML = groups.map((g) => `<option value="${g}">${g}</option>`).join('');
  }

  // bindEvents：方法用途註解，處理此元件或類別的一段行為。
  bindEvents() {
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.zoom-out').addEventListener('click', () => this.adjustZoom(-0.1));
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.zoom-in').addEventListener('click', () => this.adjustZoom(0.1));

    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.add-btn').addEventListener('click', () => {
      const input = this.root.querySelector('.code-input');
      const code = (input.value || '').trim();
      const group = this.root.querySelector('.group-select').value || '自選1';
      if (!code) return;
      const list = store.get('watchlist');
      list.push({ code, name: `股票${code}`, group });
      store.set('watchlist', list);
      // 段落說明：讀寫 localStorage，保留使用者設定。
      localStorage.setItem(LS_KEY, JSON.stringify(list));
      input.value = '';
      this.fillGroupSelect();
    });

    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.export-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(store.get('watchlist'), null, 2)], { type: 'application/json' });
      // 段落說明：建立新的 DOM 節點。
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'watchlist.json';
      a.click();
    });

    const fileInput = this.root.querySelector('.import-file');
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.import-btn').addEventListener('click', () => fileInput.click());
    // 段落說明：綁定使用者互動事件。
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        store.set('watchlist', data);
        // 段落說明：讀寫 localStorage，保留使用者設定。
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        this.fillGroupSelect();
      }
      fileInput.value = '';
    });
  }

  // removeItem：方法用途註解，處理此元件或類別的一段行為。
  removeItem(code, group) {
    // list：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const list = store.get('watchlist').filter((x) => !(x.code === code && x.group === group));
    store.set('watchlist', list);
    // 段落說明：讀寫 localStorage，保留使用者設定。
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  // render：方法用途註解，處理此元件或類別的一段行為。
  render(list) {
    const groups = groupBy(list);
    // 段落說明：更新 DOM 內容。
    this.groupsEl.innerHTML = Object.entries(groups).map(([name, stocks]) => `
      <details open>
        <summary>${name} (${stocks.length})</summary>
        <div data-group="${name}">${stocks.map((s, i) => `
          <div draggable="true" class="wl-row" data-code="${s.code}" data-group="${name}" data-index="${i}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;cursor:pointer;gap:8px">
            <span>${s.code} ${s.name}</span>
            <button class="remove" style="padding:2px 6px">-</button>
          </div>`).join('')}</div>
      </details>
    `).join('');

    this.groupsEl.querySelectorAll('.wl-row').forEach((row) => {
      // 段落說明：綁定使用者互動事件。
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove')) return;
        store.set('selectedStock', row.dataset.code);
      });
      // 段落說明：綁定使用者互動事件。
      row.querySelector('.remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeItem(row.dataset.code, row.dataset.group);
      });
      // 段落說明：綁定使用者互動事件。
      row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', row.dataset.code));
      // 段落說明：綁定使用者互動事件。
      row.addEventListener('dragover', (e) => e.preventDefault());
      // 段落說明：綁定使用者互動事件。
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData('text/plain');
        const to = row.dataset.code;
        const items = [...store.get('watchlist')];
        // a：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
        const a = items.findIndex((x) => x.code === from);
        // b：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
        const b = items.findIndex((x) => x.code === to);
        if (a < 0 || b < 0 || a === b) return;
        const [moved] = items.splice(a, 1);
        items.splice(b, 0, moved);
        store.set('watchlist', items);
        // 段落說明：讀寫 localStorage，保留使用者設定。
        localStorage.setItem(LS_KEY, JSON.stringify(items));
      });
    });
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(list) {
    this.fillGroupSelect();
    this.render(list);
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
