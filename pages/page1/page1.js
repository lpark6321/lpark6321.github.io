// Page1 期貨總覽：整合台指資訊、主圖分頁、監控區與多功能看板。
// 本頁不抓報價：只讀 store（由 services/marketFeed.js 寫入）並在相關鍵變動時重畫。
import { store } from '../../data/store.js';
import { TW_FUTURES_BY_LABEL, TW_FUTURES_BY_SYMBOL } from '../../data/twDerivatives.js';
import { Panel } from '../../components/Panel.js';
import { Sparkline } from '../../components/Sparkline.js';
import { StockCard } from '../../components/StockCard.js';
import { mountMarketChart } from '../../services/marketChart.js';
import { mountTradingViewWidget } from '../../services/tradingview.js';
import { bindHorizontalSplitter } from '../../services/splitter.js';
import { esc } from '../../services/html.js';
import { isTwFuturesDaySession, isTwFuturesNightSession, isTwSpotSession } from '../../services/marketCalendar.js';
import {
  TOP10_CODES,
  fmtNum as n,
  hasValue,
  liveQuoteMap,
  orDash,
  pctFromPrevClose,
  trendClass as c
} from '../../services/quoteUtils.js';
import { getDashboardDataSource, sourceInfo, subscribeDashboardDataSource } from '../../services/dashboardDataSource.js';
import { pivotLevels } from '../../services/indicators.js';
import { drawAmp20, drawInfoCandle, drawMonitor, drawTrend } from './page1Draw.js';
import { AMP_HISTORY_DAYS, buildChartTrendSeries, buildDailyStats } from './page1Series.js';

// 多空關卡三種算法（存在瀏覽器）：樞紐點（昨日高低收）、振幅倍數（開盤 ± 30 日平均振幅 × 倍數）、固定點數（現價 ± 自訂點數）。
const LEVELS_KEY = 'tw_p1_levels';
const LEVEL_MODES = { pivot: '樞紐點', amplitude: '振幅倍數', fixed: '固定點數' };
const AMP_MULTIPLIERS = [1.25, 1, 0.75, 0.5, 0.25];
const DEFAULT_FIXED_POINTS = [280, 180, 100, 40, 10];

function loadLevelSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEVELS_KEY) || '{}');
    const points = Array.isArray(saved.points) ? saved.points.map(Number).filter((v) => v > 0).slice(0, 5) : [];
    return { mode: LEVEL_MODES[saved.mode] ? saved.mode : 'fixed', points: points.length ? points : DEFAULT_FIXED_POINTS };
  } catch {
    return { mode: 'fixed', points: DEFAULT_FIXED_POINTS };
  }
}

function saveLevelSettings(settings) {
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

// 回傳 { upper, lower }，各為 [{ label, value }]（由遠到近／由近到遠）；缺資料的值是 null。
function computeLevels(settings, snapshot, stats) {
  if (settings.mode === 'pivot') {
    const pivot = stats.prevDay ? pivotLevels(stats.prevDay) : null;
    return {
      upper: [2, 1, 0].map((i) => ({ label: `R${i + 1}`, value: pivot?.resistance[i] ?? null })),
      lower: [0, 1, 2].map((i) => ({ label: `S${i + 1}`, value: pivot?.support[i] ?? null }))
    };
  }
  if (settings.mode === 'amplitude') {
    const amps = stats.ampHistory.map((row) => row.amplitude).filter(Number.isFinite);
    const avg = amps.length ? amps.reduce((sum, v) => sum + v, 0) / amps.length : null;
    const base = snapshot?.open;
    const at = (k) => (avg != null && hasValue(base) ? base + avg * k : null);
    return {
      upper: AMP_MULTIPLIERS.map((k) => ({ label: `+${k}x`, value: at(k) })),
      lower: [...AMP_MULTIPLIERS].reverse().map((k) => ({ label: `-${k}x`, value: at(-k) }))
    };
  }
  const points = [...settings.points].sort((a, b) => b - a);
  const at = (offset) => (snapshot ? snapshot.price + offset : null);
  return {
    upper: points.map((p) => ({ label: `+${p}`, value: at(p) })),
    lower: [...points].reverse().map((p) => ({ label: `-${p}`, value: at(-p) }))
  };
}

// 期貨快照加上相對昨收的漲跌與漲跌幅。
function resolveProductSnapshot(futures) {
  const chg = futures.price - futures.prevClose;
  return { ...futures, chg, chgPct: futures.prevClose ? (chg / futures.prevClose) * 100 : 0 };
}

function isIndexSymbol(value) {
  return value === 'INDEX:TWII' || value === 'TWSE:TAIEX';
}

function isFutureSymbol(symbolConfig) {
  return symbolConfig?.type === 'future' || symbolConfig?.value === 'TXF' || symbolConfig?.value === 'TX';
}

// 開高低收昨收齊全的期貨快照才拿來顯示。
function hasUsableFuturesSnapshot(futures) {
  return ['price', 'open', 'high', 'low', 'prevClose'].every((key) => futures?.[key] != null && Number.isFinite(Number(futures[key])));
}

// 期貨點數取整數顯示。
function formatFuturesValue(value) {
  return hasValue(value) ? n(Math.round(Number(value)), 0) : '--';
}

function clampMonitorPct(value) {
  return Math.max(-10, Math.min(10, Number.isFinite(value) ? value : 0));
}

function resolveMonitorOhlcPct(stock) {
  const price = Number(stock.price);
  const changePct = Number(stock.changePct);
  const derivedPrevClose = Number.isFinite(price) && Number.isFinite(changePct)
    ? price / (1 + changePct / 100)
    : null;
  const prevClose = Number.isFinite(Number(stock.prevClose)) ? Number(stock.prevClose) : derivedPrevClose;

  const closePct = pctFromPrevClose(stock.price, prevClose) ?? changePct ?? 0;
  const openPct = pctFromPrevClose(stock.open, prevClose) ?? closePct;
  const highPct = pctFromPrevClose(stock.high, prevClose) ?? Math.max(openPct, closePct);
  const lowPct = pctFromPrevClose(stock.low, prevClose) ?? Math.min(openPct, closePct);

  return {
    openPct: clampMonitorPct(openPct),
    closePct: clampMonitorPct(closePct),
    highPct: clampMonitorPct(Math.max(highPct, openPct, closePct)),
    lowPct: clampMonitorPct(Math.min(lowPct, openPct, closePct))
  };
}

function makeMonitorRows(mode, quoteMap, watchlist) {
  const all = [...quoteMap.values()];
  let source = [];
  if (mode === '權值股') source = TOP10_CODES.map((code) => quoteMap.get(code)).filter(Boolean);
  if (mode === '高價股') source = all.filter((x) => (x.price || 0) >= 500).sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, 12);
  if (mode === '熱門股') source = all.sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 12);
  if (mode === '自選股') {
    source = [...new Set(watchlist.map((x) => x.code))].map((code) => quoteMap.get(code)).filter(Boolean).slice(0, 12);
  }

  return source.map((x) => {
    const ohlcPct = resolveMonitorOhlcPct(x);
    return {
      code: x.code,
      shortName: String(x.name || '').replace('-KY', ''),
      ...ohlcPct
    };
  });
}

const B_TABS = [
  { key: 'weighted', label: '十大權值股' },
  { key: 'intraday', label: '台指盤中資訊' },
  { key: 'watch', label: '自選股' },
  { key: 'volume', label: '大盤預估量' },
  { key: 'amp30', label: '30日振幅變化' }
];

// 各區塊依賴的 store 鍵：只有相關鍵變動才重畫該區塊（B 區再依目前分頁細分）。
const FUTURES_KEYS = ['futuresDay', 'futuresFull'];
const QUOTE_KEYS = ['watchlist', 'topStocks', 'marketMap', 'watchQuotes'];
const SECTION_DEPS = {
  left: ['taiex', 'productDaily', ...FUTURES_KEYS],
  trend: ['taiex', 'taiexIntraday'],
  group: [...QUOTE_KEYS, 'stockTrends'],
  monitor: QUOTE_KEYS
};
const B_TAB_DEPS = {
  weighted: ['topStocks', 'stockTrends'],
  intraday: ['taiex', ...FUTURES_KEYS],
  watch: QUOTE_KEYS,
  volume: ['taiex'],
  amp30: ['productDaily']
};
const WATCHED_KEYS = [...new Set([...Object.values(SECTION_DEPS), ...Object.values(B_TAB_DEPS)].flat())];

const productStoreKey = (mode) => (TW_FUTURES_BY_LABEL[mode] || TW_FUTURES_BY_LABEL['台指(全)']).storeKey;

// 1 區與 B 區統計用的日 K：有期貨來源用目前商品的期貨日 K，只有 Yahoo 時是加權日 K（label 會標「加權」）。
function productDaily(mode) {
  const daily = store.get('productDaily');
  return daily?.[productStoreKey(mode)] || daily?.index || null;
}

// 只回傳真的來自期貨來源的快照；沒有就回 null。
const getProductFuturesSnapshot = (mode) => {
  const futures = store.get(productStoreKey(mode));
  return hasUsableFuturesSnapshot(futures) ? futures : null;
};

// mount：建立頁面並回傳清理函式（由 index_hide.html 的路由在離開頁面時呼叫）。
export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 1｜期貨總覽</h2><span class="page-clock" id="p1-clock"></span></div>
    <div class="p1-layout" id="p1-layout">
      <aside class="p1-left" id="p1-left"></aside>
      <div class="grid-splitter-v p1-splitter-left" id="p1-split-left"></div>
      <section class="panel p1-center p1-resize">
        <div class="panel__header"><span class="panel__badge">C</span><h3 class="panel__title">TAIEX FUTURES 主圖</h3></div>
        <div class="panel__body p1-tv">
          <!-- C 區圖表分頁：自有資料為 Lightweight Charts，TradingView 與 Charting Library 保留替換路徑。 -->
          <div class="p1-chart-tabs" id="p1-chart-tabs">
            <button data-k="lightweight" class="is-active">自有資料</button>
            <button data-k="tradingview">TradingView</button>
            <button data-k="chartinglib">Charting Library</button>
          </div>
          <div class="p1-chart-pane" id="p1-chart-lightweight"></div>
          <div class="p1-chart-pane" id="p1-chart-tradingview" style="display:none"></div>
          <div class="p1-chart-pane p1-chart-placeholder" id="p1-chart-chartinglib" style="display:none">
            <div>
              <strong>Charting Library 預留區</strong>
              <span>日後接 TradingView Charting Library / UDF datafeed 時會掛載在這裡。</span>
            </div>
          </div>
        </div>
      </section>
      <div class="grid-splitter-v p1-splitter-right" id="p1-split-right"></div>
      <aside class="p1-right" id="p1-right"></aside>
      <section class="panel p1-bottom p1-resize"><div class="panel__header"><span class="panel__badge">B</span><h3 class="panel__title">多功能看板</h3></div><div class="panel__body"><div class="p1-b-tabs" id="p1-b-tabs"></div><div id="p1-b-content" class="p1-b-content"></div></div></section>
    </div>
  `;

  const layoutEl = container.querySelector('#p1-layout');
  const readVar = (name, fallback) => {
    const value = parseFloat(getComputedStyle(layoutEl).getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const stopSplitLeft = bindHorizontalSplitter(container.querySelector('#p1-split-left'), {
    getValue: () => readVar('--p1-left-w', 320),
    setValue: (px) => layoutEl.style.setProperty('--p1-left-w', `${px}px`),
    min: 240,
    max: 560
  });
  const stopSplitRight = bindHorizontalSplitter(container.querySelector('#p1-split-right'), {
    getValue: () => readVar('--p1-right-w', 420),
    setValue: (px) => layoutEl.style.setProperty('--p1-right-w', `${px}px`),
    min: 280,
    max: 700,
    deltaSign: -1
  });

  const left = container.querySelector('#p1-left');
  const right = container.querySelector('#p1-right');

  const pLeft = new Panel(left, { badge: '1', title: '台指綜合資訊' }); pLeft.root.classList.add('p1-resize');
  const p6 = new Panel(right, { badge: '6', title: '走勢圖' }); p6.root.classList.add('p1-resize');
  const p5 = new Panel(right, { badge: '5', title: '即時股價監控' }); p5.root.classList.add('p1-resize');

  pLeft.setContent(`
    <div class="p1-side-table" id="p1-main"></div>
    <div class="p1-side-levels" id="p1-levels">
      <div class="p1-levels-ctrl">
        <select id="p1-level-mode" aria-label="關卡算法">${Object.entries(LEVEL_MODES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
        <input id="p1-level-points" class="input" type="text" title="固定點數，用逗號分隔，最多 5 個" aria-label="固定點數">
      </div>
      <div id="p1-levels-body"></div>
    </div>
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

  // 離開頁面後，仍在飛行中的非同步工作（圖表掛載）一律丟棄。
  let disposed = false;
  let cards = [];
  let miniSparks = [];
  let activeBTab = 'weighted';
  let renderedBTab = null;
  let activeS6Tab = 'trend';
  let productMode = '台指(全)';
  let ampResizeObserver = null;
  const levelSettings = loadLevelSettings();
  const dailyStats = () => {
    const daily = productDaily(productMode);
    return { label: daily?.label || '', ...buildDailyStats(daily?.candles) };
  };

  // ---- 重畫排程：同一個畫面影格內的多次 store 更新只重畫一次；看不到的 6 區分頁不畫，切過去時再畫 ----

  const dirty = new Set();
  let frame = 0;
  const isHidden = (section) => (section === 'trend' || section === 'group') && section !== activeS6Tab;
  const flush = () => {
    frame = 0;
    if (disposed) return;
    const sections = [...dirty];
    dirty.clear();
    sections.forEach((section) => { if (!isHidden(section)) renderers[section](); });
  };
  const invalidate = (...sections) => {
    sections.forEach((section) => dirty.add(section));
    frame ||= requestAnimationFrame(flush);
  };

  // ---- 1 區：台指綜合資訊 ----

  const renderLeftPanel = () => {
    const d = store.get('taiex');
    const f = getProductFuturesSnapshot(productMode);
    const isFull = productMode === '台指(全)';
    // 沒有期貨來源時全部顯示 '--'，不拿加權指數頂替期貨價。
    const m = f ? resolveProductSnapshot(f) : null;
    const liveChange = m ? m.chg : null;
    const liveAmplitude = m ? Math.abs(m.high - m.low) : null;
    const spread = m ? m.price - d.price : null;
    const stats = dailyStats();

    // 沒有期貨來源（Yahoo、模擬資料…）時整塊灰掉並說明；資料仍照常顯示「--」。
    const info = sourceInfo();
    pLeft.root.classList.toggle('is-unsupported', !(info.feed && info.futures));
    pLeft.body.dataset.note = '需要期貨來源（DDE）';

    container.querySelector('#p1-main').innerHTML = `
      <div class="p1-kv"><span>商品</span><strong><label class="p1-radio"><input type="radio" name="p1-product" value="台指(全)" ${isFull ? 'checked' : ''}>台指(全)</label><label class="p1-radio"><input type="radio" name="p1-product" value="台指" ${!isFull ? 'checked' : ''}>台指</label></strong></div>
      <div class="p1-main-top">
        <div class="p1-main-table">
          <div class="p1-kv p1-kv-current"><span>${productMode}</span><strong class="${c(liveChange)}">${formatFuturesValue(m?.price)}</strong></div>
          <div class="p1-kv"><span>${productMode}開</span><strong>${formatFuturesValue(m?.open)}</strong></div>
          <div class="p1-kv"><span>${productMode}高</span><strong>${formatFuturesValue(m?.high)}</strong></div>
          <div class="p1-kv"><span>${productMode}低</span><strong>${formatFuturesValue(m?.low)}</strong></div>
          <div class="p1-kv" title="20 日均線"><span>${stats.label === '加權' ? '加權' : ''}月成本</span><strong>${formatFuturesValue(stats.ma20)}</strong></div>
        </div>
        <div class="p1-main-mini" id="p1-main-mini">
          <canvas id="p1-main-mini-canvas" class="p1-main-mini-canvas"></canvas>
        </div>
      </div>
      <div class="p1-kv"><span>${productMode}加權價差</span><strong class="${c(spread)}">${Number.isFinite(spread) ? spread.toFixed(2) : '--'}</strong></div>
      <div class="p1-kv"><span>${productMode}近月漲跌</span><strong class="${c(liveChange)}">${formatFuturesValue(liveChange)}</strong></div>
    `;

    const miniCanvas = container.querySelector('#p1-main-mini-canvas');
    if (m) {
      drawInfoCandle(miniCanvas, {
        open: m.open,
        close: m.price,
        high: m.high,
        low: m.low,
        prevClose: m.prevClose,
        change: liveChange,
        ampPct: m.chgPct
      });
    } else {
      miniCanvas.getContext('2d')?.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    }

    // 多空關卡：算法由上方選單切換（樞紐點／振幅倍數／固定點數）；缺資料顯示 '--'。
    const levels = computeLevels(levelSettings, m, stats);
    const levelRow = (row) => `<div class="p1-kv"><span>${row.label}</span><strong>${formatFuturesValue(row.value)}</strong></div>`;
    container.querySelector('#p1-levels-body').innerHTML = `
      <div class="p1-block p1-block--red"><div class="p1-block-title">日多方關卡</div>${levels.upper.map(levelRow).join('')}</div>
      <div class="p1-block p1-block--green"><div class="p1-block-title">日空方關卡</div>${levels.lower.map(levelRow).join('')}</div>
    `;

    // 振幅統計由 marketFeed 抓的日 K 算出（不跟 C 區圖表綁定）；還沒有資料顯示 '--'。
    const amps = stats.ampHistory.map((row) => Number(row.amplitude)).filter(Number.isFinite);
    const ampText = (value) => (amps.length && Number.isFinite(value) ? value.toFixed(0) : '--');
    const ampRows = [
      ['最大振幅', ampText(Math.max(...amps))],
      ['平均振幅', ampText(amps.reduce((sum, value) => sum + value, 0) / amps.length)],
      ['最小振幅', ampText(Math.min(...amps))],
      ['本日振幅', Number.isFinite(liveAmplitude) ? liveAmplitude.toFixed(0) : '--']
    ];
    container.querySelector('#p1-hist').innerHTML = `
      <div class="p1-block-title">${stats.label === '加權' ? '加權' : ''}日振幅統計(近${AMP_HISTORY_DAYS}日)</div>
      <div class="p1-amp-list">${ampRows.map((r) => `<div class="p1-kv"><span>${r[0]}</span><strong>${r[1]}</strong></div>`).join('')}</div>
    `;

    container.querySelectorAll('input[name="p1-product"]').forEach((el) => el.addEventListener('change', (e) => {
      productMode = e.target.value;
      renderLeftPanel();
      if (activeBTab === 'intraday') invalidate('b');
    }));
  };

  // ---- 6 區：加權指數走勢／自選股走勢 ----

  // 6 區只畫真實的加權 1 分 K（marketFeed 寫進 taiexIntraday）；沒有資料就畫「無盤中資料」。
  const renderMainTrend = () => {
    const taiex = store.get('taiex');
    const trend = buildChartTrendSeries(store.get('taiexIntraday')?.candles, '1m');
    const rows = trend?.sourceRows || [];
    const highs = rows.map((row) => Number(row.high)).filter(Number.isFinite);
    const lows = rows.map((row) => Number(row.low)).filter(Number.isFinite);
    const last = trend?.points.at(-1);
    const fmt = (value, digits) => (Number.isFinite(Number(value)) && Number(value) !== 0 ? n(value, digits ?? (value >= 100 ? 0 : 2)) : '--');
    drawTrend(container.querySelector('#p1-trend'), trend, {
      high: highs.length ? Math.max(...highs) : undefined,
      low: lows.length ? Math.min(...lows) : undefined
    });
    container.querySelector('#p1-trend-meta').innerHTML = `
      <span>加權指數 盤中走勢</span>
      <span>現價 ${fmt(last?.price ?? taiex.price)}</span>
      <span>${trend?.hasVolume === false ? '平均價' : '本日均價'} ${fmt(last?.avg)}</span>
      <span>累計量 ${fmt(taiex.volume, 0)}</span>
      <span>金額(億) ${fmt(taiex.amountYi, 2)}</span>
      <span>預估量 ${fmt(taiex.volEstimate, 0)}</span>
      <span>時段 ${trend ? trend.sessionLabel : '09:00 - 13:30'}</span>
    `;
  };

  const renderPage1Group = () => {
    const list = store.get('watchlist').filter((x) => x.group === 'page1分組');
    const quoteMap = liveQuoteMap();
    const trends = store.get('stockTrends');

    miniSparks.forEach((x) => x.destroy()); miniSparks = [];
    const mini = container.querySelector('#p1-mini');

    // 自選股欄位來自使用者輸入或匯入檔，一律 esc()。
    mini.innerHTML = list.map((s) => {
      const q = quoteMap.get(s.code) || {};
      const pct = Number(q.changePct);
      return `
        <div class="p1-mini-item">
          <div><div>${esc(s.code)}</div><div style="color:var(--text2)">${esc(q.name || s.name)}</div></div>
          <div class="p1-mini-spark"></div>
          <div class="${c(pct)}">${Number.isFinite(pct) ? `${pct > 0 ? '+' : ''}${pct}%` : '--'}</div>
        </div>
      `;
    }).join('');

    // 依索引取 sparkline 容器，代碼不進 CSS selector。
    const hosts = mini.querySelectorAll('.p1-mini-spark');
    list.forEach((s, i) => {
      const q = quoteMap.get(s.code) || {};
      const sp = new Sparkline(hosts[i], { width: 140, height: 44, color: Number(q.changePct) >= 0 ? 'rgb(240,58,95)' : 'rgb(31,214,122)' });
      sp.update(trends[s.code]?.values || [], trends[s.code]?.baseline ?? null);
      miniSparks.push(sp);
    });
  };

  const setS6Tab = (tab) => {
    activeS6Tab = tab;
    container.querySelectorAll('#p1-s6-tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.k === tab));
    container.querySelector('#p1-s6-trend').style.display = tab === 'trend' ? '' : 'none';
    container.querySelector('#p1-s6-group').style.display = tab === 'group' ? '' : 'none';
    invalidate(tab);
  };

  // ---- 5 區：即時股價監控 ----

  const renderMonitor = () => {
    const mode = container.querySelector('#p1-monitor-select').value;
    drawMonitor(container.querySelector('#p1-monitor-canvas'), makeMonitorRows(mode, liveQuoteMap(), store.get('watchlist')));
  };

  // ---- B 區：多功能看板，每個分頁一個 renderer；fresh 表示剛切到這個分頁、要重建 DOM ----

  const renderBTabs = () => {
    container.querySelector('#p1-b-tabs').innerHTML = B_TABS.map((t) => `<button data-k="${t.key}" class="${activeBTab === t.key ? 'is-active' : ''}">${t.label}</button>`).join('');
    container.querySelectorAll('#p1-b-tabs button').forEach((btn) => btn.addEventListener('click', () => {
      activeBTab = btn.dataset.k;
      renderBTabs();
      renderBContent();
    }));
  };

  // 卡片走勢用 marketFeed 抓的盤中 1 分 K（stockTrends）；還沒有就空白。
  const weightedStocks = () => {
    const list = store.get('topStocks');
    const trends = store.get('stockTrends');
    return TOP10_CODES.map((code) => list.find((s) => s.code === code)).filter(Boolean).map((s) => ({
      ...s,
      sparkline: trends[s.code]?.values || [],
      sparklineBaseline: trends[s.code]?.baseline ?? null
    }));
  };

  const bRenderers = {
    // 卡片建立一次，之後報價更新只改內容，不再刪掉重建。
    weighted: (box, fresh) => {
      const stocks = weightedStocks();
      if (fresh || cards.length !== stocks.length) {
        cards.forEach((x) => x.destroy());
        box.innerHTML = '<div class="p1-cards" id="p1-cards"></div>';
        const wrap = box.querySelector('#p1-cards');
        cards = stocks.map((stock) => new StockCard(wrap, { stock }));
        return;
      }
      stocks.forEach((stock, i) => cards[i].update(stock));
    },
    intraday: (box) => {
      const t = store.get('taiex');
      const f = getProductFuturesSnapshot(productMode) || {};
      const fv = formatFuturesValue;
      box.innerHTML = `
        <div class="p1-rows">
          <div class="p1-row"><span>加權 開/高/低</span><strong>${orDash(t.open)} / ${orDash(t.high)} / ${orDash(t.low)}</strong></div>
          <div class="p1-row"><span>加權 現/漲跌</span><strong class="${c(t.change)}">${orDash(t.price)} / ${orDash(t.change)}</strong></div>
          <div class="p1-row"><span>${productMode} 開/高/低</span><strong>${fv(f.open)} / ${fv(f.high)} / ${fv(f.low)}</strong></div>
          <div class="p1-row"><span>${productMode} 現/漲跌</span><strong class="${c(f.change)}">${fv(f.price)} / ${fv(f.change)}</strong></div>
        </div>
      `;
    },
    watch: (box) => {
      const w = store.get('watchlist');
      const quoteMap = liveQuoteMap();
      // 自選股欄位來自使用者輸入或匯入檔，一律 esc()。
      box.innerHTML = `<div class="p1-rows">${w.map((x) => {
        const q = quoteMap.get(x.code);
        const pct = Number(q?.changePct);
        const value = q ? `${esc(q.price)} / ${Number.isFinite(pct) ? `${pct}%` : '--'}` : '-- / --';
        return `<div class="p1-row"><span>${esc(x.group)}｜${esc(x.code)} ${esc(x.name)}</span><strong class="${c(pct)}">${value}</strong></div>`;
      }).join('')}</div>`;
    },
    volume: (box) => {
      // 預估量由資料層在拿到即時量時算好（withVolumeEstimate），這裡只讀。
      const t = store.get('taiex');
      const currentVolume = Number(t.volume ?? NaN);
      const estimatedVolume = Number(t.volEstimate ?? NaN);
      const ratio = Number.isFinite(currentVolume) && Number.isFinite(estimatedVolume) && estimatedVolume > 0
        ? (currentVolume / estimatedVolume) * 100
        : null;
      const barWidth = ratio == null ? 0 : Math.min(100, Math.max(0, ratio));
      box.innerHTML = `
        <div class="p1-rows">
          <div class="p1-row"><span>目前成交量</span><strong>${currentVolume > 0 ? n(currentVolume, 0) : '--'}</strong></div>
          <div class="p1-row"><span>預估成交量</span><strong>${Number.isFinite(estimatedVolume) ? n(estimatedVolume, 0) : '--'}</strong></div>
          <div style="height:14px;background:var(--border);border-radius:999px;overflow:hidden"><div style="height:100%;width:${barWidth}%;background:var(--gold)"></div></div>
          <div class="p1-row"><span>達成率</span><strong>${ratio == null ? '--' : `${ratio.toFixed(2)}%`}</strong></div>
        </div>
      `;
    },
    amp30: (box, fresh) => {
      if (fresh) {
        box.innerHTML = '<div id="p1-amp20-wrap" class="p1-amp20-wrap"><canvas id="p1-amp20" style="width:100%;height:100%"></canvas></div>';
        const cvs = box.querySelector('#p1-amp20');
        ampResizeObserver = new ResizeObserver(() => {
          const stats = dailyStats();
          drawAmp20(cvs, stats.ampHistory, stats.label);
        });
        ampResizeObserver.observe(box.querySelector('#p1-amp20-wrap'));
      }
      const stats = dailyStats();
      drawAmp20(box.querySelector('#p1-amp20'), stats.ampHistory, stats.label);
    }
  };

  const renderBContent = () => {
    if (disposed) return;
    const fresh = renderedBTab !== activeBTab;
    if (fresh) {
      cards.forEach((x) => x.destroy()); cards = [];
      ampResizeObserver?.disconnect(); ampResizeObserver = null;
      renderedBTab = activeBTab;
    }
    bRenderers[activeBTab](container.querySelector('#p1-b-content'), fresh);
  };

  const renderers = { left: renderLeftPanel, trend: renderMainTrend, group: renderPage1Group, monitor: renderMonitor, b: renderBContent };

  // ---- C 區：主圖 ----

  // K 棒即時跟價：依圖表商品取對應的 store 報價。模擬資料不看交易時段，隨時可開新 K。
  const chartLiveQuote = (symbolConfig) => {
    const mock = getDashboardDataSource() === 'mock';
    let quote;
    let inSession = isTwSpotSession();
    if (isIndexSymbol(symbolConfig.value)) {
      quote = store.get('taiex');
    } else if (isFutureSymbol(symbolConfig)) {
      const isDay = symbolConfig.session === 'day';
      quote = store.get(TW_FUTURES_BY_SYMBOL[symbolConfig.value]?.storeKey || (isDay ? 'futuresDay' : 'futuresFull'));
      if (!hasUsableFuturesSnapshot(quote)) return null;
      inSession = isTwFuturesDaySession() || (!isDay && isTwFuturesNightSession());
    } else {
      quote = liveQuoteMap().get(String(symbolConfig.value));
    }
    if (!quote) return null;
    return { price: quote.price, time: quote.source === 'yahoo' ? quote.marketTime : undefined, isLive: mock || inSession };
  };

  const subscribeChartLiveQuote = (callback) => {
    const chartUnsubs = ['taiex', ...FUTURES_KEYS, 'topStocks', 'marketMap', 'watchQuotes'].map((key) => store.subscribe(key, callback));
    return () => chartUnsubs.forEach((unsub) => unsub());
  };

  const chartOptions = {
    symbol: 'INDEX:TWII',
    timeframe: 'D',
    getLiveQuote: chartLiveQuote,
    subscribeLiveQuote: subscribeChartLiveQuote
  };

  let stopLightweightChart = () => {};
  let stopTradingViewWidget = () => {};
  let tradingViewMounted = false;

  // 三個圖表分頁共用同一個 C 區容器；只有 TradingView 需要延遲掛載外部 widget。
  const chartLightweightEl = container.querySelector('#p1-chart-lightweight');
  const chartTradingViewEl = container.querySelector('#p1-chart-tradingview');
  const chartingLibraryEl = container.querySelector('#p1-chart-chartinglib');

  // 自有資料圖表：由 services/marketChart.js 處理指標與 Lightweight Charts，K 線經 services/marketSources.js 取得。
  // 掛載完成前就離開頁面時，立刻呼叫回傳的清理函式，避免圖表訂閱殘留。
  const mountLightweight = () => {
    mountMarketChart(chartLightweightEl, chartOptions)
      .then((fn) => { if (disposed) fn(); else stopLightweightChart = fn; })
      .catch(() => { chartLightweightEl.innerHTML = '<div style="color:var(--text2)">Lightweight Charts 載入失敗</div>'; });
  };

  // TradingView widget 只有切到該分頁時才載入，避免預設頁面多載外部資源。
  const mountTradingViewTab = () => {
    if (tradingViewMounted) return;
    tradingViewMounted = true;
    mountTradingViewWidget(chartTradingViewEl, { symbol: 'INDEX:TWII', interval: 'D' })
      .then((fn) => { if (disposed) fn(); else stopTradingViewWidget = fn; })
      .catch(() => { chartTradingViewEl.innerHTML = '<div style="color:var(--text2)">TradingView 載入失敗</div>'; });
  };

  // Charting Library 目前是預留區，日後可在這裡接掛載流程。
  const setChartTab = (tab) => {
    container.querySelectorAll('#p1-chart-tabs button').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.k === tab));
    chartLightweightEl.style.display = tab === 'lightweight' ? '' : 'none';
    chartTradingViewEl.style.display = tab === 'tradingview' ? '' : 'none';
    chartingLibraryEl.style.display = tab === 'chartinglib' ? '' : 'none';
    if (tab === 'tradingview') mountTradingViewTab();
  };

  // ---- 事件綁定與啟動 ----

  container.querySelectorAll('#p1-chart-tabs button').forEach((btn) => btn.addEventListener('click', () => setChartTab(btn.dataset.k)));
  container.querySelectorAll('#p1-s6-tabs button').forEach((btn) => btn.addEventListener('click', () => setS6Tab(btn.dataset.k)));
  container.querySelector('#p1-monitor-select').addEventListener('change', renderMonitor);

  // 關卡算法切換與固定點數設定：改了就存到瀏覽器並重畫 1 區。
  const levelModeEl = container.querySelector('#p1-level-mode');
  const levelPointsEl = container.querySelector('#p1-level-points');
  const syncLevelControls = () => {
    levelModeEl.value = levelSettings.mode;
    levelPointsEl.value = levelSettings.points.join(',');
    levelPointsEl.hidden = levelSettings.mode !== 'fixed';
  };
  levelModeEl.addEventListener('change', () => {
    levelSettings.mode = levelModeEl.value;
    saveLevelSettings(levelSettings);
    syncLevelControls();
    invalidate('left');
  });
  levelPointsEl.addEventListener('change', () => {
    const points = levelPointsEl.value.split(/[,，\s]+/).map(Number).filter((v) => v > 0).slice(0, 5);
    if (points.length) levelSettings.points = points;
    saveLevelSettings(levelSettings);
    syncLevelControls();
    invalidate('left');
  });
  syncLevelControls();
  const unsubSource = subscribeDashboardDataSource(() => invalidate('left'));

  const monitorResize = new ResizeObserver(() => invalidate('monitor'));
  monitorResize.observe(container.querySelector('#p1-monitor-wrap'));
  const trendResize = new ResizeObserver(() => invalidate('trend'));
  trendResize.observe(container.querySelector('#p1-s6-trend'));

  renderBTabs();
  Object.keys(renderers).forEach((section) => { if (!isHidden(section)) renderers[section](); });

  // 每個 store 鍵只通知依賴它的區塊；B 區只在目前分頁用到該鍵時重畫。
  const unsubs = WATCHED_KEYS.map((key) => store.subscribe(key, () => {
    Object.entries(SECTION_DEPS).forEach(([section, keys]) => { if (keys.includes(key)) invalidate(section); });
    if (B_TAB_DEPS[activeBTab].includes(key)) invalidate('b');
  }));

  const clockTimer = setInterval(() => {
    container.querySelector('#p1-clock').textContent = new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
  }, 1000);

  mountLightweight();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    unsubs.forEach((unsub) => unsub());
    unsubSource();
    clearInterval(clockTimer);
    stopLightweightChart();
    stopTradingViewWidget();
    monitorResize.disconnect();
    trendResize.disconnect();
    ampResizeObserver?.disconnect();
    stopSplitLeft();
    stopSplitRight();
    cards.forEach((x) => x.destroy()); miniSparks.forEach((x) => x.destroy());
    pLeft.destroy(); p6.destroy(); p5.destroy();
  };
}
