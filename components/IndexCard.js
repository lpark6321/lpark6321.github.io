// 指數卡片元件（Page7）：建立一次，之後只改有變化的文字與顏色。走勢小圖的最後一點跟著現價移動；
// 倒數與開收盤標籤由頁面共用的每秒計時器呼叫 tick() 更新；價格真的變了才閃一下。
import { Sparkline } from './Sparkline.js';
import { getMarketStatus, getNextEvent } from '../services/marketCalendar.js';
import { fmtPct, hasValue, orDash } from '../services/quoteUtils.js';

const STATUS_TEXT = {
  open: '開盤中',
  closed: '已收盤',
  pre: '盤前',
  after: '盤後'
};

function tone(value) {
  if (!hasValue(value)) return '';
  return value >= 0 ? 'metric-up' : 'metric-down';
}

function toHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60].map((v) => String(v).padStart(2, '0')).join(':');
}

export class IndexCard {
  constructor(container, options = {}) {
    this.root = document.createElement('article');
    this.root.className = 'panel index-card';
    this.root.innerHTML = `
      <div class="panel__body">
        <div class="index-card__head">
          <div>
            <div class="index-card__title"></div>
            <div class="index-card__sub"></div>
          </div>
          <span class="badge status"></span>
        </div>
        <div class="index-card__price"></div>
        <div class="index-card__chg"></div>
        <div class="index-card__spark"></div>
        <div class="index-card__timer"></div>
        <div class="index-card__ohlc"></div>
      </div>
    `;
    const $ = (selector) => this.root.querySelector(selector);
    this.el = {
      title: $('.index-card__title'),
      sub: $('.index-card__sub'),
      status: $('.status'),
      price: $('.index-card__price'),
      chg: $('.index-card__chg'),
      timer: $('.index-card__timer'),
      ohlc: $('.index-card__ohlc')
    };
    this.spark = new Sparkline($('.index-card__spark'), { width: 220, height: 44, color: 'rgb(240,58,95)' });
    this.id = options.data?.id;
    this.last = {};
    container.appendChild(this.root);
    this.update(options.data || null);
    this.tick();
  }

  // 只在值改變時寫 DOM。
  setText(key, text, className) {
    if (this.last[key] === text && this.last[`${key}Class`] === className) return;
    this.last[key] = text;
    this.last[`${key}Class`] = className;
    this.el[key].textContent = text;
    if (className !== undefined) this.el[key].className = className;
  }

  update(data) {
    if (!data) return;
    this.data = data;
    this.setText('title', `${data.flag} ${data.name}`);
    this.setText('sub', data.fullName);

    const priceChanged = hasValue(this.last.priceValue) && hasValue(data.price) && this.last.priceValue !== data.price;
    this.last.priceValue = data.price;
    this.setText('price', String(orDash(data.price)), `index-card__price ${tone(data.changePct)}`);
    const chg = hasValue(data.change) ? `${data.change >= 0 ? '+' : ''}${data.change} (${fmtPct(data.changePct)})` : '--';
    this.setText('chg', chg, `index-card__chg ${tone(data.changePct)}`);
    this.setText('ohlc', `O ${orDash(data.open)} H ${orDash(data.high)} L ${orDash(data.low)}`);

    // 5 分 K 走勢每分鐘才換一次，期間讓最後一點跟著現價走；序列沒變就不重畫。
    const series = Array.isArray(data.sparkline) && data.sparkline.length && hasValue(data.price)
      ? [...data.sparkline.slice(0, -1), Number(data.price)]
      : [];
    const seriesKey = `${series.length}|${series[0]}|${series.at(-1)}|${tone(data.changePct)}`;
    if (seriesKey !== this.last.seriesKey) {
      this.last.seriesKey = seriesKey;
      this.spark.options.color = data.changePct >= 0 ? 'rgb(240,58,95)' : 'rgb(31,214,122)';
      this.spark.update(series, hasValue(data.prevClose) ? data.prevClose : null);
    }

    if (priceChanged) {
      this.root.classList.remove('flash-new');
      void this.root.offsetWidth; // 重新觸發動畫
      this.root.classList.add('flash-new');
    }
  }

  // 由頁面每秒呼叫：倒數文字每次更新，開收盤標籤只在狀態改變時才改。
  tick(now = new Date()) {
    if (!this.id) return;
    const status = getMarketStatus(this.id, now);
    this.setText('status', STATUS_TEXT[status] || status, `badge status ${status === 'open' ? 'badge--high' : 'badge--low'}`);
    const next = getNextEvent(this.id, now);
    const left = next?.utcTime ? next.utcTime - now : NaN;
    this.setText('timer', Number.isFinite(left) ? toHMS(left) : '', `index-card__timer ${left <= 300000 ? 'is-soon' : ''}`);
  }

  destroy() {
    this.spark.destroy();
    this.root.remove();
  }
}
