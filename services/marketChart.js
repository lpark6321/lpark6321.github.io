// Page1 C 區自有行情圖表：K 線、成交量、SMA、legend 與控制列。K 線一律經 marketSources.js 取得，重抓時機跟隨 feedClock 的全站節拍。
import { TW_FUTURES_PRODUCTS } from '../data/twDerivatives.js';
import { esc } from './html.js';
import {
  getDashboardDataSource,
  getDashboardDataSourceLabel,
  sourceInfo,
  subscribeDashboardDataSource
} from './dashboardDataSource.js';
import { isTwQuoteSession, isTwSpotSession } from './marketCalendar.js';
import { subscribeFeedTick } from './feedClock.js';
import {
  bucketTime,
  dateKeyFromUnix,
  fetchBrokerCandles,
  fetchCandles,
  fetchYahooCandles,
  isDaySessionMinute,
  isIntradayTimeframe,
  isSecondTimeframe,
  isBridgeSource,
  brokerCandlesUrl,
  shouldSkipLiveDayFuturesRefresh,
  sortTime,
  TAIEX_FUTURE_CODES,
  taipeiMinuteOfUnix
} from './marketSources.js';

const LIGHTWEIGHT_CHARTS_URL =
  'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';

const SMA_PERIOD = 9;
const UP_COLOR = '#f03a5f';
const DOWN_COLOR = '#1fd67a';
const SMA_COLOR = '#2962ff';
const VOLUME_UP_COLOR = 'rgba(240,58,95,.48)';
const VOLUME_DOWN_COLOR = 'rgba(31,214,122,.48)';
const VOLUME_ALERT_DAY_COLOR = 'rgba(245,200,66,.95)';
const VOLUME_ALERT_AFTER_HOURS_COLOR = 'rgba(130,224,170,.95)';
const DAY_VOLUME_REFERENCE = 1500;
const AFTER_HOURS_VOLUME_REFERENCE = 400;

let lightweightPromise = null;

function isTaiexIndexSymbol(symbol) {
  return symbol === 'INDEX:TWII' || symbol === 'TWSE:TAIEX';
}

export function loadLightweightChartsScript() {
  if (lightweightPromise) return lightweightPromise;

  lightweightPromise = new Promise((resolve, reject) => {
    if (window.LightweightCharts) {
      resolve(window.LightweightCharts);
      return;
    }

    const script = document.createElement('script');
    script.src = LIGHTWEIGHT_CHARTS_URL;
    script.async = true;
    script.onload = () => resolve(window.LightweightCharts);
    script.onerror = () => {
      // 載入失敗不快取，下次掛載時重試（例如筆電剛喚醒、網路尚未連上）。
      lightweightPromise = null;
      script.remove();
      reject(new Error('Lightweight Charts script failed to load'));
    };
    document.head.appendChild(script);
  });

  return lightweightPromise;
}

// 即時報價落在哪一根 K：盤中週期照時間分桶；日 K 與最後一根同一天就沿用它的時間值（格式不能混用）。
function liveBucketTime(time, timeframe, lastTime) {
  if (isIntradayTimeframe(timeframe)) return bucketTime(time, timeframe);
  const dayKey = dateKeyFromUnix(time);
  const lastKey = typeof lastTime === 'string' ? lastTime : dateKeyFromUnix(lastTime);
  if (dayKey === lastKey) return lastTime;
  return typeof lastTime === 'string' ? dayKey : time;
}

// 建立圖表外殼：上方控制列、CSV 載入按鈕、圖表容器、左上 legend。樣式在 style/components.css 的 .lc-chart。
// 資料來源只有右上角那一個全站選單，圖表不另外放。
function createShell(container) {
  container.innerHTML = `
    <div class="lc-chart">
      <div class="lc-chart__toolbar">
        <span class="lc-chart__label">商品</span><select class="lc-chart__control" data-min-width="180"></select>
        <span class="lc-chart__label">週期</span><select class="lc-chart__control" data-min-width="92"></select>
        <button type="button" class="lc-chart__button">載入CSV</button>
        <input type="file" accept=".csv,text/csv" hidden>
        <span class="lc-chart__label">指標</span><select class="lc-chart__control" data-min-width="210"></select>
        <span class="lc-chart__status"></span>
      </div>
      <div class="lc-chart__area"><div class="lc-chart__canvas"></div><div class="lc-chart-legend"></div></div>
    </div>
  `;
  const root = container.firstElementChild;
  const [symbolSelect, timeframeSelect, indicatorSelect] = root.querySelectorAll('select');
  return {
    root,
    symbolSelect,
    timeframeSelect,
    indicatorSelect,
    chartNode: root.querySelector('.lc-chart__canvas'),
    csvButton: root.querySelector('.lc-chart__button'),
    csvInput: root.querySelector('input[type="file"]'),
    status: root.querySelector('.lc-chart__status'),
    legend: root.querySelector('.lc-chart-legend')
  };
}

function fillSelect(select, items, activeValue) {
  select.innerHTML = items
    .map((item) => `<option value="${esc(item.value)}" ${item.value === activeValue ? 'selected' : ''}>${esc(item.label)}</option>`)
    .join('');
  fitSelectToText(select);
}

// 下拉框寬度依最長選項文字自動增寬，但不低於各自 dataset.minWidth。
function fitSelectToText(select) {
  const selectedText = select.options[select.selectedIndex]?.textContent || '';
  const minWidth = Number(select.dataset.minWidth || 120);
  const longestText = [...select.options].reduce((longest, option) => {
    const text = option.textContent || '';
    return text.length > longest.length ? text : longest;
  }, selectedText);
  const canvas = fitSelectToText.canvas || (fitSelectToText.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  ctx.font = getComputedStyle(select).font || '12px "Noto Sans TC", sans-serif';
  const width = Math.ceil(ctx.measureText(longestText).width) + 72;
  select.style.width = `${Math.max(minWidth, width)}px`;
  select.style.minWidth = select.style.width;
}

// SMA 指標資料只依 close 計算；目前固定使用 SMA_PERIOD。
function calculateSma(candles, period = SMA_PERIOD) {
  const result = [];
  let sum = 0;

  candles.forEach((candle, index) => {
    sum += candle.close;
    if (index >= period) sum -= candles[index - period].close;
    if (index >= period - 1) {
      result.push({
        time: candle.time,
        value: +(sum / period).toFixed(4)
      });
    }
  });

  return result;
}

// 整批送入 K 線、成交量與 SMA。初次載入與每次輪詢都用 setData：不會漏掉輪詢間隔中新增的 K 線，
// 也不會因為較舊的時間點觸發 update() 例外。
function applyCandles(candleSeries, volumeSeries, smaSeries, candles, withVolumeAlerts) {
  candleSeries.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
  volumeSeries.setData(candles.map((candle) => toVolumePoint(candle, withVolumeAlerts)));
  const smaData = calculateSma(candles);
  smaSeries.setData(smaData);
  return smaData;
}

// toVolumePoint：量能警示門檻是台指期口數，只有期貨商品才上色。
function toVolumePoint(candle, withAlerts) {
  const alert = withAlerts ? volumeAlertInfo(candle) : null;
  return {
    time: candle.time,
    value: candle.volume || 0,
    color: alert?.color || (candle.close >= candle.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR)
  };
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return '--';
  return Number(value).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(value) {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}億`;
  if (abs >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return String(Math.round(value));
}

const TAIPEI_DATE_FORMAT = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
});
const TAIPEI_DATETIME_FORMAT = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
const TAIPEI_PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

// formatChartTime：K 線時間 → 台北時間文字（legend 與十字線標籤共用）。
export function formatChartTime(time, timeframe = 'D') {
  if (time == null) return '--';
  if (typeof time === 'string') return time;
  if (typeof time === 'object' && Number.isFinite(time.year)) {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  }
  const date = new Date(Number(time) * 1000);
  return (timeframe === 'D' ? TAIPEI_DATE_FORMAT : TAIPEI_DATETIME_FORMAT).format(date);
}

// 時間軸刻度：Lightweight Charts 預設把 unix 時間當 UTC 顯示，這裡改成台北時間。
// tickMarkType 0 年、1 月、2 日、3 時分、4 時分秒；日 K 字串/BusinessDay 回傳 null 交給預設格式。
export function formatTaipeiTick(time, tickMarkType) {
  if (typeof time !== 'number') return null;
  const p = Object.fromEntries(TAIPEI_PARTS_FORMAT.formatToParts(new Date(time * 1000)).map((x) => [x.type, x.value]));
  if (tickMarkType === 0) return p.year;
  if (tickMarkType === 1) return `${Number(p.month)}月`;
  if (tickMarkType === 2) return `${p.month}/${p.day}`;
  if (tickMarkType === 3) return `${p.hour}:${p.minute}`;
  return `${p.hour}:${p.minute}:${p.second}`;
}

function volumeReferenceForTime(time) {
  if (typeof time !== 'number') return null;
  return isDaySessionMinute(taipeiMinuteOfUnix(time))
    ? { label: '盤中量', value: DAY_VOLUME_REFERENCE, color: VOLUME_ALERT_DAY_COLOR }
    : { label: '盤後量', value: AFTER_HOURS_VOLUME_REFERENCE, color: VOLUME_ALERT_AFTER_HOURS_COLOR };
}

function volumeAlertInfo(candle) {
  const reference = volumeReferenceForTime(candle?.time);
  const volume = Number(candle?.volume || 0);
  if (!reference || !Number.isFinite(volume) || volume <= reference.value) return null;
  return { ...reference, volume };
}

function chartTimeToUnix(time) {
  if (typeof time === 'number') return time;
  if (typeof time === 'string') {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
  }
  if (typeof time === 'object' && Number.isFinite(time.year)) {
    return Math.floor(new Date(time.year, time.month - 1, time.day).getTime() / 1000);
  }
  return null;
}

function changeFromPrevious(candles, index) {
  const candle = candles[index];
  if (!candle) return { value: 0, pct: 0 };
  const prevClose = candles[index - 1]?.close ?? candle.open;
  const value = candle.close - prevClose;
  return {
    value,
    pct: prevClose ? (value / prevClose) * 100 : 0
  };
}

function findTimeIndex(candles, time) {
  if (time == null) return -1;
  const key = timeKey(time);
  return candles.findIndex((candle) => timeKey(candle.time) === key);
}

  function timeKey(time) {
    return typeof time === 'object' ? JSON.stringify(time) : String(time);
  }

function nearestCandleIndex(candles, targetTime) {
  const target = chartTimeToUnix(targetTime);
  if (!Number.isFinite(target)) return -1;

  let bestIndex = -1;
  let bestDistance = Infinity;
  candles.forEach((candle, index) => {
    const current = chartTimeToUnix(candle.time);
    if (!Number.isFinite(current)) return;
    const distance = Math.abs(current - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function readFileText(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('CSV讀取失敗'));
    reader.readAsText(file, encoding);
  });
}

// FinMind snapshot 每次只回最新一根：接在既有 K 線後面；其他來源回傳完整序列，直接取代。
const MAX_SNAPSHOT_CANDLES = 2000;

function mergeSnapshotCandles(previous, candles) {
  const first = candles[0].time;
  return [...previous.filter((candle) => sortTime(candle.time, first) < 0), ...candles].slice(-MAX_SNAPSHOT_CANDLES);
}

// mountMarketChart：Page1 C 區「自有資料」圖表，回傳清理函式。
// 清理函式晚到或從未被呼叫時，只要圖表已離開 DOM，就會在下次輪詢時自行停止並釋放資源。
export async function mountMarketChart(container, options = {}) {
  if (!container) return () => {};

  const LightweightCharts = await loadLightweightChartsScript();
  // 載入 script 期間頁面可能已卸載。
  if (!container.isConnected) return () => {};
  const shell = createShell(container);
  // 期貨商品的 productCodes 給期交所 CSV 篩選，futuresId/dailyId 給 FinMind。
  const symbols = options.symbols || [
    { label: '加權指數', value: 'INDEX:TWII' },
    { label: '台積電', value: '2330' },
    ...TW_FUTURES_PRODUCTS.map((product) => ({
      label: product.label, value: product.symbol, type: 'future', session: product.session, productCodes: ['TX'], futuresId: 'TXF', dailyId: 'TX'
    }))
  ];
  const timeframes = options.timeframes || [
    { label: '1S', value: '1s' },
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '日K', value: 'D' }
  ];
  const indicators = options.indicators || [
    { label: '成交量 + SMA 9', value: 'volume_sma' },
    { label: '成交量', value: 'volume' },
    { label: 'SMA 9', value: 'sma' },
    { label: '無', value: 'none' }
  ];

  let activeSymbol = options.symbol || symbols[0]?.value || 'INDEX:TWII';
  let activeTimeframe = options.timeframe || options.interval || 'D';
  let activeDataSource = getDashboardDataSource();
  let activeIndicator = options.indicator || indicators[0]?.value || 'volume_sma';
  let taifexCsvText = options.taifexCsvText || '';
  let lastCandles = [];
  let lastLoadedSymbol = null;
  let lastLoadedTimeframe = null;
  let lastSmaData = [];
  let selectedCandle = null;
  let disposed = false;
  // 每次載入遞增；await 回來時序號不同代表使用者已切換商品/週期/來源，結果作廢。
  let requestSeq = 0;
  let polling = false;
  let closePriceLine = null;
  let smaPriceLine = null;
  let unsubscribeDataSource = null;
  let unsubscribeFeedTick = null;
  let unsubscribeLiveQuote = null;

  useLiveFutureSymbol();
  fillSelect(shell.symbolSelect, symbols, activeSymbol);
  fillSelect(shell.timeframeSelect, timeframes, activeTimeframe);
  fillSelect(shell.indicatorSelect, indicators, activeIndicator);

  const chart = LightweightCharts.createChart(shell.chartNode, {
    autoSize: true,
    layout: {
      background: { color: '#0d0f14' },
      textColor: '#aebbd3'
    },
    grid: {
      vertLines: { color: 'rgba(80,95,125,.22)' },
      horzLines: { color: 'rgba(80,95,125,.22)' }
    },
    // K 線時間是 UTC unix 秒；十字線標籤與時間軸刻度都改用台北時間顯示。
    localization: { locale: 'zh-TW', timeFormatter: (time) => formatChartTime(time, activeTimeframe) },
    timeScale: {
      timeVisible: true,
      secondsVisible: isSecondTimeframe(activeTimeframe) || activeTimeframe === '1m',
      tickMarkFormatter: formatTaipeiTick
    },
    rightPriceScale: {
      borderColor: 'rgba(120,140,180,.28)',
      scaleMargins: { top: 0.05, bottom: 0.18 }
    },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
  });

  const candleSeries = chart.addCandlestickSeries({
    upColor: UP_COLOR,
    downColor: DOWN_COLOR,
    borderUpColor: UP_COLOR,
    borderDownColor: DOWN_COLOR,
    wickUpColor: '#f2a6b8',
    wickDownColor: '#83e8b0',
    priceLineVisible: false
  });

  const smaSeries = chart.addLineSeries({
    color: SMA_COLOR,
    lineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: false,
    title: `SMA ${SMA_PERIOD} close`
  });

  const indexOverlaySeries = chart.addLineSeries({
    color: '#f5c842',
    lineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: false,
    title: '加權指數'
  });

  const volumeSeries = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    lastValueVisible: true,
    priceLineVisible: true
  });
  volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
  // 盤中/盤後量參考線是台指期口數門檻，只在期貨商品顯示（見 drawCandles）。
  const volumeReferenceLines = [
    volumeSeries.createPriceLine({
      price: DAY_VOLUME_REFERENCE,
      color: '#f5c842',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle?.Dashed ?? 2,
      axisLabelVisible: true,
      title: `盤中量 ${DAY_VOLUME_REFERENCE}`
    }),
    volumeSeries.createPriceLine({
      price: AFTER_HOURS_VOLUME_REFERENCE,
      color: '#82e0aa',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle?.Dashed ?? 2,
      axisLabelVisible: true,
      title: `盤後量 ${AFTER_HOURS_VOLUME_REFERENCE}`
    })
  ];

  function hasVolumeIndicator() {
    return activeIndicator === 'volume_sma' || activeIndicator === 'volume';
  }

  function hasSmaIndicator() {
    return activeIndicator === 'volume_sma' || activeIndicator === 'sma';
  }

  function applyIndicatorVisibility() {
    volumeSeries.applyOptions({
      visible: hasVolumeIndicator(),
      lastValueVisible: hasVolumeIndicator(),
      priceLineVisible: hasVolumeIndicator()
    });
    smaSeries.applyOptions({
      visible: hasSmaIndicator(),
      lastValueVisible: hasSmaIndicator(),
      priceLineVisible: false
    });
  }

  applyIndicatorVisibility();

  function activeSymbolConfig() {
    return symbols.find((item) => item.value === activeSymbol) || { label: activeSymbol, value: activeSymbol, source: 'yahoo' };
  }

  function activeTimeframeConfig() {
    return timeframes.find((item) => item.value === activeTimeframe) || { label: activeTimeframe, value: activeTimeframe };
  }

  function isFutureSymbolActive() {
    return activeSymbolConfig().type === 'future';
  }

  // 只向目前來源要加權 K 線（券商橋接或 Yahoo），不改用其他來源補；其他來源沒有加權疊圖。
  function fetchIndexOverlayCandles() {
    if (isBridgeSource(activeDataSource)) {
      return fetchBrokerCandles({ brokerUrl: brokerCandlesUrl(activeDataSource), symbol: 'INDEX:TWII', timeframe: activeTimeframe });
    }
    return activeDataSource === 'yahoo' ? fetchYahooCandles({ symbol: 'INDEX:TWII', timeframe: activeTimeframe }) : [];
  }

  async function updateIndexOverlay() {
    const symbolConfig = activeSymbolConfig();
    if (!isTwSpotSession() || isTaiexIndexSymbol(symbolConfig.value) || symbolConfig.type !== 'future') {
      indexOverlaySeries.setData([]);
      return;
    }

    try {
      const candles = await fetchIndexOverlayCandles();
      if (disposed) return;
      indexOverlaySeries.setData((candles || [])
        .filter((row) => Number.isFinite(Number(row.close)))
        .map((row) => ({ time: row.time, value: Number(row.close) })));
    } catch (error) {
      console.warn('[marketChart] index overlay refresh failed:', error);
    }
  }

  // 把一組 K 線畫上圖：K 線、成交量、SMA、legend 與價格線。fit：切換商品/週期/來源後重設可視範圍。
  function drawCandles(candles, { fit = false } = {}) {
    const isFuture = isFutureSymbolActive();
    lastCandles = candles;
    lastSmaData = applyCandles(candleSeries, volumeSeries, smaSeries, candles, isFuture);
    volumeReferenceLines.forEach((line) => line.applyOptions({ lineVisible: isFuture, axisLabelVisible: isFuture }));
    if (fit) chart.timeScale().fitContent();
    updateLegend();
    syncPriceLines();
  }

  function clearMainSeriesForSymbol(symbol) {
    if (lastLoadedSymbol === symbol) return;
    selectedCandle = null;
    drawCandles([]);
  }

  function notifyDataUpdate(candles) {
    if (typeof options.onDataUpdate !== 'function' || !Array.isArray(candles) || !candles.length) return;
    try {
      options.onDataUpdate({
        candles,
        latest: candles.at(-1),
        previous: candles.length > 1 ? candles.at(-2) : null,
        symbol: activeSymbol,
        symbolConfig: activeSymbolConfig(),
        source: activeDataSource,
        timeframe: activeTimeframe
      });
    } catch (error) {
      // 頁面回呼出錯不能讓圖表停在半途。
      console.error('[marketChart] onDataUpdate failed:', error);
    }
  }

  function activeProductCodes() {
    const symbolConfig = activeSymbolConfig();
    const codes = symbolConfig.csvProductCodes || symbolConfig.productCodes || symbolConfig.taifexProductCodes;
    if (Array.isArray(codes) && codes.length) return codes;
    const code = symbolConfig.taifexProduct || symbolConfig.productCode || symbolConfig.product || symbolConfig.value;
    return code ? [String(code).replace(/\.TW$/i, '').replace(/F$/i, '').toUpperCase()] : TAIEX_FUTURE_CODES;
  }

  function activeFuturesId() {
    const symbolConfig = activeSymbolConfig();
    return symbolConfig.finMindFuturesId || symbolConfig.futuresId || symbolConfig.taifexFuturesId || symbolConfig.value || 'TXF';
  }

  function activeDailyId() {
    const symbolConfig = activeSymbolConfig();
    return symbolConfig.finMindDailyId || symbolConfig.dailyId || symbolConfig.taifexDailyId || activeProductCodes()[0] || 'TX';
  }

  // 報價一進 store 就更新最後一根 K 棒，不必等下一輪重抓 K 線；時間進到下一根時，只有 isLive 的報價才開新 K。
  // 不回呼 onDataUpdate：那會寫回 store、再觸發這裡，形成迴圈。
  function applyLiveQuote() {
    const last = lastCandles.at(-1);
    const symbolConfig = activeSymbolConfig();
    if (disposed || !last || lastLoadedSymbol !== symbolConfig.value || lastLoadedTimeframe !== activeTimeframe) return;
    const quote = options.getLiveQuote?.(symbolConfig);
    const price = Number(quote?.price);
    if (!Number.isFinite(price) || price <= 0) return;

    const quoteTime = Number.isFinite(quote.time) ? quote.time : Math.floor(Date.now() / 1000);
    const bucket = liveBucketTime(quoteTime, activeTimeframe, last.time);
    const order = sortTime(bucket, last.time);
    let candles;
    if (order === 0) {
      if (price === last.close && price <= last.high && price >= last.low) return;
      candles = [...lastCandles.slice(0, -1), { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) }];
    } else if (order > 0 && quote.isLive) {
      candles = [...lastCandles, { time: bucket, open: price, high: price, low: price, close: price, volume: 0, prevClose: last.close }];
    } else {
      return;
    }
    drawCandles(candles);
  }

  // fetchCandles 的參數：初次載入與輪詢共用。模擬資料以目前報價為起點產生隨機 K 線。
  function candleRequest(symbolConfig) {
    return {
      ...options,
      ...symbolConfig,
      base: Number(options.getLiveQuote?.(symbolConfig)?.price) || undefined,
      symbol: symbolConfig.value,
      timeframe: activeTimeframe,
      source: activeDataSource,
      taifexCsvText,
      productCodes: activeProductCodes(),
      futuresId: activeFuturesId(),
      finMindFuturesId: activeFuturesId(),
      dailyId: activeDailyId(),
      finMindDailyId: activeDailyId()
    };
  }

  // CSV 模式才顯示載入按鈕；一般 API 來源不需要本機檔案。
  function syncCsvControls() {
    const visible = activeDataSource === 'taifex_csv';
    shell.csvButton.hidden = !visible;
    if (visible && !taifexCsvText) shell.status.textContent = '請載入CSV';
  }

  // 券商即時源（DDE/RTD）只提供台指期：非期貨商品改用台指期，並優先選全盤（含夜盤），夜盤時段才不會是空圖。
  function useLiveFutureSymbol() {
    if (isBridgeSource(activeDataSource) && !isFutureSymbolActive()) {
      const futures = symbols.filter((item) => item.type === 'future');
      const futureSymbol = futures.find((item) => item.session === 'full') || futures[0];
      if (futureSymbol) activeSymbol = futureSymbol.value;
    }
    shell.symbolSelect.value = activeSymbol;
  }

  function latestSmaPoint(index = lastCandles.length - 1) {
    const candle = lastCandles[index];
    if (!candle) return null;
    return lastSmaData.find((point) => timeKey(point.time) === timeKey(candle.time)) || lastSmaData.at(-1) || null;
  }

  function updateLegend(candle = lastCandles.at(-1), index = lastCandles.length - 1) {
    if (!candle) {
      shell.legend.innerHTML = '';
      return;
    }

    const { value: change, pct } = changeFromPrevious(lastCandles, index);
    const changeColor = change >= 0 ? UP_COLOR : DOWN_COLOR;
    const smaPoint = latestSmaPoint(index);
    const displayTime = formatChartTime(candle.time, activeTimeframe);
    const selectedRow = selectedCandle
      ? `<div style="margin-top:4px;color:#f5c842;">選取時間 <span>${esc(formatChartTime(selectedCandle.time, activeTimeframe))}</span></div>`
      : '';
    const volumeAlert = isFutureSymbolActive() ? volumeAlertInfo(candle) : null;
    const volumeAlertColor = volumeAlert?.color || '#dfe7f7';
    const volumeRow = hasVolumeIndicator()
      ? `<div style="margin-top:4px;color:#dfe7f7;">成交量 <span style="color:${volumeAlertColor};">${formatVolume(candle.volume || 0)}</span>${volumeAlert ? ` <span style="color:${volumeAlertColor};">超過${volumeAlert.label} ${formatVolume(volumeAlert.value)}</span>` : ''}</div>`
      : '';
    const smaRow = hasSmaIndicator()
      ? `<div style="margin-top:4px;color:#dfe7f7;">SMA ${SMA_PERIOD} close <span style="color:${SMA_COLOR};">${smaPoint ? formatPrice(smaPoint.value) : '--'}</span></div>`
      : '';

    shell.legend.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;white-space:nowrap;flex-wrap:nowrap;">
        <span style="color:#f5c842;">K線時間 ${esc(displayTime)}</span>
        <span style="color:#f5c842;">${esc(activeTimeframeConfig().label)}</span>
        <span>開 ${formatPrice(candle.open)}</span>
        <span>高 ${formatPrice(candle.high)}</span>
        <span>低 ${formatPrice(candle.low)}</span>
        <span>收 ${formatPrice(candle.close)}</span>
        <span style="color:${changeColor};">${change >= 0 ? '+' : ''}${formatPrice(change)} (${change >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span>
      </div>
      ${selectedRow}
      ${volumeRow}
      ${smaRow}
    `;
  }

  // 最新價與 SMA 的右側價格線；沒有 K 線時也要清掉上一個商品留下的線。指標關閉時不畫 SMA 線。
  function syncPriceLines() {
    if (closePriceLine) candleSeries.removePriceLine(closePriceLine);
    if (smaPriceLine) smaSeries.removePriceLine(smaPriceLine);
    closePriceLine = null;
    smaPriceLine = null;

    const latest = lastCandles.at(-1);
    if (!latest) return;

    const latestIndex = lastCandles.length - 1;
    const { value: change } = changeFromPrevious(lastCandles, latestIndex);
    closePriceLine = candleSeries.createPriceLine({
      price: latest.close,
      color: change >= 0 ? UP_COLOR : DOWN_COLOR,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle?.Dotted ?? 1,
      axisLabelVisible: true,
      title: ''
    });

    const smaPoint = latestSmaPoint(latestIndex);
    if (hasSmaIndicator() && smaPoint) {
      smaPriceLine = smaSeries.createPriceLine({
        price: smaPoint.value,
        color: SMA_COLOR,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle?.Solid ?? 0,
        axisLabelVisible: true,
        title: ''
      });
    }
  }

  // 初次載入或切換商品/週期/資料來源時會走這裡。
  async function loadInitialData() {
    const seq = ++requestSeq;
    const symbolConfig = activeSymbolConfig();
    const label = getDashboardDataSourceLabel(activeDataSource);
    if (shouldSkipLiveDayFuturesRefresh(activeDataSource, symbolConfig.value, symbolConfig)) {
      shell.status.textContent = `${label} 台指盤外不更新`;
      clearMainSeriesForSymbol(symbolConfig.value);
      await updateIndexOverlay();
      return;
    }
    shell.status.textContent = '載入中';
    try {
      // fetchCandles 是資料來源分流的單一入口；不同來源回來後都會被轉成 OHLCV。
      const candles = await fetchCandles(candleRequest(symbolConfig));
      if (seq !== requestSeq || disposed) return;
      lastLoadedSymbol = symbolConfig.value;
      lastLoadedTimeframe = activeTimeframe;
      selectedCandle = null;
      drawCandles(candles, { fit: true });
      notifyDataUpdate(candles);
      shell.status.textContent = candles.length ? label : `${label}：目前沒有資料`;
    } catch (error) {
      if (seq !== requestSeq || disposed) return;
      // 抓不到就顯示空圖與錯誤訊息；隨機 K 線只屬於「模擬資料」來源，不能冒充真實資料。
      selectedCandle = null;
      drawCandles([], { fit: true });
      shell.status.textContent = `${label}連線失敗：${error.message}`;
    }
    await updateIndexOverlay();
  }

  // 輪詢：上一輪還沒回來就跳過（不重疊請求）；回來時若已有新的載入開始，結果作廢。
  // 由 feedClock 的全站節拍（「更新頻率」設定）觸發；本機 CSV 與模擬資料不會變動，不重抓。
  async function pollLatest() {
    if (disposed || polling || activeDataSource === 'taifex_csv' || activeDataSource === 'mock') return;
    // 頁面已卸載但清理函式沒被呼叫（或還沒被呼叫）：自行釋放。
    if (!shell.root.isConnected) {
      dispose();
      return;
    }
    const symbolConfig = activeSymbolConfig();
    if (shouldSkipLiveDayFuturesRefresh(activeDataSource, symbolConfig.value, symbolConfig)) {
      shell.status.textContent = `${getDashboardDataSourceLabel(activeDataSource)} 台指盤外不更新`;
      await updateIndexOverlay();
      return;
    }
    // Yahoo 的台股報價在現貨時段外不會變動，盤外不輪詢。
    if (activeDataSource === 'yahoo' && !isTwQuoteSession()) {
      shell.status.textContent = `${getDashboardDataSourceLabel(activeDataSource)} 非交易時段，暫停更新`;
      return;
    }
    const seq = requestSeq;
    polling = true;
    try {
      const candles = await fetchCandles(candleRequest(symbolConfig));
      if (seq !== requestSeq || disposed || !candles.length) return;
      lastLoadedSymbol = symbolConfig.value;
      lastLoadedTimeframe = activeTimeframe;
      drawCandles(sourceInfo(activeDataSource).snapshot ? mergeSnapshotCandles(lastCandles, candles) : candles);
      notifyDataUpdate(lastCandles);
      await updateIndexOverlay();
      shell.status.textContent = `更新 ${new Date().toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}`;
    } catch (error) {
      if (seq === requestSeq && !disposed) shell.status.textContent = `更新失敗：${error.message}`;
    } finally {
      polling = false;
    }
  }

  // 跟著右上角的全站資料來源切換。
  async function setActiveDataSource(source) {
    if (source === activeDataSource) return;
    activeDataSource = source;
    useLiveFutureSymbol();
    syncCsvControls();
    fitSelectToText(shell.symbolSelect);
    await loadInitialData();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribeDataSource?.();
    unsubscribeFeedTick?.();
    unsubscribeLiveQuote?.();
    chart.remove();
    shell.root.remove();
  }

  // 滑鼠移到哪根 K 線，legend 就顯示該根 K 線的時間與 OHLCV。
  chart.subscribeCrosshairMove((param) => {
    // crosshair 沒有精準落在資料點時，保留已點選 K 線或回到最新 K 線。
    if (!param?.time || !lastCandles.length) {
      if (selectedCandle) {
        const selectedIndex = findTimeIndex(lastCandles, selectedCandle.time);
        updateLegend(selectedCandle, selectedIndex >= 0 ? selectedIndex : lastCandles.length - 1);
      } else {
        updateLegend();
      }
      return;
    }

    let index = findTimeIndex(lastCandles, param.time);
    if (index < 0) index = nearestCandleIndex(lastCandles, param.time);
    if (index < 0) {
      updateLegend();
      return;
    }
    updateLegend(lastCandles[index], index);
  });

  // 點擊 K 線會固定選取時間，滑鼠移開後仍可看到「選取時間」。
  chart.subscribeClick((param) => {
    // Lightweight Charts 有時回傳的是邏輯時間，不一定能直接等於 candle.time；
    // 找不到精準索引時再用 nearestCandleIndex 貼近使用者點的位置。
    if (!param?.time || !lastCandles.length) return;
    let index = findTimeIndex(lastCandles, param.time);
    if (index < 0) index = nearestCandleIndex(lastCandles, param.time);
    if (index < 0) return;
    selectedCandle = lastCandles[index];
    updateLegend(selectedCandle, index);
    shell.status.textContent = `選取 ${formatChartTime(selectedCandle.time, activeTimeframe)}`;
  });

  shell.symbolSelect.addEventListener('change', async () => {
    activeSymbol = shell.symbolSelect.value;
    useLiveFutureSymbol();
    fitSelectToText(shell.symbolSelect);
    await loadInitialData();
  });

  shell.timeframeSelect.addEventListener('change', async () => {
    activeTimeframe = shell.timeframeSelect.value;
    fitSelectToText(shell.timeframeSelect);
    chart.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible: isSecondTimeframe(activeTimeframe) || activeTimeframe === '1m'
      }
    });
    await loadInitialData();
  });

  shell.csvButton.addEventListener('click', () => {
    shell.csvInput.click();
  });

  shell.csvInput.addEventListener('change', async () => {
    const file = shell.csvInput.files?.[0];
    if (!file) return;
    shell.status.textContent = `CSV讀取中：${file.name}`;
    shell.csvButton.disabled = true;
    try {
      taifexCsvText = await readFileText(file, 'big5');
      await loadInitialData();
      if (lastCandles.length) shell.status.textContent = `CSV：${file.name}`;
    } catch (error) {
      shell.status.textContent = `CSV載入失敗：${error.message || error}`;
    } finally {
      shell.csvButton.disabled = false;
      shell.csvInput.value = '';
    }
  });

  shell.indicatorSelect.addEventListener('change', () => {
    activeIndicator = shell.indicatorSelect.value;
    fitSelectToText(shell.indicatorSelect);
    applyIndicatorVisibility();
    updateLegend();
    syncPriceLines();
  });

  unsubscribeDataSource = subscribeDashboardDataSource((source) => {
    setActiveDataSource(source).catch((error) => {
      shell.status.textContent = `資料來源切換失敗：${error.message}`;
    });
  });
  unsubscribeFeedTick = subscribeFeedTick(pollLatest);
  unsubscribeLiveQuote = options.subscribeLiveQuote?.(applyLiveQuote) || null;

  syncCsvControls();
  await loadInitialData();
  // 首次載入期間頁面可能已卸載：自行釋放。
  if (!shell.root.isConnected) {
    dispose();
    return () => {};
  }
  return dispose;
}
