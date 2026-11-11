// Page8 籌碼監控（只看整體）：三大法人上市現貨買賣超、大盤成交金額、期貨未平倉（大／小／微台與合計）、選擇權三大法人與 P/C Ratio。
// 資料由 marketFeed 在這頁開著時抓（store chipMonitor／chipPrevIntraday）；盤中成交金額用加權報價（taiex、taiexIntraday）。
import { store } from '../../data/store.js';
import { saveSetting } from '../../data/storage.js';
import { CHIP_DAYS, FUTURES_PRODUCTS, IDENTITIES, cumulativeMinutes, lastWithChange } from '../../services/chipMonitor.js';
import { sourceInfo } from '../../services/dashboardDataSource.js';
import { esc } from '../../services/html.js';
import { TW_SESSIONS, isTwMarketHoliday, minutesOf } from '../../services/marketCalendar.js';
import { recentAverage } from '../../services/marketOverview.js';
import { UP, drawChart } from './page8Draw.js';

const SPOT_VIEWS = { ...IDENTITIES, total: '合計' };
const OI_VIEWS = { market: '全市場（大台約當）', foreign: '外資淨（大台約當）' };
const OPEN = minutesOf(TW_SESSIONS.spot.open);
const CLOSE = minutesOf(TW_SESSIONS.spot.close);

const taipeiNow = () => new Date(Date.now() + 8 * 3600 * 1000);
const todayKey = () => taipeiNow().toISOString().slice(0, 10);
const shortDate = (date) => (date ? date.slice(5).replace('-', '/') : '--');
const colorOf = (value) => (value > 0 ? 'metric-up' : value < 0 ? 'metric-down' : 'metric-flat');
const fmt = (value, digits = 0) => (Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '--');
const signed = (value, digits = 0) => (Number.isFinite(value) ? `${value > 0 ? '+' : ''}${fmt(value, digits)}` : '--');
const cell = (value, digits = 0) => `<span class="${colorOf(value)}">${signed(value, digits)}</span>`;

// 盤後資料的日期說明：交易日當天還沒公布時講清楚看到的是哪一天。
function dataDateText(date, publishAt) {
  if (!date) return '資料載入中';
  const now = taipeiNow();
  const tradingDay = now.getUTCDay() % 6 !== 0 && !isTwMarketHoliday();
  return `資料日期 ${shortDate(date)}${tradingDay && date < todayKey() ? `（今日資料約 ${publishAt} 後公布）` : ''}`;
}

const panel = (id, title, badge, extra = '') => `
  <section class="panel p8-panel" id="p8-${id}">
    <div class="panel__header"><span class="panel__badge">${badge}</span><h3 class="panel__title">${title}</h3><span class="p8-date" data-date></span></div>
    <div class="panel__body">${extra}</div>
  </section>`;

const tabs = (name, views) => `<div class="p8-tabs" data-tabs="${name}">${Object.entries(views).map(([key, label]) => `<button type="button" data-key="${key}">${label}</button>`).join('')}</div>`;

export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar p8-topbar">
      <h2>PAGE 8｜籌碼監控</h2>
      <label>天數 <select id="p8-days">${CHIP_DAYS.map((days) => `<option value="${days}">${days} 日</option>`).join('')}</select></label>
      <span class="p8-status" id="p8-status"></span>
    </div>
    <div class="p8-grid">
      ${panel('spot', '三大法人現貨買賣超（上市，億元）', '盤後', `<div class="p8-kvs" data-kvs></div>${tabs('spot', SPOT_VIEWS)}<canvas class="p8-chart"></canvas>`)}
      ${panel('amount', '大盤成交金額（億元）', '盤中', `<div class="p8-kvs" data-kvs></div>
        <div class="p8-legend"><span style="color:${UP}">━ 今日累計</span><span style="color:#8a93a6">┅ 前一交易日</span></div><canvas class="p8-chart" data-intraday></canvas>
        <div class="p8-legend"><span>每日成交金額</span><span style="color:#f5c842">━ 20 日均量</span></div><canvas class="p8-chart" data-daily></canvas>`)}
      ${panel('oi', '期貨未平倉（口）', '盤後', `<div class="p8-tables" data-tables></div>${tabs('oi', OI_VIEWS)}<canvas class="p8-chart"></canvas>`)}
      ${panel('options', '臺指選擇權', '盤後', `<div class="p8-kvs" data-kvs></div><div class="p8-tables" data-tables></div>
        <div class="p8-legend"><span style="color:#f5c842">━ P/C 未平倉比 %</span><span style="color:#8a93a6">┅ P/C 成交量比 %</span></div><canvas class="p8-chart"></canvas>`)}
    </div>`;

  const $ = (selector) => container.querySelector(selector);
  const daysSelect = $('#p8-days');
  const status = $('#p8-status');
  const view = { spot: 'foreign', oi: 'market' };
  daysSelect.value = String(store.get('chipDays'));
  daysSelect.addEventListener('change', () => {
    const days = Number(daysSelect.value);
    saveSetting('page8Days', days);
    store.set('chipDays', days);
    render();
  });
  container.querySelectorAll('[data-tabs]').forEach((group) => group.addEventListener('click', (event) => {
    const key = event.target.closest('button')?.dataset.key;
    if (!key) return;
    view[group.dataset.tabs] = key;
    render();
  }));

  const setDate = (id, text) => { $(`#p8-${id} [data-date]`).textContent = text; };
  const kvs = (id, items) => {
    $(`#p8-${id} [data-kvs]`).innerHTML = items.map(([label, html, title = '']) => `<div class="p8-kv" title="${esc(title)}"><span>${esc(label)}</span><strong>${html}</strong></div>`).join('');
  };
  const markTabs = () => container.querySelectorAll('[data-tabs]').forEach((group) => group.querySelectorAll('button')
    .forEach((btn) => btn.classList.toggle('is-active', btn.dataset.key === view[group.dataset.tabs])));

  function renderSpot(data) {
    const rows = data?.spot || [];
    const last = rows.at(-1);
    setDate('spot', dataDateText(last?.date, '15:00'));
    kvs('spot', Object.entries(SPOT_VIEWS).map(([key, label]) => [label, cell(last?.[key], 1)]));
    drawChart($('#p8-spot canvas'), { labels: rows.map((row) => shortDate(row.date)), bars: { values: rows.map((row) => row[view.spot]) }, format: (v) => v.toFixed(0) });
  }

  function renderAmount(data) {
    const taiex = store.peek('taiex') || {};
    const today = todayKey();
    const history = (data?.amounts || []).filter((row) => row.date < today);
    const avg20 = recentAverage(history.map((row) => row.amountYi), 20);
    // 今日累計只用「公開資料」來源的證交所 MIS 每分鐘成交金額；其他來源的 1 分 K 量不是金額。
    const intraday = sourceInfo().mis ? cumulativeMinutes(store.peek('taiexIntraday')?.candles) : [];
    const prev = store.peek('chipPrevIntraday');
    const nowMinute = intraday.at(-1)?.minute;
    const prevSame = Number.isFinite(nowMinute) ? prev?.points.filter((p) => p.minute <= nowMinute).at(-1)?.amountYi : null;
    const amount = intraday.at(-1)?.amountYi ?? taiex.amountYi;
    setDate('amount', prev ? `比較日 ${shortDate(prev.date)}` : '');
    kvs('amount', [
      ['今日累計', fmt(amount)],
      ['預估全日', fmt(taiex.volEstimate)],
      ['前一交易日同時間', fmt(prevSame), prev ? `${prev.date} 同一分鐘的累計成交金額` : ''],
      ['比前日同時間', cell(Number.isFinite(amount) && Number.isFinite(prevSame) ? amount - prevSame : NaN)],
      ['20 日均量', fmt(avg20)],
      ['預估／均量', Number.isFinite(taiex.volEstimate) && avg20 ? `${(taiex.volEstimate / avg20).toFixed(2)} 倍` : '--']
    ]);
    const minutes = Array.from({ length: CLOSE - OPEN + 1 }, (_, i) => OPEN + i);
    const pick = (points) => {
      const map = new Map((points || []).map((p) => [p.minute, p.amountYi]));
      return minutes.map((m) => map.get(m) ?? NaN);
    };
    drawChart($('#p8-amount [data-intraday]'), {
      labels: minutes.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`),
      lines: [{ values: pick(prev?.points), color: '#8a93a6', dash: [4, 3] }, { values: pick(intraday), color: UP }],
      zero: true
    });
    const days = data?.days || store.peek('chipDays');
    const all = data?.amounts || [];
    const shown = all.slice(-days);
    const ma = shown.map((row) => recentAverage(all.slice(0, all.indexOf(row) + 1).map((r) => r.amountYi), 20));
    drawChart($('#p8-amount [data-daily]'), { labels: shown.map((row) => shortDate(row.date)), bars: { values: shown.map((row) => row.amountYi), color: '#4b6cb7' }, lines: [{ values: ma, color: '#f5c842' }] });
  }

  function renderOi(data) {
    const oi = data?.openInterest || [];
    const inst = data?.institutional || [];
    setDate('oi', dataDateText(oi.at(-1)?.date, '15:00'));
    const products = [...FUTURES_PRODUCTS, { id: 'total', label: '合計（大台約當）' }];
    const market = products.map((p) => {
      const item = lastWithChange(oi, (row) => row[p.id]);
      return `<tr><th>${p.label}</th><td>${fmt(item?.value)}</td><td>${cell(item?.change)}</td></tr>`;
    }).join('');
    const net = products.map((p) => `<tr><th>${p.label}</th>${Object.keys(IDENTITIES).map((id) => {
      const item = lastWithChange(inst, (row) => row[id][p.id]);
      return `<td>${cell(item?.value)}<small> (${signed(item?.change)})</small></td>`;
    }).join('')}</tr>`).join('');
    $('#p8-oi [data-tables]').innerHTML = `
      <table class="p8-table"><thead><tr><th>全市場</th><th>未平倉</th><th>增減</th></tr></thead><tbody>${market}</tbody></table>
      <table class="p8-table"><thead><tr><th>法人淨未平倉</th>${Object.values(IDENTITIES).map((label) => `<th>${label}（增減）</th>`).join('')}</tr></thead><tbody>${net}</tbody></table>`;
    const rows = view.oi === 'market' ? oi : inst;
    drawChart($('#p8-oi canvas'), view.oi === 'market'
      ? { labels: rows.map((row) => shortDate(row.date)), bars: { values: rows.map((row) => row.total), color: '#4b6cb7' }, zero: false }
      : { labels: rows.map((row) => shortDate(row.date)), bars: { values: rows.map((row) => row.foreign.total) } });
  }

  function renderOptions(data) {
    const pc = data?.pcRatio || [];
    const options = data?.options || [];
    setDate('options', dataDateText(pc.at(-1)?.date, '15:00'));
    const oiRatio = lastWithChange(pc, (row) => row.oiRatio);
    const volRatio = lastWithChange(pc, (row) => row.volRatio);
    kvs('options', [
      ['P/C 未平倉比', `${fmt(oiRatio?.value, 2)}% <small>(${signed(oiRatio?.change, 2)})</small>`, '賣權未平倉 ÷ 買權未平倉'],
      ['P/C 成交量比', `${fmt(volRatio?.value, 2)}% <small>(${signed(volRatio?.change, 2)})</small>`, '賣權成交量 ÷ 買權成交量'],
      ['買權未平倉', fmt(pc.at(-1)?.callOI)],
      ['賣權未平倉', fmt(pc.at(-1)?.putOI)]
    ]);
    const body = Object.entries(IDENTITIES).map(([id, label]) => {
      const call = lastWithChange(options, (row) => row[id]?.call);
      const put = lastWithChange(options, (row) => row[id]?.put);
      const last = options.at(-1)?.[id];
      return `<tr><th>${label}</th><td>${cell(call?.value)}<small> (${signed(call?.change)})</small></td><td>${cell(last?.callAmt, 2)}</td><td>${cell(put?.value)}<small> (${signed(put?.change)})</small></td><td>${cell(last?.putAmt, 2)}</td></tr>`;
    }).join('');
    $('#p8-options [data-tables]').innerHTML = `<table class="p8-table"><thead><tr><th>淨未平倉</th><th>買權口數（增減）</th><th>買權金額（億）</th><th>賣權口數（增減）</th><th>賣權金額（億）</th></tr></thead><tbody>${body}</tbody></table>`;
    drawChart($('#p8-options canvas'), {
      labels: pc.map((row) => shortDate(row.date)),
      lines: [{ values: pc.map((row) => row.volRatio), color: '#8a93a6', dash: [4, 3] }, { values: pc.map((row) => row.oiRatio), color: '#f5c842' }]
    });
  }

  function render() {
    const data = store.peek('chipMonitor');
    const days = store.peek('chipDays');
    status.textContent = data?.days === days ? '' : '載入中…（第一次要逐日向證交所、逐月向期交所抓資料，約需 10～60 秒）';
    markTabs();
    renderSpot(data);
    renderAmount(data);
    renderOi(data);
    renderOptions(data);
  }

  // 盤中只有成交金額會變：只重畫那一塊。
  const renderLive = () => renderAmount(store.peek('chipMonitor'));
  const unsubs = [
    store.subscribe('chipMonitor', render),
    store.subscribe('chipPrevIntraday', renderLive),
    store.subscribe('taiex', renderLive),
    store.subscribe('taiexIntraday', renderLive)
  ];
  const resize = new ResizeObserver(() => render());
  resize.observe($('.p8-grid'));
  render();

  return () => {
    unsubs.forEach((unsub) => unsub());
    resize.disconnect();
  };
}
