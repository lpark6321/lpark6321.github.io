// Greeks 表格元件：呈現選擇權 Greeks 與風險數值。
export class GreeksTable {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container) {
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = `
      <div class="panel__header"><span class="panel__badge">G</span><h3 class="panel__title">Greeks</h3></div>
      <div class="panel__body table-wrap"><table><thead><tr><th>腿</th><th>Delta</th><th>Gamma</th><th>Theta</th><th>Vega</th></tr></thead><tbody></tbody><tfoot></tfoot></table></div>
    `;
    this.tbody = this.root.querySelector('tbody');
    this.tfoot = this.root.querySelector('tfoot');
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(legs = [], chain) {
    // rows：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const rows = legs.map((l, i) => {
      const mul = l.action === 'buy' ? 1 : -1;
      if (l.type === 'future') {
        return { i: i + 1, delta: 1 * mul * l.qty, gamma: 0, theta: 0, vega: 0 };
      }
      // row：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
      const row = (l.type === 'call' ? chain.calls : chain.puts).find((x) => x.strike === l.strike);
      return {
        i: i + 1,
        delta: (row?.delta || 0) * mul * l.qty,
        gamma: (row?.gamma || 0) * mul * l.qty,
        theta: (row?.theta || 0) * mul * l.qty,
        vega: (row?.vega || 0) * mul * l.qty
      };
    });

    // total：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const total = rows.reduce((a, r) => ({
      delta: a.delta + r.delta,
      gamma: a.gamma + r.gamma,
      theta: a.theta + r.theta,
      vega: a.vega + r.vega
    }), { delta: 0, gamma: 0, theta: 0, vega: 0 });

    // 段落說明：更新 DOM 內容。
    this.tbody.innerHTML = rows.map((r) => `<tr><td>Leg ${r.i}</td><td>${r.delta.toFixed(3)}</td><td>${r.gamma.toFixed(3)}</td><td>${r.theta.toFixed(3)}</td><td>${r.vega.toFixed(3)}</td></tr>`).join('');
    // 段落說明：更新 DOM 內容。
    this.tfoot.innerHTML = `<tr><th>Net</th><th>${total.delta.toFixed(3)}</th><th>${total.gamma.toFixed(3)}</th><th>${total.theta.toFixed(3)}</th><th>${total.vega.toFixed(3)}</th></tr>`;
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
