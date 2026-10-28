// 損益圖元件：依選擇權部位計算並繪製到期損益曲線。
function payoffAt(legs, spot) {
  return legs.reduce((sum, leg) => {
    if (leg.type === 'future') {
      const p = (spot - leg.strike) * leg.qty;
      return sum + (leg.action === 'buy' ? p : -p);
    }
    const intrinsic = leg.type === 'call' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot);
    const unit = leg.action === 'buy' ? intrinsic - leg.premium : leg.premium - intrinsic;
    return sum + unit * leg.qty;
  }, 0);
}

// PLChart：類別用途註解，集中管理相關狀態與方法。
export class PLChart {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.options = { width: options.width || 740, height: options.height || 340 };
    // 段落說明：建立新的 DOM 節點。
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    // 段落說明：取得 Canvas 2D context 進行繪圖。
    this.ctx = this.canvas.getContext('2d');
    // 段落說明：建立新的 DOM 節點。
    this.tooltip = document.createElement('div');
    this.tooltip.style.cssText = 'position:absolute;pointer-events:none;background:#111520;border:1px solid #263050;padding:4px 6px;font-size:12px;display:none';
    container.style.position = 'relative';
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.canvas);
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.tooltip);
    this.points = [];
    // 段落說明：綁定使用者互動事件。
    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    // 段落說明：綁定使用者互動事件。
    this.canvas.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(legs = [], spot = 19850) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const minP = spot * 0.85;
    const maxP = spot * 1.15;
    const samples = 120;
    this.points = Array.from({ length: samples }, (_, i) => {
      const price = minP + (i / (samples - 1)) * (maxP - minP);
      return { price, pl: payoffAt(legs, price) };
    });
    // minY：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const minY = Math.min(...this.points.map((p) => p.pl));
    // maxY：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const maxY = Math.max(...this.points.map((p) => p.pl));
    // mapX：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const mapX = (p) => ((p - minP) / (maxP - minP)) * (w - 50) + 30;
    // mapY：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
    const mapY = (y) => h - 30 - ((y - minY) / (maxY - minY || 1)) * (h - 60);

    // 段落說明：清除上一輪 Canvas 繪圖內容。
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#263050';
    ctx.setLineDash([4, 4]);
    const zeroY = mapY(0);
    ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY); ctx.stroke();
    const spotX = mapX(spot);
    ctx.beginPath(); ctx.moveTo(spotX, 0); ctx.lineTo(spotX, h); ctx.stroke();
    ctx.setLineDash([]);

    this.points.forEach((p, i) => {
      const x = mapX(p.price);
      const y = mapY(p.pl);
      if (i === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#6a7a99';
    ctx.font = '12px var(--font-ui)';
    ctx.fillText('損益點數', 8, 14);
  }

  // onMove：方法用途註解，處理此元件或類別的一段行為。
  onMove(e) {
    if (!this.points.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(this.points.length - 1, Math.round((x / rect.width) * this.points.length)));
    const p = this.points[idx];
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${x + 10}px`;
    this.tooltip.style.top = `${e.clientY - rect.top + 8}px`;
    this.tooltip.textContent = `價格 ${p.price.toFixed(0)} / P&L ${p.pl.toFixed(1)}`;
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.tooltip.remove();
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.canvas.remove();
  }
}
