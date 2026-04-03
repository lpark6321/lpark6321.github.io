function colorOf(num) {
  if (num > 0) return 'metric-up';
  if (num < 0) return 'metric-down';
  return 'metric-flat';
}

export class PriceTable {
  constructor(container, options = {}) {
    this.root = document.createElement('div');
    this.root.className = 'table-wrap';
    this.table = document.createElement('table');
    this.table.innerHTML = `
      <thead>
        <tr><th>欄位</th><th>值</th></tr>
      </thead>
      <tbody></tbody>
    `;
    this.tbody = this.table.querySelector('tbody');
    this.root.appendChild(this.table);
    container.appendChild(this.root);
    if (options.rows) this.update(options.rows);
  }

  update(rows = []) {
    this.tbody.innerHTML = rows.map((r) => {
      const cls = typeof r.value === 'number' ? colorOf(r.value) : '';
      const val = typeof r.value === 'number' ? r.value.toLocaleString() : r.value;
      return `<tr><td>${r.label}</td><td class="${cls}">${val}</td></tr>`;
    }).join('');
  }

  destroy() {
    this.root.remove();
  }
}
