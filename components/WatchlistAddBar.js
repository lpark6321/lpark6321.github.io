// 自選股新增列元件：提供輸入股票代號並加入 watchlist 的操作。
import { store } from '../data/store.js';

// WatchlistAddBar：類別用途註解，集中管理相關狀態與方法。
export class WatchlistAddBar {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.getCodes = options.getCodes || (() => []);
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('div');
    this.root.className = 'panel';
    this.root.style.position = 'sticky';
    this.root.style.bottom = '0';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = `
      <div class="panel__body" style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <span class="count">已選 0 檔</span>
        <select class="group"><option>自選1</option><option>自選2</option><option>自選3</option></select>
        <button class="add">加入自選</button>
      </div>
    `;
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.add').addEventListener('click', () => {
      const group = this.root.querySelector('.group').value;
      const codes = this.getCodes();
      const src = store.get('screenResults');
      const curr = store.get('watchlist');
      const merged = [...curr];
      codes.forEach((c) => {
        if (merged.some((x) => x.code === c)) return;
        // row：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
        const row = src.find((x) => x.code === c);
        merged.push({ code: c, name: row?.name || `股票${c}`, group });
      });
      store.set('watchlist', merged);
      // 段落說明：讀寫 localStorage，保留使用者設定。
      localStorage.setItem('tw_watchlist', JSON.stringify(merged));
    });
  }

  // updateCount：方法用途註解，處理此元件或類別的一段行為。
  updateCount(n) {
    this.root.querySelector('.count').textContent = `已選 ${n} 檔`;
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
