// Local Yahoo + FinMind + TWSE/TPEx OpenAPI + TWSE/TAIFEX MIS + TAIFEX download proxy for development.
// Run with: node bridges/yahooProxyServer.js
// Frontend calls this server instead of query1.finance.yahoo.com to avoid browser CORS blocks.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.YAHOO_PROXY_PORT || 8787);
// Shorter than the 5 s default poll so each poll gets fresh data; it only dedupes simultaneous requests.
const CACHE_TTL_MS = Number(process.env.YAHOO_PROXY_CACHE_MS || 4000);
const FETCH_TIMEOUT_MS = 8000;
const V7_RETRY_MS = 60000;
const MAX_SYMBOLS = 200;
const CHART_FALLBACK_CONCURRENCY = 5;
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:8000', 'http://localhost:8000', 'https://lpark6321.github.io']);
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const cache = new Map();

let yahooSession = null; // Promise<{ cookie, crumb }> shared by concurrent requests
let v7PausedUntil = 0;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

async function fetchJson(url, headers = {}) {
  const key = `${url}|${headers.Authorization || ''}`;
  const item = cache.get(key);
  if (item && Date.now() - item.time <= CACHE_TTL_MS) return item.payload;

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  const text = await response.text();
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`), { status: response.status });
  }

  const payload = JSON.parse(text);
  if (cache.size > 500) cache.clear(); // keys are bounded in practice; this caps stale crumb/date keys
  cache.set(key, { time: Date.now(), payload });
  return payload;
}

async function fetchYahooJson(path, searchParams, headers) {
  const errors = [];
  for (const host of YAHOO_HOSTS) {
    const url = new URL(`https://${host}${path}`);
    Object.entries(searchParams).forEach(([key, value]) => url.searchParams.set(key, value));
    try {
      return await fetchJson(url.toString(), headers);
    } catch (error) {
      if (error.status === 401 || error.status === 404) throw error; // same answer on every host
      errors.push(`${host}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

async function createYahooSession() {
  // fc.yahoo.com answers 404 but sets the A3 cookie that getcrumb requires.
  const cookieResponse = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  await cookieResponse.body?.cancel();
  const cookie = (cookieResponse.headers.getSetCookie?.() || []).map((item) => item.split(';')[0]).join('; ');
  const crumbResponse = await fetch(`https://${YAHOO_HOSTS[0]}/v1/test/getcrumb`, {
    headers: { 'User-Agent': USER_AGENT, Cookie: cookie },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  const crumb = (await crumbResponse.text()).trim();
  if (!crumbResponse.ok || !cookie || !crumb) throw new Error(`Yahoo crumb HTTP ${crumbResponse.status}`);
  return { cookie, crumb };
}

function getYahooSession(refresh) {
  if (refresh || !yahooSession) {
    const session = createYahooSession();
    yahooSession = session;
    session.catch(() => {
      if (yahooSession === session) yahooSession = null;
    });
  }
  return yahooSession;
}

async function fetchV7Quotes(symbols) {
  for (const refresh of [false, true]) {
    const { cookie, crumb } = await getYahooSession(refresh);
    try {
      return await fetchYahooJson('/v7/finance/quote', { symbols, crumb }, { Cookie: cookie });
    } catch (error) {
      // 401 means the crumb expired: get a new cookie + crumb and retry once.
      if (error.status !== 401 || refresh) throw error;
    }
  }
}

function cleanSymbols(value) {
  return String(value || '^TWII')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS)
    .join(',');
}

function cleanSymbol(value) {
  return String(value || '^TWII').trim().slice(0, 32);
}

function cleanEnum(value, allowed, fallback) {
  const raw = String(value || fallback);
  return allowed.includes(raw) ? raw : fallback;
}

// Missing numbers stay undefined so JSON omits them: the pollers read Number(null) as 0.
const num = (value) => (Number.isFinite(value) ? value : undefined);

function quoteFromChartMeta(symbol, chartPayload) {
  const result = chartPayload?.chart?.result?.[0];
  const meta = result?.meta || {};
  const quote = result?.indicators?.quote?.[0] || {};
  const highs = (quote.high || []).filter(Number.isFinite);
  const lows = (quote.low || []).filter(Number.isFinite);
  const price = num(meta.regularMarketPrice) ?? (quote.close || []).findLast(Number.isFinite);
  const previousClose = num(meta.previousClose) ?? num(meta.chartPreviousClose);
  const change = price !== undefined && previousClose !== undefined ? price - previousClose : undefined;

  return {
    symbol,
    shortName: meta.shortName || meta.longName || symbol,
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: change !== undefined && previousClose ? (change / previousClose) * 100 : undefined,
    regularMarketOpen: num(meta.regularMarketOpen) ?? (quote.open || []).find(Number.isFinite),
    regularMarketDayHigh: num(meta.regularMarketDayHigh) ?? (highs.length ? Math.max(...highs) : undefined),
    regularMarketDayLow: num(meta.regularMarketDayLow) ?? (lows.length ? Math.min(...lows) : undefined),
    regularMarketPreviousClose: previousClose,
    regularMarketVolume: num(meta.regularMarketVolume),
    regularMarketTime: num(meta.regularMarketTime) ?? Math.floor(Date.now() / 1000),
    source: 'chart-meta-fallback'
  };
}

function unavailableQuote(symbol, message) {
  return { symbol, shortName: symbol, source: 'unavailable', error: message };
}

async function fetchQuoteFallbackFromChart(symbols) {
  const list = symbols.split(',');
  const result = [];
  const errors = [];
  for (let i = 0; i < list.length; i += CHART_FALLBACK_CONCURRENCY) {
    const batch = list.slice(i, i + CHART_FALLBACK_CONCURRENCY).map(async (symbol) => {
      try {
        const chartPayload = await fetchYahooJson(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
          interval: '1m',
          range: '1d',
          includePrePost: 'false'
        });
        return quoteFromChartMeta(symbol, chartPayload);
      } catch (error) {
        const message = error.message || 'Yahoo chart fallback failed';
        errors.push(`${symbol}: ${message}`);
        return unavailableQuote(symbol, message);
      }
    });
    result.push(...(await Promise.all(batch)));
  }
  return {
    quoteResponse: {
      result,
      error: null,
      fallback: 'chart-meta',
      fallbackErrors: errors
    }
  };
}

async function handleQuote(reqUrl, res) {
  const symbols = cleanSymbols(reqUrl.searchParams.get('symbols'));
  let quoteError = 'v7 quote paused after a recent failure';
  if (Date.now() >= v7PausedUntil) {
    try {
      sendJson(res, 200, await fetchV7Quotes(symbols));
      return;
    } catch (error) {
      // One v7 request carries every symbol; the chart fallback costs one request per symbol.
      v7PausedUntil = Date.now() + V7_RETRY_MS;
      quoteError = error.message;
      console.warn(`[Yahoo v7] ${error.message}. Using chart fallback for ${V7_RETRY_MS / 1000}s.`);
    }
  }
  const fallbackPayload = await fetchQuoteFallbackFromChart(symbols);
  fallbackPayload.quoteResponse.quoteError = quoteError;
  sendJson(res, 200, fallbackPayload);
}

async function handleChart(reqUrl, res) {
  const symbol = cleanSymbol(reqUrl.searchParams.get('symbol'));
  const interval = cleanEnum(reqUrl.searchParams.get('interval'), ['1m', '2m', '5m', '15m', '30m', '60m', '1d'], '1d');
  const range = cleanEnum(reqUrl.searchParams.get('range'), ['1d', '5d', '1mo', '3mo', '6mo', '1y'], '6mo');
  const includePrePost = reqUrl.searchParams.get('includePrePost') === 'true' ? 'true' : 'false';

  const payload = await fetchYahooJson(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    interval,
    range,
    includePrePost
  });
  sendJson(res, 200, payload);
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function finMindSnapshotUrl(reqUrl) {
  const url = new URL('https://api.finmindtrade.com/api/v4/taiwan_futures_snapshot');
  url.searchParams.set('data_id', cleanSymbol(reqUrl.searchParams.get('data_id') || 'TXF'));
  return url;
}

function finMindDailyUrl(reqUrl) {
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 86400000);
  const url = new URL('https://api.finmindtrade.com/api/v4/data');
  url.searchParams.set('dataset', 'TaiwanFuturesDaily');
  url.searchParams.set('data_id', cleanSymbol(reqUrl.searchParams.get('data_id') || 'TX'));
  url.searchParams.set('start_date', reqUrl.searchParams.get('start_date') || formatDate(start));
  url.searchParams.set('end_date', reqUrl.searchParams.get('end_date') || formatDate(end));
  return url;
}

// The token travels only in Authorization headers (browser -> proxy -> FinMind), never in a URL.
async function handleFinMind(req, res, label, finmindUrl) {
  const fromHeader = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = (fromHeader || process.env.FINMIND_TOKEN || '').trim();
  try {
    sendJson(res, 200, await fetchJson(finmindUrl.toString(), token ? { Authorization: `Bearer ${token}` } : {}));
  } catch (error) {
    console.warn(`[FinMind ${label}] ${error.message}`);
    sendJson(res, 200, {
      data: [],
      error: error.message,
      msg: `FinMind futures ${label} unavailable: ${error.message}`
    });
  }
}

// 證交所 OpenAPI 盤後資料（Page5 選股）：沒有 CORS，經這裡轉送。資料一天才更新一次，快取 10 分鐘。
const TWSE_DATASETS = {
  valuation: 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL',
  daily: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  // 櫃買中心上櫃股票每日收盤行情（含今天的漲跌停價），約 1.4 萬列含權證，只留 4 碼普通股。
  tpex: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'
};
const TWSE_FILTERS = {
  tpex: (row) => /^[1-9]\d{3}$/.test(row.SecuritiesCompanyCode)
};
const TWSE_CACHE_MS = 10 * 60 * 1000;
const twseCache = new Map();

async function handleTwse(res, dataset) {
  const item = twseCache.get(dataset);
  if (item && Date.now() - item.time <= TWSE_CACHE_MS) {
    sendJson(res, 200, item.payload);
    return;
  }
  const response = await fetch(TWSE_DATASETS[dataset], {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`TWSE ${dataset} HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`TWSE ${dataset} returned no rows`);
  const payload = TWSE_FILTERS[dataset] ? rows.filter(TWSE_FILTERS[dataset]) : rows;
  twseCache.set(dataset, { time: Date.now(), payload });
  sendJson(res, 200, payload);
}

// ---- 證交所／期交所 MIS（網站自己用的即時資料介面，非正式 API）：「公開資料」來源的加權成交金額、台指期、選擇權 ----

// 加權指數每分鐘收盤與成交金額、累積成交金額（staticObj.tz，元）。不需要 cookie。
async function handleTwseMisIndex(reqUrl, res) {
  sendJson(res, 200, await fetchJson('https://mis.twse.com.tw/stock/data/mis_ohlc_TSE.txt'));
}

// 期交所 MIS 只收 POST JSON；同一組條件在快取時間內共用一次上游請求。
const taifexCache = new Map();
const TAIFEX_FIELDS = ['SymbolID', 'DispCName', 'CLastPrice', 'CRefPrice', 'COpenPrice', 'CHighPrice', 'CLowPrice', 'CTotalVolume',
  'CBestBidPrice', 'CBestAskPrice', 'CDiff', 'CDiffRate', 'CDate', 'CTime'];

async function fetchTaifexMis(body, ttl) {
  const key = JSON.stringify(body);
  const item = taifexCache.get(key);
  if (item && Date.now() - item.time <= ttl) return item.payload;
  const response = await fetch('https://mis.taifex.com.tw/futures/api/getQuoteList', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ KindID: '1', ExpireMonth: '', RowSize: '全部', PageNo: '', SortColumn: '', AscDesc: 'A', ...body }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`TAIFEX MIS HTTP ${response.status}`);
  const json = await response.json();
  if (String(json.RtCode) !== '0') throw new Error(`TAIFEX MIS ${json.RtMsg || json.RtCode}`);
  // 只留前端用得到的欄位。
  const list = json.RtData?.QuoteList || [];
  // 選擇權約 3000 列，改成精簡陣列 [代號, 名稱裡的到期日, 成交價, 參考價, 買價, 賣價, 成交量]，大小約剩 1/5。
  const payload = body.SymbolType === 'O'
    ? list.map((row) => [row.SymbolID, String(row.DispCName || '').match(/\((\d{4}\/\d{2}\/\d{2})\)/)?.[1] || '', row.CLastPrice, row.CRefPrice, row.CBestBidPrice, row.CBestAskPrice, row.CTotalVolume])
    : list.map((row) => Object.fromEntries(TAIFEX_FIELDS.map((field) => [field, row[field] ?? ''])));
  taifexCache.set(key, { time: Date.now(), payload });
  return payload;
}

// ?kind=futures|options&session=day|night
async function handleTaifexMis(reqUrl, res) {
  const options = reqUrl.searchParams.get('kind') === 'options';
  const night = reqUrl.searchParams.get('session') === 'night';
  const body = { MarketType: night ? '1' : '0', SymbolType: options ? 'O' : 'F', CID: options ? 'TXO' : 'TXF' };
  sendJson(res, 200, await fetchTaifexMis(body, options ? 10000 : CACHE_TTL_MS));
}

// 期交所 OpenAPI 選擇權每日行情（收盤後的選擇權鏈）：原檔約 4 MB，只留 TXO 一般交易時段與用得到的欄位，快取 30 分鐘。
const TAIFEX_OPT_DAILY_FIELDS = ['Contract', 'ContractMonth(Week)', 'StrikePrice', 'CallPut', 'TradingSession', 'BestBid', 'BestAsk',
  'SettlementPrice', 'Close', 'Last', 'Volume', 'OpenInterest', 'Date'];
let taifexOptDaily = null;

async function handleTaifexOptDaily(reqUrl, res) {
  if (!taifexOptDaily || Date.now() - taifexOptDaily.time > 30 * 60 * 1000) {
    const response = await fetch('https://openapi.taifex.com.tw/v1/DailyMarketReportOpt', {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`TAIFEX DailyMarketReportOpt HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('TAIFEX DailyMarketReportOpt returned no rows');
    const payload = rows
      .filter((row) => row.Contract === 'TXO' && row.TradingSession === '一般')
      .map((row) => Object.fromEntries(TAIFEX_OPT_DAILY_FIELDS.filter((field) => field in row).map((field) => [field, row[field]])));
    taifexOptDaily = { time: Date.now(), payload };
  }
  sendJson(res, 200, taifexOptDaily.payload);
}

// ---- 期交所盤後下載（CSV，Big5）：台指期歷史日 K、三大法人期貨未平倉；證交所／櫃買／期交所的其他公開資料 ----

const big5 = new TextDecoder('big5');
const longCache = new Map();

// 本機快取資料夾（.gitignore）：只存不會再變的盤後資料（過去的月份、過去的日期）。
const DISK_DIR = path.join(__dirname, '.cache');
const diskFile = (key) => path.join(DISK_DIR, `${key.replace(/[^\w.-]/g, '_')}.json`);
// 前端「⋯ → 盤後資料存本機」勾選的資料群組才帶 disk=1。
const wantsDisk = (reqUrl) => reqUrl.searchParams.get('disk') === '1';

// 同一個 key 在 ttl 內共用結果（含進行中的請求）；失敗不快取。disk＝不會再變的資料：先讀本機檔，沒有才抓、抓到就寫檔。
function cached(key, ttl, load, disk = false) {
  const item = longCache.get(key);
  if (item && Date.now() - item.time <= ttl) return item.promise;
  const promise = (async () => {
    if (disk) {
      try {
        return JSON.parse(await fs.promises.readFile(diskFile(key), 'utf8'));
      } catch {
        // 沒有本機檔就抓。
      }
    }
    const value = await load();
    if (disk) {
      fs.promises.mkdir(DISK_DIR, { recursive: true })
        .then(() => fs.promises.writeFile(diskFile(key), JSON.stringify(value)))
        .catch((error) => console.warn(`disk cache ${key}: ${error.message}`));
    }
    return value;
  })();
  longCache.set(key, { time: Date.now(), promise });
  promise.catch(() => { if (longCache.get(key)?.promise === promise) longCache.delete(key); });
  return promise;
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// 期交所下載頁要 POST 表單＋Referer（沒帶會回「日期時間錯誤」的 HTML）；回傳 CSV 每列欄位陣列（不含表頭）。
async function fetchTaifexCsv(path, form) {
  const response = await fetch(`https://www.taifex.com.tw/cht/3/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT, Referer: `https://www.taifex.com.tw/cht/3/${path.replace(/Down$/, '')}` },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`TAIFEX ${path} HTTP ${response.status}`);
  const text = big5.decode(Buffer.from(await response.arrayBuffer()));
  if (/<html/i.test(text.slice(0, 200))) throw new Error(`TAIFEX ${path} returned HTML`);
  return text.trim().split(/\r?\n/).slice(1).map((line) => line.split(',').map((cell) => cell.trim()));
}

const slashDate = (date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
const isoDate = (text) => text.replaceAll('/', '-');
const csvNum = (text) => (text === '' || text === '-' ? null : Number(text));

// 最近 N 個日曆月（含本月），由舊到新：[{ year, month(0~11), current }]。
function monthsBack(months) {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return { year: date.getFullYear(), month: date.getMonth(), current: i === months - 1 };
  });
}

const monthsParam = (reqUrl, max, fallback) => Math.min(max, Math.max(1, Number(reqUrl.searchParams.get('months')) || fallback));

// 期交所下載一次查一個日曆月（一次最多約一個月）：過去的月份不會再變（可存本機）、快取 12 小時，本月 30 分鐘。回傳 CSV 原始列。
function taifexMonth(csvPath, form, { year, month, current }, disk) {
  const start = new Date(year, month, 1);
  const query = (end) => fetchTaifexCsv(csvPath, { ...form, queryStartDate: slashDate(start), queryEndDate: slashDate(end) });
  return cached(`${csvPath}:${Object.values(form).join('-')}:${year}-${month + 1}`, current ? 30 * 60 * 1000 : 12 * 3600 * 1000, async () => {
    if (!current) return query(new Date(year, month + 1, 0));
    // 三大法人類的下載迄日不能超過已公布的最後一天（今天還沒公布會回 HTML）：改查到昨天；本月還沒有任何一天就是空的。
    try {
      return await query(new Date());
    } catch (error) {
      const yesterday = new Date(Date.now() - 86400000);
      if (yesterday < start) return [];
      return query(yesterday);
    }
  }, disk && !current);
}

// 逐月依序抓（不同時對期交所打太多請求），每月的列經 map 轉換後接起來。
async function taifexMonths(csvPath, form, months, disk, map) {
  const result = [];
  for (const item of monthsBack(months)) result.push(...map(await taifexMonth(csvPath, form, item, disk)));
  return result;
}

const futDataForm = (commodity) => ({ down_type: '1', commodity_id: commodity, commodity_id2: '' });

// ?months=N（1~24，預設 2）：最近 N 個日曆月的台指期（TX）日 K，由舊到新：
// [日期, 契約月份, 'day'|'night', 開, 高, 低, 收, 量, 結算價]，只留單一月份契約。
async function handleTaifexFutHistory(reqUrl, res) {
  sendJson(res, 200, await taifexMonths('futDataDown', futDataForm('TX'), monthsParam(reqUrl, 24, 2), wantsDisk(reqUrl), (rows) => rows
    .filter((cells) => cells[1] === 'TX' && /^\d{6}$/.test(cells[2]) && csvNum(cells[3]) !== null)
    .map((cells) => [isoDate(cells[0]), cells[2], cells[17] === '盤後' ? 'night' : 'day', ...[3, 4, 5, 6, 9, 10].map((i) => csvNum(cells[i]))])));
}

// ?months=N（1~4，預設 3）：大台（TX）、小台（MTX）、微台（TMF）全市場未平倉口數（一般時段各契約加總，不含價差單）：[日期, 商品, 未平倉口數]。
const OI_PRODUCTS = ['TX', 'MTX', 'TMF'];
async function handleTaifexOi(reqUrl, res) {
  const months = monthsParam(reqUrl, 4, 3);
  const result = [];
  for (const product of OI_PRODUCTS) {
    result.push(...await taifexMonths('futDataDown', futDataForm(product), months, wantsDisk(reqUrl), (rows) => {
      const totals = new Map();
      rows.filter((cells) => cells[1] === product && cells[17] === '一般' && !cells[2].includes('/') && csvNum(cells[11]) !== null)
        .forEach((cells) => totals.set(isoDate(cells[0]), (totals.get(isoDate(cells[0])) || 0) + csvNum(cells[11])));
      return [...totals].map(([date, oi]) => [date, product, oi]);
    }));
  }
  sendJson(res, 200, result.sort((a, b) => a[0].localeCompare(b[0])));
}

const INST_NAMES = { 自營商: 'dealer', 投信: 'trust', 外資及陸資: 'foreign' };

// 三大法人期貨每日交易與未平倉：[日期, 身份('foreign'|'trust'|'dealer'), 交易淨口數, 交易淨額(千元), 未平倉淨口數, 未平倉淨額(千元)]。
// ?days=N（30~730，預設 365）&commodity=TXF（大台）|MXF（小台）|TMF（微台）；一月一請求，盤後約 15:00 更新。
async function handleTaifexInst(reqUrl, res) {
  const days = Math.min(730, Math.max(30, Number(reqUrl.searchParams.get('days')) || 365));
  const commodityId = cleanEnum(reqUrl.searchParams.get('commodity'), ['TXF', 'MXF', 'TMF'], 'TXF');
  const since = isoDate(slashDate(new Date(Date.now() - days * 86400000)));
  const rows = await taifexMonths('futContractsDateDown', { commodityId }, Math.ceil(days / 30) + 1, wantsDisk(reqUrl), (list) => list
    .filter((cells) => INST_NAMES[cells[2]] && isoDate(cells[0]) >= since)
    .map((cells) => [isoDate(cells[0]), INST_NAMES[cells[2]], ...[7, 8, 13, 14].map((i) => csvNum(cells[i]))]));
  sendJson(res, 200, rows.sort((a, b) => a[0].localeCompare(b[0])));
}

// 三大法人臺指選擇權買賣權未平倉：[日期, 'call'|'put', 身份, 買方未平倉口數, 賣方未平倉口數, 未平倉淨口數, 未平倉淨額(千元)]。?months=N（1~4，預設 3）。
async function handleTaifexOptInst(reqUrl, res) {
  const rows = await taifexMonths('callsAndPutsDateDown', { commodityId: 'TXO' }, monthsParam(reqUrl, 4, 3), wantsDisk(reqUrl), (list) => list
    .filter((cells) => INST_NAMES[cells[3]] && /^(CALL|PUT)$/.test(cells[2]))
    .map((cells) => [isoDate(cells[0]), cells[2].toLowerCase(), INST_NAMES[cells[3]], ...[10, 12, 14, 15].map((i) => csvNum(cells[i]))]));
  sendJson(res, 200, rows.sort((a, b) => a[0].localeCompare(b[0])));
}

// 臺指選擇權 Put/Call Ratio：[日期, 賣權量, 買權量, 成交量比率%, 賣權未平倉, 買權未平倉, 未平倉比率%]，由舊到新。?months=N（1~4，預設 3）。
async function handleTaifexPcRatio(reqUrl, res) {
  const rows = await taifexMonths('pcRatioDown', {}, monthsParam(reqUrl, 4, 3), wantsDisk(reqUrl), (list) => list
    .filter((cells) => /^\d{4}\/\d{2}\/\d{2}$/.test(cells[0]))
    .map((cells) => [isoDate(cells[0]), ...cells.slice(1, 7).map(csvNum)]));
  sendJson(res, 200, rows.sort((a, b) => a[0].localeCompare(b[0])));
}

// 加權與櫃買指數即時（證交所 MIS getStockInfo）：z 現價、y 昨收、o/h/l 開高低。
async function handleTwIndices(reqUrl, res) {
  const json = await fetchJson(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw%7Cotc_o00.tw&json=1&delay=0&_=${Math.floor(Date.now() / CACHE_TTL_MS)}`);
  sendJson(res, 200, (json.msgArray || []).map((row) => ({ ex: row.ex, name: row.n, price: row.z, prevClose: row.y, open: row.o, high: row.h, low: row.l, time: row.tlong })));
}

// 台指選擇權波動率指數（VIX）即時，快取 10 秒。
async function handleTaifexVix(reqUrl, res) {
  const payload = await cached('vix', 10000, async () => {
    const response = await fetch('https://mis.taifex.com.tw/futures/api/getQuoteListVIX', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body: '{}',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`TAIFEX VIX HTTP ${response.status}`);
    const row = (await response.json()).RtData?.QuoteList?.[0];
    if (!row) throw new Error('TAIFEX VIX returned no rows');
    return { price: row.CLastPrice, prevClose: row.CRefPrice, open: row.COpenPrice, high: row.CHighPrice, low: row.CLowPrice, date: row.CDate, time: row.CTime };
  });
  sendJson(res, 200, payload);
}

// 證交所有請求頻率限制（太密會被暫時封鎖）：沒命中快取的請求之間至少隔這麼久。
const TWSE_GAP_MS = 600;
let twseLastAt = 0;
async function fetchTwseThrottled(url) {
  const wait = twseLastAt + TWSE_GAP_MS - Date.now();
  twseLastAt = Date.now() + Math.max(0, wait);
  if (wait > 0) await sleep(wait);
  return fetchJson(url);
}

const compactDate = (iso) => iso.replaceAll('-', '');
const twseNum = (text) => Number(String(text).replace(/,/g, ''));

// 證交所每日市場成交資訊（大盤成交金額）：[日期, 成交金額(元)]。一月一請求，過去的月份不會再變。
async function twseAmountMonths(months, disk) {
  const rows = [];
  for (const { year, month, current } of monthsBack(months)) {
    const yyyymm = `${year}${String(month + 1).padStart(2, '0')}`;
    rows.push(...await cached(`fmtqik:${yyyymm}`, current ? 30 * 60 * 1000 : 12 * 3600 * 1000, async () => {
      const json = await fetchTwseThrottled(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${yyyymm}01&response=json`);
      return (json.data || []).map((cells) => {
        const [roc, mm, dd] = String(cells[0]).split('/');
        return [`${Number(roc) + 1911}-${mm}-${dd}`, twseNum(cells[2])];
      });
    }, disk && !current));
  }
  return rows;
}

// ?months=N（1~4，預設 2）。
async function handleTwseMarketAmount(reqUrl, res) {
  sendJson(res, 200, await twseAmountMonths(monthsParam(reqUrl, 4, 2), wantsDisk(reqUrl)));
}

// 三大法人上市現貨買賣金額（BFI82U，一天一請求，盤後約 15:00 公布）：[日期, 外資, 投信, 自營商, 合計]（買賣差額，元）。
// ?days=N（5~60，預設 20）：交易日取自每日成交資訊；當天還沒公布就略過。外資＝外資及陸資＋外資自營商、自營商＝自行買賣＋避險。
async function handleTwseInstAmount(reqUrl, res) {
  const days = Math.min(60, Math.max(5, Number(reqUrl.searchParams.get('days')) || 20));
  const disk = wantsDisk(reqUrl);
  const today = isoDate(slashDate(new Date()));
  const dates = (await twseAmountMonths(Math.ceil(days / 19) + 1, disk)).map(([date]) => date).slice(-days);
  const rows = [];
  for (const date of dates) {
    try {
      rows.push(await cached(`bfi82u:${date}`, date === today ? 10 * 60 * 1000 : 12 * 3600 * 1000, async () => {
        const json = await fetchTwseThrottled(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${compactDate(date)}&response=json`);
        if (json.stat !== 'OK') throw new Error(`BFI82U ${date} ${json.stat}`);
        const net = (prefix) => (json.data || []).filter((cells) => String(cells[0]).startsWith(prefix)).reduce((sum, cells) => sum + twseNum(cells[3]), 0);
        return [date, net('外資'), net('投信'), net('自營商'), net('合計')];
      }, disk && date !== today));
    } catch (error) {
      if (date !== today) throw error;
    }
  }
  sendJson(res, 200, rows);
}

// 某一天的盤中累計成交金額（MI_5MINS 每 5 秒一列，取整分鐘）：[台北當日分鐘數, 累計成交金額(百萬元)]。?date=YYYY-MM-DD（過去的日期）。
async function handleTwseIntradayAmount(reqUrl, res) {
  const date = reqUrl.searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    sendJson(res, 400, { error: 'date=YYYY-MM-DD required' });
    return;
  }
  const rows = await cached(`mi5mins:${date}`, 12 * 3600 * 1000, async () => {
    const json = await fetchTwseThrottled(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_5MINS?date=${compactDate(date)}&response=json`);
    if (json.stat !== 'OK') throw new Error(`MI_5MINS ${date} ${json.stat}`);
    return (json.data || []).filter((cells) => String(cells[0]).endsWith(':00')).map((cells) => {
      const [hh, mm] = String(cells[0]).split(':').map(Number);
      return [hh * 60 + mm, twseNum(cells[7])];
    });
  }, wantsDisk(reqUrl));
  sendJson(res, 200, rows);
}

// Yahoo spark（只有收盤價的日線，一次最多 20 檔）：?symbols= 最多 200 檔，分批抓，每批快取 6 小時（市場寬度統計一天抓一次）。
const SPARK_BATCH = 20;
async function handleYahooSpark(reqUrl, res) {
  const symbols = cleanSymbols(reqUrl.searchParams.get('symbols')).split(',').filter((symbol) => /^[\w.^=-]{1,20}$/.test(symbol));
  const range = cleanEnum(reqUrl.searchParams.get('range'), ['3mo', '6mo', '1y'], '1y');
  const batches = [];
  for (let i = 0; i < symbols.length; i += SPARK_BATCH) batches.push(symbols.slice(i, i + SPARK_BATCH));
  const result = {};
  for (let i = 0; i < batches.length; i += 4) {
    await Promise.all(batches.slice(i, i + 4).map(async (batch) => {
      const json = await cached(`spark:${range}:${batch.join(',')}`, 6 * 3600 * 1000,
        () => fetchYahooJson('/v8/finance/spark', { symbols: batch.join(','), range, interval: '1d' }));
      Object.entries(json || {}).forEach(([symbol, row]) => { result[symbol] = { t: row.timestamp || [], c: row.close || [] }; });
    }));
  }
  sendJson(res, 200, result);
}

const routes = {
  '/api/yahoo-quote': handleQuote,
  '/api/yahoo-chart': handleChart,
  '/api/finmind-futures-snapshot': (reqUrl, res, req) => handleFinMind(req, res, 'snapshot', finMindSnapshotUrl(reqUrl)),
  '/api/finmind-futures-daily': (reqUrl, res, req) => handleFinMind(req, res, 'daily', finMindDailyUrl(reqUrl)),
  '/api/twse-valuation': (reqUrl, res) => handleTwse(res, 'valuation'),
  '/api/twse-daily': (reqUrl, res) => handleTwse(res, 'daily'),
  '/api/twse-mis-index': handleTwseMisIndex,
  '/api/taifex-mis': handleTaifexMis,
  '/api/taifex-opt-daily': handleTaifexOptDaily,
  '/api/taifex-fut-history': handleTaifexFutHistory,
  '/api/taifex-inst': handleTaifexInst,
  '/api/taifex-oi': handleTaifexOi,
  '/api/taifex-opt-inst': handleTaifexOptInst,
  '/api/taifex-pc-ratio': handleTaifexPcRatio,
  '/api/twse-inst-amount': handleTwseInstAmount,
  '/api/twse-intraday-amount': handleTwseIntradayAmount,
  '/api/taifex-vix': handleTaifexVix,
  '/api/tw-indices': handleTwIndices,
  '/api/tpex-daily': (reqUrl, res) => handleTwse(res, 'tpex'),
  '/api/twse-market-amount': handleTwseMarketAmount,
  '/api/yahoo-spark': handleYahooSpark
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization');
  }
  // CORS alone only hides the response; a foreign page could still spend the FinMind token.
  // The Host check blocks DNS rebinding.
  if ((origin && !ALLOWED_ORIGINS.has(origin)) || !ALLOWED_HOSTS.has(req.headers.host)) {
    sendJson(res, 403, { error: 'Forbidden origin or host' });
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const reqUrl = new URL(req.url, 'http://127.0.0.1');
    const route = routes[reqUrl.pathname];
    if (route) {
      await route(reqUrl, res, req);
      return;
    }
    sendJson(res, 404, {
      error: 'Not found',
      endpoints: [
        '/api/yahoo-quote?symbols=^TWII',
        '/api/yahoo-chart?symbol=^TWII&interval=1d&range=6mo',
        '/api/finmind-futures-snapshot?data_id=TXF',
        '/api/finmind-futures-daily?data_id=TX',
        '/api/twse-valuation',
        '/api/twse-daily',
        '/api/twse-mis-index',
        '/api/taifex-mis?kind=futures|options&session=day|night',
        '/api/taifex-opt-daily',
        '/api/taifex-fut-history?months=2',
        '/api/taifex-inst?days=365&commodity=TXF',
        '/api/taifex-oi?months=3',
        '/api/taifex-opt-inst?months=3',
        '/api/taifex-pc-ratio?months=3',
        '/api/twse-inst-amount?days=20',
        '/api/twse-intraday-amount?date=2026-11-10',
        '/api/taifex-vix',
        '/api/tw-indices',
        '/api/tpex-daily',
        '/api/twse-market-amount?months=2',
        '/api/yahoo-spark?symbols=2330.TW&range=1y'
      ]
    });
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use. Close the other Yahoo proxy window first.`
    : `Yahoo proxy error: ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Yahoo proxy listening on http://127.0.0.1:${PORT}`);
});
