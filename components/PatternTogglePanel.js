// 型態切換面板：依 PATTERN_REGISTRY 產生可勾選的技術型態條件。
import { store } from '../data/store.js';
import { PATTERN_REGISTRY } from '../services/patternEngine.js';

export class PatternTogglePanel {
  constructor(container, options = {}) {
    this.onChange = options.onChange || (() => {});
    // 勾選狀態以 store.enabledPatterns 為準（store 會存到瀏覽器），型態引擎也讀同一份。
    this.enabled = new Set(store.get('enabledPatterns'));
    this.collapsed = false;
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">P</span><h3 class="panel__title">型態開關</h3><button class="toggle pattern-panel__toggle">收合</button></div>
      <div class="panel__body">
        <select class="cat-filter"><option value="all">全部分類</option></select>
        <div class="list pattern-panel__list"></div>
      </div>
    `;
    container.appendChild(this.root);
    this.fillCategories();
    this.render('all');
    this.root.querySelector('.cat-filter').addEventListener('change', (e) => this.render(e.target.value));
    this.root.querySelector('.toggle').addEventListener('click', () => this.toggle());
    if (options.defaultCollapsed) {
      this.toggle();
    }
  }

  toggle() {
    this.collapsed = !this.collapsed;
    this.root.querySelector('.panel__body').style.display = this.collapsed ? 'none' : '';
    this.root.querySelector('.toggle').textContent = this.collapsed ? '展開' : '收合';
  }

  fillCategories() {
    const sel = this.root.querySelector('.cat-filter');
    [...new Set(PATTERN_REGISTRY.map((p) => p.category))].forEach((cat) => {
      const op = document.createElement('option');
      op.value = cat;
      op.textContent = cat;
      sel.appendChild(op);
    });
  }

  render(category) {
    const list = this.root.querySelector('.list');
    const rows = PATTERN_REGISTRY.filter((p) => category === 'all' || p.category === category);
    list.innerHTML = rows.map((p) => `
      <label class="pattern-panel__item">
        <div class="pattern-panel__row">
          <strong>${p.name}</strong>
          <input type="checkbox" data-id="${p.id}" ${this.enabled.has(p.id) ? 'checked' : ''}>
        </div>
        <div class="pattern-panel__desc">${p.description}</div>
      </label>
    `).join('');

    list.querySelectorAll('input[type=checkbox]').forEach((ck) => {
      ck.addEventListener('change', () => {
        if (ck.checked) this.enabled.add(ck.dataset.id);
        else this.enabled.delete(ck.dataset.id);
        this.onChange([...this.enabled]);
      });
    });
  }

  getEnabled() {
    return [...this.enabled];
  }

  destroy() { this.root.remove(); }
}
