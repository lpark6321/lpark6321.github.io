// 篩選結果表格元件（Page5）：可排序、分頁、拖曳欄位、勾選後加入自選。
// 「趨勢」欄保留但停用：證交所盤後資料只有當日一筆，沒有歷史走勢可畫。
import { esc } from '../services/html.js';
import { fmtNum, fmtPct, trendClass } from '../services/quoteUtils.js';

const COLS = [
  { key: '_sel', label: '', sortable: false },
  { key: 'code', label: '代碼', sortable: true },
  { key: 'name', label: '名稱', sortable: true },
  { key: 'price', label: '收盤價', sortable: true },
  { key: 'changePct', label: '漲跌%', sortable: true },
  { key: 'pe', label: '本益比', sortable: true },
  { key: 'dividendYield', label: '殖利率%', sortable: true },
  { key: 'pb', label: '股價淨值比', sortable: true },
  { key: 'volume', label: '成交量(張)', sortable: true },
  { key: '_spark', label: '趨勢', sortable: false, disabled: true, title: '需要歷史 K 線，目前資料只有當日一筆' }
];

export class ResultTable {
  constructor(container, options = {}) {
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.page = 1;
    this.pageSize = 50;
    this.sortKey = 'code';
    this.asc = true;
    this.selected = new Set();
    this.colOrder = COLS.map((c) => c.key);
    this.dragCol = null;

    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">R</span><h3 class="panel__title">篩選結果（欄位可拖曳）</h3></div>
      <div class="panel__body">
        <div class="table-wrap"><table><thead><tr></tr></thead><tbody></tbody></table></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px">
          <button class="prev">上一頁</button><span class="page"></span><button class="next">下一頁</button>
        </div>
      </div>
    `;
    container.appendChild(this.root);
    this.theadRow = this.root.querySelector('thead tr');
    this.tbody = this.root.querySelector('tbody');

    this.root.querySelector('.prev').addEventListener('click', () => { this.page = Math.max(1, this.page - 1); this.update(this.data || []); });
    this.root.querySelector('.next').addEventListener('click', () => { this.page += 1; this.update(this.data || []); });
  }

  getCol(key) {
    return COLS.find((c) => c.key === key);
  }

  renderHead() {
    this.theadRow.innerHTML = this.colOrder.map((key) => {
      const col = this.getCol(key);
      return `<th data-k="${key}" class="${col.disabled ? 'is-disabled' : ''}" ${col.title ? `title="${col.title}"` : ''} ${key !== '_sel' ? 'draggable="true"' : ''}>${col.label}</th>`;
    }).join('');

    this.theadRow.querySelectorAll('th').forEach((th) => {
      const key = th.dataset.k;
      const col = this.getCol(key);

      if (col.sortable) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          this.asc = this.sortKey === key ? !this.asc : true;
          this.sortKey = key;
          this.update(this.data || []);
        });
      }

      if (key !== '_sel') {
        th.addEventListener('dragstart', () => { this.dragCol = key; });
        th.addEventListener('dragover', (e) => e.preventDefault());
        th.addEventListener('drop', () => {
          if (!this.dragCol || this.dragCol === key) return;
          const from = this.colOrder.indexOf(this.dragCol);
          const to = this.colOrder.indexOf(key);
          if (from < 0 || to < 0) return;
          const next = [...this.colOrder];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          this.colOrder = next;
          this.update(this.data || []);
        });
      }
    });
  }

  cellHtml(row, key) {
    if (key === '_sel') return `<input type="checkbox" ${this.selected.has(row.code) ? 'checked' : ''}>`;
    if (key === '_spark') return '<span class="is-disabled">—</span>';
    if (key === 'changePct') return `<span class="${trendClass(row.changePct)}">${fmtPct(row.changePct)}</span>`;
    if (key === 'volume') return fmtNum(row.volume, 0);
    if (['price', 'pe', 'dividendYield', 'pb'].includes(key)) return fmtNum(row[key]);
    return esc(row[key] ?? '');
  }

  update(data = []) {
    // 沒有值的一律排在最後，不論升冪或降冪。
    const sorted = [...data].sort((a, b) => {
      const x = a[this.sortKey];
      const y = b[this.sortKey];
      const xMissing = x == null || x === '';
      const yMissing = y == null || y === '';
      if (xMissing || yMissing) return xMissing === yMissing ? 0 : xMissing ? 1 : -1;
      if (x === y) return 0;
      return this.asc ? (x > y ? 1 : -1) : (x < y ? 1 : -1);
    });

    const totalPage = Math.max(1, Math.ceil(sorted.length / this.pageSize));
    if (this.page > totalPage) this.page = totalPage;
    const begin = (this.page - 1) * this.pageSize;
    const rows = sorted.slice(begin, begin + this.pageSize);
    this.data = sorted;

    this.renderHead();

    this.tbody.innerHTML = rows.map((r) => `
      <tr data-code="${esc(r.code)}">
        ${this.colOrder.map((key) => `<td>${this.cellHtml(r, key)}</td>`).join('')}
      </tr>
    `).join('');

    this.tbody.querySelectorAll('tr').forEach((tr) => {
      const ck = tr.querySelector('input[type=checkbox]');
      if (!ck) return;
      ck.addEventListener('change', (e) => {
        if (e.target.checked) this.selected.add(tr.dataset.code);
        else this.selected.delete(tr.dataset.code);
        this.onSelectionChange([...this.selected]);
      });
    });

    this.root.querySelector('.page').textContent = `${this.page} / ${totalPage}`;
  }

  getSelectedCodes() { return [...this.selected]; }
  destroy() { this.root.remove(); }
}
