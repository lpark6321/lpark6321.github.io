export class Panel {
  constructor(container, options = {}) {
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__header">
        <span class="panel__badge">${options.badge || ''}</span>
        <h3 class="panel__title">${options.title || ''}</h3>
      </div>
      <div class="panel__body"></div>
    `;
    this.body = this.root.querySelector('.panel__body');
    container.appendChild(this.root);
  }

  setContent(node) {
    this.body.innerHTML = '';
    if (typeof node === 'string') {
      this.body.innerHTML = node;
      return;
    }
    if (node) this.body.appendChild(node);
  }

  destroy() {
    this.root.remove();
  }
}
