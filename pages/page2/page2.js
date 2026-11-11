// Page2 市場溫度：只讀 store（由 marketFeed 寫入）計算統計並重畫；繪圖函式在 page2Draw.js。
import { store } from '../../data/store.js';
import { Panel } from '../../components/Panel.js';
import { Gauge } from '../../components/Gauge.js';
import { bindCssVarSplitter } from '../../services/splitter.js';
import { subscribeSecond } from '../../services/feedClock.js';
import { getDashboardDataSource, sourceInfo, subscribeDashboardDataSource } from '../../services/dashboardDataSource.js';
import { TAIEX_BY_CODE, TAIEX_DATA_DATE } from '../../data/taiexWeightedConstituents.js';
import { TW50_BY_CODE, TW50_DATA_DATE } from '../../data/tw50Constituents.js';
import { MID100_BY_CODE, MID100_DATA_DATE } from '../../data/twMid100Constituents.js';
import { TOP10_CODES, liveMarketMapQuotes, pctFromPrevClose, trendClass as c, weightedAverage } from '../../services/quoteUtils.js';
import { HIGH_LOW_DAYS } from '../../services/marketBreadth.js';
import { indexContributions, recentAverage, topWeightSummary } from '../../services/marketOverview.js';
import { drawBars, drawCategoryCandle, drawSectorPie } from './page2Draw.js';

const LIMIT_FALLBACK_PCT = 9.8;

// 沒有報價回傳 null（不當成 0% 平盤）。
function quoteClosePct(row) {
  if (row.changePct != null && Number.isFinite(Number(row.changePct))) return Number(row.changePct);
  return pctFromPrevClose(row.price, row.prevClose);
}

function quoteOhlcPct(row) {
  const close = quoteClosePct(row);
  if (close == null) return null;
  const open = pctFromPrevClose(row.open, row.prevClose) ?? close;
  const high = pctFromPrevClose(row.high, row.prevClose) ?? Math.max(open, close);
  const low = pctFromPrevClose(row.low, row.prevClose) ?? Math.min(open, close);
  return {
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close
  };
}

function rowWeight(row) {
  const weight = Number(row.taiexWeightPct ?? row.weightPct ?? row.marketCap);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

// 依加權指數權重平均（原本誤把 { row, ohlc } 當成 row 取權重，每檔都變成 1）。
const weightedOhlc = (ohlcRows, key) => weightedAverage(ohlcRows, ({ ohlc }) => ohlc[key], ({ row }) => rowWeight(row));

// 沒有任何報價的類股回傳 { label, empty: true }，圖上顯示「--」。
function summarizeQuoteRows(label, rows) {
  const ohlcRows = rows.map((row) => ({ row, ohlc: quoteOhlcPct(row) })).filter((item) => item.ohlc);
  if (!ohlcRows.length) return { label, empty: true };
  const [open, close, high, low] = ['open', 'close', 'high', 'low'].map((key) => weightedOhlc(ohlcRows, key));
  return {
    label,
    open: +open.toFixed(2),
    high: +Math.max(high, open, close).toFixed(2),
    low: +Math.min(low, open, close).toFixed(2),
    close: +close.toFixed(2)
  };
}

function isElectronicRow(row) {
  const meta = TAIEX_BY_CODE[String(row.code)] || {};
  const sector = `${row.taiexSector || meta.sector || ''} ${row.yahooSector || meta.yahooSector || ''} ${row.sector || ''}`;
  return /半導體|電子|電腦|通信|光電|資訊/.test(sector);
}

function isFinancialRow(row) {
  const meta = TAIEX_BY_CODE[String(row.code)] || {};
  const sector = `${row.taiexSector || meta.sector || ''} ${row.yahooSector || meta.yahooSector || ''} ${row.sector || ''}`;
  return /金融|保險/.test(sector);
}

function isTraditionalRow(row) {
  return !isElectronicRow(row) && !isFinancialRow(row);
}

function quoteRowsForCategories(topStocks, marketMap) {
  const liveMarketRows = Array.isArray(marketMap)
    ? marketMap.filter((row) => row.source === 'yahoo' && Number.isFinite(Number(row.price)) && Number.isFinite(Number(row.changePct)))
    : [];
  if (liveMarketRows.length) return liveMarketRows;
  return Array.isArray(topStocks) ? topStocks.filter((row) => Number.isFinite(Number(row.price))) : [];
}

function buildCategoryQuoteStats(taiex, topStocks, marketMap) {
  const rows = quoteRowsForCategories(topStocks, marketMap);
  // 第一根是加權指數（現貨），不是台指期。
  const taiexOhlc = quoteOhlcPct(taiex);
  const stats = [
    taiexOhlc
      ? {
        label: '加權',
        open: +taiexOhlc.open.toFixed(2),
        high: +taiexOhlc.high.toFixed(2),
        low: +taiexOhlc.low.toFixed(2),
        close: +taiexOhlc.close.toFixed(2)
      }
      : { label: '加權', empty: true },
    summarizeQuoteRows('電子', rows.filter(isElectronicRow)),
    summarizeQuoteRows('金融', rows.filter(isFinancialRow)),
    summarizeQuoteRows('傳產', rows.filter(isTraditionalRow))
  ];
  // 全部有報價成分股的加權平均（不是 MSCI 摩台指數；之後有摩台成分股名單再另加）。
  stats.push(summarizeQuoteRows('全體', rows));
  return stats;
}

function twseTickSize(price) {
  const value = Math.abs(Number(price));
  if (!Number.isFinite(value)) return 0.01;
  if (value < 10) return 0.01;
  if (value < 50) return 0.05;
  if (value < 100) return 0.1;
  if (value < 500) return 0.5;
  if (value < 1000) return 1;
  return 5;
}

// 證交所規則：漲停 = 昨收×1.1 未滿一檔無條件捨去；跌停 = 昨收×0.9 未滿一檔無條件進位。
function limitPrice(prevClose, direction) {
  const base = Number(prevClose);
  if (!Number.isFinite(base) || base <= 0) return null;
  const raw = base * (direction === 'up' ? 1.1 : 0.9);
  const tick = twseTickSize(raw);
  const steps = direction === 'up' ? Math.floor(raw / tick + 1e-9) : Math.ceil(raw / tick - 1e-9);
  return +(steps * tick).toFixed(2);
}

function isLimitQuote(row, direction) {
  const price = Number(row?.price);
  const prevClose = Number(row?.prevClose);
  const changePct = Number(row?.changePct);
  const limit = limitPrice(prevClose, direction);
  if (Number.isFinite(price) && Number.isFinite(limit)) {
    const tick = twseTickSize(limit);
    return direction === 'up'
      ? price >= limit - tick / 2
      : price <= limit + tick / 2;
  }
  if (!Number.isFinite(changePct)) return false;
  return direction === 'up'
    ? changePct >= LIMIT_FALLBACK_PCT
    : changePct <= -LIMIT_FALLBACK_PCT;
}

function isRisingQuote(row) {
  const price = Number(row?.price);
  const prevClose = Number(row?.prevClose);
  if (Number.isFinite(price) && Number.isFinite(prevClose)) return price > prevClose;
  return Number(row?.changePct) > 0;
}

function isFallingQuote(row) {
  const price = Number(row?.price);
  const prevClose = Number(row?.prevClose);
  if (Number.isFinite(price) && Number.isFinite(prevClose)) return price < prevClose;
  return Number(row?.changePct) < 0;
}

// 成分股漲停／上漲／平盤／下跌／跌停／無資料的檔數，直接給圓餅圖用。沒有報價的另成一塊（深灰斜線），不算平盤。
function buildConstituentPieSegments(constituentsByCode, marketMap, denominator) {
  const quoteByCode = liveMarketMapQuotes(marketMap);
  const codes = Object.keys(constituentsByCode);
  let up = 0;
  let down = 0;
  let limitUp = 0;
  let limitDown = 0;

  codes.forEach((code) => {
    const quote = quoteByCode.get(String(code));
    if (!quote) return;
    if (isLimitQuote(quote, 'up')) {
      limitUp += 1;
      up += 1;
    } else if (isLimitQuote(quote, 'down')) {
      limitDown += 1;
      down += 1;
    } else if (isRisingQuote(quote)) {
      up += 1;
    } else if (isFallingQuote(quote)) {
      down += 1;
    }
  });

  const quoted = codes.filter((code) => quoteByCode.has(String(code))).length;
  const noData = Math.max(0, (denominator || codes.length) - quoted);
  const flat = Math.max(0, quoted - up - down);
  return [
    { value: limitUp, color: 'rgb(244,65,110)' },
    { value: up - limitUp, color: 'rgb(244,134,124)' },
    { value: flat, color: '#d0d0d0' },
    { value: down - limitDown, color: 'rgb(139,195,74)' },
    { value: limitDown, color: 'rgb(37,210,129)' },
    { value: noData, color: '#2a2e38', hatch: true }
  ];
}

function buildCombinedAttackStats(marketMap) {
  const quoteByCode = liveMarketMapQuotes(marketMap);
  const codes = [...new Set([...Object.keys(TW50_BY_CODE), ...Object.keys(MID100_BY_CODE)])];
  let up = 0;
  let down = 0;
  let limitUp = 0;
  let limitDown = 0;

  codes.forEach((code) => {
    const quote = quoteByCode.get(String(code));
    if (!quote) return;
    if (isRisingQuote(quote)) up += 1;
    else if (isFallingQuote(quote)) down += 1;
    if (isLimitQuote(quote, 'up')) limitUp += 1;
    else if (isLimitQuote(quote, 'down')) limitDown += 1;
  });

  return { up, down, limitUp, limitDown };
}

const fmt = (value, digits = 2) => (Number.isFinite(value) ? value.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '--');
const signed = (value, digits = 2) => (Number.isFinite(value) ? `${value > 0 ? '+' : ''}${fmt(value, digits)}` : '--');
const ratioText = (a, b) => `<span class="metric-up">${a ?? '--'}</span> : <span class="metric-down">${b ?? '--'}</span>`;
const pctOf = (count, total) => (total ? ` (${((count / total) * 100).toFixed(1)}%)` : '');
const taipeiDate = (unixSeconds) => new Date((unixSeconds + 8 * 3600) * 1000).toISOString().slice(0, 10);

// 指數列：名稱、現價、漲跌、漲跌幅。
function indexRow(label, quote, digits = 2) {
  const price = Number(quote?.price);
  const change = Number(quote?.change);
  const pct = Number(quote?.changePct);
  return `<div class="p2-flow-row"><span>${label}</span><strong class="${c(change)}">${fmt(price, digits)} <small>${signed(change, digits)} ${Number.isFinite(pct) ? `${signed(pct)}%` : ''}</small></strong></div>`;
}

// 一個市場（上市／上櫃）的漲跌停分布、創 N 日高低、站上均線家數（services/marketBreadth.js 算好的統計）。
function breadthBlock(label, b) {
  if (!b) return `<div class="p2-ov-title">${label}</div><div class="p2-flow-row"><span>統計中…</span></div>`;
  return `
    <div class="p2-ov-title">${label}（${b.total} 檔）</div>
    <div class="p2-ov-dist">
      <span class="metric-down">跌停<b>${b.limitDown}</b></span><span class="metric-down">下跌<b>${b.down}</b></span>
      <span>平盤<b>${b.flat}</b></span><span class="metric-up">上漲<b>${b.up}</b></span><span class="metric-up">漲停<b>${b.limitUp}</b></span>
    </div>
    <div class="p2-ov-grid" title="創高：現價高於前 N 日收盤的最高；創低：低於最低（以收盤價計）">
      <span>創高 : 創低</span><span></span>
      ${HIGH_LOW_DAYS.map((n) => `<span>${n} 日</span><span>${ratioText(b.newHigh[n], b.newLow[n])}</span>`).join('')}
    </div>
    <div class="p2-ov-grid">
      <span>站上週線</span><span>${b.above.week}${pctOf(b.above.week, b.withHistory)}</span>
      <span>站上月線</span><span>${b.above.month}${pctOf(b.above.month, b.withHistory)}</span>
      <span>站上季線</span><span>${b.above.quarter}${pctOf(b.above.quarter, b.withHistory)}</span>
      <span>多頭排列</span><span>${b.bullish}${pctOf(b.bullish, b.withHistory)}</span>
    </div>`;
}

// mount：建立頁面並回傳清理函式（由 app.js 的路由在離開頁面時呼叫）。
export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 2｜台股溫度計 <span class="badge badge--mid" title="台灣50 ${TW50_DATA_DATE}｜中型100 ${MID100_DATA_DATE}">權重資料 ${TAIEX_DATA_DATE}</span></h2><span class="page-clock" id="p2-clock"></span></div>
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

  const p1 = new Panel(left, { badge: '1', title: '市場概況' }); p1.root.classList.add('p2-resize');
  p1.setContent('<div class="p2-flow" id="p2-main"></div><div class="p2-flow p2-overview" id="p2-overview"></div>');

  const p4 = new Panel(center, { badge: '2', title: '時鐘與多空攻擊' }); p4.root.classList.add('p2-resize');
  const p5 = new Panel(center, { badge: '3', title: '類股強弱' }); p5.root.classList.add('p2-resize');

  const centerSplit = container.querySelector('#p2-center-split');
  if (centerSplit && p5.root?.parentNode === center) {
    center.insertBefore(centerSplit, p5.root);
  }

  const clockBlock = document.createElement('div');
  clockBlock.innerHTML = `
    <div class="p2-bigclock" id="p2-bigclock">--:--:--</div>
    <div class="p2-vol-box">加權預估量<br><strong id="p2-vol-e"></strong></div>
  `;
  p4.body.appendChild(clockBlock);

  const bullWrap = document.createElement('div');
  bullWrap.className = 'p2-gauge-wrap';
  const bearWrap = document.createElement('div');
  bearWrap.className = 'p2-gauge-wrap';
  p4.body.appendChild(bullWrap);
  p4.body.appendChild(bearWrap);

  const gaugeBull = new Gauge(bullWrap, {
    scaleMax: 150,
    zoneStart: 150,
    tickStep: 25,
    color: 'rgb(111,93,99)',
    baseAlpha: 1,
    zoneColor: 'rgb(111,93,99)',
    titleColor: 'rgb(244,134,124)',
    needleColor: 'rgb(244,65,110)',
    width: 380,
    height: 220,
    title: '多方攻擊'
  });
  const gaugeBear = new Gauge(bearWrap, {
    scaleMax: 150,
    zoneStart: 150,
    tickStep: 25,
    color: 'rgb(91,108,99)',
    baseAlpha: 1,
    zoneColor: 'rgb(91,108,99)',
    titleColor: 'rgb(139,195,74)',
    needleColor: 'rgb(37,210,129)',
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
    </div>
  `);

  const p6 = new Panel(bottom, { badge: '4', title: '前十大權值股' }); p6.root.classList.add('p2-resize');
  const p7 = new Panel(bottom, { badge: '5', title: '類股 K 線（加權/電子/金融/傳產/全體）' }); p7.root.classList.add('p2-resize');
  const p8 = new Panel(bottom, { badge: '6', title: '類股今日漲跌幅' }); p8.root.classList.add('p2-resize');
  p6.setContent('<div class="p2-chart-wrap p2-chart-wrap--w120"><canvas id="p2-c6" class="p2-chart-canvas"></canvas></div>');
  p7.setContent('<div class="p2-chart-wrap p2-chart-wrap--w90"><canvas id="p2-c7" class="p2-chart-canvas"></canvas></div>');
  p8.setContent('<div class="p2-chart-wrap p2-chart-wrap--w90"><canvas id="p2-c8" class="p2-chart-canvas"></canvas></div>');

  // 各區塊自己判斷：拿不到資料的區塊灰掉並說明（DDE 時區塊 1 仍正常）。
  // 多空攻擊、成分股圓餅要市場地圖（來源清單的 stocks）；權值股與類股統計在模擬資料下用模擬的十大權值股。
  const renderSourceNote = (source = getDashboardDataSource()) => {
    const marketStats = Boolean(sourceInfo(source).stocks);
    const stockQuotes = marketStats || source === 'mock';
    [[p4, marketStats], [p5, marketStats], [p6, stockQuotes], [p7, stockQuotes], [p8, stockQuotes]].forEach(([panel, supported]) => {
      panel.root.classList.toggle('is-unsupported', !supported);
      panel.body.dataset.note = '此資料來源沒有市場統計';
    });
  };

  const clockEl = container.querySelector('#p2-bigclock');
  const stopMainSplit = bindCssVarSplitter(container.querySelector('#p2-main-split'), layoutEl, '--p2-left-w', { fallback: 360, min: 280, max: 760 });
  const stopCenterSplit = bindCssVarSplitter(centerSplit, center, '--p2-center-left-w', { fallback: 440, min: 300, max: 900 });
  const clockResize = new ResizeObserver(() => {
    const rect = p4.body.getBoundingClientRect();
    const size = Math.max(32, Math.min(96, Math.floor(Math.min(rect.width * 0.16, rect.height * 0.18))));
    clockEl.style.fontSize = `${size}px`;
  });
  clockResize.observe(p4.body);

  // 台指期只認 marketFeed 從券商橋接寫進 futuresFull 的報價（帶 sourceUpdatedAt）；Yahoo 沒有台指期，顯示 '--'。
  const renderMain = () => {
    const t = store.get('taiex');
    const f = store.get('futuresFull') || {};
    const hasFutures = Number.isFinite(Number(f.price)) && Number.isFinite(f.sourceUpdatedAt);
    const spread = hasFutures && Number.isFinite(Number(t.price)) ? +(f.price - t.price).toFixed(2) : null;
    const volEstimate = t.volEstimate == null ? NaN : Number(t.volEstimate);

    const extras = store.get('indexExtras') || {};
    container.querySelector('#p2-main').innerHTML = `
      ${indexRow('加權指數', t)}
      ${indexRow('櫃買指數', extras.otc)}
      ${indexRow('台指期', hasFutures ? f : null, 0)}
      <div class="p2-flow-row"><span>價差</span><strong class="${c(spread)}">${spread ?? '--'}</strong></div>
      ${indexRow('台指 VIX', extras.vix)}
    `;
    container.querySelector('#p2-vol-e').textContent = Number.isFinite(volEstimate) ? Math.round(volEstimate).toLocaleString('zh-TW') : '--';
  };

  // 盤面摘要＋上市／上櫃寬度統計（公開資料來源；其他來源顯示「--」）。
  const renderOverview = () => {
    const t = store.get('taiex');
    const contributions = indexContributions(liveMarketMapQuotes().values(), t.prevClose);
    const tsmc = contributions.find((row) => row.code === '2330');
    const top20 = topWeightSummary(contributions, 20);
    const today = taipeiDate(Date.now() / 1000);
    const avgAmount = recentAverage((store.get('marketAmountHistory') || []).filter((row) => row.date < today).map((row) => row.amountYi));
    // 振幅％＝(高－低)÷昨收；20 日均振幅用加權日 K（不含今天）。
    const daily = (store.get('productDaily')?.index?.candles || []).filter((row) => taipeiDate(row.time) < today);
    const ampPcts = daily.slice(1).map((row, i) => ((row.high - row.low) / daily[i].close) * 100);
    const ampToday = t.prevClose ? ((t.high - t.low) / t.prevClose) * 100 : NaN;
    const breadth = store.get('marketBreadth');
    const tse = breadth?.tse;
    container.querySelector('#p2-overview').innerHTML = `
      <div class="p2-ov-title">盤面摘要</div>
      <div class="p2-flow-row"><span>台積電貢獻</span><strong class="${c(tsmc?.points)}">${signed(tsmc?.points)}</strong></div>
      <div class="p2-flow-row"><span>權值前 20 貢獻</span><strong class="${c(top20.points)}">${top20.count ? signed(top20.points) : '--'}</strong></div>
      <div class="p2-flow-row"><span>權值前 20 漲跌</span><strong>${top20.count ? ratioText(top20.up, top20.down) : '--'}</strong></div>
      <div class="p2-flow-row"><span>上市漲跌家數</span><strong>${tse ? ratioText(tse.up, tse.down) : '--'}</strong></div>
      <div class="p2-flow-row"><span>預估量／20 日均量(億)</span><strong>${fmt(Number(t.volEstimate), 0)} / ${fmt(avgAmount, 0)}</strong></div>
      <div class="p2-flow-row"><span>振幅／20 日均振幅</span><strong>${Number.isFinite(ampToday) ? `${ampToday.toFixed(2)}%` : '--'} / ${ampPcts.length ? `${recentAverage(ampPcts).toFixed(2)}%` : '--'}</strong></div>
      ${breadthBlock('上市', tse)}
      ${breadthBlock('上櫃', breadth?.otc)}
    `;
  };

  const renderAttackGauges = () => {
    const stats = buildCombinedAttackStats(store.peek('marketMap'));
    gaugeBull.update({
      value: stats.limitUp,
      activeValue: stats.up,
      segmentValue: stats.limitUp,
      displayValue: stats.limitUp,
      displayMax: stats.up,
      title: '多方攻擊'
    });
    gaugeBear.update({
      value: stats.limitDown,
      activeValue: stats.down,
      segmentValue: stats.limitDown,
      displayValue: stats.limitDown,
      displayMax: stats.down,
      title: '空方攻擊'
    });
  };

  const renderPies = () => {
    const marketMap = store.peek('marketMap');
    [['台灣50', TW50_BY_CODE, 50], ['中型100', MID100_BY_CODE, 100]].forEach(([key, constituents, total]) => {
      const canvas = p5.body.querySelector(`.p2-pie-card[data-key="${key}"] canvas`);
      if (canvas) drawSectorPie(canvas, buildConstituentPieSegments(constituents, marketMap, total), 240);
    });
  };

  const renderCharts = () => {
    const stocks = store.get('topStocks');
    // 還沒有報價的股票不畫長條、標「--」，不畫成 0%。
    const top10 = TOP10_CODES.map((code) => stocks.find((s) => s.code === code)).filter(Boolean);

    drawBars(
      container.querySelector('#p2-c6'),
      top10.map((s) => ({ label: s.code, subLabel: s.name, value: Number.isFinite(s.changePct) ? s.changePct : null })),
      { axisBottom: 44, maxWidth: 672 }
    );

    const taiex = store.get('taiex');
    const marketMap = store.peek('marketMap');
    const categoryStats = buildCategoryQuoteStats(taiex, stocks, marketMap);

    drawCategoryCandle(container.querySelector('#p2-c7'), categoryStats, { minV: -4, maxV: 4, ticks: [-4, -2, 0, 2, 4], maxWidth: 504 });
    drawBars(
      container.querySelector('#p2-c8'),
      categoryStats.map((item) => ({ label: item.label, value: item.empty ? null : item.close })),
      { ticks: [-2, -1, 0, 1, 2], maxWidth: 504 }
    );
  };

  renderSourceNote();
  renderMain();
  renderOverview();
  renderAttackGauges();
  renderPies();
  renderCharts();

  const pieResize = new ResizeObserver(renderPies);
  pieResize.observe(p5.body);

  const chartResize = new ResizeObserver(renderCharts);
  chartResize.observe(bottom);

  const unsubs = [
    store.subscribe('taiex', () => {
      renderMain();
      renderCharts();
    }),
    store.subscribe('futuresFull', renderMain),
    store.subscribe('indexExtras', renderMain),
    ...['taiex', 'marketMap', 'marketBreadth', 'marketAmountHistory', 'productDaily'].map((key) => store.subscribe(key, renderOverview)),
    store.subscribe('topStocks', renderCharts),
    store.subscribe('marketMap', () => {
      renderAttackGauges();
      renderPies();
      renderCharts();
    }),
    subscribeDashboardDataSource(renderSourceNote)
  ];

  const clockEls = [container.querySelector('#p2-clock'), container.querySelector('#p2-bigclock')];
  const stopClock = subscribeSecond((now) => {
    const t = now.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
    clockEls.forEach((el) => { el.textContent = t; });
  });

  return () => {
    stopClock();
    clockResize.disconnect();
    pieResize.disconnect();
    chartResize.disconnect();
    stopMainSplit();
    stopCenterSplit();
    unsubs.forEach((unsub) => unsub());
    gaugeBull.destroy();
    gaugeBear.destroy();
    [p1, p4, p5, p6, p7, p8].forEach((panel) => panel.destroy());
  };
}
