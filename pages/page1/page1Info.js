// Page1 的 1 區「台指綜合資訊」：商品切換（台指(全)／台指）、期貨開高低收、月成本、價差、多空關卡、振幅統計。
// 版面在建立時畫好一次，之後 render() 只改數字、顏色與標籤，不重建 DOM（商品選項、關卡選單不會被換掉）。
import { store } from '../../data/store.js';
import { loadSetting, saveSetting } from '../../data/storage.js';
import { TW_FUTURES_BY_LABEL } from '../../data/twDerivatives.js';
import { Panel } from '../../components/Panel.js';
import { sourceInfo } from '../../services/dashboardDataSource.js';
import { pivotLevels } from '../../services/indicators.js';
import { fmtNum as n, hasValue, trendClass as c } from '../../services/quoteUtils.js';
import { drawInfoCandle } from './page1Draw.js';
import { AMP_HISTORY_DAYS, buildDailyStats } from './page1Series.js';

// 多空關卡三種算法（存在瀏覽器）：樞紐點（昨日高低收）、振幅倍數（開盤 ± 30 日平均振幅 × 倍數）、固定點數（現價 ± 自訂點數）。
const LEVEL_MODES = { pivot: '樞紐點', amplitude: '振幅倍數', fixed: '固定點數' };
const AMP_MULTIPLIERS = [1.25, 1, 0.75, 0.5, 0.25];
const DEFAULT_FIXED_POINTS = [280, 180, 100, 40, 10];
const PRODUCTS = ['台指(全)', '台指'];

function loadLevelSettings() {
  const saved = loadSetting('page1Levels') || {};
  const points = Array.isArray(saved.points) ? saved.points.map(Number).filter((v) => v > 0).slice(0, 5) : [];
  return { mode: LEVEL_MODES[saved.mode] ? saved.mode : 'fixed', points: points.length ? points : DEFAULT_FIXED_POINTS };
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

const productStoreKey = (mode) => (TW_FUTURES_BY_LABEL[mode] || TW_FUTURES_BY_LABEL['台指(全)']).storeKey;

// 只回傳真的來自期貨來源、開高低收昨收齊全的快照；沒有就回 null。
export function getProductFuturesSnapshot(mode) {
  const futures = store.get(productStoreKey(mode));
  const usable = ['price', 'open', 'high', 'low', 'prevClose'].every((key) => futures?.[key] != null && Number.isFinite(Number(futures[key])));
  return usable ? futures : null;
}

// 1 區與 B 區統計用的日 K：有期貨來源用目前商品的期貨日 K，只有 Yahoo 時是加權日 K（label 會標「加權」）。
export function productDailyStats(mode) {
  const daily = store.get('productDaily');
  const product = daily?.[productStoreKey(mode)] || daily?.index || null;
  return { label: product?.label || '', ...buildDailyStats(product?.candles) };
}

const kv = (field, label = '') => `<div class="p1-kv"><span data-label="${field}">${label}</span><strong data-f="${field}"></strong></div>`;

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
          <div class="p1-kv" title="20 日均線"><span data-label="ma20"></span><strong data-f="ma20"></strong></div>
        </div>
        <div class="p1-main-mini"><canvas class="p1-main-mini-canvas"></canvas></div>
      </div>
      ${kv('spread')}${kv('change')}
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
      <div class="p1-block-title" data-label="ampTitle"></div>
      <div class="p1-amp-list">${kv('ampMax', '最大振幅')}${kv('ampAvg', '平均振幅')}${kv('ampMin', '最小振幅')}${kv('ampToday', '本日振幅')}</div>
    </div>
  `);

  const body = panel.body;
  const fields = Object.fromEntries([...body.querySelectorAll('[data-f]')].map((el) => [el.dataset.f, el]));
  const labels = Object.fromEntries([...body.querySelectorAll('[data-label]')].map((el) => [el.dataset.label, el]));
  const levelRows = Object.fromEntries([...body.querySelectorAll('.p1-level-rows')].map((el) => [el.dataset.side, el]));
  const miniCanvas = body.querySelector('.p1-main-mini-canvas');
  const levelModeEl = body.querySelector('.p1-level-mode');
  const levelPointsEl = body.querySelector('.p1-level-points');
  const levelSettings = loadLevelSettings();
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

  const render = () => {
    const taiex = store.get('taiex');
    const futures = getProductFuturesSnapshot(mode);
    const stats = productDailyStats(mode);
    // 沒有期貨來源時全部顯示 '--'，不拿加權指數頂替期貨價；整塊灰掉並說明。
    const chg = futures ? futures.price - futures.prevClose : null;
    const chgPct = futures?.prevClose ? (chg / futures.prevClose) * 100 : 0;
    const spread = futures && hasValue(taiex.price) ? futures.price - taiex.price : null;
    const info = sourceInfo();
    panel.root.classList.toggle('is-unsupported', !(info.feed && (info.futures || info.mis)));

    const indexPrefix = stats.label === '加權' ? '加權' : '';
    set(labels.price, mode);
    set(labels.open, `${mode}開`);
    set(labels.high, `${mode}高`);
    set(labels.low, `${mode}低`);
    set(labels.ma20, `${indexPrefix}月成本`);
    set(labels.spread, `${mode}加權價差`);
    set(labels.change, `${mode}近月漲跌`);
    set(fields.price, formatFuturesValue(futures?.price), c(chg));
    set(fields.open, formatFuturesValue(futures?.open));
    set(fields.high, formatFuturesValue(futures?.high));
    set(fields.low, formatFuturesValue(futures?.low));
    set(fields.ma20, formatFuturesValue(stats.ma20));
    set(fields.spread, Number.isFinite(spread) ? spread.toFixed(2) : '--', c(spread));
    set(fields.change, formatFuturesValue(chg), c(chg));

    if (futures) {
      drawInfoCandle(miniCanvas, { open: futures.open, close: futures.price, high: futures.high, low: futures.low, prevClose: futures.prevClose, change: chg, ampPct: chgPct });
    } else {
      miniCanvas.getContext('2d')?.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    }

    renderLevels(computeLevels(levelSettings, futures, stats));

    // 振幅統計由 marketFeed 抓的日 K 算出（不跟 C 區圖表綁定）；還沒有資料顯示 '--'。
    const amps = stats.ampHistory.map((row) => Number(row.amplitude)).filter(Number.isFinite);
    const ampText = (value) => (amps.length && Number.isFinite(value) ? value.toFixed(0) : '--');
    set(labels.ampTitle, `${indexPrefix}日振幅統計(近${AMP_HISTORY_DAYS}日)`);
    set(fields.ampMax, ampText(Math.max(...amps)));
    set(fields.ampAvg, ampText(amps.reduce((sum, value) => sum + value, 0) / amps.length));
    set(fields.ampMin, ampText(Math.min(...amps)));
    set(fields.ampToday, futures ? Math.abs(futures.high - futures.low).toFixed(0) : '--');
  };

  body.querySelectorAll('input[name="p1-product"]').forEach((el) => el.addEventListener('change', () => {
    mode = el.value;
    render();
    onModeChange(mode);
  }));

  // 關卡算法切換與固定點數設定：改了就存到瀏覽器並重畫。
  const syncLevelControls = () => {
    levelModeEl.value = levelSettings.mode;
    levelPointsEl.value = levelSettings.points.join(',');
    levelPointsEl.hidden = levelSettings.mode !== 'fixed';
  };
  const saveLevels = () => {
    saveSetting('page1Levels', levelSettings);
    syncLevelControls();
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
  syncLevelControls();

  return { root: panel.root, render, mode: () => mode, destroy: () => panel.destroy() };
}
