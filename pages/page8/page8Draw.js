// Page8 的 canvas 圖：同一條 x 軸（等距類別）上畫長條與折線。只畫圖，不讀 store。
import { setupHiDpiCanvas } from '../../services/canvas.js';

export const UP = '#f03a5f';
export const DOWN = '#1fd67a';
const GRID = '#ffffff22';
const TEXT = '#9aa6c2';
const PAD = { left: 60, right: 8, top: 8, bottom: 20 };

// options：labels（x 軸標籤）、bars { values, color? }（沒給 color 依正負紅綠）、lines [{ values, color, dash? }]、
// zero（y 軸含 0、長條從 0 畫起；預設有長條就含 0）、format（y 軸刻度文字）、height。值不是數字的點略過。
export function drawChart(canvas, { labels = [], bars = null, lines = [], zero = Boolean(bars), format = (v) => v.toFixed(0), height = 170 } = {}) {
  const width = Math.max(240, Math.floor(canvas.clientWidth || 480));
  const ctx = setupHiDpiCanvas(canvas, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px "JetBrains Mono", monospace';
  const values = [...(bars?.values || []), ...lines.flatMap((line) => line.values)].filter(Number.isFinite);
  if (!values.length) {
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'center';
    ctx.fillText('--', width / 2, height / 2);
    return;
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (zero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const pad = (max - min) * 0.08 || Math.abs(max) * 0.05 || 1;
  if (!(zero && min === 0)) min -= pad;
  if (!(zero && max === 0)) max += pad;

  const n = Math.max(1, labels.length);
  const pw = width - PAD.left - PAD.right;
  const ph = height - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + ((i + 0.5) * pw) / n;
  const y = (v) => PAD.top + (1 - (v - min) / (max - min)) * ph;

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  [min + pad, (min + max) / 2, max - pad].forEach((tick) => {
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y(tick));
    ctx.lineTo(width - PAD.right, y(tick));
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.fillText(format(tick), PAD.left - 6, y(tick));
  });
  if (zero) {
    ctx.strokeStyle = '#ffffff55';
    ctx.beginPath();
    ctx.moveTo(PAD.left, y(0));
    ctx.lineTo(width - PAD.right, y(0));
    ctx.stroke();
  }

  if (bars) {
    const bw = Math.max(1, (pw / n) * 0.7);
    const base = y(zero ? 0 : min);
    bars.values.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      ctx.fillStyle = bars.color || (v >= 0 ? UP : DOWN);
      ctx.fillRect(x(i) - bw / 2, Math.min(base, y(v)), bw, Math.max(1, Math.abs(y(v) - base)));
    });
  }

  lines.forEach((line) => {
    ctx.strokeStyle = line.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(line.dash || []);
    ctx.beginPath();
    let pen = false;
    line.values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        pen = false;
        return;
      }
      if (pen) ctx.lineTo(x(i), y(v));
      else ctx.moveTo(x(i), y(v));
      pen = true;
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);
  ctx.lineWidth = 1;

  // x 軸只標頭、中、尾三個。
  ctx.fillStyle = TEXT;
  ctx.textBaseline = 'alphabetic';
  [...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])].filter((i) => i >= 0).forEach((i, k, list) => {
    ctx.textAlign = k === 0 && list.length > 1 ? 'left' : k === list.length - 1 && list.length > 1 ? 'right' : 'center';
    const at = ctx.textAlign === 'left' ? PAD.left : ctx.textAlign === 'right' ? width - PAD.right : x(i);
    ctx.fillText(labels[i], at, height - 5);
  });
}
