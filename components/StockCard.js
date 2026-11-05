// 股票卡片元件：呈現單檔股票報價、漲跌與迷你走勢。
import { Sparkline } from './Sparkline.js';

// 還沒拿到報價的欄位顯示「--」。
const show = (value) => (value != null && Number.isFinite(Number(value)) ? value : '--');

export class StockCard {
  constructor(container, options = {}) {
    this.root = document.createElement('article');
    this.root.className = 'panel stock-card';
    this.root.innerHTML = `
      <div class="panel__body">
        <div class="card-top">
          <div>
            <div class="code"></div>
            <div class="name"></div>
          </div>
          <div class="price"></div>
        </div>
        <div class="change"></div>
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
    const hasQuote = Number.isFinite(Number(stock.changePct));
    const up = stock.changePct >= 0;
    const tone = hasQuote ? (up ? 'metric-up' : 'metric-down') : '';
    this.codeEl.textContent = stock.code;
    this.nameEl.textContent = stock.name;
    this.priceEl.textContent = show(stock.price);
    this.priceEl.className = `price ${tone}`;
    this.changeEl.textContent = hasQuote ? `${up ? '+' : ''}${stock.changePct}%` : '--';
    this.changeEl.className = `change ${tone}`;
    this.spark.options.color = up ? 'rgb(240,58,95)' : 'rgb(31,214,122)';
    this.spark.update(stock.sparkline || [], stock.sparklineBaseline ?? null);
  }

  destroy() {
    this.spark.destroy();
    this.root.remove();
  }
}
