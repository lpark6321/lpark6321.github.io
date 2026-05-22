// 世界時鐘列元件：顯示多市場城市時間與交易狀態。
const CITIES = [
  { name: '台北', tz: 'Asia/Taipei', marketId: 'usdtwd' },
  { name: '首爾', tz: 'Asia/Seoul', marketId: 'kospi' },
  { name: '東京', tz: 'Asia/Tokyo', marketId: 'nikkei' },
  { name: '倫敦', tz: 'Europe/London', marketId: 'gold' },
  { name: '紐約', tz: 'America/New_York', marketId: 'nasdaq' }
];

// fmt：函式用途註解，說明此處封裝一段可重用的流程。
function fmt(now, tz) {
  return now.toLocaleTimeString('zh-TW', { hour12: false, timeZone: tz });
}

// WorldClockStrip：類別用途註解，集中管理相關狀態與方法。
export class WorldClockStrip {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.isOpen = options.isOpen || (() => false);
    // 段落說明：建立新的 DOM 節點。
    this.root = document.createElement('section');
    this.root.className = 'panel';
    // 段落說明：更新 DOM 內容。
    this.root.innerHTML = '<div class="panel__body clocks" style="display:flex;gap:10px;flex-wrap:wrap"></div>';
    this.wrap = this.root.querySelector('.clocks');
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.root);
    this.tick();
    // 段落說明：建立定時更新流程。
    this.timer = setInterval(() => this.tick(), 1000);
  }

  // tick：方法用途註解，處理此元件或類別的一段行為。
  tick() {
    const now = new Date();
    // 段落說明：更新 DOM 內容。
    this.wrap.innerHTML = CITIES.map((c) => {
      const open = this.isOpen(c.marketId);
      return `<span class="badge ${open ? 'badge--high' : 'badge--low'}">${c.name} ${fmt(now, c.tz)}</span>`;
    }).join('');
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：清除定時器，避免頁面卸載後繼續執行。
    clearInterval(this.timer);
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.root.remove();
  }
}
