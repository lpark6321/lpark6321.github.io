// 型態提醒表格元件（Page3）：觸發的股票、型態、時間與嚴重度；新觸發的列閃一下；可開啟瀏覽器桌面通知。
import { esc } from '../services/html.js';
import { isPatternNotifyEnabled, setPatternNotify } from '../services/patternEngine.js';
import { fmtNum, fmtPct, trendClass } from '../services/quoteUtils.js';

const SEVERITY = {
  high: { label: '高', className: 'badge--high', rank: 3 },
  mid: { label: '中', className: 'badge--mid', rank: 2 },
  low: { label: '低', className: 'badge--low', rank: 1 }
};
const alertKey = (row) => `${row.date}|${row.code}|${row.patternId}`;
// 排序用的值：時間依觸發毫秒、嚴重度依等級。
const sortValue = (row, key) => (key === 'triggered' ? row.triggeredAt : key === 'severity' ? SEVERITY[row.severity]?.rank : row[key]);

export class AlertTable {
  constructor(container, options = {}) {
    this.onSelect = options.onSelect || (() => {});
    this.sortKey = 'triggered';
    this.asc = false;
    this.zoom = 1;
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header">
        <span class="panel__badge">A</span>
        <h3 class="panel__title">型態提醒</h3>
        <div class="alert-table__actions">
          <label title="觸發時跳出瀏覽器通知，切到其他分頁也看得到"><input type="checkbox" class="notify-toggle"> 桌面通知</label>
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
    this.seen = null;

    const notifyToggle = this.root.querySelector('.notify-toggle');
    notifyToggle.checked = isPatternNotifyEnabled();
    notifyToggle.addEventListener('change', async () => {
      notifyToggle.checked = await setPatternNotify(notifyToggle.checked);
    });

    this.root.querySelector('.zoom-out').addEventListener('click', () => this.adjustZoom(-0.1));
    this.root.querySelector('.zoom-in').addEventListener('click', () => this.adjustZoom(0.1));

    this.root.querySelectorAll('th[data-k]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.dataset.k;
        this.asc = this.sortKey === k ? !this.asc : true;
        this.sortKey = k;
        this.update(this.data || []);
      });
    });
    container.appendChild(this.root);
    this.applyZoom();
  }

  applyZoom() {
    this.root.querySelector('.table-wrap').style.zoom = String(this.zoom);
  }

  adjustZoom(delta) {
    this.zoom = Math.min(1.4, Math.max(0.8, +(this.zoom + delta).toFixed(2)));
    this.applyZoom();
  }

  update(data = []) {
    this.data = [...data].sort((a, b) => {
      const x = sortValue(a, this.sortKey);
      const y = sortValue(b, this.sortKey);
      if (x === y) return 0;
      return this.asc ? (x > y ? 1 : -1) : (x < y ? 1 : -1);
    });

    // 第一次畫的時候全部算「看過」；之後新出現的列才閃。
    const fresh = this.seen ? new Set(this.data.map(alertKey).filter((key) => !this.seen.has(key))) : new Set();
    this.seen = new Set(this.data.map(alertKey));

    if (!this.data.length) {
      this.tbody.innerHTML = '<tr><td colspan="6" class="alert-table__empty">尚無觸發。勾選的型態會在自選股上檢查（日 K 加上目前來源的即時價）。</td></tr>';
      return;
    }
    this.tbody.innerHTML = this.data.map((r) => `
      <tr class="${fresh.has(alertKey(r)) ? 'flash-new' : ''}" data-code="${esc(r.code)}">
        <td>${esc(r.code)} ${esc(r.name)}</td>
        <td>${fmtNum(r.price)}</td>
        <td class="${trendClass(r.changePct)}">${fmtPct(r.changePct)}</td>
        <td>${r.patterns.map((p) => `<span class="badge badge--mid">${esc(p)}</span>`).join(' ')}</td>
        <td>${esc(r.triggered)}</td>
        <td><span class="badge ${SEVERITY[r.severity]?.className || 'badge--low'}">${SEVERITY[r.severity]?.label || '--'}</span></td>
      </tr>
    `).join('');

    this.tbody.querySelectorAll('tr').forEach((tr) => {
      tr.addEventListener('click', () => this.onSelect(tr.dataset.code));
    });
  }

  destroy() { this.root.remove(); }
}
