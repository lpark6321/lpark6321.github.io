import { Sparkline } from './Sparkline.js';

export class StockCard {
  constructor(container, options = {}) {
    this.root = document.createElement('article');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__body">
        <div class="card-top">
          <div>
            <div class="code"></div>
            <div class="name" style="color:var(--text2);font-size:12px"></div>
          </div>
          <div class="price" style="font-family:var(--font-mono);font-size:18px"></div>
        </div>
        <div class="change" style="margin:6px 0"></div>
        <div class="spark"></div>
      </div>
    `;
    this.codeEl = this.root.querySelector('.code');
    this.nameEl = this.root.querySelector('.name');
    this.priceEl = this.root.querySelector('.price');
    this.changeEl = this.root.querySelector('.change');
    this.spark = new Sparkline(this.root.querySelector('.spark'), { width: 130, height: 38 });
    container.appendChild(this.root);
    this.update(options.stock || null);
  }

  update(stock) {
    if (!stock) return;
    const up = stock.changePct >= 0;
    this.codeEl.textContent = stock.code;
    this.nameEl.textContent = stock.name;
    this.priceEl.textContent = stock.price;
    this.priceEl.className = `price ${up ? 'metric-up' : 'metric-down'}`;
    this.changeEl.textContent = `${up ? '+' : ''}${stock.changePct}%`;
    this.changeEl.className = up ? 'metric-up' : 'metric-down';
    this.spark.options.color = up ? 'rgb(240,58,95)' : 'rgb(31,214,122)';
    this.spark.update(stock.sparkline || []);
  }

  destroy() {
    this.spark.destroy();
    this.root.remove();
  }
}

