function toHMS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export class StatusCountdown {
  constructor(container) {
    this.el = document.createElement('span');
    this.el.className = 'status-countdown';
    container.appendChild(this.el);
    this.timer = null;
  }

  update(targetTime) {
    if (this.timer) clearInterval(this.timer);
    const tick = () => {
      const left = targetTime - new Date();
      this.el.textContent = toHMS(left);
      this.el.style.color = left <= 300000 ? 'var(--gold)' : 'var(--text2)';
    };
    tick();
    this.timer = setInterval(tick, 1000);
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.el.remove();
  }
}
