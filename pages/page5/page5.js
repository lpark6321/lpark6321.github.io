// Page5 策略選股：用證交所盤後資料（store.twseDaily，由 marketFeed 每天收盤後抓）篩選上市股票。
// 這是盤後資料，不受右上角「資料來源」限制；只有技術指標條件要日 K，限公開資料（yahoo）來源。
import { store, isValidStockCode, sanitizeWatchlist } from '../../data/store.js';
import { loadSetting, saveSetting } from '../../data/storage.js';
import { applyFilters, applyHistoryFilters, hasHistoryFilters, historyCandidates } from '../../services/filterEngine.js';
import { loadScreenerCandles, screenerHistoryAvailable } from '../../services/screenerHistory.js';
import { subscribeDashboardDataSource } from '../../services/dashboardDataSource.js';
import { FilterPanel } from '../../components/FilterPanel.js';
import { ResultTable } from '../../components/ResultTable.js';
import { WatchlistAddBar } from '../../components/WatchlistAddBar.js';
import { bindCssVarSplitter } from '../../services/splitter.js';
import { toCsv } from '../../services/csv.js';
import { createFilePicker, downloadCsv, readJsonArrayFile } from '../../services/jsonFile.js';

// 匯出 CSV 的欄位（與結果表同順序，不含勾選與停用的趨勢欄）。
const CSV_COLUMNS = [
  ['code', '代碼'], ['name', '名稱'], ['price', '收盤價'], ['changePct', '漲跌%'], ['pe', '本益比'],
  ['dividendYield', '殖利率%'], ['pb', '股價淨值比'], ['volume', '成交量(張)']
];

// 技術指標要抓日 K 的檔數上限（依成交量取前 N 檔），0＝全部。
const HISTORY_CAPS = [50, 100, 200, 500, 0];
const DEFAULT_HISTORY_CAP = 100;

// mount：建立頁面並回傳清理函式（由 app.js 的路由在離開頁面時呼叫）。
export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 5｜策略選股 <span class="badge badge--mid" id="p5-data-date">證交所資料載入中</span></h2><span class="p5-topbar-tools"><span id="p5-note" class="p5-note"></span><label class="p5-cap" title="技術指標條件只抓成交量最大的前 N 檔日 K">日 K 上限 <select id="p5-cap">${HISTORY_CAPS.map((n) => `<option value="${n}">${n ? `${n} 檔` : '全部'}</option>`).join('')}</select></label><button id="p5-export" type="button" title="匯出目前篩選結果（全部頁）">匯出 CSV</button></span></div>
    <div class="p5-grid" id="p5-grid">
      <aside id="p5-filters"></aside>
      <div class="grid-splitter-v p5-main-splitter" id="p5-main-split"></div>
      <section class="p5-right">
        <div id="p5-results"></div>
        <div id="p5-addbar"></div>
      </section>
    </div>
  `;

  const gridEl = container.querySelector('#p5-grid');
  const noteEl = container.querySelector('#p5-note');
  const dateEl = container.querySelector('#p5-data-date');
  const capEl = container.querySelector('#p5-cap');
  const savedCap = loadSetting('screenHistoryCap', DEFAULT_HISTORY_CAP);
  capEl.value = String(HISTORY_CAPS.includes(savedCap) ? savedCap : DEFAULT_HISTORY_CAP);
  capEl.addEventListener('change', () => saveSetting('screenHistoryCap', Number(capEl.value)));
  const stopMainSplit = bindCssVarSplitter(container.querySelector('#p5-main-split'), gridEl, '--p5-left-w', { fallback: 320, min: 260, max: 620 });

  // 只放行有效代碼，其餘告訴使用者被略過幾檔。
  const keepValidCodes = (codes) => {
    const valid = codes.filter(isValidStockCode);
    noteEl.textContent = valid.length < codes.length ? `略過 ${codes.length - valid.length} 檔無效代碼` : '';
    return valid;
  };

  const results = new ResultTable(container.querySelector('#p5-results'), {
    onSelectionChange: (codes) => addBar.updateCount(codes.length)
  });
  const addBar = new WatchlistAddBar(container.querySelector('#p5-addbar'), {
    getCodes: () => keepValidCodes(results.getSelectedCodes())
  });

  // 「載入自選」：讀入 Page3 匯出的 watchlist.json，驗證後取代目前的自選股。
  const openWatchlistFile = createFilePicker(async (file) => {
    try {
      const data = await readJsonArrayFile(file);
      const rows = sanitizeWatchlist(data);
      store.set('watchlist', rows);
      const skipped = data.length - rows.length;
      filter.showMessage(`已載入 ${rows.length} 檔自選股${skipped ? `，略過 ${skipped} 筆（代碼格式不符或重複）` : ''}`);
    } catch (error) {
      filter.showMessage(`載入失敗：${error.message}`);
    }
  });

  // 約 1000 列，唯讀取用（篩選只產生新陣列，不改原資料）。
  const rows = () => store.peek('twseDaily')?.rows || [];
  let filtered = [];
  // 每次篩選遞增；抓日 K 期間又開始新的篩選（或離開頁面）時，舊的結果直接丟掉。
  let runSeq = 0;
  // fetchHistory=false 用在頁面載入與證交所資料更新：不主動抓日 K，技術指標條件先不套用。
  const runFilters = async ({ enabled, settings }, fetchHistory = true) => {
    const seq = ++runSeq;
    const all = rows();
    let matched = applyFilters(all, enabled, settings);
    let note = '';
    if (hasHistoryFilters(enabled) && all.length) {
      if (fetchHistory) {
        const cap = Number(capEl.value) || Infinity;
        const total = historyCandidates(matched).length;
        const codes = historyCandidates(matched, cap).map((row) => row.code);
        const candles = await loadScreenerCandles(codes, (done, due) => {
          if (seq === runSeq) filter.showMessage(`抓日 K ${done}/${due}${total > codes.length ? `（依成交量取前 ${codes.length} 檔）` : ''}`);
        });
        if (seq !== runSeq) return;
        matched = applyHistoryFilters(matched, enabled, settings, candles);
        note = total > codes.length ? `（日 K 依成交量取前 ${codes.length} 檔檢查，候選共 ${total} 檔）` : `（日 K 檢查 ${codes.length} 檔）`;
      } else {
        note = '（技術指標條件未套用，請按「執行篩選」）';
      }
    }
    filtered = matched;
    results.update(filtered);
    filter.showMessage(all.length ? `符合 ${filtered.length} / ${all.length} 檔${note}` : '');
  };

  const filter = new FilterPanel(container.querySelector('#p5-filters'), {
    onRun: runFilters,
    onLoadWatchlist: openWatchlistFile
  });
  filter.setHistoryAvailable(screenerHistoryAvailable());

  const exportButton = container.querySelector('#p5-export');
  exportButton.addEventListener('click', () => {
    if (!filtered.length) {
      filter.showMessage('沒有篩選結果可以匯出');
      return;
    }
    const date = store.get('twseDaily')?.date || new Date().toISOString().slice(0, 10);
    const table = [CSV_COLUMNS.map(([, label]) => label), ...filtered.map((row) => CSV_COLUMNS.map(([key]) => row[key]))];
    downloadCsv(`screener-${date}.csv`, toCsv(table));
  });

  const render = () => {
    const data = store.get('twseDaily');
    dateEl.textContent = data ? `證交所 ${data.date.replaceAll('-', '/')} 收盤` : '證交所資料載入中';
    runFilters(filter.collect(), false);
  };
  render();
  const unsub = store.subscribe('twseDaily', render);
  const unsubSource = subscribeDashboardDataSource(() => {
    filter.setHistoryAvailable(screenerHistoryAvailable());
    render();
  });

  return () => {
    runSeq += 1;
    unsub();
    unsubSource();
    stopMainSplit();
    openWatchlistFile.destroy();
    filter.destroy();
    results.destroy();
    addBar.destroy();
  };
}
