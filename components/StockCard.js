// 股票卡片元件：呈現單檔股票報價、漲跌與迷你走勢。
import { Sparkline } from './Sparkline.js';

// StockCard：類別用途註解，集中管理相關狀態與方法。
export class StockCard {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('article');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
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
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    this.update(options.stock || null);
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
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
    this.spark.update(stock.sparkline || [], stock.sparklineBaseline ?? null);
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    this.spark.destroy();
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.root.remove();
  }
}
