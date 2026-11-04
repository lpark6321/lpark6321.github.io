// Page2 的 canvas 繪圖：長條圖、類股 K 棒、成分股圓餅。只畫圖，不讀 store。

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveCanvasSize(canvas, options = {}) {
  const maxWidth = options.maxWidth ?? 560;
  const minWidth = options.minWidth ?? 220;
  const targetHeight = options.height ?? 240;
  const clientWidth = Math.floor(canvas.clientWidth || maxWidth);
  const width = clamp(clientWidth, minWidth, maxWidth);
  canvas.width = width;
  canvas.height = targetHeight;
  return { w: width, h: targetHeight };
}

function drawAxis(ctx, w, h, minV, maxV, options = {}) {
  const left = options.left ?? 44;
  const right = options.right ?? 10;
  const top = options.top ?? 8;
  const bottom = options.bottom ?? 20;
  const ticks = options.ticks ?? [minV, (minV + maxV) / 2, maxV];
  const range = maxV - minV || 1;
  const y = (v) => top + (1 - (v - minV) / range) * (h - top - bottom);

  ctx.strokeStyle = '#ffffff33';
  ticks.forEach((t) => {
    const yy = y(t);
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
    ctx.fillStyle = '#9aa6c2';
    ctx.font = '12px Noto Sans TC';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.toFixed(1), left - 6, yy);
  });

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, h - bottom);
  ctx.strokeStyle = '#ffffff66';
  ctx.stroke();

  return { left, right, y };
}

export function drawBars(canvas, items, options = {}) {
  const ctx = canvas.getContext('2d');
  const { w, h } = resolveCanvasSize(canvas, { maxWidth: options.maxWidth ?? 560, height: 240, minWidth: 260 });
  ctx.clearRect(0, 0, w, h);

  const maxAbs = Math.max(2, ...items.filter((x) => x.value != null).map((x) => Math.abs(x.value)));
  const axisBottom = options.axisBottom ?? 20;
  const { left, right, y } = drawAxis(ctx, w, h, -maxAbs, maxAbs, { bottom: axisBottom, ticks: options.ticks });
  const pw = w - left - right;
  const gap = items.length > 7 ? 6 : 8;
  const bw = Math.max(10, (pw - items.length * gap) / items.length);

  items.forEach((it, i) => {
    const x = left + gap + i * (bw + gap);
    const y0 = y(0);
    if (it.value == null) {
      // 沒有資料：不畫長條，標「--」。
      ctx.fillStyle = '#8f9bb7';
      ctx.font = '12px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('--', x + bw / 2, y0 - 4);
    } else {
      const y1 = y(it.value);
      ctx.fillStyle = it.value >= 0 ? '#f03a5f' : '#1fd67a';
      ctx.fillRect(x, Math.min(y0, y1), bw, Math.max(2, Math.abs(y0 - y1)));
    }

    ctx.fillStyle = '#cdd6ea';
    ctx.font = '12px Noto Sans TC';
    ctx.textAlign = 'center';
    if (it.subLabel) {
      ctx.fillText(it.label, x + bw / 2, h - 20);
      ctx.fillStyle = '#8f9bb7';
      ctx.fillText(it.subLabel, x + bw / 2, h - 5);
    } else {
      ctx.fillText(it.label, x + bw / 2, h - 5);
    }
  });
}

export function drawCategoryCandle(canvas, items, options = {}) {
  const ctx = canvas.getContext('2d');
  const { w, h } = resolveCanvasSize(canvas, { maxWidth: options.maxWidth ?? 560, height: 240, minWidth: 260 });
  ctx.clearRect(0, 0, w, h);

  const filled = items.filter((x) => !x.empty);
  const minV = options.minV ?? Math.min(...filled.map((x) => x.low), -1);
  const maxV = options.maxV ?? Math.max(...filled.map((x) => x.high), 1);
  const { left, right, y } = drawAxis(ctx, w, h, minV, maxV, { ticks: options.ticks, bottom: 24 });
  const pw = w - left - right;
  const bw = Math.max(16, (pw - items.length * 14) / items.length);

  items.forEach((it, i) => {
    const x = left + 10 + i * (bw + 14);
    const mid = x + bw / 2;
    ctx.fillStyle = '#cdd6ea';
    ctx.font = '12px Noto Sans TC';
    ctx.textAlign = 'center';
    ctx.fillText(it.label, mid, h - 6);
    if (it.empty) {
      // 沒有任何報價的類股：不畫 K 棒，標「--」。
      ctx.fillStyle = '#8f9bb7';
      ctx.fillText('--', mid, y(0) - 4);
      return;
    }
    const yHigh = y(it.high);
    const yLow = y(it.low);
    const yOpen = y(it.open);
    const yClose = y(it.close);
    const up = it.close >= it.open;

    ctx.strokeStyle = '#c8d3f5';
    ctx.beginPath();
    ctx.moveTo(mid, yHigh);
    ctx.lineTo(mid, yLow);
    ctx.stroke();

    ctx.fillStyle = up ? '#f03a5f' : '#1fd67a';
    ctx.fillRect(x, Math.min(yOpen, yClose), bw, Math.max(2, Math.abs(yOpen - yClose)));
  });
}

// 斜線圖樣（「無資料」那一塊用）。
function hatchPattern(ctx, color) {
  const tile = document.createElement('canvas');
  tile.width = 6;
  tile.height = 6;
  const t = tile.getContext('2d');
  t.fillStyle = color;
  t.fillRect(0, 0, 6, 6);
  t.strokeStyle = 'rgba(255,255,255,0.18)';
  t.beginPath();
  t.moveTo(0, 6);
  t.lineTo(6, 0);
  t.stroke();
  return ctx.createPattern(tile, 'repeat');
}

// drawSectorPie：依 segments（value + color，hatch 表示畫斜線）畫圓餅圖，處理高 DPI。
export function drawSectorPie(canvas, segments, size) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const clientW = Math.floor(canvas.clientWidth || size);
  const clientH = Math.floor(canvas.clientHeight || size);
  const box = Math.max(72, Math.min(size, Math.min(clientW, clientH)));
  canvas.width = Math.floor(box * dpr);
  canvas.height = Math.floor(box * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, box, box);

  const cx = box / 2;
  const cy = box / 2;
  const r = box * 0.48;
  const total = segments.reduce((sum, item) => sum + item.value, 0) || 1;
  let start = -Math.PI / 2;

  segments.forEach((item) => {
    const angle = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = item.hatch ? hatchPattern(ctx, item.color) : item.color;
    ctx.fill();
    start += angle;
  });
}
