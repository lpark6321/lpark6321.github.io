// Yahoo 經本機 proxy 的共用存取：proxy 位址、URL 組裝、請求逾時、報價分批抓取與報價欄位轉換。
export const DEFAULT_YAHOO_PROXY_BASE = 'http://127.0.0.1:8787/api';
// 單一請求最多等 8 秒，避免卡住的請求讓輪詢器一直停在「請求中」而不再更新。
export const REQUEST_TIMEOUT_MS = 8000;
// proxy 端一次上游請求最多帶 200 檔。
const MAX_SYMBOLS_PER_REQUEST = 200;

export function yahooProxyUrl(endpoint) {
  const base = globalThis.window?.YAHOO_PROXY_BASE || globalThis.YAHOO_PROXY_BASE || DEFAULT_YAHOO_PROXY_BASE;
  return new URL(endpoint, base.endsWith('/') ? base : `${base}/`);
}

async function fetchProxyJson(endpoint, params, label) {
  const url = yahooProxyUrl(endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('_ts', String(Date.now()));
  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  return response.json();
}

export async function fetchYahooQuoteChunk(symbols) {
  const payload = await fetchProxyJson('yahoo-quote', { symbols: symbols.join(',') }, 'Yahoo quote');
  const rows = payload?.quoteResponse?.result;
  if (!Array.isArray(rows)) throw new Error('Yahoo quote response is empty');
  return rows;
}

// 每批最多 MAX_SYMBOLS_PER_REQUEST 檔、最多 concurrency 批同時抓；只要有一批成功就回傳已取得的部分。
export async function fetchYahooQuotes(symbols, concurrency = 4) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_REQUEST) {
    chunks.push(symbols.slice(i, i + MAX_SYMBOLS_PER_REQUEST));
  }
  const rawMap = new Map();
  const errors = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor];
      cursor += 1;
      try {
        (await fetchYahooQuoteChunk(chunk)).forEach((raw) => {
          if (raw?.symbol) rawMap.set(raw.symbol, raw);
        });
      } catch (error) {
        errors.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
  if (!rawMap.size && errors.length) throw errors[0];
  return rawMap;
}

// 回傳 Yahoo chart API 的 result[0]（timestamp + indicators.quote），沒有資料時回傳 null。
export async function fetchYahooChart(symbol, interval, range) {
  const payload = await fetchProxyJson('yahoo-chart', { symbol, interval, range, includePrePost: 'false' }, 'Yahoo chart');
  return payload?.chart?.result?.[0] || null;
}

// proxy 對缺少的數值欄位會省略（舊版回傳 null）；Number(null) 是 0，所以 undefined/null/空字串一律視為缺值。
export function yahooNumber(value) {
  return value == null || value === '' ? NaN : Number(value);
}

// Yahoo 報價 → 共用的價格欄位；缺值沿用 previous。價格無效時回傳 null。
export function mapYahooQuoteFields(raw, previous = {}, digits = 2) {
  const price = yahooNumber(raw?.regularMarketPrice);
  if (!Number.isFinite(price)) return null;
  const prevClose = yahooNumber(raw.regularMarketPreviousClose);
  const rawChange = yahooNumber(raw.regularMarketChange);
  const change = Number.isFinite(rawChange) ? rawChange : price - prevClose;
  const rawChangePct = yahooNumber(raw.regularMarketChangePercent);
  const changePct = Number.isFinite(rawChangePct) ? rawChangePct : (prevClose ? (change / prevClose) * 100 : NaN);
  const volume = yahooNumber(raw.regularMarketVolume);
  const round = (value, fallback, places = digits) => (Number.isFinite(value) ? +value.toFixed(places) : fallback);
  return {
    price: round(price),
    prevClose: round(prevClose, previous.prevClose),
    open: round(yahooNumber(raw.regularMarketOpen), previous.open),
    high: round(yahooNumber(raw.regularMarketDayHigh), previous.high),
    low: round(yahooNumber(raw.regularMarketDayLow), previous.low),
    change: round(change, previous.change),
    changePct: round(changePct, previous.changePct, 2),
    volume: Number.isFinite(volume) ? volume : previous.volume
  };
}
