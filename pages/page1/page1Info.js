// Page1 的 1 區「台指綜合資訊」：商品切換（台指(全)／台指／加權）、開高低、結算月成本、價差、多空關卡、振幅統計、三大法人持倉成本。
// 版面在建立時畫好一次，之後 render() 只改數字、顏色與標籤，不重建 DOM（商品選項、關卡選單不會被換掉）。
import { store } from '../../data/store.js';
import { loadSetting, saveSetting } from '../../data/storage.js';
import { TW_FUTURES_BY_LABEL } from '../../data/twDerivatives.js';
import { Panel } from '../../components/Panel.js';
import { sourceInfo } from '../../services/dashboardDataSource.js';
import { pivotLevels } from '../../services/indicators.js';
import { fmtNum as n, hasValue, trendClass as c } from '../../services/quoteUtils.js';
import { INSTITUTIONS } from '../../services/taifexHistory.js';
import { drawInfoCandle } from './page1Draw.js';
import { AMP_HISTORY_DAYS, COMPARE_COLORS, amplitudeStats, buildDailyStats, compareWithPrevDay, periodAmplitudes, settlementMonth } from './page1Series.js';

// 多空關卡三種算法（存在瀏覽器）：樞紐點（昨日高低收）、振幅倍數（開盤 ± 20 日平均振幅 × 倍數）、固定點數（現價 ± 自訂點數）。
const LEVEL_MODES = { pivot: '樞紐點', amplitude: '振幅倍數', fixed: '固定點數' };
const AMP_MULTIPLIERS = [1.25, 1, 0.75, 0.5, 0.25];
const DEFAULT_FIXED_POINTS = [280, 180, 100, 40, 10];
const PRODUCTS = ['台指(全)', '台指', '加權'];
const AMP_PERIODS = { D: '日', W: '週', M: '月' };
const K_MODES = { change: 'K棒：漲跌', compare: 'K棒：比前日' };
const COMPARE_TITLES = { red: '高過高、低不過低', green: '高不過高、低過低', yellow: '高不過高、低不過低', grey: '高過高、低過低' };

function loadLevelSettings() {
  const saved = loadSetting('page1Levels') || {};
  const points = Array.isArray(saved.points) ? saved.points.map(Number).filter((v) => v > 0).slice(0, 5) : [];
  return { mode: LEVEL_MODES[saved.mode] ? saved.mode : 'fixed', points: points.length ? points : DEFAULT_FIXED_POINTS };
}

// 振幅週期與 K 棒顏色模式（存在瀏覽器）。
function loadViewSettings() {
  const saved = loadSetting('page1Info') || {};
  return { ampPeriod: AMP_PERIODS[saved.ampPeriod] ? saved.ampPeriod : 'D', kMode: K_MODES[saved.kMode] ? saved.kMode : 'change' };
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

// 期貨點數取整數顯示。
export function formatFuturesValue(value) {
  return hasValue(value) ? n(Math.round(Number(value)), 0) : '--';
}

const isIndexMode = (mode) => mode === '加權';
const productStoreKey = (mode) => (TW_FUTURES_BY_LABEL[mode] || TW_FUTURES_BY_LABEL['台指(全)']).storeKey;

// 只回傳開高低收昨收齊全的快照（期貨來自期貨來源；「加權」是加權指數報價）；沒有就回 null。
export function getProductFuturesSnapshot(mode) {
  const quote = store.get(isIndexMode(mode) ? 'taiex' : productStoreKey(mode));
  const usable = ['price', 'open', 'high', 'low', 'prevClose'].every((key) => quote?.[key] != null && Number.isFinite(Number(quote[key])));
  return usable ? quote : null;
}

// 1 區與 B 區統計用的日 K：台指／台指(全) 用該商品的期貨日 K（沒有時退回加權日 K，label 會標「加權」）；「加權」用加權日 K。
export function productDailyStats(mode) {
  const daily = store.get('productDaily');
  const product = (isIndexMode(mode) ? null : daily?.[productStoreKey(mode)]) || daily?.index || null;
  return { label: product?.label || '', ...buildDailyStats(product?.candles) };
}

const kv = (field, label = '', title = '') => `<div class="p1-kv"${title ? ` title="${title}"` : ''}><span data-label="${field}">${label}</span><strong data-f="${field}"></strong></div>`;

// onModeChange 在切換商品後呼叫（B 區「台指盤中資訊」要跟著換）。回傳 { root, render, mode(), destroy }。
export function createInfoPanel(host, { onModeChange = () => {} } = {}) {
  const panel = new Panel(host, { badge: '1', title: '台指綜合資訊' });
  panel.root.classList.add('p1-resize');
  panel.body.dataset.note = '需要期貨來源（公開資料或 DDE）';
  panel.setContent(`
    <div class="p1-side-table">
      <div class="p1-kv"><span>商品</span><strong>${PRODUCTS.map((p, i) => `<label class="p1-radio"><input type="radio" name="p1-product" value="${p}" ${i === 0 ? 'checked' : ''}>${p}</label>`).join('')}</strong></div>
      <div class="p1-main-top">
        <div class="p1-main-table">
          <div class="p1-kv p1-kv-current"><span data-label="price"></span><strong data-f="price"></strong></div>
          ${kv('open')}${kv('high')}${kv('low')}
          <div class="p1-kv" data-cost-tip><span data-label="cost"></span><strong data-f="cost"></strong></div>
          ${kv('contract', '合約高低', '目前結算月 K 的最高／最低')}
        </div>
        <div class="p1-main-mini">
          <canvas class="p1-main-mini-canvas"></canvas>
          <select class="p1-k-mode" aria-label="K 棒顏色">${Object.entries(K_MODES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
        </div>
      </div>
      ${kv('spread')}${kv('farSpread', '近遠月價差', '次近月減近月')}
    </div>
    <div class="p1-side-levels">
      <div class="p1-levels-ctrl">
        <select class="p1-level-mode" aria-label="關卡算法">${Object.entries(LEVEL_MODES).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
        <input class="input p1-level-points" type="text" title="固定點數，用逗號分隔，最多 5 個" aria-label="固定點數">
      </div>
      <div class="p1-block p1-block--red"><div class="p1-block-title">日多方關卡</div><div class="p1-level-rows" data-side="upper"></div></div>
      <div class="p1-block p1-block--green"><div class="p1-block-title">日空方關卡</div><div class="p1-level-rows" data-side="lower"></div></div>
    </div>
    <div class="p1-side-amp">
      <div class="p1-block-title p1-amp-head"><span data-label="ampTitle"></span><span class="p1-amp-periods">${Object.entries(AMP_PERIODS).map(([value, label]) => `<button type="button" data-period="${value}">${label}</button>`).join('')}</span></div>
      <div class="p1-amp-list">${kv('ampMax', '最大振幅')}${kv('ampBig', '大大振幅', '高於平均的那幾期再平均')}${kv('ampAvg', '平均振幅')}${kv('ampSmall', '小小振幅', '低於平均的那幾期再平均')}${kv('ampMin', '最小振幅')}${kv('ampToday')}</div>
    </div>
    <div class="p1-side-inst">
      <div class="p1-block-title" title="期交所三大法人臺股期貨未平倉，近一年逐日累計的平均成本（自行計算，和玩股網的起算方式不同，數字會有差異）">三大法人持倉成本（淨口數）</div>
      <div class="p1-amp-list">${Object.entries(INSTITUTIONS).map(([id, label]) => kv(`inst-${id}`, label)).join('')}</div>
    </div>
  `);

  const body = panel.body;
  const fields = Object.fromEntries([...body.querySelectorAll('[data-f]')].map((el) => [el.dataset.f, el]));
  const labels = Object.fromEntries([...body.querySelectorAll('[data-label]')].map((el) => [el.dataset.label, el]));
  const levelRows = Object.fromEntries([...body.querySelectorAll('.p1-level-rows')].map((el) => [el.dataset.side, el]));
  const miniCanvas = body.querySelector('.p1-main-mini-canvas');
  const costRow = body.querySelector('[data-cost-tip]');
  const ampTodayRow = fields.ampToday.parentElement;
  const levelModeEl = body.querySelector('.p1-level-mode');
  const levelPointsEl = body.querySelector('.p1-level-points');
  const kModeEl = body.querySelector('.p1-k-mode');
  const periodButtons = [...body.querySelectorAll('.p1-amp-periods button')];
  const levelSettings = loadLevelSettings();
  const view = loadViewSettings();
  let mode = PRODUCTS[0];
  let levelLabelsKey = '';

  // 只在文字或顏色真的變了才寫 DOM。
  const set = (el, text, className) => {
    if (el.textContent !== text) el.textContent = text;
    if (className !== undefined && el.className !== className) el.className = className;
  };

  // 關卡列數隨算法改變（樞紐點 3 列、其他 5 列）：標籤組合變了才重建列，否則只改數字。
  const renderLevels = (levels) => {
    const key = [...levels.upper, ...levels.lower].map((row) => row.label).join('|');
    if (key !== levelLabelsKey) {
      levelLabelsKey = key;
      ['upper', 'lower'].forEach((side) => {
        levelRows[side].innerHTML = levels[side].map(() => '<div class="p1-kv"><span></span><strong></strong></div>').join('');
      });
    }
    ['upper', 'lower'].forEach((side) => {
      [...levelRows[side].children].forEach((row, i) => {
        set(row.firstElementChild, levels[side][i].label);
        set(row.lastElementChild, formatFuturesValue(levels[side][i].value));
      });
    });
  };

  // 振幅統計（期海任我行的算法）：本期振幅還小於最小振幅時標亮，表示振幅還沒被滿足、可能放大。
  const renderAmplitude = (stats, quote) => {
    const unit = AMP_PERIODS[view.ampPeriod];
    const { history, current } = periodAmplitudes(stats.rows, view.ampPeriod, stats.today, quote);
    const summary = amplitudeStats(history);
    const text = (value) => (Number.isFinite(value) ? value.toFixed(0) : '--');
    set(labels.ampTitle, `${isIndexMode(mode) || stats.label === '加權' ? '加權' : ''}${unit}振幅統計(近${AMP_HISTORY_DAYS}${unit})`);
    set(labels.ampToday, `本${unit}振幅`);
    set(fields.ampMax, text(summary?.max));
    set(fields.ampBig, text(summary?.big));
    set(fields.ampAvg, text(summary?.avg));
    set(fields.ampSmall, text(summary?.small));
    set(fields.ampMin, text(summary?.min));
    set(fields.ampToday, text(current));
    const unmet = summary && Number.isFinite(current) && current < summary.min;
    ampTodayRow.classList.toggle('p1-amp-alert', Boolean(unmet));
    ampTodayRow.title = unmet ? `本${unit}振幅還小於近 ${AMP_HISTORY_DAYS} ${unit}最小振幅：振幅未滿足，可能放大` : '';
    periodButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.period === view.ampPeriod));
  };

  const renderInstitutional = () => {
    const data = store.get('institutional');
    Object.keys(INSTITUTIONS).forEach((id) => {
      const last = data?.[id]?.at(-1);
      set(fields[`inst-${id}`], last ? `${formatFuturesValue(last.cost)} (${last.netOI > 0 ? '+' : ''}${n(last.netOI, 0)})` : '--', last ? c(last.netOI) : '');
    });
  };

  const render = () => {
    const taiex = store.get('taiex');
    const index = isIndexMode(mode);
    const quote = getProductFuturesSnapshot(mode);
    const stats = productDailyStats(mode);
    // 沒有期貨來源時期貨商品全部顯示 '--'，不拿加權指數頂替期貨價；整塊灰掉並說明。
    const chg = quote ? quote.price - quote.prevClose : null;
    const chgPct = quote?.prevClose ? (chg / quote.prevClose) * 100 : 0;
    const spread = !index && quote && hasValue(taiex.price) ? quote.price - taiex.price : null;
    const farSpread = !index && quote && hasValue(quote.farPrice) ? quote.farPrice - quote.price : null;
    const info = sourceInfo();
    panel.root.classList.toggle('is-unsupported', !(info.feed && (index || info.futures || info.mis)));

    const month = stats.today ? settlementMonth(stats.rows, stats.today, quote) : null;
    set(labels.price, mode);
    set(labels.open, `${mode}開`);
    set(labels.high, `${mode}高`);
    set(labels.low, `${mode}低`);
    set(labels.cost, `${index || stats.label === '加權' ? '加權' : ''}月成本`);
    set(labels.spread, index ? '期現價差' : `${mode}加權價差`);
    set(fields.price, formatFuturesValue(quote?.price), c(chg));
    set(fields.open, formatFuturesValue(quote?.open));
    set(fields.high, formatFuturesValue(quote?.high));
    set(fields.low, formatFuturesValue(quote?.low));
    set(fields.cost, formatFuturesValue(month?.cost), month && quote ? c(quote.price - month.cost) : '');
    set(fields.contract, month ? `${formatFuturesValue(month.high)}/${formatFuturesValue(month.low)}` : '--');
    costRow.title = month ? `結算月 K（${month.since} 起）開 ${formatFuturesValue(month.open)}、高 ${formatFuturesValue(month.high)}、低 ${formatFuturesValue(month.low)}；月成本＝(高＋低)÷2` : '結算月 K 的 (最高＋最低)÷2';
    set(fields.spread, Number.isFinite(spread) ? spread.toFixed(2) : '--', c(spread));
    set(fields.farSpread, Number.isFinite(farSpread) ? formatFuturesValue(farSpread) : '--', c(farSpread));

    if (quote) {
      const compare = view.kMode === 'compare' ? compareWithPrevDay(quote, stats.prevDay) : null;
      miniCanvas.title = compare ? `比前一日：${COMPARE_TITLES[compare]}` : '';
      drawInfoCandle(miniCanvas, { open: quote.open, close: quote.price, high: quote.high, low: quote.low, prevClose: quote.prevClose, change: chg, ampPct: chgPct, bodyColor: compare ? COMPARE_COLORS[compare] : null });
    } else {
      miniCanvas.getContext('2d')?.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    }

    renderLevels(computeLevels(levelSettings, quote, stats));
    renderAmplitude(stats, quote);
    renderInstitutional();
  };

  body.querySelectorAll('input[name="p1-product"]').forEach((el) => el.addEventListener('change', () => {
    mode = el.value;
    render();
    onModeChange(mode);
  }));

  // 關卡算法、振幅週期、K 棒顏色：改了就存到瀏覽器並重畫。
  const syncControls = () => {
    levelModeEl.value = levelSettings.mode;
    levelPointsEl.value = levelSettings.points.join(',');
    levelPointsEl.hidden = levelSettings.mode !== 'fixed';
    kModeEl.value = view.kMode;
  };
  const saveLevels = () => {
    saveSetting('page1Levels', levelSettings);
    syncControls();
    render();
  };
  const saveView = () => {
    saveSetting('page1Info', view);
    syncControls();
    render();
  };
  levelModeEl.addEventListener('change', () => {
    levelSettings.mode = levelModeEl.value;
    saveLevels();
  });
  levelPointsEl.addEventListener('change', () => {
    const points = levelPointsEl.value.split(/[,，\s]+/).map(Number).filter((v) => v > 0).slice(0, 5);
    if (points.length) levelSettings.points = points;
    saveLevels();
  });
  kModeEl.addEventListener('change', () => {
    view.kMode = kModeEl.value;
    saveView();
  });
  periodButtons.forEach((btn) => btn.addEventListener('click', () => {
    view.ampPeriod = btn.dataset.period;
    saveView();
  }));
  syncControls();

  return { root: panel.root, render, mode: () => mode, destroy: () => panel.destroy() };
}
