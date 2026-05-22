// 通用面板元件：提供標題、徽章、內容容器與銷毀方法。
export class Panel {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = `
      <div class="panel__header">
        <span class="panel__badge">${options.badge || ''}</span>
        <h3 class="panel__title">${options.title || ''}</h3>
      </div>
      <div class="panel__body"></div>
    `;
    this.body = this.root.querySelector('.panel__body');
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
  }

  // setContent：方法用途註解，處理此元件或類別的一段行為。
  setContent(node) {
    // 段落說明：更新 DOM 內容。
    this.body.innerHTML = '';
    if (typeof node === 'string') {
      // 段落說明：更新 DOM 內容。
      this.body.innerHTML = node;
      return;
    }
    // 段落說明：將建立好的節點掛回頁面。
    if (node) this.body.appendChild(node);
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.root.remove();
  }
}
