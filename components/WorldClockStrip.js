// 世界時鐘列元件：顯示多市場城市時間與交易狀態。標籤只建一次，由頁面共用的每秒時鐘呼叫 tick() 改文字與顏色。
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
    this.root.innerHTML = `<div class="panel__body clocks">${CITIES.map(() => '<span class="badge"></span>').join('')}</div>`;
    this.badges = [...this.root.querySelectorAll('.badge')];
    container.appendChild(this.root);
    this.tick();
  }

  tick(now = new Date()) {
    CITIES.forEach((c, i) => {
      this.badges[i].textContent = `${c.name} ${fmt(now, c.tz)}`;
      this.badges[i].className = `badge ${this.isOpen(c.marketId) ? 'badge--high' : 'badge--low'}`;
    });
  }

  destroy() {
    this.root.remove();
  }
}
