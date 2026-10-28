// 儀表板元件：繪製半圓量表與指針，用於多空攻擊等強度顯示。
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Gauge：類別用途註解，集中管理相關狀態與方法。
export class Gauge {
  // constructor：方法用途註解，處理此元件或類別的一段行為。
  constructor(container, options = {}) {
    this.options = {
      scaleMin: options.scaleMin ?? 0,
      scaleMax: options.scaleMax ?? options.max ?? 160,
      zoneStart: options.zoneStart ?? 120,
      color: options.color || '#f03a5f',
      baseAlpha: options.baseAlpha ?? 0.32,
      zoneColor: options.zoneColor || '#912942',
      titleColor: options.titleColor || options.color || '#f03a5f',
      needleColor: options.needleColor || options.titleColor || options.color || '#f03a5f',
      title: options.title || '',
      width: options.width || 360,
      height: options.height || 210,
      tickStep: options.tickStep || 20
    };

    // 段落說明：建立新的 DOM 節點。
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    // 段落說明：將建立好的節點掛回頁面。
    container.appendChild(this.canvas);
    // 段落說明：取得 Canvas 2D context 進行繪圖。
    this.ctx = this.canvas.getContext('2d');
  }

  // update：方法用途註解，處理此元件或類別的一段行為。
  update(payload = 0) {
    const state = typeof payload === 'number'
      ? {
          value: payload,
          activeValue: payload,
          segmentValue: null,
          displayValue: payload,
          displayMax: this.options.scaleMax,
          title: this.options.title
        }
      : {
          value: Number(payload.value ?? 0),
          activeValue: Number(payload.activeValue ?? payload.value ?? 0),
          segmentValue: payload.segmentValue == null ? null : Number(payload.segmentValue),
          displayValue: Number(payload.displayValue ?? payload.value ?? 0),
          displayMax: Number(payload.displayMax ?? this.options.scaleMax),
          title: payload.title ?? this.options.title
        };

    this._render(state);
  }

  // _valueToAngle：方法用途註解，處理此元件或類別的一段行為。
  _valueToAngle(value) {
    const { scaleMin, scaleMax } = this.options;
    const ratio = clamp((value - scaleMin) / (scaleMax - scaleMin || 1), 0, 1);
    return Math.PI + ratio * Math.PI;
  }

  // _render：方法用途註解，處理此元件或類別的一段行為。
  _render(state) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h - Math.max(22, Math.round(h * 0.16));
    const outerR = Math.min(w * 0.45, h * 0.78);
    const innerR = outerR * 0.68;

    // 段落說明：清除上一輪 Canvas 繪圖內容。
    ctx.clearRect(0, 0, w, h);

    const startA = Math.PI;
    const endA = Math.PI * 2;

    // Base ring (upper half only)
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startA, endA, false);
    ctx.arc(cx, cy, innerR, endA, startA, true);
    ctx.closePath();
    ctx.fillStyle = this.options.color;
    ctx.globalAlpha = this.options.baseAlpha;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Active bright arc
    const activeEnd = this._valueToAngle(state.activeValue);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startA, activeEnd, false);
    ctx.arc(cx, cy, innerR, activeEnd, startA, true);
    ctx.closePath();
    ctx.fillStyle = this.options.titleColor;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (Number.isFinite(state.segmentValue) && state.segmentValue > this.options.scaleMin) {
      const segmentEnd = this._valueToAngle(state.segmentValue);
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startA, segmentEnd, false);
      ctx.arc(cx, cy, innerR, segmentEnd, startA, true);
      ctx.closePath();
      ctx.fillStyle = this.options.needleColor;
      ctx.globalAlpha = 0.96;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Red zone from 120 to 160
    const zoneStartA = this._valueToAngle(this.options.zoneStart);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, zoneStartA, endA, false);
    ctx.arc(cx, cy, innerR, endA, zoneStartA, true);
    ctx.closePath();
    ctx.fillStyle = this.options.zoneColor;
    ctx.globalAlpha = 0.78;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ticks
    const { scaleMin, scaleMax, tickStep } = this.options;
    const midValue = scaleMin + (scaleMax - scaleMin) / 2;
    for (let v = scaleMin; v <= scaleMax; v += tickStep) {
      const a = this._valueToAngle(v);
      const major = v === scaleMin || v === scaleMax || Math.abs(v - midValue) < tickStep / 2;
      const r1 = innerR - (major ? 14 : 9);
      const r2 = innerR - 2;
      const x1 = cx + Math.cos(a) * r1;
      const y1 = cy + Math.sin(a) * r1;
      const x2 = cx + Math.cos(a) * r2;
      const y2 = cy + Math.sin(a) * r2;
      ctx.strokeStyle = major ? '#c9d2e6' : '#8f9ab3';
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Labels at min / midpoint / max
    [scaleMin, midValue, scaleMax].forEach((v) => {
      const a = this._valueToAngle(v);
      const tx = cx + Math.cos(a) * (innerR - 24);
      const ty = cy + Math.sin(a) * (innerR - 24);
      ctx.fillStyle = '#d4a735';
      ctx.font = '700 11px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.round(v)), tx, ty);
    });

    // Single needle (speedometer style)
    const needleA = this._valueToAngle(state.value);
    const tipR = outerR - 18;
    const tailR = 16;
    const halfWidth = 4;
    const tipX = cx + Math.cos(needleA) * tipR;
    const tipY = cy + Math.sin(needleA) * tipR;
    const baseCx = cx - Math.cos(needleA) * tailR;
    const baseCy = cy - Math.sin(needleA) * tailR;
    const leftA = needleA + Math.PI / 2;
    const rightA = needleA - Math.PI / 2;
    const leftX = baseCx + Math.cos(leftA) * halfWidth;
    const leftY = baseCy + Math.sin(leftA) * halfWidth;
    const rightX = baseCx + Math.cos(rightA) * halfWidth;
    const rightY = baseCy + Math.sin(rightA) * halfWidth;

    ctx.fillStyle = this.options.needleColor;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#eef3fb';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();

    // Title and readout
    ctx.font = '700 34px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.options.needleColor;
    ctx.fillText(String(Math.round(state.displayValue)), cx - 64, h - 18);
    ctx.fillStyle = this.options.titleColor;
    ctx.fillText(String(Math.round(state.displayMax)), cx + 64, h - 18);

    ctx.font = '700 14px "Noto Sans TC"';
    ctx.fillText(state.title || '', cx, cy - outerR * 0.4);
  }

  // destroy：方法用途註解，處理此元件或類別的一段行為。
  destroy() {
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    this.canvas.remove();
  }
}
