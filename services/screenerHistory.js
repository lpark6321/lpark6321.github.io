// 選股用日 K（Yahoo，經本機 proxy）：使用者執行含技術指標條件的篩選時才抓，每檔在台北交易日內快取，收盤後依 isDailyRefreshDue 重抓。
import { getDashboardDataSource } from './dashboardDataSource.js';
import { isDailyRefreshDue } from './marketCalendar.js';
import { fetchStockDaily } from './marketSources.js';

const FETCH_CONCURRENCY = 4;
const dailyByCode = new Map();

// 日 K 走 Yahoo proxy，只有 yahoo（公開資料）來源才能用。
export const screenerHistoryAvailable = () => getDashboardDataSource() === 'yahoo';


// 回傳 Map(code → 日 K)；抓不到的是空陣列。onProgress(done, total) 只算這次真的要抓的檔數。
export async function loadScreenerCandles(codes, onProgress = () => {}) {
  const due = codes.filter((code) => {
    const entry = dailyByCode.get(code);
    return isDailyRefreshDue(entry?.fetchedAt, Date.now(), entry?.failedAt);
  });
  let cursor = 0;
  let done = 0;
  if (due.length) onProgress(0, due.length);
  const worker = async () => {
    while (cursor < due.length) {
      const code = due[cursor];
      cursor += 1;
      const candles = await fetchStockDaily(code);
      // 抓不到記下失敗時間，一分鐘後才重試；舊的日 K 先留著用。
      dailyByCode.set(code, candles.length
        ? { candles, fetchedAt: Date.now(), failedAt: 0 }
        : { candles: dailyByCode.get(code)?.candles || [], fetchedAt: Date.now(), failedAt: Date.now() });
      done += 1;
      onProgress(done, due.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, due.length) }, worker));
  return new Map(codes.map((code) => [code, dailyByCode.get(code)?.candles || []]));
}
