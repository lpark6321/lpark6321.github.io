import { store } from '../data/store.js';

const LS_KEY = 'tw_watchlist';
const DEFAULT_GROUPS = ['page1分組', '自選1', '自選2', '自選3'];

function groupBy(list) {
  return list.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});
}

export class WatchlistSidebar {
  constructor(container) {
    this.zoom = 1;
    this.root = document.createElement('section');
    this.root.className = 'panel';
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
    container.appendChild(this.root);
    this.groupsEl = this.root.querySelector('.groups');
    this.fillGroupSelect();
    this.bindEvents();
    this.applyZoom();
    this.render(store.get('watchlist'));
  }

  applyZoom() {
    this.root.querySelector('.wl-body').style.zoom = String(this.zoom);
  }

  adjustZoom(delta) {
    this.zoom = Math.min(1.4, Math.max(0.8, +(this.zoom + delta).toFixed(2)));
    this.applyZoom();
  }

  fillGroupSelect() {
    const sel = this.root.querySelector('.group-select');
    const groups = [...new Set([...DEFAULT_GROUPS, ...store.get('watchlist').map((x) => x.group)])];
    sel.innerHTML = groups.map((g) => `<option value="${g}">${g}</option>`).join('');
  }

  bindEvents() {
    this.root.querySelector('.zoom-out').addEventListener('click', () => this.adjustZoom(-0.1));
    this.root.querySelector('.zoom-in').addEventListener('click', () => this.adjustZoom(0.1));

    this.root.querySelector('.add-btn').addEventListener('click', () => {
      const input = this.root.querySelector('.code-input');
      const code = (input.value || '').trim();
      const group = this.root.querySelector('.group-select').value || '自選1';
      if (!code) return;
      const list = store.get('watchlist');
      list.push({ code, name: `股票${code}`, group });
      store.set('watchlist', list);
      localStorage.setItem(LS_KEY, JSON.stringify(list));
      input.value = '';
      this.fillGroupSelect();
    });

    this.root.querySelector('.export-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(store.get('watchlist'), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'watchlist.json';
      a.click();
    });

    const fileInput = this.root.querySelector('.import-file');
    this.root.querySelector('.import-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        store.set('watchlist', data);
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        this.fillGroupSelect();
      }
      fileInput.value = '';
    });
  }

  removeItem(code, group) {
    const list = store.get('watchlist').filter((x) => !(x.code === code && x.group === group));
    store.set('watchlist', list);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  render(list) {
    const groups = groupBy(list);
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
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove')) return;
        store.set('selectedStock', row.dataset.code);
      });
      row.querySelector('.remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeItem(row.dataset.code, row.dataset.group);
      });
      row.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', row.dataset.code));
      row.addEventListener('dragover', (e) => e.preventDefault());
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData('text/plain');
        const to = row.dataset.code;
        const items = [...store.get('watchlist')];
        const a = items.findIndex((x) => x.code === from);
        const b = items.findIndex((x) => x.code === to);
        if (a < 0 || b < 0 || a === b) return;
        const [moved] = items.splice(a, 1);
        items.splice(b, 0, moved);
        store.set('watchlist', items);
        localStorage.setItem(LS_KEY, JSON.stringify(items));
      });
    });
  }

  update(list) {
    this.fillGroupSelect();
    this.render(list);
  }

  destroy() { this.root.remove(); }
}
