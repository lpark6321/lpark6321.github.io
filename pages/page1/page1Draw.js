// Page1 的 canvas 繪圖：6 區加權走勢、1 區迷你 K 棒、5 區股價監控、B 區 30 日振幅。只畫圖，不讀 store。
import { fmtNum as n } from '../../services/quoteUtils.js';
import { TAIEX_PLOT_END, TAIEX_PLOT_START } from './page1Series.js';

const INFO_CANDLE_RANGE_PCT = 15;
const AMP_BAR_WIDTH_SCALE = 1.5;

function formatClockLabel(totalMinutes) {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildTaiexTimeLabels() {
  const labels = [];
  for (let minute = TAIEX_PLOT_START; minute <= TAIEX_PLOT_END; minute += 30) {
    labels.push(formatClockLabel(minute));
  }
  return labels;
}

export function drawTrend(canvas, data, meta = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(520, Math.floor(canvas.clientWidth));
  const h = canvas.height = Math.max(320, Math.floor(canvas.clientHeight));
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#080b12';
  ctx.fillRect(0, 0, w, h);

  if (!data?.points?.length) {
    ctx.fillStyle = '#8ea0be';
    ctx.font = '14px Noto Sans TC';
    ctx.textAlign = 'center';
    ctx.fillText('無盤中資料', w / 2, h / 2);
    return;
  }
  const { points } = data;
  const labels = buildTaiexTimeLabels();

  const priceValues = points.flatMap((point) => [point.price, point.avg]);
  const rawMin = Math.min(...priceValues, meta.low ?? priceValues[0]);
  const rawMax = Math.max(...priceValues, meta.high ?? priceValues[0]);
  const rawRange = rawMax - rawMin || 1;
  const min = rawMin - rawRange * 0.04;
  const max = rawMax + rawRange * 0.04;
  const range = max - min || 1;

  const left = 62;
  const right = 16;
  const top = 14;
  const bottom = 30;
  // 來源沒有成交量時不留量的區塊，價格區塊佔滿。
  const showVolume = data.hasVolume !== false;
  const volumeGap = showVolume ? 14 : 0;
  const volumeHeight = showVolume ? Math.max(86, Math.round(h * 0.27)) : 0;
  const priceHeight = h - top - bottom - volumeGap - volumeHeight;
  const volumeTop = top + priceHeight + volumeGap;
  const pw = w - left - right;

  const sessionSpan = TAIEX_PLOT_END - TAIEX_PLOT_START;
  const xFromMinute = (minute) => {
    const safeMinute = Number.isFinite(minute) ? Math.min(TAIEX_PLOT_END, Math.max(TAIEX_PLOT_START, minute)) : TAIEX_PLOT_START;
    return left + ((safeMinute - TAIEX_PLOT_START) / sessionSpan) * pw;
  };
  const x = (i) => xFromMinute(points[i]?.minute);
  const y = (v) => top + (1 - (v - min) / range) * priceHeight;

  const volumeMax = Math.max(...points.map((point) => point.volume), 1);
  const volumeStep = Math.max(1, Math.ceil(volumeMax / 4));
  const volumeAxisMax = volumeStep * 4;
  const yVolume = (v) => volumeTop + volumeHeight - (v / volumeAxisMax) * volumeHeight;

  const drawHLine = (yy, color = '#1f2a3d') => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  Array.from({ length: 6 }, (_, idx) => idx / 5).forEach((step) => {
    const yy = top + priceHeight * step;
    drawHLine(yy);
    const value = max - range * step;
    ctx.fillStyle = '#9fb2d0';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(n(value, value >= 100 ? 0 : 2), left - 8, yy);
  });

  for (let value = 0; showVolume && value <= volumeAxisMax; value += volumeStep) {
    const yy = yVolume(value);
    drawHLine(yy, '#1c2434');
    if (value > 0) {
      ctx.fillStyle = '#8ea0be';
      ctx.font = '12px JetBrains Mono';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(n(value, 0), left - 8, yy);
    }
  }

  labels.forEach((label) => {
    const [hour, minute] = label.split(':').map(Number);
    const labelMinute = hour * 60 + minute;
    const isEdge = labelMinute === TAIEX_PLOT_START || labelMinute === TAIEX_PLOT_END;
    const xx = xFromMinute(labelMinute);
    ctx.strokeStyle = labelMinute % 60 === 0 ? '#29354a' : '#1b2433';
    ctx.lineWidth = 1;
    ctx.setLineDash(labelMinute % 60 === 0 ? [] : [3, 4]);
    ctx.beginPath();
    ctx.moveTo(xx, top);
    ctx.lineTo(xx, volumeTop + volumeHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = isEdge ? '#ffd84d' : '#aab8d0';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = labelMinute === TAIEX_PLOT_START ? 'left' : labelMinute === TAIEX_PLOT_END ? 'right' : 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, xx, h - 8);
  });

  ctx.strokeStyle = '#334156';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(left, top + priceHeight);
  ctx.lineTo(w - right, top + priceHeight);
  ctx.stroke();

  ctx.fillStyle = '#8ea0be';
  ctx.font = '12px JetBrains Mono';
  ctx.textAlign = 'right';
  if (showVolume) {
    ctx.fillText('量', left - 8, volumeTop + 12);
  } else {
    ctx.font = '12px Noto Sans TC';
    ctx.fillText('此來源無成交量', w - right - 4, top + priceHeight - 6);
  }

  const barWidth = Math.max(2, Math.min(8, pw / points.length * 0.82));
  ctx.fillStyle = '#f2d319';
  (showVolume ? points : []).forEach((point, idx) => {
    const xx = x(idx);
    const barTop = yVolume(Math.min(point.volume, volumeAxisMax));
    ctx.fillRect(xx - barWidth / 2, barTop, barWidth, volumeTop + volumeHeight - barTop);
  });

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#d4cc45cc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  points.forEach((point, idx) => idx === 0 ? ctx.moveTo(x(idx), y(point.avg)) : ctx.lineTo(x(idx), y(point.avg)));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  points.forEach((point, idx) => idx === 0 ? ctx.moveTo(x(idx), y(point.price)) : ctx.lineTo(x(idx), y(point.price)));
  ctx.strokeStyle = '#25d6ff';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  const lastPoint = points[points.length - 1];
  const lastY = y(lastPoint.price);
  ctx.fillStyle = '#25d6ff';
  ctx.beginPath();
  ctx.arc(x(points.length - 1), lastY, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawInfoCandle(canvas, payload) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(90, Math.floor(canvas.clientWidth || 90));
  const h = canvas.height = Math.max(130, Math.floor(canvas.clientHeight || 130));
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#1b1d22';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#424754';
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  const top = 2;
  const bottom = 58;
  const left = 12;
  const right = 12;
  const plotHeight = h - top - bottom;
  const base = Number.isFinite(Number(payload.prevClose)) && Number(payload.prevClose) !== 0
    ? Number(payload.prevClose)
    : Number(payload.open);
  const halfRangePct = INFO_CANDLE_RANGE_PCT / 2;
  const pctOfBase = (value) => ((Number(value) - base) / base) * 100;
  const clampPct = (pct) => Math.max(-halfRangePct, Math.min(halfRangePct, pct));
  const yPct = (pct) => top + (1 - ((clampPct(pct) + halfRangePct) / INFO_CANDLE_RANGE_PCT)) * plotHeight;
  const y = (v) => yPct(pctOfBase(v));

  const cx = (w - left - right) / 2 + left;
  const bw = Math.min(24, (w - left - right) * 0.4);

  ctx.strokeStyle = 'rgba(180,190,215,.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, yPct(0));
  ctx.lineTo(w - right, yPct(0));
  ctx.stroke();

  ctx.strokeStyle = '#cde2d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, y(payload.high));
  ctx.lineTo(cx, y(payload.low));
  ctx.stroke();

  // payload.bodyColor：「比前一日」模式指定的實體顏色；沒給就依收盤 ≥ 開盤分紅綠。
  const up = payload.close >= payload.open;
  ctx.fillStyle = payload.bodyColor || (up ? '#f03a5f' : '#1fd67a');
  ctx.fillRect(cx - bw / 2, Math.min(y(payload.open), y(payload.close)), bw, Math.max(3, Math.abs(y(payload.open) - y(payload.close))));

  const changeText = `${payload.change >= 0 ? '+' : ''}${payload.change.toFixed(0)}`;
  const ampText = `${payload.ampPct >= 0 ? '+' : ''}${payload.ampPct.toFixed(1)}%`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#b5bfd6';
  ctx.font = '700 13px Noto Sans TC';
  ctx.fillText('漲跌:', 8, h - 32);
  ctx.fillText('幅度:', 8, h - 12);

  ctx.textAlign = 'right';
  ctx.fillStyle = payload.change >= 0 ? '#f03a5f' : '#1fd67a';
  ctx.font = '700 28px JetBrains Mono';
  ctx.fillText(changeText, w - 8, h - 28);
  ctx.fillStyle = payload.ampPct >= 0 ? '#f03a5f' : '#1fd67a';
  ctx.font = '700 20px JetBrains Mono';
  ctx.fillText(ampText, w - 8, h - 8);
}

export function drawMonitor(canvas, rows) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(360, Math.floor(canvas.clientWidth));
  const h = canvas.height = Math.max(280, Math.floor(canvas.clientHeight));
  ctx.clearRect(0, 0, w, h);

  const left = 44;
  const right = 12;
  const top = 12;
  const bottom = 90;
  const pw = w - left - right;
  const ph = h - top - bottom;
  const y = (pct) => top + (1 - (pct + 10) / 20) * ph;
  const labelTop = h - bottom + 18;
  const nameStart = labelTop + 16;
  const nameLine = 12;

  [-10, -5, 0, 5, 10].forEach((v) => {
    const yy = y(v);
    ctx.strokeStyle = v === 0 ? '#f5c84266' : '#ffffff22';
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
    ctx.fillStyle = '#9aa6c2';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText(`${v}%`, left - 8, yy + 4);
  });

  if (!rows.length) return;

  const step = pw / rows.length;
  const bw = Math.max(10, Math.min(26, step * 0.52));

  rows.forEach((r, i) => {
    const cx = left + step * (i + 0.5);
    const x = cx - bw / 2;
    const yOpen = y(r.openPct);
    const yClose = y(r.closePct);
    const yHigh = y(r.highPct);
    const yLow = y(r.lowPct);
    const up = r.closePct >= r.openPct;

    ctx.strokeStyle = '#d8def0';
    ctx.beginPath();
    ctx.moveTo(cx, yHigh);
    ctx.lineTo(cx, yLow);
    ctx.stroke();

    ctx.fillStyle = up ? '#f03a5f' : '#1fd67a';
    ctx.fillRect(x, Math.min(yOpen, yClose), bw, Math.max(2, Math.abs(yOpen - yClose)));

    ctx.fillStyle = '#dce4f5';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(r.code || '', cx, labelTop);

    const shortName = String(r.shortName || '').slice(0, 4);
    if (shortName) {
      ctx.fillStyle = '#9fb0d8';
      ctx.font = '11px Noto Sans TC';
      ctx.textAlign = 'center';
      [...shortName].forEach((ch, idx) => {
        ctx.fillText(ch, cx, nameStart + idx * nameLine);
      });
    }
  });
}

// label：振幅是哪個商品的（加權／台指(全)／台指）。
export function drawAmp20(canvas, hist, label = '') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(560, Math.floor(canvas.clientWidth));
  const h = canvas.height = Math.max(260, Math.floor(canvas.clientHeight));
  ctx.clearRect(0, 0, w, h);

  const left = 42;
  const right = 12;
  const top = 10;
  const mid = 96;
  const bottom = 24;
  const pw = w - left - right;

  ctx.fillStyle = '#10151f';
  ctx.fillRect(0, 0, w, h);

  const amps = hist.map((x) => Number(x.amplitude) || 0);
  const maxAmp = Math.max(...amps, 1);

  const tY = (v) => top + (1 - (v + 4) / 8) * (mid - top - 8);
  [-4, -2, 0, 2, 4].forEach((v) => {
    const yy = tY(v);
    ctx.strokeStyle = v === 0 ? '#f5c84266' : '#ffffff1f';
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
  });

  const step = pw / Math.max(hist.length, 1);
  const bw = Math.max(10, Math.min(30, step * 0.52 * AMP_BAR_WIDTH_SCALE));
  hist.forEach((x, i) => {
    const px = left + step * i + (step - bw) / 2;
    const base = Number(x.prevClose) || Number(x.open) || Number(x.close) || 1;
    const toPct = (value) => Math.max(-4, Math.min(4, ((Number(value) - base) / base) * 100));
    const open = toPct(x.open);
    const close = toPct(x.close);
    const high = Math.max(open, close, toPct(x.high));
    const low = Math.min(open, close, toPct(x.low));
    const up = close >= open;

    ctx.strokeStyle = '#c7d0e8';
    ctx.beginPath();
    ctx.moveTo(px + bw / 2, tY(high));
    ctx.lineTo(px + bw / 2, tY(low));
    ctx.stroke();

    ctx.fillStyle = up ? '#f03a5f' : '#1fd67a';
    ctx.fillRect(px, Math.min(tY(open), tY(close)), bw, Math.max(2, Math.abs(tY(open) - tY(close))));
  });

  const bTop = mid + 10;
  const bH = h - bTop - bottom;
  const bY = (v) => bTop + (1 - v / maxAmp) * bH;

  ctx.strokeStyle = '#ffffff1f';
  [0, 0.33, 0.66, 1].forEach((t) => {
    const yy = bTop + bH * t;
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
  });

  ctx.fillStyle = '#82e0aa';
  ctx.font = '700 12px Noto Sans TC';
  ctx.textAlign = 'right';
  ctx.fillText(`${label}30日振幅${hist.length ? '' : '（無資料）'}`, w - right - 8, top + 12);

  amps.forEach((amp, i) => {
    const px = left + step * i + (step - bw) / 2;
    ctx.fillStyle = 'rgba(148,87,128,0.6)';
    ctx.fillRect(px, bY(amp), bw, bTop + bH - bY(amp));
  });

  ctx.beginPath();
  amps.forEach((amp, i) => {
    const xx = left + step * i + step / 2;
    const yy = bY(amp);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  });
  ctx.strokeStyle = '#6f88d9';
  ctx.lineWidth = 2;
  ctx.stroke();
}
