const CITIES = [
  { name: '台北', tz: 'Asia/Taipei', marketId: 'usdtwd' },
  { name: '首爾', tz: 'Asia/Seoul', marketId: 'kospi' },
  { name: '東京', tz: 'Asia/Tokyo', marketId: 'nikkei' },
  { name: '倫敦', tz: 'Europe/London', marketId: 'gold' },
  { name: '紐約', tz: 'America/New_York', marketId: 'nasdaq' }
];

function fmt(now, tz) {
  return now.toLocaleTimeString('zh-TW', { hour12: false, timeZone: tz });
}

export class WorldClockStrip {
  constructor(container, options = {}) {
    this.isOpen = options.isOpen || (() => false);
    this.root = document.createElement('section');
    this.root.className = 'panel';
    this.root.innerHTML = '<div class="panel__body clocks" style="display:flex;gap:10px;flex-wrap:wrap"></div>';
    this.wrap = this.root.querySelector('.clocks');
    container.appendChild(this.root);
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    const now = new Date();
    this.wrap.innerHTML = CITIES.map((c) => {
      const open = this.isOpen(c.marketId);
      return `<span class="badge ${open ? 'badge--high' : 'badge--low'}">${c.name} ${fmt(now, c.tz)}</span>`;
    }).join('');
  }

  destroy() {
    clearInterval(this.timer);
    this.root.remove();
  }
}
