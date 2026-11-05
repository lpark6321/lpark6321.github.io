// Page5 策略選股：用證交所盤後資料（store.twseDaily，由 marketFeed 每天收盤後抓）篩選上市股票。
// 這是盤後資料，不受右上角「資料來源」限制。
import { store, isValidStockCode, sanitizeWatchlist } from '../../data/store.js';
import { applyFilters } from '../../services/filterEngine.js';
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

// mount：建立頁面並回傳清理函式（由 app.js 的路由在離開頁面時呼叫）。
export function mount(container) {
  container.innerHTML = `
    <div class="page-topbar"><h2>PAGE 5｜策略選股 <span class="badge badge--mid" id="p5-data-date">證交所資料載入中</span></h2><span class="p5-topbar-tools"><span id="p5-note" class="p5-note"></span><button id="p5-export" type="button" title="匯出目前篩選結果（全部頁）">匯出 CSV</button></span></div>
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

  const rows = () => store.get('twseDaily')?.rows || [];
  let filtered = [];
  const runFilters = ({ enabled, settings }) => {
    filtered = applyFilters(rows(), enabled, settings);
    results.update(filtered);
    filter.showMessage(rows().length ? `符合 ${filtered.length} / ${rows().length} 檔` : '');
  };

  const filter = new FilterPanel(container.querySelector('#p5-filters'), {
    onRun: runFilters,
    onLoadWatchlist: openWatchlistFile
  });

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
    runFilters(filter.collect());
  };
  render();
  const unsub = store.subscribe('twseDaily', render);

  return () => {
    unsub();
    stopMainSplit();
    openWatchlistFile.destroy();
    filter.destroy();
    results.destroy();
    addBar.destroy();
  };
}
