import { store } from '../data/store.js';

export class WatchlistAddBar {
  constructor(container, options = {}) {
    this.getCodes = options.getCodes || (() => []);
    this.root = document.createElement('div');
    this.root.className = 'panel';
    this.root.style.position = 'sticky';
    this.root.style.bottom = '0';
    this.root.innerHTML = `
      <div class="panel__body" style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <span class="count">已選 0 檔</span>
        <select class="group"><option>自選1</option><option>自選2</option><option>自選3</option></select>
        <button class="add">加入自選</button>
      </div>
    `;
    container.appendChild(this.root);
    this.root.querySelector('.add').addEventListener('click', () => {
      const group = this.root.querySelector('.group').value;
      const codes = this.getCodes();
      const src = store.get('screenResults');
      const curr = store.get('watchlist');
      const merged = [...curr];
      codes.forEach((c) => {
        if (merged.some((x) => x.code === c)) return;
        const row = src.find((x) => x.code === c);
        merged.push({ code: c, name: row?.name || `股票${c}`, group });
      });
      store.set('watchlist', merged);
      localStorage.setItem('tw_watchlist', JSON.stringify(merged));
    });
  }

  updateCount(n) {
    this.root.querySelector('.count').textContent = `已選 ${n} 檔`;
  }

  destroy() { this.root.remove(); }
}
