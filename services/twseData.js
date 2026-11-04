// 證交所盤後資料（Page5 選股、全上市股名）：本益比／殖利率／股價淨值比 + 當日開高低收量，經本機代理取得，合併成一檔一列。
// 只收上市股票（以有本益比資料的代碼為準，ETF 不在內）。
import { yahooProxyUrl } from './yahooApi.js';

const TWSE_TIMEOUT_MS = 20000;

// 證交所欄位是字串，空字串、'--' 都算沒有值；數字可能帶千分位。
function num(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text || text === '--') return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

// 民國日期 '1151103' → '2026-11-03'。
function rocToIso(value) {
  const text = String(value || '');
  if (!/^\d{7}$/.test(text)) return '';
  return `${Number(text.slice(0, 3)) + 1911}-${text.slice(3, 5)}-${text.slice(5, 7)}`;
}

async function fetchDataset(endpoint) {
  const url = yahooProxyUrl(endpoint);
  url.searchParams.set('_ts', String(Date.now()));
  const response = await fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(TWSE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${endpoint} returned no rows`);
  return rows;
}

// 回傳 { date, rows }：date 是資料日期（'YYYY-MM-DD'），rows 每列 { code, name, pe, dividendYield, pb, open, high, low, price, change, changePct, volume(張) }。
export async function fetchTwseDaily() {
  const [valuation, daily] = await Promise.all([fetchDataset('twse-valuation'), fetchDataset('twse-daily')]);
  const dailyByCode = new Map(daily.map((row) => [row.Code, row]));
  const rows = valuation.map((row) => {
    const day = dailyByCode.get(row.Code) || {};
    const price = num(day.ClosingPrice);
    const change = num(day.Change);
    const prevClose = price != null && change != null ? price - change : null;
    const shares = num(day.TradeVolume);
    return {
      code: row.Code,
      name: row.Name,
      pe: num(row.PEratio),
      dividendYield: num(row.DividendYield),
      pb: num(row.PBratio),
      open: num(day.OpeningPrice),
      high: num(day.HighestPrice),
      low: num(day.LowestPrice),
      price,
      change,
      changePct: prevClose ? +((change / prevClose) * 100).toFixed(2) : null,
      volume: shares == null ? null : Math.round(shares / 1000)
    };
  });
  return { date: rocToIso(daily[0]?.Date || valuation[0]?.Date), rows };
}
