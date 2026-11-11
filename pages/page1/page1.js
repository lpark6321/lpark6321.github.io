// Page1 期貨總覽：整合台指資訊、主圖分頁、監控區與多功能看板。
// 本頁不抓報價：只讀 store（由 services/marketFeed.js 寫入）並在相關鍵變動時重畫。
import { store } from '../../data/store.js';
import { TW_FUTURES_BY_SYMBOL } from '../../data/twDerivatives.js';
import { Panel } from '../../components/Panel.js';
import { Sparkline } from '../../components/Sparkline.js';
import { StockCard } from '../../components/StockCard.js';
import { mountMarketChart } from '../../services/marketChart.js';
import { mountTradingViewWidget } from '../../services/tradingview.js';
import { bindCssVarSplitter } from '../../services/splitter.js';
import { subscribeSecond } from '../../services/feedClock.js';
import { esc } from '../../services/html.js';
import { isTwFuturesDaySession, isTwFuturesNightSession, isTwSpotSession } from '../../services/marketCalendar.js';
import {
  TOP10_CODES,
  fmtNum as n,
  liveMarketMapQuotes,
  liveQuoteMap,
  orDash,
  pctFromPrevClose,
  trendClass as c
} from '../../services/quoteUtils.js';
import { getDashboardDataSource, subscribeDashboardDataSource } from '../../services/dashboardDataSource.js';
import { indexContributions, recentAverage } from '../../services/marketOverview.js';
import { drawAmp20, drawMonitor, drawTrend } from './page1Draw.js';
import { createInfoPanel, formatFuturesValue, getProductFuturesSnapshot, productDailyStats } from './page1Info.js';
import { buildChartTrendSeries } from './page1Series.js';

function isIndexSymbol(value) {
  return value === 'INDEX:TWII' || value === 'TWSE:TAIEX';
}

function isFutureSymbol(symbolConfig) {
  return symbolConfig?.type === 'future' || symbolConfig?.value === 'TXF' || symbolConfig?.value === 'TX';
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
  { key: 'amp30', label: '振幅變化' }
];

// 各區塊依賴的 store 鍵：只有相關鍵變動才重畫該區塊（B 區再依目前分頁細分）。
const FUTURES_KEYS = ['futuresDay', 'futuresFull'];
const QUOTE_KEYS = ['watchlist', 'topStocks', 'marketMap', 'watchQuotes'];
const SECTION_DEPS = {
  left: ['taiex', 'productDaily', 'institutional', ...FUTURES_KEYS],
  trend: ['taiex', 'taiexIntraday'],
  group: [...QUOTE_KEYS, 'stockTrends'],
  monitor: QUOTE_KEYS
};
const B_TAB_DEPS = {
  weighted: ['topStocks', 'stockTrends'],
  intraday: ['taiex', 'marketMap', ...FUTURES_KEYS],
  watch: QUOTE_KEYS,
  volume: ['taiex', 'marketAmountHistory'],
  amp30: ['productDaily']
};
const WATCHED_KEYS = [...new Set([...Object.values(SECTION_DEPS), ...Object.values(B_TAB_DEPS)].flat())];

// mount：建立頁面並回傳清理函式（由 app.js 的路由在離開頁面時呼叫）。
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
          <div class="p1-chart-pane" id="p1-chart-tradingview" hidden></div>
          <div class="p1-chart-pane p1-chart-placeholder" id="p1-chart-chartinglib" hidden>
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
  const stopSplitLeft = bindCssVarSplitter(container.querySelector('#p1-split-left'), layoutEl, '--p1-left-w', { fallback: 320, min: 240, max: 560 });
  const stopSplitRight = bindCssVarSplitter(container.querySelector('#p1-split-right'), layoutEl, '--p1-right-w', { fallback: 420, min: 280, max: 700, deltaSign: -1 });

  const left = container.querySelector('#p1-left');
  const right = container.querySelector('#p1-right');

  const p6 = new Panel(right, { badge: '6', title: '走勢圖' }); p6.root.classList.add('p1-resize');
  const p5 = new Panel(right, { badge: '5', title: '即時股價監控' }); p5.root.classList.add('p1-resize');

  p6.setContent(`
    <div class="p1-tabs" id="p1-s6-tabs">
      <button data-k="trend" class="is-active">加權指數走勢</button>
      <button data-k="group">自選股走勢</button>
    </div>
    <div id="p1-s6-trend" class="p1-s6-pane"><canvas class="p1-trend-canvas" id="p1-trend"></canvas><div class="p1-trend-meta" id="p1-trend-meta"></div></div>
    <div id="p1-s6-group" class="p1-s6-pane" hidden><div class="p1-mini" id="p1-mini"></div></div>
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
  let ampResizeObserver = null;
  // 1 區（左欄只有它）；切換商品時 B 區「台指盤中資訊」跟著換。
  const infoPanel = createInfoPanel(left, { onModeChange: () => { if (activeBTab === 'intraday') invalidate('b'); } });
  const dailyStats = () => productDailyStats(infoPanel.mode());

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
          <div><div>${esc(s.code)}</div><div class="p1-mini-name">${esc(q.name || s.name)}</div></div>
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
    container.querySelector('#p1-s6-trend').hidden = tab !== 'trend';
    container.querySelector('#p1-s6-group').hidden = tab !== 'group';
    invalidate(tab);
  };

  // ---- 5 區：即時股價監控 ----

  const renderMonitor = () => {
    const mode = container.querySelector('#p1-monitor-select').value;
    drawMonitor(container.querySelector('#p1-monitor-canvas'), makeMonitorRows(mode, liveQuoteMap(), store.get('watchlist')));
  };

  // ---- B 區：多功能看板，每個分頁一個 renderer；fresh 表示剛切到這個分頁、要重建 DOM ----

  const bTabsEl = container.querySelector('#p1-b-tabs');
  bTabsEl.innerHTML = B_TABS.map((t) => `<button data-k="${t.key}">${t.label}</button>`).join('');
  const renderBTabs = () => {
    bTabsEl.querySelectorAll('button').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.k === activeBTab));
  };
  bTabsEl.addEventListener('click', (event) => {
    const key = event.target.closest('button')?.dataset.k;
    if (!key || key === activeBTab) return;
    activeBTab = key;
    renderBTabs();
    renderBContent();
  });

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

  // 一列「標籤／數值」只在文字或顏色變了才寫 DOM；label 是 null 表示標籤不變。
  const patchRow = (row, label, text, className) => {
    const [labelEl, valueEl] = row.children;
    if (label != null && labelEl.textContent !== label) labelEl.textContent = label;
    if (valueEl.textContent !== text) valueEl.textContent = text;
    if (valueEl.className !== className) valueEl.className = className;
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
    intraday: (box, fresh) => {
      const mode = infoPanel.mode();
      if (fresh) {
        box.innerHTML = `
          <div class="p1-rows">${['加權 開/高/低', '加權 現/漲跌', '', ''].map((label) => `<div class="p1-row"><span>${label}</span><strong></strong></div>`).join('')}</div>
          <div class="p1-contrib" title="個股對加權指數的貢獻點數＝權重 × 漲跌幅 × 加權昨收（權重取設定檔，僅供參考）">
            <div><div class="p1-contrib__title">上漲貢獻（點）</div><div class="p1-contrib__list" data-side="up"></div></div>
            <div><div class="p1-contrib__title">下跌貢獻（點）</div><div class="p1-contrib__list" data-side="down"></div></div>
          </div>`;
      }
      const t = store.get('taiex');
      const f = getProductFuturesSnapshot(mode) || {};
      const fv = formatFuturesValue;
      const rows = [...box.querySelectorAll('.p1-row')];
      const values = [
        [null, `${orDash(t.open)} / ${orDash(t.high)} / ${orDash(t.low)}`, ''],
        [null, `${orDash(t.price)} / ${orDash(t.change)}`, c(t.change)],
        [`${mode} 開/高/低`, `${fv(f.open)} / ${fv(f.high)} / ${fv(f.low)}`, ''],
        [`${mode} 現/漲跌`, `${fv(f.price)} / ${fv(f.change)}`, c(f.change)]
      ];
      values.forEach(([label, text, cls], i) => patchRow(rows[i], label, text, cls));
      // 股名來自名單設定檔，仍一律 esc()。
      const contributions = indexContributions(liveMarketMapQuotes().values(), t.prevClose);
      const list = (rowsOf) => rowsOf.map((row) => `<div class="p1-row"><span>${esc(row.code)} ${esc(row.name)} <em class="${c(row.changePct)}">${row.changePct > 0 ? '+' : ''}${row.changePct.toFixed(2)}%</em></span><strong class="${c(row.points)}">${row.points > 0 ? '+' : ''}${row.points.toFixed(2)}</strong></div>`).join('') || '<div class="p1-row"><span>--</span></div>';
      box.querySelector('[data-side="up"]').innerHTML = list(contributions.filter((row) => row.points > 0).slice(0, 8));
      box.querySelector('[data-side="down"]').innerHTML = list(contributions.filter((row) => row.points < 0).reverse().slice(0, 8));
    },
    watch: (box, fresh) => {
      const w = store.get('watchlist');
      const quoteMap = liveQuoteMap();
      // 自選股清單變了才重建列（欄位來自使用者輸入或匯入檔，一律 esc()）；報價更新只改數字與顏色。
      const key = w.map((x) => `${x.group}|${x.code}|${x.name}`).join('\n');
      if (fresh || box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = `<div class="p1-rows">${w.map((x) => `<div class="p1-row"><span>${esc(x.group)}｜${esc(x.code)} ${esc(x.name)}</span><strong></strong></div>`).join('')}</div>`;
      }
      const rows = [...box.querySelectorAll('.p1-row')];
      w.forEach((x, i) => {
        const q = quoteMap.get(x.code);
        const pct = Number(q?.changePct);
        patchRow(rows[i], null, q ? `${orDash(q.price)} / ${Number.isFinite(pct) ? `${pct}%` : '--'}` : '-- / --', c(pct));
      });
    },
    volume: (box, fresh) => {
      if (fresh) {
        box.innerHTML = `
          <div class="p1-rows">
            <div class="p1-row"><span>目前成交量</span><strong></strong></div>
            <div class="p1-row"><span>預估成交量</span><strong></strong></div>
            <div class="p1-volume-bar"><div class="p1-volume-bar__fill"></div></div>
            <div class="p1-row"><span>達成率</span><strong></strong></div>
            <div class="p1-row"><span>20 日均量(億)</span><strong></strong></div>
            <div class="p1-row"><span>預估量／20 日均量</span><strong></strong></div>
          </div>
        `;
      }
      // 預估量由資料層在拿到即時量時算好（withVolumeEstimate），這裡只讀。
      const t = store.get('taiex');
      const currentVolume = Number(t.volume ?? NaN);
      const estimatedVolume = Number(t.volEstimate ?? NaN);
      const ratio = Number.isFinite(currentVolume) && Number.isFinite(estimatedVolume) && estimatedVolume > 0
        ? (currentVolume / estimatedVolume) * 100
        : null;
      const rows = [...box.querySelectorAll('.p1-row')];
      patchRow(rows[0], null, currentVolume > 0 ? n(currentVolume, 0) : '--', '');
      patchRow(rows[1], null, Number.isFinite(estimatedVolume) ? n(estimatedVolume, 0) : '--', '');
      patchRow(rows[2], null, ratio == null ? '--' : `${ratio.toFixed(2)}%`, '');
      // 20 日均量：證交所每日成交金額（億），不含今天。
      const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      const avg20 = recentAverage((store.get('marketAmountHistory') || []).filter((row) => row.date < today).map((row) => row.amountYi));
      patchRow(rows[3], null, avg20 == null ? '--' : n(avg20, 0), '');
      const vsAvg = avg20 && Number.isFinite(estimatedVolume) ? (estimatedVolume / avg20) * 100 : null;
      patchRow(rows[4], null, vsAvg == null ? '--' : `${vsAvg.toFixed(0)}%`, vsAvg == null ? '' : c(vsAvg - 100));
      box.querySelector('.p1-volume-bar__fill').style.width = `${ratio == null ? 0 : Math.min(100, Math.max(0, ratio))}%`;
    },
    amp30: (box, fresh) => {
      if (fresh) {
        box.innerHTML = '<div id="p1-amp20-wrap" class="p1-amp20-wrap"><canvas id="p1-amp20" class="p1-amp20-canvas"></canvas></div>';
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

  const renderers = { left: () => infoPanel.render(), trend: renderMainTrend, group: renderPage1Group, monitor: renderMonitor, b: renderBContent };

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
    subscribeLiveQuote: subscribeChartLiveQuote,
    // 大戶成本線與多空差額：期交所三大法人（marketFeed 寫入 institutional）。
    getInstitutional: () => store.get('institutional'),
    subscribeInstitutional: (callback) => store.subscribe('institutional', callback)
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
      .catch(() => { chartLightweightEl.innerHTML = '<div class="p1-chart-error">Lightweight Charts 載入失敗</div>'; });
  };

  // TradingView widget 只有切到該分頁時才載入，避免預設頁面多載外部資源。
  const mountTradingViewTab = () => {
    if (tradingViewMounted) return;
    tradingViewMounted = true;
    mountTradingViewWidget(chartTradingViewEl, { symbol: 'INDEX:TWII', interval: 'D' })
      .then((fn) => { if (disposed) fn(); else stopTradingViewWidget = fn; })
      .catch(() => { chartTradingViewEl.innerHTML = '<div class="p1-chart-error">TradingView 載入失敗</div>'; });
  };

  // Charting Library 目前是預留區，日後可在這裡接掛載流程。
  const setChartTab = (tab) => {
    container.querySelectorAll('#p1-chart-tabs button').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.k === tab));
    chartLightweightEl.hidden = tab !== 'lightweight';
    chartTradingViewEl.hidden = tab !== 'tradingview';
    chartingLibraryEl.hidden = tab !== 'chartinglib';
    if (tab === 'tradingview') mountTradingViewTab();
  };

  // ---- 事件綁定與啟動 ----

  container.querySelectorAll('#p1-chart-tabs button').forEach((btn) => btn.addEventListener('click', () => setChartTab(btn.dataset.k)));
  container.querySelectorAll('#p1-s6-tabs button').forEach((btn) => btn.addEventListener('click', () => setS6Tab(btn.dataset.k)));
  container.querySelector('#p1-monitor-select').addEventListener('change', renderMonitor);

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

  const clockEl = container.querySelector('#p1-clock');
  const stopClock = subscribeSecond((now) => {
    clockEl.textContent = now.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
  });

  mountLightweight();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    unsubs.forEach((unsub) => unsub());
    unsubSource();
    stopClock();
    stopLightweightChart();
    stopTradingViewWidget();
    monitorResize.disconnect();
    trendResize.disconnect();
    ampResizeObserver?.disconnect();
    stopSplitLeft();
    stopSplitRight();
    cards.forEach((x) => x.destroy()); miniSparks.forEach((x) => x.destroy());
    infoPanel.destroy(); p6.destroy(); p5.destroy();
  };
}
