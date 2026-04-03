import { store } from '../../data/store.js';
import { Panel } from '../../components/Panel.js';
import { Gauge } from '../../components/Gauge.js';
import { PieChart } from '../../components/PieChart.js';

let cleanup = () => {};

const TOP10_CODES = ['2330', '2308', '2317', '2454', '3711', '2881', '2382', '2412', '2882', '2891'];
const CATEGORY_KEYS = ['台指', '電子', '金融', '傳產', '摩台'];

function c(v) { return v >= 0 ? 'metric-up' : 'metric-down'; }

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
  const w = canvas.width = 560;
  const h = canvas.height = 240;
  ctx.clearRect(0, 0, w, h);

  const maxAbs = Math.max(2, ...items.map((x) => Math.abs(x.value)));
  const axisBottom = options.axisBottom ?? 20;
  const { left, right, y } = drawAxis(ctx, w, h, -maxAbs, maxAbs, { bottom: axisBottom, ticks: options.ticks });
  const pw = w - left - right;
  const gap = items.length > 7 ? 6 : 8;
  const bw = Math.max(14, (pw - items.length * gap) / items.length);

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
  const w = canvas.width = 560;
  const h = canvas.height = 240;
  ctx.clearRect(0, 0, w, h);

  const highs = items.map((x) => x.high);
  const lows = items.map((x) => x.low);
  const minV = options.minV ?? Math.min(...lows);
  const maxV = options.maxV ?? Math.max(...highs);
  const { left, right, y } = drawAxis(ctx, w, h, minV, maxV, { ticks: options.ticks, bottom: 24 });
  const pw = w - left - right;
  const bw = Math.max(20, (pw - items.length * 14) / items.length);

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

function getCategoryStats(taiex, sectors) {
  const ele = sectors.find((s) => s.name === '電子');
  const fin = sectors.find((s) => s.name === '金融');
  const tra = sectors.find((s) => s.name === '航運');

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

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 2｜台股溫度計</h2><span class="page-clock" id="p2-clock"></span></div>
    <div class="p2-layout">
      <aside class="p2-left" id="p2-left"></aside>
      <section class="p2-center" id="p2-center"></section>
      <section class="p2-bottom" id="p2-bottom"></section>
    </div>
  `;

  const left = container.querySelector('#p2-left');
  const center = container.querySelector('#p2-center');
  const bottom = container.querySelector('#p2-bottom');

  const p1 = new Panel(left, { badge: '1', title: '加權/台指/價差' }); p1.root.classList.add('p2-resize');
  const p2 = new Panel(left, { badge: '2', title: '試搓預測' }); p2.root.classList.add('p2-resize');
  const p3 = new Panel(left, { badge: '3', title: '法人資金流向' }); p3.root.classList.add('p2-resize');
  p1.setContent('<div class="p2-flow" id="p2-main"></div>');
  p2.setContent('<div class="p2-flow" id="p2-spread"></div>');
  p3.setContent('<div class="p2-flow" id="p2-flow"></div>');

  const p4 = new Panel(center, { badge: '4', title: '時鐘與多空攻擊' }); p4.root.classList.add('p2-resize');
  const p5 = new Panel(center, { badge: '5', title: '類股分布' }); p5.root.classList.add('p2-resize');

  const clockBlock = document.createElement('div');
  clockBlock.innerHTML = `
    <div class="p2-bigclock" id="p2-bigclock">--:--:--</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div style="border:1px solid var(--border);padding:8px;text-align:center">加權昨日量<br><strong id="p2-vol-y"></strong></div>
      <div style="border:1px solid var(--border);padding:8px;text-align:center">加權預估量<br><strong id="p2-vol-e"></strong></div>
    </div>
  `;
  p4.body.appendChild(clockBlock);

  const bullWrap = document.createElement('div');
  const bearWrap = document.createElement('div');
  bullWrap.style.marginBottom = '12px';
  p4.body.appendChild(bullWrap);
  p4.body.appendChild(bearWrap);
  const gaugeBull = new Gauge(bullWrap, { max: 28, color: 'var(--red)', width: 330, height: 180 });
  const gaugeBear = new Gauge(bearWrap, { max: 48, color: 'var(--green)', width: 330, height: 180 });

  const sectorGrid = document.createElement('div');
  sectorGrid.className = 'p2-sector-grid';
  p5.body.appendChild(sectorGrid);

  const p6 = new Panel(bottom, { badge: '6', title: '前十大權值股' }); p6.root.classList.add('p2-resize');
  const p7 = new Panel(bottom, { badge: '7', title: '類股 K 線（台指/電子/金融/傳產/摩台）' }); p7.root.classList.add('p2-resize');
  const p8 = new Panel(bottom, { badge: '8', title: '類股今日漲跌幅' }); p8.root.classList.add('p2-resize');
  p6.setContent('<canvas id="p2-c6" width="560" height="240"></canvas>');
  p7.setContent('<canvas id="p2-c7" width="560" height="240"></canvas>');
  p8.setContent('<canvas id="p2-c8" width="560" height="240"></canvas>');

  let pies = [];
  const clockEl = container.querySelector('#p2-bigclock');
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

    container.querySelector('#p2-vol-y').textContent = t.volume.toFixed(2);
    container.querySelector('#p2-vol-e').textContent = t.volEstimate.toFixed(2);
  };

  const renderFlow = (m) => {
    container.querySelector('#p2-flow').innerHTML = `
      <div class="p2-flow-row"><span>大戶（估/實）</span><strong class="${c(m.bigPlayer.actual)}">${m.bigPlayer.estimated} / ${m.bigPlayer.actual}</strong></div>
      <div class="p2-flow-row"><span>中實戶（估/實）</span><strong class="${c(m.midPlayer.actual)}">${m.midPlayer.estimated} / ${m.midPlayer.actual}</strong></div>
      <div class="p2-flow-row"><span>其他（估/實）</span><strong class="${c(m.other.actual)}">${m.other.estimated} / ${m.other.actual}</strong></div>
    `;
  };

  const renderBB = (b) => {
    gaugeBull.update(b.bull.score);
    gaugeBear.update(b.bear.score);
  };

  const renderSectors = (src) => {
    pies.forEach((p) => p.destroy()); pies = [];
    sectorGrid.innerHTML = '';

    const sectors = [
      { name: '台灣50', upPct: 58, downPct: 22, flatPct: 20 },
      { name: '電子', upPct: src[0].upPct, downPct: src[0].downPct, flatPct: src[0].flatPct },
      { name: '金融', upPct: src[1].upPct, downPct: src[1].downPct, flatPct: src[1].flatPct },
      { name: '中型100', upPct: 53, downPct: 27, flatPct: 20 },
      { name: '傳產', upPct: 42, downPct: 38, flatPct: 20 }
    ];

    sectors.forEach((s) => {
      const cell = document.createElement('div');
      cell.className = 'panel';
      cell.innerHTML = `<div class="panel__body"><div style="margin-bottom:8px">${s.name}</div><div class="pie"></div></div>`;
      sectorGrid.appendChild(cell);
      const pie = new PieChart(cell.querySelector('.pie'), { size: 225 });
      pie.update([s.upPct, s.downPct, s.flatPct]);
      pies.push(pie);
    });
  };

  const renderCharts = () => {
    const stocks = store.get('topStocks');
    const top10 = TOP10_CODES.map((code) => stocks.find((s) => s.code === code)).filter(Boolean);

    drawBars(container.querySelector('#p2-c6'), top10.map((s) => ({ label: s.code, subLabel: s.name, value: s.changePct })), { axisBottom: 44 });

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

    drawCategoryCandle(container.querySelector('#p2-c7'), candles, { minV: -4, maxV: 4, ticks: [-4, -2, 0, 2, 4] });
    drawBars(container.querySelector('#p2-c8'), CATEGORY_KEYS.map((k) => {
      const hit = cat.find((x) => x.label === k);
      return { label: k, value: hit ? hit.chg : 0 };
    }), { ticks: [-2, -1, 0, 1, 2] });
  };

  renderMain();
  renderFlow(store.get('moneyFlow'));
  renderBB(store.get('bullBear'));
  renderSectors(store.get('sectors'));
  renderCharts();

  const u1 = store.subscribe('taiex', () => { renderMain(); renderCharts(); });
  const u2 = store.subscribe('futures', renderMain);
  const u3 = store.subscribe('moneyFlow', renderFlow);
  const u4 = store.subscribe('bullBear', renderBB);
  const u5 = store.subscribe('sectors', () => { renderSectors(store.get('sectors')); renderCharts(); });
  const u6 = store.subscribe('topStocks', renderCharts);

  const clockTimer = setInterval(() => {
    const t = new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
    container.querySelector('#p2-clock').textContent = t;
    container.querySelector('#p2-bigclock').textContent = t;
  }, 1000);

  cleanup = () => {
    clearInterval(clockTimer);
    clockResize.disconnect();
    u1(); u2(); u3(); u4(); u5(); u6();
    gaugeBull.destroy(); gaugeBear.destroy(); pies.forEach((p) => p.destroy());
    p1.destroy(); p2.destroy(); p3.destroy(); p4.destroy(); p5.destroy(); p6.destroy(); p7.destroy(); p8.destroy();
  };

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}
