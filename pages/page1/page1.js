import { store } from '../../data/store.js';
import { Panel } from '../../components/Panel.js';
import { Sparkline } from '../../components/Sparkline.js';
import { StockCard } from '../../components/StockCard.js';
import { mountTradingView } from '../../services/tradingview.js';

let cleanup = () => {};

const TOP10_CODES = ['2330', '2308', '2317', '2454', '3711', '2881', '2382', '2412', '2882', '2891'];
const AMP_GRID = [["最大振幅",2668],["大大振幅",1749],["平均振幅",1282],["小小振幅",970],["最小振幅",677],["本日振幅",369]];

function c(v) { return v >= 0 ? 'metric-up' : 'metric-down'; }
function n(v, d = 2) { return Number(v).toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d }); }

const PRODUCT_SESSIONS = {
  '台指': { start: '08:45', end: '13:45', ticks: 29 },
  '台指(全)': { start: '15:00', end: '13:45', ticks: 45 }
};

function toMinutes(label) {
  const [h, m] = label.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(total) {
  const minutes = ((Math.round(total) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildSessionLabels(mode) {
  const session = PRODUCT_SESSIONS[mode] || PRODUCT_SESSIONS['台指'];
  const start = toMinutes(session.start);
  const end = toMinutes(session.end);
  const span = end > start ? end - start : (1440 - start) + end;
  return Array.from({ length: 6 }, (_, idx) => formatMinutes(start + (span * idx) / 5));
}

function resolveProductSnapshot(mode, taiex, futures) {
  if (mode === '台指(全)') {
    return {
      name: mode,
      price: futures.price + 153,
      open: futures.open + 147,
      high: futures.high + 149,
      low: futures.low + 151,
      prevClose: futures.prevClose + 150,
      chg: futures.change - 2,
      chgPct: futures.changePct - 0.1,
      volume: +(taiex.volume * 1.18).toFixed(2)
    };
  }

  return {
    name: mode,
    price: futures.price,
    open: futures.open,
    high: futures.high,
    low: futures.low,
    prevClose: futures.prevClose,
    chg: futures.change,
    chgPct: futures.changePct,
    volume: taiex.volume
  };
}

function buildIntradaySeries(mode, snapshot) {
  const session = PRODUCT_SESSIONS[mode] || PRODUCT_SESSIONS['台指'];
  const labels = buildSessionLabels(mode);
  const count = session.ticks;
  const hiIndex = Math.max(2, Math.floor(count * 0.34));
  const loIndex = Math.min(count - 3, Math.floor(count * 0.72));
  const range = Math.max(snapshot.high - snapshot.low, Math.abs(snapshot.chg) * 2, snapshot.price * 0.003, 1);
  const points = [];
  let cumValue = 0;
  let cumVolume = 0;

  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1 || 1);
    const base = snapshot.open + (snapshot.price - snapshot.open) * t;
    const wave = Math.sin(t * Math.PI * 1.35) * range * 0.18 + Math.sin(t * Math.PI * 5.2) * range * 0.06;
    let price = base + wave;

    if (i === 0) price = snapshot.open;
    if (i === count - 1) price = snapshot.price;
    if (i === hiIndex) price = snapshot.high;
    if (i === loIndex) price = snapshot.low;
    price = Math.max(snapshot.low, Math.min(snapshot.high, price));

    const midday = 1 - Math.abs(t - 0.5) * 1.5;
    const volume = Math.max(18, Math.round(44 + (Math.sin(t * Math.PI * 2.8) + 1.2) * 20 + (1 - midday) * 36));
    cumValue += price * volume;
    cumVolume += volume;

    points.push({
      price,
      avg: cumValue / cumVolume,
      volume
    });
  }

  points[0].price = snapshot.open;
  points[count - 1].price = snapshot.price;
  return { points, labels };
}

function drawTrend(canvas, data, meta = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(520, Math.floor(canvas.clientWidth));
  const h = canvas.height = Math.max(320, Math.floor(canvas.clientHeight));
  ctx.clearRect(0, 0, w, h);
  if (!data?.points?.length) return;

  const { points, labels } = data;
  const priceValues = points.flatMap((point) => [point.price, point.avg]);
  const min = Math.min(...priceValues, meta.low ?? priceValues[0]);
  const max = Math.max(...priceValues, meta.high ?? priceValues[0]);
  const range = max - min || 1;
  const left = 58;
  const right = 18;
  const top = 14;
  const bottom = 28;
  const volumeGap = 16;
  const volumeHeight = Math.max(78, Math.round(h * 0.24));
  const priceHeight = h - top - bottom - volumeGap - volumeHeight;
  const volumeTop = top + priceHeight + volumeGap;
  const pw = w - left - right;
  const x = (i) => left + (i / (points.length - 1 || 1)) * pw;
  const y = (v) => top + (1 - (v - min) / range) * priceHeight;
  const maxVolume = Math.max(...points.map((point) => point.volume), 1);
  const yVolume = (v) => volumeTop + volumeHeight - (v / maxVolume) * volumeHeight;

  ctx.fillStyle = '#10151f';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#1a2236';
  [0, 0.25, 0.5, 0.75, 1].forEach((step) => {
    const yy = top + priceHeight * step;
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();

    const value = max - range * step;
    ctx.fillStyle = '#98a6c7';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.fillText(n(value, value >= 100 ? 0 : 2), left - 8, yy + 4);
  });

  [0, 0.5, 1].forEach((step) => {
    const yy = volumeTop + volumeHeight * step;
    ctx.strokeStyle = '#21283a';
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(w - right, yy);
    ctx.stroke();
  });

  labels.forEach((label, idx) => {
    const xx = left + (idx / (labels.length - 1 || 1)) * pw;
    ctx.strokeStyle = '#1c2740';
    ctx.beginPath();
    ctx.moveTo(xx, top);
    ctx.lineTo(xx, volumeTop + volumeHeight);
    ctx.stroke();
    ctx.fillStyle = '#9aa6c2';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = idx === 0 ? 'left' : idx === labels.length - 1 ? 'right' : 'center';
    ctx.fillText(label, xx, h - 8);
  });

  ctx.fillStyle = '#8693b2';
  ctx.font = '12px JetBrains Mono';
  ctx.textAlign = 'right';
  ctx.fillText('量', left - 8, volumeTop + 12);

  const barWidth = Math.max(6, Math.min(14, pw / points.length * 0.62));
  points.forEach((point, idx) => {
    const xx = x(idx);
    const prev = idx === 0 ? points[0].price : points[idx - 1].price;
    ctx.fillStyle = point.price >= prev ? 'rgba(240,58,95,0.75)' : 'rgba(31,214,122,0.75)';
    ctx.fillRect(xx - barWidth / 2, yVolume(point.volume), barWidth, volumeTop + volumeHeight - yVolume(point.volume));
  });

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#f5c842cc';
  ctx.beginPath();
  points.forEach((point, idx) => idx === 0 ? ctx.moveTo(x(idx), y(point.avg)) : ctx.lineTo(x(idx), y(point.avg)));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  points.forEach((point, idx) => idx === 0 ? ctx.moveTo(x(idx), y(point.price)) : ctx.lineTo(x(idx), y(point.price)));
  ctx.strokeStyle = '#39a0ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const lastPoint = points[points.length - 1];
  const lastY = y(lastPoint.price);
  ctx.fillStyle = '#39a0ff';
  ctx.beginPath();
  ctx.arc(x(points.length - 1), lastY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(57,160,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(x(0), y(points[0].price));
  points.forEach((point, idx) => ctx.lineTo(x(idx), y(point.price)));
  ctx.lineTo(x(points.length - 1), top + priceHeight);
  ctx.lineTo(x(0), top + priceHeight);
  ctx.closePath();
  ctx.fill();
}

function drawInfoCandle(canvas, payload) {
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
  const yMax = Math.max(payload.high, payload.open, payload.close);
  const yMin = Math.min(payload.low, payload.open, payload.close);
  const range = yMax - yMin || 1;
  const y = (v) => top + (1 - (v - yMin) / range) * (h - top - bottom);

  const cx = (w - left - right) / 2 + left;
  const bw = Math.min(24, (w - left - right) * 0.4);

  ctx.strokeStyle = '#cde2d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, y(payload.high));
  ctx.lineTo(cx, y(payload.low));
  ctx.stroke();

  const up = payload.close >= payload.open;
  ctx.fillStyle = up ? '#2dd14f' : '#f03a5f';
  ctx.fillRect(cx - bw / 2, Math.min(y(payload.open), y(payload.close)), bw, Math.max(3, Math.abs(y(payload.open) - y(payload.close))));

  const changeText = `${payload.change >= 0 ? '+' : ''}${payload.change.toFixed(0)}`;
  const ampText = `${payload.ampPct >= 0 ? '+' : ''}${payload.ampPct.toFixed(1)}%`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#b5bfd6';
  ctx.font = '700 13px Noto Sans TC';
  ctx.fillText('漲跌:', 8, h - 32);
  ctx.fillText('幅度:', 8, h - 12);

  ctx.textAlign = 'right';
  ctx.fillStyle = payload.change >= 0 ? '#2dd14f' : '#f03a5f';
  ctx.font = '700 28px JetBrains Mono';
  ctx.fillText(changeText, w - 8, h - 28);
  ctx.fillStyle = payload.ampPct >= 0 ? '#2dd14f' : '#f03a5f';
  ctx.font = '700 20px JetBrains Mono';
  ctx.fillText(ampText, w - 8, h - 8);
}

function drawMonitor(canvas, rows) {
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

function drawAmp20(canvas, hist) {
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

  const amps = hist.map((x) => Math.abs(x.delta));
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

  const bw = Math.max(12, Math.min(20, (pw - hist.length * 8) / hist.length));
  hist.forEach((x, i) => {
    const px = left + 8 + i * (bw + 8);
    const close = Math.max(-4, Math.min(4, x.delta / 180));
    const open = +(close * (Math.random() * 0.6 - 0.3)).toFixed(2);
    const high = Math.min(4, Math.max(open, close) + Math.random() * 0.8);
    const low = Math.max(-4, Math.min(open, close) - Math.random() * 0.8);
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

  const ref = 677;
  const refY = bY(ref);
  ctx.fillStyle = 'rgba(193,56,100,0.25)';
  ctx.fillRect(left, refY, pw, bTop + bH - refY);
  ctx.strokeStyle = '#82e0aa';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(left, refY);
  ctx.lineTo(w - right, refY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#82e0aa';
  ctx.font = '12px JetBrains Mono';
  ctx.fillText('最小振幅 677', w - right - 86, refY - 4);

  hist.forEach((x, i) => {
    const px = left + 8 + i * (bw + 8);
    const amp = Math.abs(x.delta);
    ctx.fillStyle = 'rgba(148,87,128,0.6)';
    ctx.fillRect(px, bY(amp), bw, bTop + bH - bY(amp));
  });

  ctx.beginPath();
  hist.forEach((x, i) => {
    const amp = Math.abs(x.delta);
    const xx = left + 8 + i * (bw + 8) + bw / 2;
    const yy = bY(amp);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  });
  ctx.strokeStyle = '#6f88d9';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function makeMonitorRows(mode, data) {
  const all = [...data.topStocks, ...data.screenResults];
  let source = [];
  if (mode === '權值股') source = TOP10_CODES.map((c) => all.find((x) => x.code === c)).filter(Boolean);
  if (mode === '高價股') source = all.filter((x) => (x.price || 0) >= 500).sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 12);
  if (mode === '熱門股') source = all.sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 12);
  if (mode === '自選股') {
    const set = data.watchlist.map((x) => x.code);
    source = set.map((c) => all.find((x) => x.code === c)).filter(Boolean).slice(0, 12);
  }

  return source.map((x) => {
    const closePct = Math.max(-10, Math.min(10, x.changePct || 0));
    const openPct = +(closePct * (Math.random() * 0.6 - 0.3)).toFixed(2);
    const highPct = Math.max(openPct, closePct) + Math.random() * 1.5;
    const lowPct = Math.min(openPct, closePct) - Math.random() * 1.5;
    return {
      code: x.code,
      shortName: String(x.name || '').replace('-KY', ''),
      openPct,
      closePct,
      highPct: Math.min(10, highPct),
      lowPct: Math.max(-10, lowPct)
    };
  });
}

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 1｜期貨總覽</h2><span class="page-clock" id="p1-clock"></span></div>
    <div class="p1-layout">
      <aside class="p1-left" id="p1-left"></aside>
      <section class="panel p1-center p1-resize"><div class="panel__header"><span class="panel__badge">C</span><h3 class="panel__title">TAIEX FUTURES 主圖</h3></div><div class="panel__body p1-tv" id="p1-tv"></div></section>
      <aside class="p1-right" id="p1-right"></aside>
      <section class="panel p1-bottom p1-resize"><div class="panel__header"><span class="panel__badge">B</span><h3 class="panel__title">多功能看板</h3></div><div class="panel__body"><div class="p1-b-tabs" id="p1-b-tabs"></div><div id="p1-b-content" class="p1-b-content"></div></div></section>
    </div>
  `;

  const left = container.querySelector('#p1-left');
  const right = container.querySelector('#p1-right');

  const pLeft = new Panel(left, { badge: '1', title: '台指綜合資訊' }); pLeft.root.classList.add('p1-resize');
  const p6 = new Panel(right, { badge: '6', title: '走勢圖' }); p6.root.classList.add('p1-resize');
  const p5 = new Panel(right, { badge: '5', title: '即時股價監控' }); p5.root.classList.add('p1-resize');

  pLeft.setContent(`
    <div class="p1-side-table" id="p1-main"></div>
    <div class="p1-side-levels" id="p1-levels"></div>
    <div class="p1-side-amp" id="p1-hist"></div>
  `);

  p6.setContent(`
    <div class="p1-tabs" id="p1-s6-tabs">
      <button data-k="trend" class="is-active">加權指數走勢</button>
      <button data-k="group">自選股走勢</button>
    </div>
    <div id="p1-s6-trend" class="p1-s6-pane"><canvas class="p1-trend-canvas" id="p1-trend"></canvas><div class="p1-trend-meta" id="p1-trend-meta"></div></div>
    <div id="p1-s6-group" class="p1-s6-pane" style="display:none"><div class="p1-mini" id="p1-mini"></div></div>
  `);

  p5.setContent(`
    <div class="p1-monitor-head"><select id="p1-monitor-select"><option>權值股</option><option>高價股</option><option>熱門股</option><option>自選股</option></select></div>
    <div class="p1-monitor-wrap" id="p1-monitor-wrap"><canvas id="p1-monitor-canvas" class="p1-monitor-canvas"></canvas></div>
  `);

  const histData = [
    { date: '04/01', close: 32420, delta: 40 }, { date: '03/31', close: 32380, delta: -100 }, { date: '03/30', close: 32480, delta: 120 },
    { date: '03/29', close: 32360, delta: 95 }, { date: '03/28', close: 32265, delta: -210 }, { date: '03/27', close: 32475, delta: 180 },
    { date: '03/26', close: 32295, delta: -88 }, { date: '03/25', close: 32383, delta: 156 }, { date: '03/24', close: 32227, delta: -342 },
    { date: '03/21', close: 32569, delta: 223 }, { date: '03/20', close: 32346, delta: -115 }, { date: '03/19', close: 32461, delta: 289 },
    { date: '03/18', close: 32172, delta: -198 }, { date: '03/17', close: 32370, delta: 401 }, { date: '03/14', close: 31969, delta: -87 },
    { date: '03/13', close: 32056, delta: 66 }, { date: '03/12', close: 31990, delta: -54 }, { date: '03/11', close: 32044, delta: 41 },
    { date: '03/10', close: 32003, delta: -33 }, { date: '03/07', close: 32036, delta: 77 }
  ];

  let cards = [];
  let miniSparks = [];
  let activeBTab = 'weighted';
  let productMode = '台指(全)';
  let ampResizeObserver = null;

  const bTabs = [
    { key: 'weighted', label: '十大權值股' },
    { key: 'intraday', label: '台指盤中資訊' },
    { key: 'watch', label: '自選股' },
    { key: 'volume', label: '大盤預估量' },
    { key: 'amp20', label: '20日振幅變化' }
  ];

  const renderBTabs = () => {
    container.querySelector('#p1-b-tabs').innerHTML = bTabs.map((t) => `<button data-k="${t.key}" class="${activeBTab === t.key ? 'is-active' : ''}">${t.label}</button>`).join('');
    container.querySelectorAll('#p1-b-tabs button').forEach((btn) => btn.addEventListener('click', () => {
      activeBTab = btn.dataset.k;
      renderBTabs();
      renderBContent();
    }));
  };

  const attachAmpResize = () => {
    if (ampResizeObserver) ampResizeObserver.disconnect();
    const wrap = container.querySelector('#p1-amp20-wrap');
    const cvs = container.querySelector('#p1-amp20');
    if (!wrap || !cvs) return;
    ampResizeObserver = new ResizeObserver(() => drawAmp20(cvs, histData));
    ampResizeObserver.observe(wrap);
  };

  const renderBContent = () => {
    cards.forEach((x) => x.destroy()); cards = [];
    if (ampResizeObserver) { ampResizeObserver.disconnect(); ampResizeObserver = null; }

    const box = container.querySelector('#p1-b-content');

    if (activeBTab === 'weighted') {
      box.innerHTML = '<div class="p1-cards" id="p1-cards"></div>';
      const wrap = box.querySelector('#p1-cards');
      const list = store.get('topStocks');
      const weighted = TOP10_CODES.map((code) => list.find((s) => s.code === code)).filter(Boolean);
      weighted.forEach((s) => cards.push(new StockCard(wrap, { stock: s })));
      return;
    }

    if (activeBTab === 'intraday') {
      const t = store.get('taiex');
      const f = store.get('futures');
      box.innerHTML = `
        <div class="p1-rows">
          <div class="p1-row"><span>加權 開/高/低</span><strong>${t.open} / ${t.high} / ${t.low}</strong></div>
          <div class="p1-row"><span>加權 現/漲跌</span><strong class="${c(t.change)}">${t.price} / ${t.change}</strong></div>
          <div class="p1-row"><span>台指 開/高/低</span><strong>${f.open} / ${f.high} / ${f.low}</strong></div>
          <div class="p1-row"><span>台指 現/漲跌</span><strong class="${c(f.change)}">${f.price} / ${f.change}</strong></div>
        </div>
      `;
      return;
    }

    if (activeBTab === 'watch') {
      const w = store.get('watchlist');
      const map = new Map([...store.get('topStocks'), ...store.get('screenResults')].map((x) => [x.code, x]));
      box.innerHTML = `<div class="p1-rows">${w.map((x) => {
        const q = map.get(x.code) || { price: '-', changePct: 0 };
        return `<div class="p1-row"><span>${x.group}｜${x.code} ${x.name}</span><strong class="${c(q.changePct)}">${q.price} / ${q.changePct}%</strong></div>`;
      }).join('')}</div>`;
      return;
    }

    if (activeBTab === 'volume') {
      const t = store.get('taiex');
      const ratio = Math.min(100, Math.max(0, (t.volume / (t.volEstimate || 1)) * 100));
      box.innerHTML = `
        <div class="p1-rows">
          <div class="p1-row"><span>目前成交量</span><strong>${t.volume}</strong></div>
          <div class="p1-row"><span>預估成交量</span><strong>${t.volEstimate}</strong></div>
          <div style="height:14px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:${ratio}%;background:var(--gold)"></div></div>
          <div class="p1-row"><span>達成率</span><strong>${ratio.toFixed(2)}%</strong></div>
        </div>
      `;
      return;
    }

    box.innerHTML = '<div id="p1-amp20-wrap" class="p1-amp20-wrap"><canvas id="p1-amp20" style="width:100%;height:100%"></canvas></div>';
    drawAmp20(box.querySelector('#p1-amp20'), histData);
    attachAmpResize();
  };

  const renderLeftPanel = () => {
    const d = store.get('taiex');
    const f = store.get('futures');
    const isFull = productMode === '台指(全)';
    const m = resolveProductSnapshot(productMode, d, f);

    container.querySelector('#p1-main').innerHTML = `
      <div class="p1-kv"><span>商品</span><strong><label class="p1-radio"><input type="radio" name="p1-product" value="台指(全)" ${isFull ? 'checked' : ''}>台指(全)</label><label class="p1-radio"><input type="radio" name="p1-product" value="台指" ${!isFull ? 'checked' : ''}>台指</label></strong></div>
      <div class="p1-main-top">
        <div class="p1-main-table">
          <div class="p1-kv"><span>台約開</span><strong>${m.open}</strong></div>
          <div class="p1-kv"><span>台約高</span><strong>${m.high}</strong></div>
          <div class="p1-kv"><span>台約低</span><strong>${m.low}</strong></div>
          <div class="p1-kv"><span>月成本</span><strong>${m.prevClose}</strong></div>
        </div>
        <div class="p1-main-mini" id="p1-main-mini">
          <canvas id="p1-main-mini-canvas" class="p1-main-mini-canvas"></canvas>
        </div>
      </div>
      <div class="p1-kv"><span>台指加權價差</span><strong class="${c(m.price - d.price)}">${(m.price - d.price).toFixed(2)}</strong></div>
      <div class="p1-kv"><span>台指近月漲跌</span><strong class="${c(m.chg)}">${m.chg.toFixed(2)}</strong></div>
    `;

    drawInfoCandle(container.querySelector('#p1-main-mini-canvas'), {
      open: m.open,
      close: m.price,
      high: m.high,
      low: m.low,
      change: m.chg,
      ampPct: m.chgPct
    });

    const upper = [d.price + 280, d.price + 180, d.price + 100, d.price + 40, d.price + 10].map((x) => x.toFixed(0));
    const lower = [d.price - 10, d.price - 40, d.price - 100, d.price - 180, d.price - 280].map((x) => x.toFixed(0));
    container.querySelector('#p1-levels').innerHTML = `
      <div class="p1-block p1-block--red"><div class="p1-block-title">日多方關卡</div>${upper.map((x, i) => `<div class="p1-kv"><span>關卡${5 - i}</span><strong>${x}</strong></div>`).join('')}</div>
      <div class="p1-block p1-block--green"><div class="p1-block-title">日空方關卡</div>${lower.map((x, i) => `<div class="p1-kv"><span>關卡${i + 1}</span><strong>${x}</strong></div>`).join('')}</div>
    `;

    container.querySelector('#p1-hist').innerHTML = `
      <div class="p1-block-title">日振幅統計(近20日)</div>
      <div class="p1-amp-list">${AMP_GRID.map((r) => `<div class="p1-kv"><span>${r[0]}</span><strong>${r[1]}</strong></div>`).join('')}</div>
    `;

    container.querySelectorAll('input[name="p1-product"]').forEach((el) => el.addEventListener('change', (e) => {
      productMode = e.target.value;
      renderLeftPanel();
      renderMainTrend();
    }));
  };

  const renderMainTrend = () => {
    const taiex = store.get('taiex');
    const futures = store.get('futures');
    const snap = resolveProductSnapshot(productMode, taiex, futures);
    const intraday = buildIntradaySeries(productMode, snap);
    const avg = intraday.points[intraday.points.length - 1]?.avg ?? snap.price;
    const totalVolume = intraday.points.reduce((sum, point) => sum + point.volume, 0);
    drawTrend(container.querySelector('#p1-trend'), intraday, { high: snap.high, low: snap.low });
    container.querySelector('#p1-trend-meta').innerHTML = `
      <span>${productMode} 盤中走勢</span>
      <span>現價 ${n(snap.price, snap.price >= 100 ? 0 : 2)}</span>
      <span>本日均價 ${n(avg, avg >= 100 ? 0 : 2)}</span>
      <span>累計量 ${n(totalVolume, 0)}</span>
      <span>時段 ${PRODUCT_SESSIONS[productMode].start} - ${PRODUCT_SESSIONS[productMode].end}</span>
    `;
  };

  const renderPage1Group = () => {
    const list = store.get('watchlist').filter((x) => x.group === 'page1分組');
    const quoteMap = new Map([...store.get('topStocks'), ...store.get('screenResults')].map((x) => [x.code, x]));

    miniSparks.forEach((x) => x.destroy()); miniSparks = [];
    const mini = container.querySelector('#p1-mini');
    if (!mini) return;

    mini.innerHTML = list.map((s) => {
      const q = quoteMap.get(s.code) || { code: s.code, name: s.name, changePct: 0, sparkline: [0, 0, 0, 0, 0] };
      return `
        <div class="p1-mini-item" data-code="${q.code}">
          <div><div>${q.code}</div><div style="color:var(--text2)">${q.name || s.name}</div></div>
          <div class="spark-${q.code}"></div>
          <div class="${c(q.changePct)}">${q.changePct > 0 ? '+' : ''}${q.changePct}%</div>
        </div>
      `;
    }).join('');

    list.forEach((s) => {
      const q = quoteMap.get(s.code) || { code: s.code, sparkline: [0, 0, 0, 0, 0], changePct: 0 };
      const el = mini.querySelector(`.spark-${q.code}`);
      if (!el) return;
      const sp = new Sparkline(el, { width: 140, height: 44, color: q.changePct >= 0 ? 'rgb(240,58,95)' : 'rgb(31,214,122)' });
      sp.update(q.sparkline || [0, 0, 0, 0, 0]);
      miniSparks.push(sp);
    });
  };

  const renderMonitor = () => {
    const mode = container.querySelector('#p1-monitor-select').value;
    const rows = makeMonitorRows(mode, {
      topStocks: store.get('topStocks'),
      screenResults: store.get('screenResults'),
      watchlist: store.get('watchlist')
    });
    drawMonitor(container.querySelector('#p1-monitor-canvas'), rows);
  };

  const setS6Tab = (tab) => {
    container.querySelectorAll('#p1-s6-tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.k === tab));
    container.querySelector('#p1-s6-trend').style.display = tab === 'trend' ? '' : 'none';
    container.querySelector('#p1-s6-group').style.display = tab === 'group' ? '' : 'none';
  };

  container.querySelectorAll('#p1-s6-tabs button').forEach((btn) => btn.addEventListener('click', () => setS6Tab(btn.dataset.k)));
  container.querySelector('#p1-monitor-select').addEventListener('change', renderMonitor);

  const monitorResize = new ResizeObserver(() => renderMonitor());
  monitorResize.observe(container.querySelector('#p1-monitor-wrap'));
  const trendResize = new ResizeObserver(() => renderMainTrend());
  trendResize.observe(container.querySelector('#p1-s6-trend'));

  const redrawAll = () => {
    renderLeftPanel();
    renderMainTrend();
    renderPage1Group();
    renderMonitor();
    renderBContent();
  };

  renderBTabs();
  redrawAll();

  const unsubTaiex = store.subscribe('taiex', redrawAll);
  const unsubFut = store.subscribe('futures', redrawAll);
  const unsubTop = store.subscribe('topStocks', redrawAll);
  const unsubWatch = store.subscribe('watchlist', redrawAll);

  const clockTimer = setInterval(() => {
    container.querySelector('#p1-clock').textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
  }, 1000);

  let stopTv = () => {};
  mountTradingView(container.querySelector('#p1-tv'), { symbol: 'TWSE:TAIEX', interval: 'D' })
    .then((fn) => { stopTv = fn; })
    .catch(() => { container.querySelector('#p1-tv').innerHTML = '<div style="color:var(--text2)">TradingView 載入失敗</div>'; });

  cleanup = () => {
    unsubTaiex(); unsubFut(); unsubTop(); unsubWatch();
    clearInterval(clockTimer); stopTv();
    monitorResize.disconnect();
    trendResize.disconnect();
    if (ampResizeObserver) ampResizeObserver.disconnect();
    cards.forEach((x) => x.destroy()); miniSparks.forEach((x) => x.destroy());
    pLeft.destroy(); p6.destroy(); p5.destroy();
  };

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}




