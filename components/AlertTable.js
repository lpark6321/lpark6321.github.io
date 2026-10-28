// 警示表格元件：依嚴重度呈現警示清單與樣式分類。
function sevClass(sev) {
  return sev === 'high' ? 'badge--high' : sev === 'mid' ? 'badge--mid' : 'badge--low';
}

// AlertTable：類別用途註解，集中管理相關狀態與方法。
export class AlertTable {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.onSelect = options.onSelect || (() => {});
    this.sortKey = 'triggered';
    this.asc = false;
    this.zoom = 1;
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = `
      <div class="panel__header">
        <span class="panel__badge">A</span>
        <h3 class="panel__title">型態提醒</h3>
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button class="zoom-out" title="縮小">A-</button>
          <button class="zoom-in" title="放大">A+</button>
        </div>
      </div>
      <div class="panel__body table-wrap">
        <table>
          <thead><tr>
            <th data-k="code">股票</th><th data-k="price">現價</th><th data-k="changePct">漲跌%</th><th>觸發型態</th><th data-k="triggered">時間</th><th data-k="severity">嚴重度</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    this.tbody = this.root.querySelector('tbody');

    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.zoom-out').addEventListener('click', () => this.adjustZoom(-0.1));
    // 段落說明：綁定使用者互動事件。
    this.root.querySelector('.zoom-in').addEventListener('click', () => this.adjustZoom(0.1));

    this.root.querySelectorAll('th[data-k]').forEach((th) => {
      // 段落說明：綁定使用者互動事件。
      th.addEventListener('click', () => {
        const k = th.dataset.k;
        this.asc = this.sortKey === k ? !this.asc : true;
        this.sortKey = k;
        this.update(this.data || []);
      });
    });
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    this.applyZoom();
  }

  // applyZoom：方法用途註解，處理此元件或類別的一段行為。
  applyZoom() {
    this.root.querySelector('.table-wrap').style.zoom = String(this.zoom);
  }

  // adjustZoom：方法用途註解，處理此元件或類別的一段行為。
  adjustZoom(delta) {
    this.zoom = Math.min(1.4, Math.max(0.8, +(this.zoom + delta).toFixed(2)));
    this.applyZoom();
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(data = []) {
    this.data = [...data].sort((a, b) => {
      const x = a[this.sortKey];
      const y = b[this.sortKey];
      if (x === y) return 0;
      return this.asc ? (x > y ? 1 : -1) : (x < y ? 1 : -1);
    });

    // 段落說明：更新 DOM 內容。
    this.tbody.innerHTML = this.data.map((r, idx) => `
      <tr class="${idx === 0 ? 'flash-new' : ''}" data-code="${r.code}">
        <td>${r.code} ${r.name}</td>
        <td>${r.price}</td>
        <td class="${r.changePct >= 0 ? 'metric-up' : 'metric-down'}">${r.changePct}%</td>
        <td>${r.patterns.map((p) => `<span class="badge badge--mid">${p}</span>`).join(' ')}</td>
        <td>${r.triggered}</td>
        <td><span class="badge ${sevClass(r.severity)}">${r.severity}</span></td>
      </tr>
    `).join('');

    this.tbody.querySelectorAll('tr').forEach((tr) => {
      // 段落說明：綁定使用者互動事件。
      tr.addEventListener('click', () => this.onSelect(tr.dataset.code));
    });
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
