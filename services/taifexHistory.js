// 期交所盤後資料（「公開資料」來源，經本機代理）：台指期歷史日 K（近月、日盤／全日盤）、三大法人持倉成本。
// 解析與計算都是純函式（tests/ 直接測）；fetch* 經代理取資料。
import { fetchProxy } from './chipMonitor.js';

// 日 K 的時間用台北 09:00（和 Yahoo 日 K 一樣），dateKeyFromUnix 換回日期不會跨日。
const dateToUnix = (iso) => Date.parse(`${iso}T01:00:00Z`) / 1000;

// 代理回傳的列：[日期, 契約月份, 'day'|'night', 開, 高, 低, 收, 量, 結算價]（夜盤列的日期是它所屬的交易日，即隔一個交易日）。
export const fetchFuturesHistory = (months = 2) => fetchProxy('taifex-fut-history', { months }, { disk: 'futures' });

const toRow = ([date, contract, session, open, high, low, close, volume, settle]) => ({ date, contract, session, open, high, low, close, volume, settle });

// 每個交易日的近月契約＝當天日盤列裡最小的契約月份（結算日當天還是到期的那一檔）。
function nearByDate(rows) {
  const near = new Map();
  rows.filter((row) => row.session === 'day').forEach((row) => {
    if (!near.has(row.date) || row.contract < near.get(row.date)) near.set(row.date, row.contract);
  });
  return near;
}

// 近月連續日 K：session 'day' 只用日盤；'full' 是夜盤＋日盤（開＝夜盤開、收＝日盤收、高低取兩段）。
export function buildFuturesDaily(raw, session = 'day') {
  const rows = (raw || []).map(toRow);
  const near = nearByDate(rows);
  const byDate = new Map();
  rows.filter((row) => near.get(row.date) === row.contract && (session === 'full' || row.session === 'day')).forEach((row) => {
    const list = byDate.get(row.date) || [];
    list.push(row);
    byDate.set(row.date, list);
  });
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([date, list]) => {
    const day = list.find((row) => row.session === 'day');
    if (!day) return [];
    const night = list.find((row) => row.session === 'night');
    return [{
      time: dateToUnix(date),
      date,
      contract: day.contract,
      open: night?.open ?? day.open,
      high: Math.max(day.high, night?.high ?? -Infinity),
      low: Math.min(day.low, night?.low ?? Infinity),
      close: day.close,
      settle: day.settle,
      volume: (day.volume || 0) + (night?.volume || 0)
    }];
  });
}

// ---- 三大法人臺股期貨持倉成本 ----

export const INSTITUTIONS = { foreign: '外資', trust: '投信', dealer: '自營商' };
const POINT_VALUE = 200;

// 代理回傳的列：[日期, 身份, 交易淨口數, 交易淨額(千元), 未平倉淨口數, 未平倉淨額(千元)]。
export const fetchInstitutional = (days = 365) => fetchProxy('taifex-inst', { days, commodity: 'TXF' }, { disk: 'institutional', timeout: 120000 });

// 該日期所屬的結算月：月結算日（第三個星期三）當天起算到下次結算日前一天，回傳起算月份 'YYYY-MM'。
// shortcut: 結算日遇假日順延沒處理，遇到時那一個月會差一天。
export function settlementCycle(iso) {
  const first = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  const third = 15 + ((3 - first.getUTCDay() + 7) % 7);
  if (Number(iso.slice(8, 10)) >= third) return iso.slice(0, 7);
  first.setUTCMonth(first.getUTCMonth() - 1);
  return first.toISOString().slice(0, 7);
}

// 依日期逐日累計淨部位的平均成本（玩股網「持倉成本」同一種概念）：每個結算月從結算日當天重新起算
// （11/10 回推比對玩股網：從 10/21 結算日起算差 25 點，是兩個月內最接近的起算日）。
// 每天的部位變化＝未平倉淨口數的變化，價格用當天淨交易的均價（淨額÷口數÷200；沒有淨交易用未平倉市值的均價）。
// 同方向加碼→加權平均；減碼→成本不變；翻轉→新部位用當天價格。回傳每天 { date, netOI, change, cost, price }。
export function buildPositionCost(raw, identity) {
  const rows = (raw || []).filter((row) => row[1] === identity);
  const result = [];
  let pos = 0;
  let cost = null;
  rows.forEach(([date, , tradeQty, tradeAmt, netOI, netAmt], index) => {
    const oiPrice = netOI ? (netAmt * 1000) / (netOI * POINT_VALUE) : null;
    const tradePrice = tradeQty ? (tradeAmt * 1000) / (tradeQty * POINT_VALUE) : null;
    const price = tradePrice ?? oiPrice;
    if (index === 0 || settlementCycle(date) !== settlementCycle(rows[index - 1][0])) {
      pos = netOI;
      cost = oiPrice;
    } else {
      const change = netOI - pos;
      if (change && price != null) {
        if (!pos || cost == null || Math.sign(change) === Math.sign(pos)) {
          cost = ((cost ?? price) * Math.abs(pos) + price * Math.abs(change)) / Math.abs(netOI);
        } else if (Math.abs(change) > Math.abs(pos)) {
          cost = price;
        }
      }
      pos = netOI;
      if (!pos) cost = null;
    }
    result.push({ time: dateToUnix(date), date, netOI, change: index ? netOI - (result[index - 1]?.netOI ?? netOI) : 0, cost, price: oiPrice });
  });
  return result;
}
