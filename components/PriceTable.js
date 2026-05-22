// 價格表格元件：以漲跌顏色呈現行情列。
function colorOf(num) {
  if (num > 0) return 'metric-up';
  if (num < 0) return 'metric-down';
  return 'metric-flat';
}

// PriceTable：類別用途註解，集中管理相關狀態與方法。
export class PriceTable {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('div');
    this.root.className = 'table-wrap';
    // 段落說明：建立新的 DOM 節點。
    this.table = document.createElement('table');
    // 段落說明：更新 DOM 內容。
    this.table.innerHTML = `
      <thead>
        <tr><th>欄位</th><th>值</th></tr>
      </thead>
      <tbody></tbody>
    `;
    this.tbody = this.table.querySelector('tbody');
    // 段落說明：將建立好的節點掛回頁面。
    this.root.appendChild(this.table);
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    if (options.rows) this.update(options.rows);
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(rows = []) {
    // 段落說明：更新 DOM 內容。
    this.tbody.innerHTML = rows.map((r) => {
      const cls = typeof r.value === 'number' ? colorOf(r.value) : '';
      const val = typeof r.value === 'number' ? r.value.toLocaleString() : r.value;
      return `<tr><td>${r.label}</td><td class="${cls}">${val}</td></tr>`;
    }).join('');
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.root.remove();
  }
}
