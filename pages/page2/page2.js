import { store } from '../../data/store.js';
import { Panel } from '../../components/Panel.js';
import { Gauge } from '../../components/Gauge.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';

let cleanup = () => {};

const TOP10_CODES = ['2330', '2308', '2317', '2454', '3711', '2881', '2382', '2412', '2882', '2891'];
const CATEGORY_KEYS = ['台指', '電子', '金融', '傳產', '摩台'];

function c(v) {
  return v >= 0 ? 'metric-up' : 'metric-down';
}

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

function drawBars(canvas, items, options = {}) {
  const ctx = canvas.getContext('2d');
  const { w, h } = resolveCanvasSize(canvas, { maxWidth: options.maxWidth ?? 560, height: 240, minWidth: 260 });
  ctx.clearRect(0, 0, w, h);

  const maxAbs = Math.max(2, ...items.map((x) => Math.abs(x.value)));
  const axisBottom = options.axisBottom ?? 20;
  const { left, right, y } = drawAxis(ctx, w, h, -maxAbs, maxAbs, { bottom: axisBottom, ticks: options.ticks });
  const pw = w - left - right;
  const gap = items.length > 7 ? 6 : 8;
  const bw = Math.max(10, (pw - items.length * gap) / items.length);

  items.forEach((it, i) => {
    const x = left + gap + i * (bw + gap);
    const y0 = y(0);
    const y1 = y(it.value);
    const barY = Math.min(y0, y1);
    const barH = Math.abs(y0 - y1);
    ctx.fillStyle = it.value >= 0 ? '#f03a5f' : '#1fd67a';
    ctx.fillRect(x, barY, bw, Math.max(2, barH));

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

function drawCategoryCandle(canvas, items, options = {}) {
  const ctx = canvas.getContext('2d');
  const { w, h } = resolveCanvasSize(canvas, { maxWidth: options.maxWidth ?? 560, height: 240, minWidth: 260 });
  ctx.clearRect(0, 0, w, h);

  const highs = items.map((x) => x.high);
  const lows = items.map((x) => x.low);
  const minV = options.minV ?? Math.min(...lows);
  const maxV = options.maxV ?? Math.max(...highs);
  const { left, right, y } = drawAxis(ctx, w, h, minV, maxV, { ticks: options.ticks, bottom: 24 });
  const pw = w - left - right;
  const bw = Math.max(16, (pw - items.length * 14) / items.length);

  items.forEach((it, i) => {
    const x = left + 10 + i * (bw + 14);
    const mid = x + bw / 2;
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

    ctx.fillStyle = '#cdd6ea';
    ctx.font = '12px Noto Sans TC';
    ctx.textAlign = 'center';
    ctx.fillText(it.label, mid, h - 6);
  });
}

function drawSectorPie(canvas, data, options = {}) {
  const ctx = canvas.getContext('2d');
  const size = options.size || 120;
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
  const items = [
    { value: data.upPct, color: '#8bc34a' },
    { value: data.flatPct, color: '#d0d0d0' },
    { value: data.downPct, color: '#f4867c' }
  ];
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let start = -Math.PI / 2;

  items.forEach((item) => {
    const angle = (item.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    start += angle;
  });
}

function getCategoryStats(taiex, sectors) {
  const ele = sectors.find((s) => s.name === '電子');
  const fin = sectors.find((s) => s.name === '金融');
  const tra = sectors.find((s) => s.name === '傳產') || sectors.find((s) => s.name === '航運');

  const elePct = ele ? +(((ele.upPct - ele.downPct) / 25).toFixed(2)) : 0;
  const finPct = fin ? +(((fin.upPct - fin.downPct) / 25).toFixed(2)) : 0;
  const traPct = tra ? +(((tra.upPct - tra.downPct) / 25).toFixed(2)) : 0;
  const motaiPct = +(taiex.changePct * 0.78).toFixed(2);

  return [
    { label: '台指', chg: +taiex.changePct.toFixed(2) },
    { label: '電子', chg: elePct },
    { label: '金融', chg: finPct },
    { label: '傳產', chg: traPct },
    { label: '摩台', chg: motaiPct }
  ];
}

function estimateSessionVolume(currentVolume) {
  const now = new Date();
  const minute = now.getHours() * 60 + now.getMinutes();
  const start = 9 * 60;
  const end = 13 * 60 + 30;
  if (minute <= start) return currentVolume;
  if (minute >= end) return currentVolume;
  const progress = clamp((minute - start) / (end - start), 0.08, 1);
  return currentVolume / progress;
}

function driftAttack(value, max) {
  return clamp(value + (Math.random() - 0.5) * 2.6, 0, max);
}

function drawEstimateSystem(canvas, taiex, futures) {
  const ctx = canvas.getContext('2d');
  const { w, h } = resolveCanvasSize(canvas, { maxWidth: 340, minWidth: 260, height: 286 });
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#07090e';
  ctx.fillRect(0, 0, w, h);

  const top = 18;
  const split = Math.floor(h * 0.62);
  const bottomTop = split + 12;
  const bottomTitleY = h - 18;
  const left = 38;
  const right = 38;
  const plotW = w - left - right;
  const plotH = split - top - 10;
  const bottomH = bottomTitleY - bottomTop - 8;

  const points = 64;
  const phase = Date.now() / 6000;
  const volMin = 1500;
  const volMax = 2300;
  const priceCenter = Number(taiex.price || taiex.open || 10880);
  const priceMin = priceCenter - 35;
  const priceMax = priceCenter + 35;
  const spreadCenter = Number(futures.price || 0) - Number(taiex.price || 0);

  const x = (i) => left + (i / (points - 1 || 1)) * plotW;
  const yVol = (v) => top + (1 - (v - volMin) / (volMax - volMin || 1)) * plotH;
  const yPrice = (v) => top + (1 - (v - priceMin) / (priceMax - priceMin || 1)) * plotH;
  const ySpread = (v) => bottomTop + (1 - (v + 65) / (25 + 65)) * bottomH;

  const volSeries = [];
  const priceSeries = [];
  const spreadSeries = [];
  for (let i = 0; i < points; i += 1) {
    const t = i / (points - 1);
    const vol = 2120 - 430 * t + Math.sin(t * 9 + phase * 0.3) * 75 + Math.sin(t * 21 + phase) * 18;
    const price = priceCenter + Math.sin(t * 7 + phase) * 8 + Math.sin(t * 17 + phase * 0.4) * 3;
    const spread = spreadCenter - 28 + Math.sin(t * 13 + phase * 0.8) * 8 + (Math.random() - 0.5) * 6;
    volSeries.push(clamp(vol, volMin + 20, volMax - 10));
    priceSeries.push(clamp(price, priceMin + 1, priceMax - 1));
    spreadSeries.push(clamp(spread, -65, 25));
  }

  // Frame
  ctx.strokeStyle = '#bf7f12';
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, plotW, plotH);
  ctx.strokeRect(left, bottomTop, plotW, bottomH);

  // Top area fill (現貨估量)
  ctx.beginPath();
  volSeries.forEach((v, i) => {
    const px = x(i);
    const py = yVol(v);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.lineTo(x(points - 1), yVol(volMin));
  ctx.lineTo(x(0), yVol(volMin));
  ctx.closePath();
  ctx.fillStyle = '#1d86ea';
  ctx.fill();

  // Price line
  ctx.beginPath();
  priceSeries.forEach((v, i) => {
    const px = x(i);
    const py = yPrice(v);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = '#30d25f';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Baseline
  ctx.strokeStyle = '#f1d03a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(left, yVol(1660));
  ctx.lineTo(left + plotW, yVol(1660));
  ctx.stroke();

  // Bottom spread bars
  ctx.fillStyle = '#8bc34a';
  ctx.fillRect(left, ySpread(-11), plotW, ySpread(-65) - ySpread(-11));
  const barW = Math.max(2, plotW / points - 1);
  ctx.fillStyle = '#0d1218';
  spreadSeries.forEach((v, i) => {
    const px = x(i) - barW / 2;
    const py = ySpread(v);
    const y0 = ySpread(-11);
    const yy = Math.min(py, y0);
    const hh = Math.abs(py - y0);
    ctx.fillRect(px, yy, barW, hh);
  });

  // Axes labels
  const topTicksL = [2300, 2140, 1980, 1820, 1660, 1500];
  ctx.fillStyle = '#d39b29';
  ctx.font = '11px "JetBrains Mono"';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  topTicksL.forEach((v) => ctx.fillText(String(v), left - 6, yVol(v)));

  const topTicksR = [priceMax, priceCenter + 15, priceCenter, priceCenter - 15, priceMin];
  ctx.textAlign = 'left';
  topTicksR.forEach((v) => ctx.fillText(String(Math.round(v)), left + plotW + 6, yPrice(v)));

  const btTicks = [25, 7, -11, -29, -47, -65];
  ctx.textAlign = 'right';
  btTicks.forEach((v) => ctx.fillText(String(v), left - 6, ySpread(v)));
  ctx.textAlign = 'left';
  btTicks.forEach((v) => ctx.fillText(String(v), left + plotW + 6, ySpread(v)));

  // Time labels
  const labels = ['09:00', '10:00', '11:00', '12:00', '13:00'];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  labels.forEach((label, i) => {
    const px = left + (i / (labels.length - 1 || 1)) * plotW;
    ctx.fillText(label, px, split + 2);
  });

  // Titles
  ctx.fillStyle = '#f2f6ff';
  ctx.font = '700 18px "Noto Sans TC"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('現貨估量系統', w / 2, 2);
  ctx.fillText('價差走勢圖', w / 2, bottomTitleY);
}

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 2｜台股溫度計</h2><span class="page-clock" id="p2-clock"></span></div>
    <div class="p2-layout" id="p2-layout">
      <aside class="p2-left" id="p2-left"></aside>
      <div class="grid-splitter-v p2-main-splitter" id="p2-main-split"></div>
      <section class="p2-center" id="p2-center"><div class="grid-splitter-v p2-center-splitter" id="p2-center-split"></div></section>
      <section class="p2-bottom" id="p2-bottom"></section>
    </div>
  `;

  const layoutEl = container.querySelector('#p2-layout');
  const left = container.querySelector('#p2-left');
  const center = container.querySelector('#p2-center');
  const bottom = container.querySelector('#p2-bottom');
  const readVar = (el, name, fallback) => {
    const value = parseFloat(getComputedStyle(el).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };

  const p1 = new Panel(left, { badge: '1', title: '加權/台指/價差' }); p1.root.classList.add('p2-resize');
  const p2 = new Panel(left, { badge: '2', title: '試搓預測' }); p2.root.classList.add('p2-resize');
  const p10 = new Panel(left, { badge: '10', title: '現貨估量系統 / 價差走勢圖' }); p10.root.classList.add('p2-resize');
  const p3 = new Panel(left, { badge: '3', title: '法人資金流向' }); p3.root.classList.add('p2-resize');

  p1.setContent('<div class="p2-flow" id="p2-main"></div>');
  p2.setContent('<div class="p2-flow" id="p2-spread"></div>');
  p10.setContent('<canvas id="p2-est-canvas" class="p2-est-canvas"></canvas>');
  p3.setContent('<div class="p2-flow" id="p2-flow"></div>');

  const p4 = new Panel(center, { badge: '4', title: '時鐘與多空攻擊' }); p4.root.classList.add('p2-resize');
  const p5 = new Panel(center, { badge: '5', title: '類股強弱' }); p5.root.classList.add('p2-resize');

  const centerSplit = container.querySelector('#p2-center-split');
  if (centerSplit && p5.root?.parentNode === center) {
    center.insertBefore(centerSplit, p5.root);
  }

  const clockBlock = document.createElement('div');
  clockBlock.innerHTML = `
    <div class="p2-bigclock" id="p2-bigclock">--:--:--</div>
    <div class="p2-vol-grid">
      <div class="p2-vol-box">加權昨日量<br><strong id="p2-vol-y"></strong></div>
      <div class="p2-vol-box">加權預估量<br><strong id="p2-vol-e"></strong></div>
    </div>
  `;
  p4.body.appendChild(clockBlock);

  const bullWrap = document.createElement('div');
  bullWrap.className = 'p2-gauge-wrap';
  const bearWrap = document.createElement('div');
  bearWrap.className = 'p2-gauge-wrap';
  p4.body.appendChild(bullWrap);
  p4.body.appendChild(bearWrap);

  const gaugeBull = new Gauge(bullWrap, {
    scaleMax: 160,
    zoneStart: 120,
    tickStep: 20,
    color: '#f6bfd0',
    zoneColor: '#6f3045',
    titleColor: '#ff3f6f',
    width: 380,
    height: 220,
    title: '多方攻擊'
  });
  const gaugeBear = new Gauge(bearWrap, {
    scaleMax: 160,
    zoneStart: 120,
    tickStep: 20,
    color: '#b9efd3',
    zoneColor: '#2a6f4c',
    titleColor: '#21dc84',
    width: 380,
    height: 220,
    title: '空方攻擊'
  });

  p5.setContent(`
    <div class="p2-pie-layout">
      <div class="p2-pie-top">
        <div class="p2-pie-card p2-pie-card--large" data-key="台灣50"><div class="p2-pie-title">台灣50</div><canvas></canvas></div>
        <div class="p2-pie-card p2-pie-card--large" data-key="中型100"><div class="p2-pie-title">中型100</div><canvas></canvas></div>
      </div>
      <div class="p2-pie-bottom">
        <div class="p2-pie-card p2-pie-card--small" data-key="電子"><div class="p2-pie-title">電子</div><canvas></canvas></div>
        <div class="p2-pie-card p2-pie-card--small" data-key="金融"><div class="p2-pie-title">金融</div><canvas></canvas></div>
        <div class="p2-pie-card p2-pie-card--small" data-key="傳產"><div class="p2-pie-title">傳產</div><canvas></canvas></div>
      </div>
    </div>
  `);

  const p6 = new Panel(bottom, { badge: '6', title: '前十大權值股' }); p6.root.classList.add('p2-resize');
  const p7 = new Panel(bottom, { badge: '7', title: '類股 K 線（台指/電子/金融/傳產/摩台）' }); p7.root.classList.add('p2-resize');
  const p8 = new Panel(bottom, { badge: '8', title: '類股今日漲跌幅' }); p8.root.classList.add('p2-resize');
  p6.setContent('<div class="p2-chart-wrap p2-chart-wrap--w120"><canvas id="p2-c6" class="p2-chart-canvas"></canvas></div>');
  p7.setContent('<div class="p2-chart-wrap p2-chart-wrap--w90"><canvas id="p2-c7" class="p2-chart-canvas"></canvas></div>');
  p8.setContent('<div class="p2-chart-wrap p2-chart-wrap--w90"><canvas id="p2-c8" class="p2-chart-canvas"></canvas></div>');

  const yesterdayVolume = Number(store.get('taiex').volume) || 0;
  const baseBullBear = store.get('bullBear');
  const attackState = {
    bullValue: Number(baseBullBear?.bull?.score) || 24,
    bullMax: 38,
    bearValue: Number(baseBullBear?.bear?.score) || 16,
    bearMax: 48
  };

  const clockEl = container.querySelector('#p2-bigclock');
  const stopMainSplit = bindHorizontalSplitter(container.querySelector('#p2-main-split'), {
    getValue: () => readVar(layoutEl, '--p2-left-w', 360),
    setValue: (px) => layoutEl.style.setProperty('--p2-left-w', `${px}px`),
    min: 280,
    max: 760
  });
  const stopCenterSplit = bindHorizontalSplitter(centerSplit, {
    getValue: () => readVar(center, '--p2-center-left-w', 440),
    setValue: (px) => center.style.setProperty('--p2-center-left-w', `${px}px`),
    min: 300,
    max: 900
  });
  const clockResize = new ResizeObserver(() => {
    const rect = p4.body.getBoundingClientRect();
    const size = Math.max(32, Math.min(96, Math.floor(Math.min(rect.width * 0.16, rect.height * 0.18))));
    clockEl.style.fontSize = `${size}px`;
  });
  clockResize.observe(p4.body);

  const renderMain = () => {
    const t = store.get('taiex');
    const f = store.get('futures');
    const spread = +(f.price - t.price).toFixed(2);
    const estimated = estimateSessionVolume(Number(t.volume) || 0);

    container.querySelector('#p2-main').innerHTML = `
      <div class="p2-flow-row"><span>加權指數</span><strong class="${c(t.change)}">${t.price} / ${t.change}</strong></div>
      <div class="p2-flow-row"><span>台指期</span><strong class="${c(f.change)}">${f.price} / ${f.change}</strong></div>
      <div class="p2-flow-row"><span>價差</span><strong class="${c(spread)}">${spread}</strong></div>
    `;

    container.querySelector('#p2-spread').innerHTML = `
      <div class="p2-flow-row"><span>試搓預測價</span><strong class="${c(t.change)}">${t.price.toFixed(2)}</strong></div>
      <div class="p2-flow-row"><span>試搓漲跌</span><strong class="${c(t.change)}">${t.change.toFixed(2)}</strong></div>
      <div class="p2-flow-row"><span>擬合估量</span><strong>${(t.volume * 0.07).toFixed(2)}</strong></div>
      <div class="p2-flow-row"><span>內外盤差</span><strong class="${c(spread)}">${(-spread).toFixed(0)}</strong></div>
    `;

    container.querySelector('#p2-vol-y').textContent = yesterdayVolume.toFixed(2);
    container.querySelector('#p2-vol-e').textContent = estimated.toFixed(2);
    drawEstimateSystem(container.querySelector('#p2-est-canvas'), t, f);
  };

  const renderFlow = (m) => {
    container.querySelector('#p2-flow').innerHTML = `
      <div class="p2-flow-row"><span>大戶（估/實）</span><strong class="${c(m.bigPlayer.actual)}">${m.bigPlayer.estimated} / ${m.bigPlayer.actual}</strong></div>
      <div class="p2-flow-row"><span>中實戶（估/實）</span><strong class="${c(m.midPlayer.actual)}">${m.midPlayer.estimated} / ${m.midPlayer.actual}</strong></div>
      <div class="p2-flow-row"><span>其他（估/實）</span><strong class="${c(m.other.actual)}">${m.other.estimated} / ${m.other.actual}</strong></div>
    `;
  };

  const renderAttackGauge = () => {
    const bullNeedle = (attackState.bullValue / attackState.bullMax) * 160;
    const bearNeedle = (attackState.bearValue / attackState.bearMax) * 160;
    gaugeBull.update({ value: bullNeedle, displayValue: attackState.bullValue, displayMax: attackState.bullMax, title: '多方攻擊' });
    gaugeBear.update({ value: bearNeedle, displayValue: attackState.bearValue, displayMax: attackState.bearMax, title: '空方攻擊' });
  };

  const renderSectors = (src) => {
    const findSector = (name) => src.find((s) => s.name === name);
    const fin = findSector('金融');
    const ele = findSector('電子');
    const tra = findSector('傳產') || findSector('航運');

    const pies = {
      台灣50: { upPct: 58, downPct: 20, flatPct: 22 },
      中型100: { upPct: 53, downPct: 25, flatPct: 22 },
      金融: { upPct: fin?.upPct ?? 40, downPct: fin?.downPct ?? 45, flatPct: fin?.flatPct ?? 15 },
      電子: { upPct: ele?.upPct ?? 55, downPct: ele?.downPct ?? 30, flatPct: ele?.flatPct ?? 15 },
      傳產: { upPct: tra?.upPct ?? 42, downPct: tra?.downPct ?? 38, flatPct: tra?.flatPct ?? 20 }
    };

    Object.entries(pies).forEach(([key, value]) => {
      const canvas = p5.body.querySelector(`.p2-pie-card[data-key="${key}"] canvas`);
      if (!canvas) return;
      drawSectorPie(canvas, value, { size: key === '台灣50' || key === '中型100' ? 240 : 160 });
    });
  };

  const renderCharts = () => {
    const stocks = store.get('topStocks');
    const top10 = TOP10_CODES.map((code) => stocks.find((s) => s.code === code)).filter(Boolean);

    drawBars(
      container.querySelector('#p2-c6'),
      top10.map((s) => ({ label: s.code, subLabel: s.name, value: s.changePct })),
      { axisBottom: 44, maxWidth: 672 }
    );

    const taiex = store.get('taiex');
    const sectors = store.get('sectors');
    const cat = getCategoryStats(taiex, sectors);

    const candles = cat.map((x) => {
      const close = x.chg;
      const open = +(x.chg * 0.35).toFixed(2);
      const high = +(Math.min(3.8, Math.max(open, close) + 0.75)).toFixed(2);
      const low = +(Math.max(-3.8, Math.min(open, close) - 0.75)).toFixed(2);
      return { label: x.label, open, high, low, close };
    });

    drawCategoryCandle(container.querySelector('#p2-c7'), candles, { minV: -4, maxV: 4, ticks: [-4, -2, 0, 2, 4], maxWidth: 504 });
    drawBars(
      container.querySelector('#p2-c8'),
      CATEGORY_KEYS.map((k) => {
        const hit = cat.find((x) => x.label === k);
        return { label: k, value: hit ? hit.chg : 0 };
      }),
      { ticks: [-2, -1, 0, 1, 2], maxWidth: 504 }
    );
  };

  renderMain();
  renderFlow(store.get('moneyFlow'));
  renderAttackGauge();
  renderSectors(store.get('sectors'));
  renderCharts();

  const estResize = new ResizeObserver(() => {
    const t = store.get('taiex');
    const f = store.get('futures');
    drawEstimateSystem(container.querySelector('#p2-est-canvas'), t, f);
  });
  estResize.observe(p10.body);

  const pieResize = new ResizeObserver(() => {
    renderSectors(store.get('sectors'));
  });
  pieResize.observe(p5.body);

  const chartResize = new ResizeObserver(() => {
    renderCharts();
  });
  chartResize.observe(bottom);

  const u1 = store.subscribe('taiex', () => {
    renderMain();
    renderCharts();
  });
  const u2 = store.subscribe('futures', renderMain);
  const u3 = store.subscribe('moneyFlow', renderFlow);
  const u4 = store.subscribe('sectors', () => {
    renderSectors(store.get('sectors'));
    renderCharts();
  });
  const u5 = store.subscribe('topStocks', renderCharts);
  const u6 = store.subscribe('bullBear', (b) => {
    attackState.bullValue = clamp(Number(b.bull?.score) || attackState.bullValue, 0, attackState.bullMax);
    attackState.bearValue = clamp(Number(b.bear?.score) || attackState.bearValue, 0, attackState.bearMax);
    renderAttackGauge();
  });

  const attackTimer = setInterval(() => {
    attackState.bullValue = driftAttack(attackState.bullValue, attackState.bullMax);
    attackState.bearValue = driftAttack(attackState.bearValue, attackState.bearMax);
    renderAttackGauge();
  }, 2500);

  const clockTimer = setInterval(() => {
    const t = new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
    container.querySelector('#p2-clock').textContent = t;
    container.querySelector('#p2-bigclock').textContent = t;
  }, 1000);

  cleanup = () => {
    clearInterval(clockTimer);
    clearInterval(attackTimer);
    clockResize.disconnect();
    estResize.disconnect();
    pieResize.disconnect();
    chartResize.disconnect();
    stopMainSplit();
    stopCenterSplit();
    u1(); u2(); u3(); u4(); u5(); u6();
    gaugeBull.destroy();
    gaugeBear.destroy();
    p1.destroy(); p2.destroy(); p10.destroy(); p3.destroy(); p4.destroy(); p5.destroy(); p6.destroy(); p7.destroy(); p8.destroy();
  };

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}
