import { Sparkline } from './Sparkline.js';
import { StatusCountdown } from './StatusCountdown.js';
import { getMarketStatus, getNextEvent } from '../services/marketCalendar.js';

function cls(num) {
  return num >= 0 ? 'metric-up' : 'metric-down';
}

const STATUS_TEXT = {
  open: '開盤中',
  closed: '已收盤',
  pre: '盤前',
  after: '盤後'
};

export class IndexCard {
  constructor(container, options = {}) {
    this.root = document.createElement('article');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <div class="panel__body">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="title" style="font-weight:700"></div>
            <div class="sub" style="font-size:12px;color:var(--text2)"></div>
          </div>
          <span class="badge status"></span>
        </div>
        <div class="price" style="font-size:28px;font-family:var(--font-mono);margin-top:6px"></div>
        <div class="chg" style="margin:4px 0 6px"></div>
        <div class="spark"></div>
        <div class="timer" style="margin-top:6px;font-size:12px"></div>
        <div class="ohlc" style="margin-top:6px;font-size:12px;color:var(--text2)"></div>
      </div>
    `;
    this.spark = new Sparkline(this.root.querySelector('.spark'), { width: 220, height: 44, color: 'rgb(240,58,95)' });
    this.countdown = new StatusCountdown(this.root.querySelector('.timer'));
    container.appendChild(this.root);
    this.update(options.data || null);
  }

  update(data) {
    if (!data) return;
    const status = getMarketStatus(data.id, new Date());
    const next = getNextEvent(data.id, new Date());
    const up = data.changePct >= 0;
    this.root.querySelector('.title').textContent = `${data.flag} ${data.name}`;
    this.root.querySelector('.sub').textContent = data.fullName;
    const badge = this.root.querySelector('.status');
    badge.textContent = STATUS_TEXT[status] || status;
    badge.className = `badge status ${status === 'open' ? 'badge--high' : 'badge--low'}`;

    this.root.querySelector('.price').textContent = data.price;
    this.root.querySelector('.price').className = `price ${cls(data.changePct)}`;
    this.root.querySelector('.chg').textContent = `${data.change >= 0 ? '+' : ''}${data.change} (${data.changePct >= 0 ? '+' : ''}${data.changePct}%)`;
    this.root.querySelector('.chg').className = `chg ${cls(data.changePct)}`;

    this.spark.options.color = up ? 'rgb(240,58,95)' : 'rgb(31,214,122)';
    this.spark.update(data.sparkline || [], data.prevClose);

    this.root.querySelector('.ohlc').textContent = `O ${data.open} H ${data.high} L ${data.low}`;
    if (next?.utcTime) this.countdown.update(next.utcTime);
  }

  destroy() {
    this.countdown.destroy();
    this.spark.destroy();
    this.root.remove();
  }
}
