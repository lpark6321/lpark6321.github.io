// Local Yahoo proxy for development.
// Run with: node services/yahooProxyServer.js
// Frontend calls this server instead of query1.finance.yahoo.com to avoid browser CORS blocks.
const http = require('node:http');
const { URL } = require('node:url');

const PORT = Number(process.env.YAHOO_PROXY_PORT || 8787);
const CACHE_TTL_MS = Number(process.env.YAHOO_PROXY_CACHE_MS || 10000);
const FINMIND_FUTURES_SNAPSHOT_URL = 'https://api.finmindtrade.com/api/v4/taiwan_futures_snapshot';
const cache = new Map();

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
}

function sendJson(res, status, payload) {
  setCors(res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.payload;
}

function setCached(key, payload) {
  cache.set(key, { time: Date.now(), payload });
}

async function fetchYahooJson(url) {
  const cached = getCached(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Yahoo HTTP ${response.status}: ${text.slice(0, 160)}`);
  }

  const payload = JSON.parse(text);
  setCached(url, payload);
  return payload;
}

async function fetchJsonWithHeaders(url, headers = {}) {
  const cached = getCached(`${url}:${headers.Authorization || ''}`);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...headers
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
  }

  const payload = JSON.parse(text);
  setCached(`${url}:${headers.Authorization || ''}`, payload);
  return payload;
}

async function fetchYahooJsonWithHosts(path, searchParams) {
  const errors = [];
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    const url = new URL(`https://${host}${path}`);
    Object.entries(searchParams).forEach(([key, value]) => url.searchParams.set(key, value));
    try {
      return await fetchYahooJson(url.toString());
    } catch (error) {
      errors.push(`${host}: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

function cleanSymbols(value) {
  return String(value || '^TWII')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
    .join(',');
}

function cleanSymbol(value) {
  return String(value || '^TWII').trim().slice(0, 32);
}

function cleanEnum(value, allowed, fallback) {
  const raw = String(value || fallback);
  return allowed.includes(raw) ? raw : fallback;
}

function quoteFromChartMeta(symbol, chartPayload) {
  const result = chartPayload?.chart?.result?.[0];
  const meta = result?.meta || {};
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const opens = quote.open || [];
  const lastClose = [...closes].reverse().find((value) => Number.isFinite(Number(value)));
  const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose);
  const price = Number(meta.regularMarketPrice ?? lastClose);
  const change = Number.isFinite(price) && Number.isFinite(previousClose) ? price - previousClose : null;
  const changePercent = Number.isFinite(change) && previousClose ? (change / previousClose) * 100 : null;

  return {
    symbol,
    shortName: meta.shortName || meta.longName || symbol,
    regularMarketPrice: Number.isFinite(price) ? price : null,
    regularMarketChange: Number.isFinite(change) ? change : null,
    regularMarketChangePercent: Number.isFinite(changePercent) ? changePercent : null,
    regularMarketOpen: Number(meta.regularMarketOpen ?? opens.find((value) => Number.isFinite(Number(value)))),
    regularMarketDayHigh: Number(meta.regularMarketDayHigh ?? Math.max(...highs.filter((value) => Number.isFinite(Number(value))))),
    regularMarketDayLow: Number(meta.regularMarketDayLow ?? Math.min(...lows.filter((value) => Number.isFinite(Number(value))))),
    regularMarketPreviousClose: Number.isFinite(previousClose) ? previousClose : null,
    regularMarketVolume: Number(meta.regularMarketVolume ?? 0),
    regularMarketTime: Number(meta.regularMarketTime ?? Date.now() / 1000),
    source: 'chart-meta-fallback'
  };
}

function unavailableQuote(symbol, message) {
  return {
    symbol,
    shortName: symbol,
    regularMarketPrice: null,
    regularMarketChange: null,
    regularMarketChangePercent: null,
    regularMarketPreviousClose: null,
    regularMarketVolume: null,
    regularMarketTime: Math.floor(Date.now() / 1000),
    source: 'unavailable',
    error: message
  };
}

async function fetchQuoteFallbackFromChart(symbols) {
  const result = [];
  const errors = [];
  for (const symbol of symbols.split(',').map((item) => item.trim()).filter(Boolean)) {
    try {
      const chartPayload = await fetchYahooJsonWithHosts(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
        interval: '1m',
        range: '1d',
        includePrePost: 'false'
      });
      result.push(quoteFromChartMeta(symbol, chartPayload));
    } catch (error) {
      const message = error.message || 'Yahoo chart fallback failed';
      errors.push(`${symbol}: ${message}`);
      result.push(unavailableQuote(symbol, message));
    }
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
  try {
    const payload = await fetchYahooJsonWithHosts('/v7/finance/quote', { symbols });
    sendJson(res, 200, payload);
  } catch (quoteError) {
    const fallbackPayload = await fetchQuoteFallbackFromChart(symbols);
    fallbackPayload.quoteResponse.quoteError = quoteError.message;
    sendJson(res, 200, fallbackPayload);
  }
}

async function handleChart(reqUrl, res) {
  const symbol = cleanSymbol(reqUrl.searchParams.get('symbol'));
  const interval = cleanEnum(reqUrl.searchParams.get('interval'), ['1m', '2m', '5m', '15m', '30m', '60m', '1d'], '1d');
  const range = cleanEnum(reqUrl.searchParams.get('range'), ['1d', '5d', '1mo', '3mo', '6mo', '1y'], '6mo');
  const includePrePost = reqUrl.searchParams.get('includePrePost') === 'true' ? 'true' : 'false';

  const payload = await fetchYahooJsonWithHosts(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    interval,
    range,
    includePrePost
  });
  sendJson(res, 200, payload);
}

async function handleFinMindFuturesSnapshot(reqUrl, res) {
  const dataId = cleanSymbol(reqUrl.searchParams.get('data_id') || 'TXF');
  const token = String(reqUrl.searchParams.get('token') || process.env.FINMIND_TOKEN || '').trim();
  const finmindUrl = new URL(FINMIND_FUTURES_SNAPSHOT_URL);
  finmindUrl.searchParams.set('data_id', dataId);
  if (token) finmindUrl.searchParams.set('token', token);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const payload = await fetchJsonWithHeaders(finmindUrl.toString(), headers);
    sendJson(res, 200, payload);
  } catch (error) {
    console.warn(`[FinMind snapshot] ${error.message}`);
    sendJson(res, 200, {
      data: [],
      error: error.message,
      msg: `FinMind futures snapshot unavailable: ${error.message}`
    });
  }
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function handleFinMindFuturesDaily(reqUrl, res) {
  const dataId = cleanSymbol(reqUrl.searchParams.get('data_id') || 'TX');
  const token = String(reqUrl.searchParams.get('token') || process.env.FINMIND_TOKEN || '').trim();
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 86400000);
  const finmindUrl = new URL('https://api.finmindtrade.com/api/v4/data');
  finmindUrl.searchParams.set('dataset', 'TaiwanFuturesDaily');
  finmindUrl.searchParams.set('data_id', dataId);
  finmindUrl.searchParams.set('start_date', reqUrl.searchParams.get('start_date') || formatDate(start));
  finmindUrl.searchParams.set('end_date', reqUrl.searchParams.get('end_date') || formatDate(end));
  if (token) finmindUrl.searchParams.set('token', token);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const payload = await fetchJsonWithHeaders(finmindUrl.toString(), headers);
    sendJson(res, 200, payload);
  } catch (error) {
    console.warn(`[FinMind daily] ${error.message}`);
    sendJson(res, 200, {
      data: [],
      error: error.message,
      msg: `FinMind futures daily unavailable: ${error.message}`
    });
  }
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    if (reqUrl.pathname === '/api/yahoo-quote') {
      await handleQuote(reqUrl, res);
      return;
    }
    if (reqUrl.pathname === '/api/yahoo-chart') {
      await handleChart(reqUrl, res);
      return;
    }
    if (reqUrl.pathname === '/api/finmind-futures-snapshot') {
      await handleFinMindFuturesSnapshot(reqUrl, res);
      return;
    }
    if (reqUrl.pathname === '/api/finmind-futures-daily') {
      await handleFinMindFuturesDaily(reqUrl, res);
      return;
    }
    sendJson(res, 404, {
      error: 'Not found',
      endpoints: [
        '/api/yahoo-quote?symbols=^TWII',
        '/api/yahoo-chart?symbol=^TWII&interval=1d&range=6mo',
        '/api/finmind-futures-snapshot?data_id=TXF',
        '/api/finmind-futures-daily?data_id=TX'
      ]
    });
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Yahoo proxy listening on http://127.0.0.1:${PORT}`);
});
