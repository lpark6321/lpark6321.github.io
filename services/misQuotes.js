// 證交所／期交所 MIS（網站自己用的即時資料介面，經本機代理轉送）：「公開資料」來源用來補加權成交金額與 1 分走勢、台指期、選擇權。
// 解析函式不抓資料（tests/ 直接測）；fetch* 經代理取資料，連不上記在 serviceHealth。
import { diskCacheEnabled } from './chipMonitor.js';
import { trackedFetch } from './serviceHealth.js';
import { REQUEST_TIMEOUT_MS, yahooProxyUrl } from './yahooApi.js';

const num = (value) => {
  const text = String(value ?? '').replace(/,/g, '').trim();
  return text === '' || text === '-' || !Number.isFinite(Number(text)) ? null : Number(text);
};

async function fetchProxy(endpoint, params = {}, timeout = REQUEST_TIMEOUT_MS) {
  const url = yahooProxyUrl(endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('_ts', String(Date.now()));
  const response = await trackedFetch('proxy', url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
  return response.json();
}

// ---- 加權指數（證交所 mis_ohlc_TSE.txt） ----

// { amount 累積成交金額(元), volume 累積成交量(張), trades 筆數, minutes: [{ time(unix 秒), close, amount 該分鐘成交金額(百萬元) }] }
export function parseMisIndex(json) {
  const total = json?.staticObj || {};
  const minutes = (json?.ohlcArray || [])
    .map((row) => ({ time: Math.floor(Number(row.t) / 1000), close: num(row.c), amount: num(row.s) }))
    .filter((row) => Number.isFinite(row.time) && row.close !== null)
    .sort((a, b) => a.time - b.time);
  return { amount: num(total.tz), volume: num(total.tv), trades: num(total.tr), minutes };
}

export const fetchMisIndex = async () => parseMisIndex(await fetchProxy('twse-mis-index'));

// ---- 台指期（期交所 getQuoteList） ----

const MONTH_LETTERS = 'ABCDEFGHIJKL';

// 近月台指期（farPrice＝次近月成交價，算近遠月價差）：代號 TXF + 月份字母(A=1 月 … L=12 月) + 年尾數 + -F（日盤）或 -M（夜盤）；現貨列與價差單不算。
export function parseMisFutures(list) {
  const contracts = (list || [])
    .map((row) => ({ row, m: /^TXF([A-L])(\d)-[FM]$/.exec(row.SymbolID || '') }))
    .filter(({ m }) => m)
    .map(({ row, m }) => ({ row, order: Number(m[2]) * 12 + MONTH_LETTERS.indexOf(m[1]) }));
  if (!contracts.length) return null;
  // 年尾數 0 接在 9 之後（2029 → 2030）：差太多就加 10 年。
  const minOrder = Math.min(...contracts.map((c) => c.order));
  contracts.forEach((c) => { if (c.order - minOrder > 60) c.order -= 120; });
  const [{ row }, far] = contracts.sort((a, b) => a.order - b.order);
  const farPrice = num(far?.row.CLastPrice) || null;
  const price = num(row.CLastPrice);
  const prevClose = num(row.CRefPrice);
  if (price === null || price === 0) return { symbol: row.SymbolID, prevClose, price: null, farPrice, date: row.CDate };
  const change = prevClose !== null ? price - prevClose : num(row.CDiff);
  return {
    symbol: row.SymbolID,
    price,
    open: num(row.COpenPrice),
    high: num(row.CHighPrice),
    low: num(row.CLowPrice),
    prevClose,
    change,
    changePct: prevClose ? +((change / prevClose) * 100).toFixed(2) : num(row.CDiffRate),
    volume: num(row.CTotalVolume),
    farPrice,
    date: row.CDate
  };
}

// 台指(全)＝前一晚夜盤＋日盤（開用夜盤開、高低取兩段、量相加）；新的夜盤開始後就是夜盤本身。
export function mergeFullSession(day, night) {
  if (night?.price == null) return day;
  // MIS 夜盤的 CDate 是開盤那天：比日盤早一天＝今天日盤前的那一晚；同一天以後＝新的夜盤已開始。
  if (!(day?.price != null && night.date < day.date)) return night;
  return { ...day, open: night.open ?? day.open, high: Math.max(day.high, night.high), low: Math.min(day.low, night.low), volume: (day.volume || 0) + (night.volume || 0) };
}

export const fetchMisFutures = async (session = 'day') => parseMisFutures(await fetchProxy('taifex-mis', { kind: 'futures', session }));

// ---- 台指選擇權（期交所 getQuoteList，代理壓成 [代號, 到期日, 成交價, 參考價, 買價, 賣價, 成交量]） ----

// 代號：TXO（月選）／TX1~TX5（週三）／TXU~TXZ（週五）+ 履約價 + 月份字母（A~L 買權 1~12 月、M~X 賣權 1~12 月）+ 年尾數 + -O。
// 週選的到期日寫在名稱裡（代理已取出）；月選沒寫，用 contractMonth 'YYYYMM' 算（taifexOptions.contractExpiry）。
// 回傳與 taifexOptions.parseTxoReport 同格式的列：{ contractMonth, expiry?, strike, type, last, bid, ask, settle(參考價), volume }。
export function parseMisOptions(list, today = new Date()) {
  const decade = Math.floor(today.getUTCFullYear() / 10) * 10;
  return (list || []).flatMap(([symbol, expiry, last, ref, bid, ask, volume]) => {
    const m = /^(TX[O0-9A-Z])(\d+)([A-X])(\d)-O$/.exec(symbol || '');
    if (!m) return [];
    const [, root, strike, letter, yearDigit] = m;
    const index = letter.charCodeAt(0) - 65;
    let year = decade + Number(yearDigit);
    if (year < today.getUTCFullYear() - 1) year += 10;
    const month = String((index % 12) + 1).padStart(2, '0');
    const expiryIso = expiry ? expiry.replaceAll('/', '-') : null;
    // 週選以到期日當序列代號（同月可能有好幾檔）；月選用 YYYYMM，和盤後檔一致。
    const contractMonth = root === 'TXO' ? `${year}${month}` : `${root}-${expiryIso}`;
    if (root !== 'TXO' && !expiryIso) return [];
    const lastPrice = num(last);
    return [{
      contractMonth,
      ...(root === 'TXO' ? {} : { expiry: expiryIso }),
      strike: Number(strike),
      type: index < 12 ? 'call' : 'put',
      last: lastPrice > 0 ? lastPrice : null,
      bid: num(bid) > 0 ? num(bid) : null,
      ask: num(ask) > 0 ? num(ask) : null,
      settle: num(ref) > 0 ? num(ref) : null,
      volume: num(volume)
    }];
  });
}

export const fetchMisOptions = async (session = 'day') => parseMisOptions(await fetchProxy('taifex-mis', { kind: 'options', session }));

// ---- 櫃買指數、台指 VIX、大盤每日成交金額 ----

const quoteOf = (row) => {
  const price = num(row?.price);
  const prevClose = num(row?.prevClose);
  if (price === null) return null;
  const change = prevClose !== null ? price - prevClose : null;
  return { price, prevClose, open: num(row.open), high: num(row.high), low: num(row.low), change, changePct: prevClose ? +((change / prevClose) * 100).toFixed(2) : null };
};

// { otc: 櫃買指數, vix: 台指 VIX }，各為 { price, prevClose, open, high, low, change, changePct } 或 null。
export async function fetchIndexExtras() {
  const [indices, vix] = await Promise.all([fetchProxy('tw-indices'), fetchProxy('taifex-vix')]);
  return { otc: quoteOf(indices.find((row) => row.ex === 'otc')), vix: quoteOf(vix) };
}

// 大盤每日成交金額（證交所，本月＋上月）：[{ date, amountYi }]。
export const fetchMarketAmountHistory = async () => (await fetchProxy('twse-market-amount', diskCacheEnabled('twse') ? { disk: 1 } : {}, 30000))
  .map(([date, amount]) => ({ date, amountYi: amount / 1e8 }));

// 期交所選擇權每日行情（收盤後用；代理只留 TXO 一般時段）。原始列交給 taifexOptions.parseTxoReport。
export const fetchTaifexOptionsDaily = () => fetchProxy('taifex-opt-daily', {}, 30000);
