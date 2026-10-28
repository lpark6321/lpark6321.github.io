// 狀態倒數元件：將毫秒差轉成 HH:MM:SS 顯示。
function toHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// StatusCountdown：類別用途註解，集中管理相關狀態與方法。
export class StatusCountdown {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container) {
    // 段落說明：建立新的 DOM 節點。
    this.el = document.createElement('span');
    this.el.className = 'status-countdown';
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.el);
    this.timer = null;
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(targetTime) {
    // 段落說明：清除定時器，避免頁面卸載後繼續執行。
    if (this.timer) clearInterval(this.timer);
    // tick：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const tick = () => {
      const left = targetTime - new Date();
      this.el.textContent = toHMS(left);
      this.el.style.color = left <= 300000 ? 'var(--gold)' : 'var(--text2)';
    };
    tick();
    // 段落說明：建立定時更新流程。
    this.timer = setInterval(tick, 1000);
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：清除定時器，避免頁面卸載後繼續執行。
    if (this.timer) clearInterval(this.timer);
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.el.remove();
  }
}
