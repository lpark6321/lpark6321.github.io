export class SectorGroupHeader {
  constructor(container, options = {}) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:6px 0';
    container.appendChild(this.root);
    this.onClick = options.onClick || (() => {});
  }

  update(sectors = []) {
    this.root.innerHTML = sectors.map((s) => `<button data-sector="${s}">${s}</button>`).join('');
    this.root.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => this.onClick(btn.dataset.sector)));
  }

  destroy() { this.root.remove(); }
}
