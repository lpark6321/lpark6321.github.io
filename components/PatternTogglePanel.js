import { PATTERN_REGISTRY } from '../services/patternEngine.js';

const LS_KEY = 'tw_patterns_enabled';

function getSaved() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

export class PatternTogglePanel {
  constructor(container, options = {}) {
    this.onChange = options.onChange || (() => {});
    this.enabled = new Set(getSaved());
    this.collapsed = false;
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">P</span><h3 class="panel__title">型態開關</h3><button class="toggle" style="margin-left:auto">收合</button></div>
      <div class="panel__body">
        <select class="cat-filter"><option value="all">全部分類</option></select>
        <div class="list" style="margin-top:8px;display:grid;gap:8px"></div>
      </div>
    `;
    container.appendChild(this.root);
    this.fillCategories();
    this.render('all');
    this.root.querySelector('.cat-filter').addEventListener('change', (e) => this.render(e.target.value));
    this.root.querySelector('.toggle').addEventListener('click', () => this.toggle());
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
      <label style="display:block;border:1px solid var(--border);padding:6px;border-radius:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <strong>${p.name}</strong>
          <input type="checkbox" data-id="${p.id}" ${this.enabled.has(p.id) ? 'checked' : ''}>
        </div>
        <div style="font-size:12px;color:var(--text2)">${p.description}</div>
      </label>
    `).join('');

    list.querySelectorAll('input[type=checkbox]').forEach((ck) => {
      ck.addEventListener('change', () => {
        if (ck.checked) this.enabled.add(ck.dataset.id);
        else this.enabled.delete(ck.dataset.id);
        const enabled = [...this.enabled];
        localStorage.setItem(LS_KEY, JSON.stringify(enabled));
        this.onChange(enabled);
      });
    });
  }

  getEnabled() {
    return [...this.enabled];
  }

  destroy() { this.root.remove(); }
}
