// 選擇權鏈元件：呈現履約價、買賣權報價與互動選取。
import { store } from '../data/store.js';

// ChainViewer：類別用途註解，集中管理相關狀態與方法。
export class ChainViewer {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.onStrike = options.onStrike || (() => {});
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">C</span><h3 class="panel__title">Option Chain</h3></div>
      <div class="panel__body table-wrap"><table><thead><tr><th>Call</th><th>履約價</th><th>Put</th></tr></thead><tbody></tbody></table></div>
    `;
    this.tbody = this.root.querySelector('tbody');
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
  }

  update(chain = store.get('optionsChain')) {
    // rows：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const rows = chain.calls.map((c, i) => ({ call: c, put: chain.puts[i] })).sort((a, b) => a.call.strike - b.call.strike);
    // 段落說明：更新 DOM 內容。
    this.tbody.innerHTML = rows.map((r) => `
      <tr data-strike="${r.call.strike}">
        <td>${r.call.bid}/${r.call.ask}</td>
        <td>${r.call.strike}</td>
        <td>${r.put.bid}/${r.put.ask}</td>
      </tr>
    `).join('');
    // 段落說明：綁定使用者互動事件。
    this.tbody.querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => this.onStrike(Number(tr.dataset.strike))));
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
