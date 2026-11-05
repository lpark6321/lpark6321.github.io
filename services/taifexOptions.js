// 台指選擇權鏈：期交所盤後檔（DailyMarketReportOpt）的解析，以及盤後檔／期交所 MIS（misQuotes.parseMisOptions）共用的到期序列與組鏈。
// 純計算，不抓資料、不碰 DOM。鏈的格式同 store.optionsChain：{ underlying, spotPrice, expiry, calls: [{ strike, last, bid, ask, settle }], puts }。
// 價格一律看成交價（last）；沒有成交時 optionStrategy.chainPrice 才退回買賣價或結算／參考價。
import { TW_MARKET_HOLIDAYS } from '../data/twMarketHolidays.js';

// 期交所缺值是 '-' 或空字串；不是數字一律當 null。
const num = (value) => (/^-?\d+(\.\d+)?$/.test(String(value ?? '').trim()) ? Number(value) : null);

const CALL_PUT = { 買權: 'call', 賣權: 'put' };

// 只留 TXO、指定盤別（'一般' 日盤 / '盤後' 夜盤）的列，欄位轉成數字。
export function parseTxoReport(json, { session = '一般' } = {}) {
  return (json || [])
    .filter((row) => row.Contract === 'TXO' && row.TradingSession === session && CALL_PUT[row.CallPut])
    .map((row) => ({
      contractMonth: String(row['ContractMonth(Week)']).trim(),
      strike: num(row.StrikePrice),
      type: CALL_PUT[row.CallPut],
      bid: num(row.BestBid),
      ask: num(row.BestAsk),
      settle: num(row.SettlementPrice),
      last: num(row.Close) ?? num(row.Last),
      volume: num(row.Volume),
      openInterest: num(row.OpenInterest)
    }))
    .filter((row) => row.strike !== null);
}

const iso = (date) => date.toISOString().slice(0, 10);

// 該月第 n 個星期 weekday（0=日 … 3=三、5=五）。
function nthWeekday(year, month, weekday, n) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return new Date(Date.UTC(year, month - 1, 1 + ((weekday - firstDay + 7) % 7) + (n - 1) * 7));
}

// 遇週末或休市日往後順延到下一個交易日。
// shortcut: 只看證交所休市日表（TW_MARKET_HOLIDAYS），表內沒有的年份不順延；期交所臨時公告（如颱風停市）的到期日異動不會反映。
function nextTradingDay(date) {
  const d = new Date(date);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || TW_MARKET_HOLIDAYS.has(iso(d))) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// '202611' 月選＝第三個星期三；'202611W2' 週三選＝該月第 2 個星期三；'202611F1' 週五選＝該月第 1 個星期五。
export function contractExpiry(code) {
  const m = /^(\d{4})(\d{2})(?:([WF])(\d))?$/.exec(String(code).trim());
  if (!m) return null;
  const [, year, month, letter, n] = m;
  const date = letter
    ? nthWeekday(Number(year), Number(month), letter === 'W' ? 3 : 5, Number(n))
    : nthWeekday(Number(year), Number(month), 3, 3);
  return iso(nextTradingDay(date));
}

const KIND = { W: 'week-wed', F: 'week-fri' };

// 序列的到期日：列上有就用（MIS 週選），否則由代號推算。
const seriesExpiry = (rows, contractMonth) => rows.find((row) => row.contractMonth === contractMonth && row.expiry)?.expiry || contractExpiry(contractMonth);

// 週三／週五依到期日的星期判斷（MIS 週選代號不是 W/F 格式）。
function expiryKind(contractMonth, expiry) {
  if (KIND[contractMonth[6]]) return KIND[contractMonth[6]];
  if (/^\d{6}$/.test(contractMonth)) return 'month';
  return new Date(`${expiry}T00:00:00Z`).getUTCDay() === 5 ? 'week-fri' : 'week-wed';
}

// 資料裡出現的所有到期序列，依到期日排序。
export function listExpiries(rows) {
  const codes = [...new Set(rows.map((row) => row.contractMonth))];
  return codes
    .map((contractMonth) => {
      const expiry = seriesExpiry(rows, contractMonth);
      return { contractMonth, expiry, kind: expiry ? expiryKind(contractMonth, expiry) : 'month' };
    })
    .filter((item) => item.expiry)
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.contractMonth.localeCompare(b.contractMonth));
}

// 挑還沒到期（到期日當天仍算）的最近一檔；prefer='month' 只挑月選。找不到回傳 null。
export function pickExpiry(expiries, today, prefer = 'nearest') {
  return expiries.find((item) => item.expiry >= today && (prefer !== 'month' || item.kind === 'month')) || null;
}

// 組出某到期序列的選擇權鏈；spotPrice 有值時只留價平上下各 range 檔履約價。
export function buildChain(rows, contractMonth, spotPrice, { range = 15 } = {}) {
  const series = rows.filter((row) => row.contractMonth === contractMonth);
  let strikes = [...new Set(series.map((row) => row.strike))].sort((a, b) => a - b);
  if (Number.isFinite(spotPrice) && strikes.length) {
    const atm = strikes.reduce((best, s, i) => (Math.abs(s - spotPrice) < Math.abs(strikes[best] - spotPrice) ? i : best), 0);
    strikes = strikes.slice(Math.max(0, atm - range), atm + range + 1);
  }
  const keep = new Set(strikes);
  const side = (type) => series
    .filter((row) => row.type === type && keep.has(row.strike))
    .sort((a, b) => a.strike - b.strike)
    .map(({ strike, last, bid, ask, settle }) => ({ strike, last: last ?? null, bid, ask, settle }));
  return { underlying: 'TX', spotPrice, expiry: seriesExpiry(rows, contractMonth), calls: side('call'), puts: side('put') };
}
