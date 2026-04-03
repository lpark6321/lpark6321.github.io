import { store } from '../../data/store.js';
import { TreemapControls } from '../../components/TreemapControls.js';
import { TreemapCanvas } from '../../components/TreemapCanvas.js';

let cleanup = () => {};

const SECTORS = ['加權指數', '半導體', '金融', 'ETF', '航運', '傳產'];

function normalizeSector(name) {
  if (name.includes('半導')) return '半導體';
  if (name.includes('金融')) return '金融';
  if (name.includes('ETF')) return 'ETF';
  if (name.includes('航')) return '航運';
  return '傳產';
}

function drawSectorPie(canvas, data, title) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = Math.max(680, Math.floor(canvas.clientWidth));
  const h = canvas.height = Math.max(480, Math.floor(canvas.clientHeight));
  ctx.clearRect(0, 0, w, h);

  if (!data.length) return;

  const total = data.reduce((s, x) => s + x.marketCap, 0) || 1;
  const sorted = [...data].sort((a, b) => b.marketCap - a.marketCap).map((x) => ({
    label: `${x.code} ${x.name}`,
    value: x.marketCap,
    pct: (x.marketCap / total) * 100
  }));

  const major = sorted.filter((x) => x.pct >= 1);
  const minor = sorted.filter((x) => x.pct < 1);
  const merged = [...major];
  if (minor.length) {
    merged.push({
      label: '其他',
      value: minor.reduce((s, x) => s + x.value, 0),
      pct: minor.reduce((s, x) => s + x.pct, 0)
    });
  }

  const cx = w * 0.33;
  const cy = h * 0.52;
  const r = Math.min(w, h) * 0.32;
  const colors = ['#e74c3c', '#f1948a', '#c0392b', '#27ae60', '#82e0aa', '#2a3550', '#3d84ff', '#f5c842', '#95a5a6'];

  let a = -Math.PI / 2;
  merged.forEach((m, i) => {
    const ang = (m.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a, a + ang);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    a += ang;
  });

  ctx.fillStyle = '#dce4f5';
  ctx.font = 'bold 18px Noto Sans TC';
  ctx.fillText(`${title} 成分圓盤`, w * 0.63, 40);
  ctx.font = '14px Noto Sans TC';

  merged.slice(0, 20).forEach((m, i) => {
    const y = 74 + i * 24;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(w * 0.63, y - 12, 12, 12);
    ctx.fillStyle = '#dce4f5';
    ctx.fillText(`${m.label} ${m.pct.toFixed(2)}%`, w * 0.63 + 18, y - 2);
  });
}

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 6｜台股市場地圖（Finviz 風格）</h2></div>
    <div class="p6-grid">
      <div class="p6-topbar panel"><div class="panel__body p6-topbar-body"><div id="p6-sectors" class="p6-sectors"></div><div id="p6-viewmode" class="p6-viewmode"><button id="p6-mode-map">方塊圖</button><button id="p6-mode-pie">圓盤圖</button></div></div></div>
      <div id="p6-controls"></div>
      <div class="panel p6-map-panel"><div class="panel__body"><div id="p6-map" class="p6-map-wrap"></div><div id="p6-pie" class="p6-pie-wrap"><canvas id="p6-pie-canvas" style="width:100%;height:100%"></canvas></div></div></div>
      <div class="panel"><div class="panel__body p6-detail" id="p6-detail">點擊方塊查看個股資訊</div></div>
    </div>
  `;

  let settings = { groupBy: 'none', colorBy: 'changePct', sizeBy: 'marketCap', marketFilter: 'all', search: '' };
  let mode = 'map';
  let sector = '加權指數';

  const controls = new TreemapControls(container.querySelector('#p6-controls'), {
    onChange: (next) => {
      settings = next;
      render();
    }
  });

  const sectorWrap = container.querySelector('#p6-sectors');
  sectorWrap.innerHTML = SECTORS.map((s) => `<button data-sector="${s}">${s}</button>`).join('');
  sectorWrap.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
    sector = btn.dataset.sector;
    sectorWrap.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
    render();
  }));
  sectorWrap.querySelector('button')?.classList.add('is-active');

  const mapWrap = container.querySelector('#p6-map');
  const pieWrap = container.querySelector('#p6-pie');
  const pieCanvas = container.querySelector('#p6-pie-canvas');

  const map = new TreemapCanvas(mapWrap, {
    onClick: (hit) => {
      container.querySelector('#p6-detail').textContent = `${hit.code} ${hit.name}｜${hit.sector}｜價 ${hit.price}｜漲跌 ${hit.changePct}%｜市值 ${hit.marketCap} 億`;
    }
  });

  const setMode = (m) => {
    mode = m;
    mapWrap.style.display = mode === 'map' ? 'block' : 'none';
    pieWrap.style.display = mode === 'pie' ? 'flex' : 'none';
    render();
  };

  container.querySelector('#p6-mode-map').addEventListener('click', () => setMode('map'));
  container.querySelector('#p6-mode-pie').addEventListener('click', () => setMode('pie'));

  const filterData = () => {
    let data = store.get('marketMap').map((x) => ({ ...x, sectorNorm: normalizeSector(x.sector) }));
    if (settings.marketFilter !== 'all') data = data.filter((x) => x.market === settings.marketFilter);
    if (sector !== '加權指數') data = data.filter((x) => x.sectorNorm === sector);
    return data.sort((a, b) => b.marketCap - a.marketCap).slice(0, 180);
  };

  const render = () => {
    const data = filterData();
    if (mode === 'map') map.update(data, settings);
    else drawSectorPie(pieCanvas, data, sector);
  };

  render();
  const unsub = store.subscribe('marketMap', () => render());

  cleanup = () => {
    unsub();
    controls.destroy();
    map.destroy();
  };

  return cleanup;
}

export function unmount() {
  cleanup();
  cleanup = () => {};
}
