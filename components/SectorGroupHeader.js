// 類股群組標題元件：呈現群組名稱與摘要資訊。
export class SectorGroupHeader {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('div');
    this.root.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:6px 0';
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    this.onClick = options.onClick || (() => {});
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(sectors = []) {
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = sectors.map((s) => `<button data-sector="${s}">${s}</button>`).join('');
    // 段落說明：綁定使用者互動事件。
    this.root.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => this.onClick(btn.dataset.sector)));
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  // 段落說明：移除 DOM 節點或釋放畫面資源。
  destroy() { this.root.remove(); }
}
