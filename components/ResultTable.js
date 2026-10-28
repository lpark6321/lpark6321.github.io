// 篩選結果表格元件：呈現股票清單、漲跌、走勢與操作欄位。
import { Sparkline } from './Sparkline.js';

const COLS = [
  { key: '_sel', label: '', sortable: false },
  { key: 'code', label: '代碼', sortable: true },
  { key: 'name', label: '名稱', sortable: true },
  { key: 'price', label: '價格', sortable: true },
  { key: 'changePct', label: '漲跌%', sortable: true },
  { key: 'sector', label: '類股', sortable: true },
  { key: '_spark', label: '趨勢', sortable: false }
];

// ResultTable：類別用途註解，集中管理相關狀態與方法。
export class ResultTable {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.page = 1;
    this.pageSize = 50;
    this.sortKey = 'code';
    this.asc = true;
    this.selected = new Set();
    this.sparkRefs = [];
    this.colOrder = COLS.map((c) => c.key);
    this.dragCol = null;

    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">R</span><h3 class="panel__title">篩選結果（欄位可拖曳）</h3></div>
      <div class="panel__body">
        <div class="table-wrap"><table><thead><tr></tr></thead><tbody></tbody></table></div>
        <div style="display:flex;justify-content:space-between;margin-top:8px">
          <button class="prev">上一頁</button><span class="page"></span><button class="next">下一頁</button>
        </div>
      </div>
    `;
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    this.theadRow = this.root.querySelector('thead tr');
    this.tbody = this.root.querySelector('tbody');

    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.prev').addEventListener('click', () => { this.page = Math.max(1, this.page - 1); this.update(this.data || []); });
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.next').addEventListener('click', () => { this.page += 1; this.update(this.data || []); });
  }

  // getCol：方法用途註解，處理此元件或類別的一段行為。
  getCol(key) {
    return COLS.find((c) => c.key === key);
  }

  // renderHead：方法用途註解，處理此元件或類別的一段行為。
  renderHead() {
    // 段落說明：更新 DOM 內容。
    this.theadRow.innerHTML = this.colOrder.map((key) => {
      const col = this.getCol(key);
      return `<th data-k="${key}" ${col.sortable ? '' : ''} ${key !== '_sel' ? 'draggable="true"' : ''}>${col.label}</th>`;
    }).join('');

    this.theadRow.querySelectorAll('th').forEach((th) => {
      const key = th.dataset.k;
      const col = this.getCol(key);

      if (col.sortable) {
        th.style.cursor = 'pointer';
        // 段落說明：綁定使用者互動事件。
        th.addEventListener('click', () => {
          this.asc = this.sortKey === key ? !this.asc : true;
          this.sortKey = key;
          this.update(this.data || []);
        });
      }

      if (key !== '_sel') {
        // 段落說明：綁定使用者互動事件。
        th.addEventListener('dragstart', () => { this.dragCol = key; });
        // 段落說明：綁定使用者互動事件。
        th.addEventListener('dragover', (e) => e.preventDefault());
        // 段落說明：綁定使用者互動事件。
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

  // cellHtml：方法用途註解，處理此元件或類別的一段行為。
  cellHtml(row, key) {
    if (key === '_sel') return `<input type="checkbox" ${this.selected.has(row.code) ? 'checked' : ''}>`;
    if (key === '_spark') return `<div class="spark-${row.code}"></div>`;
    if (key === 'changePct') return `<span class="${row.changePct >= 0 ? 'metric-up' : 'metric-down'}">${row.changePct}%</span>`;
    return `${row[key]}`;
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(data = []) {
    this.sparkRefs.forEach((s) => s.destroy());
    this.sparkRefs = [];

    // sorted：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const sorted = [...data].sort((a, b) => {
      const x = a[this.sortKey];
      const y = b[this.sortKey];
      if (x === y) return 0;
      return this.asc ? (x > y ? 1 : -1) : (x < y ? 1 : -1);
    });

    const totalPage = Math.max(1, Math.ceil(sorted.length / this.pageSize));
    if (this.page > totalPage) this.page = totalPage;
    const begin = (this.page - 1) * this.pageSize;
    const rows = sorted.slice(begin, begin + this.pageSize);
    this.data = sorted;

    this.renderHead();

    // 段落說明：更新 DOM 內容。
    this.tbody.innerHTML = rows.map((r) => `
      <tr data-code="${r.code}">
        ${this.colOrder.map((key) => `<td>${this.cellHtml(r, key)}</td>`).join('')}
      </tr>
    `).join('');

    rows.forEach((r) => {
      const el = this.tbody.querySelector(`.spark-${r.code}`);
      if (!el) return;
      const spark = new Sparkline(el, { width: 90, height: 28, color: r.changePct >= 0 ? 'rgb(240,58,95)' : 'rgb(31,214,122)' });
      spark.update(r.sparkline || []);
      this.sparkRefs.push(spark);
    });

    this.tbody.querySelectorAll('tr').forEach((tr) => {
      const ck = tr.querySelector('input[type=checkbox]');
      if (!ck) return;
      // 段落說明：綁定使用者互動事件。
      ck.addEventListener('change', (e) => {
        if (e.target.checked) this.selected.add(tr.dataset.code);
        else this.selected.delete(tr.dataset.code);
        this.onSelectionChange([...this.selected]);
      });
    });

    this.root.querySelector('.page').textContent = `${this.page} / ${totalPage}`;
  }

  // getSelectedCodes：方法用途註解，處理此元件或類別的一段行為。
  getSelectedCodes() { return [...this.selected]; }
  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.sparkRefs.forEach((s) => s.destroy()); this.root.remove(); }
}
