// 自選股新增列元件：把勾選的股票加入指定的自選群組（群組清單與 Page3 自選列表同一份）。
import { store, watchGroupNames } from '../data/store.js';
import { esc } from '../services/html.js';
import { stockName } from '../services/quoteUtils.js';

export class WatchlistAddBar {
  constructor(container, options = {}) {
    this.getCodes = options.getCodes || (() => []);
    this.root = document.createElement('div');
    this.root.className = 'panel watchlist-addbar';
    this.root.innerHTML = `
      <div class="panel__body watchlist-addbar__body">
        <span class="count">已選 0 檔</span>
        <select class="group" aria-label="加入哪個群組"></select>
        <button class="add">加入自選</button>
      </div>
    `;
    container.appendChild(this.root);
    this.groupSelect = this.root.querySelector('.group');
    this.fillGroups();
    this.unsubs = ['watchGroups', 'watchlist'].map((key) => store.subscribe(key, () => this.fillGroups()));
    this.root.querySelector('.add').addEventListener('click', () => {
      const group = this.groupSelect.value;
      const codes = this.getCodes();
      const merged = [...store.get('watchlist')];
      codes.forEach((c) => {
        if (merged.some((x) => x.code === c && x.group === group)) return;
        merged.push({ code: c, name: stockName(c), group });
      });
      store.set('watchlist', merged);
    });
  }

  // 預設選第一個自選群組（page1分組 之後那個），重填時保留目前的選擇。
  fillGroups() {
    const groups = watchGroupNames(store.get('watchGroups'), store.get('watchlist'));
    const selected = this.groupSelect.value;
    this.groupSelect.innerHTML = groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    this.groupSelect.value = groups.includes(selected) ? selected : (groups[1] || groups[0]);
  }

  updateCount(n) {
    this.root.querySelector('.count').textContent = `已選 ${n} 檔`;
  }

  destroy() {
    this.unsubs.forEach((unsub) => unsub());
    this.root.remove();
  }
}
