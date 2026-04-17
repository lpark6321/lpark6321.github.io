function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class Gauge {
  constructor(container, options = {}) {
    this.options = {
      scaleMin: options.scaleMin ?? 0,
      scaleMax: options.scaleMax ?? options.max ?? 160,
      zoneStart: options.zoneStart ?? 120,
      color: options.color || '#f03a5f',
      zoneColor: options.zoneColor || '#912942',
      titleColor: options.titleColor || options.color || '#f03a5f',
      title: options.title || '',
      width: options.width || 360,
      height: options.height || 210,
      tickStep: options.tickStep || 20
    };

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
  }

  update(payload = 0) {
    const state = typeof payload === 'number'
      ? {
          value: payload,
          displayValue: payload,
          displayMax: this.options.scaleMax,
          title: this.options.title
        }
      : {
          value: Number(payload.value ?? 0),
          displayValue: Number(payload.displayValue ?? payload.value ?? 0),
          displayMax: Number(payload.displayMax ?? this.options.scaleMax),
          title: payload.title ?? this.options.title
        };

    this._render(state);
  }

  _valueToAngle(value) {
    const { scaleMin, scaleMax } = this.options;
    const ratio = clamp((value - scaleMin) / (scaleMax - scaleMin || 1), 0, 1);
    return Math.PI + ratio * Math.PI;
  }

  _render(state) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h - Math.max(22, Math.round(h * 0.16));
    const outerR = Math.min(w * 0.45, h * 0.78);
    const innerR = outerR * 0.68;

    ctx.clearRect(0, 0, w, h);

    const startA = Math.PI;
    const endA = Math.PI * 2;

    // Base ring (upper half only)
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startA, endA, false);
    ctx.arc(cx, cy, innerR, endA, startA, true);
    ctx.closePath();
    ctx.fillStyle = this.options.color;
    ctx.globalAlpha = 0.32;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Active bright arc (from 0 to current needle)
    const activeEnd = this._valueToAngle(state.value);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, startA, activeEnd, false);
    ctx.arc(cx, cy, innerR, activeEnd, startA, true);
    ctx.closePath();
    ctx.fillStyle = this.options.titleColor;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

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

    // Ticks every 20
    const { scaleMin, scaleMax, tickStep } = this.options;
    for (let v = scaleMin; v <= scaleMax; v += tickStep) {
      const a = this._valueToAngle(v);
      const major = v % 40 === 0;
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

    // Labels at 0 / 80 / 160
    [0, 80, 160].forEach((v) => {
      const a = this._valueToAngle(v);
      const tx = cx + Math.cos(a) * (innerR - 24);
      const ty = cy + Math.sin(a) * (innerR - 24);
      ctx.fillStyle = '#d4a735';
      ctx.font = '700 11px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v), tx, ty);
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

    ctx.fillStyle = this.options.titleColor;
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
    ctx.fillStyle = this.options.titleColor;
    ctx.font = '700 34px "JetBrains Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(state.displayValue)), cx - 64, h - 18);
    ctx.fillText(String(Math.round(state.displayMax)), cx + 64, h - 18);

    ctx.font = '700 14px "Noto Sans TC"';
    ctx.fillText(state.title || '', cx, cy - outerR * 0.4);
  }

  destroy() {
    this.canvas.remove();
  }
}
