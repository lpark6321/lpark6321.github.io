// 全站唯一的節拍：依「更新頻率」設定定時通知訂閱者（marketFeed、C 區圖表、Data Lab）。
// 第一個訂閱者出現時才開始計時；改頻率時重排。
import { getPollIntervalMs, subscribePollInterval } from './dashboardDataSource.js';

const listeners = new Set();
let timer = null;

function tickAll() {
  listeners.forEach((listener) => listener());
}

// callback 在每個節拍呼叫一次（不帶參數）；回傳取消訂閱函式。
export function subscribeFeedTick(callback) {
  listeners.add(callback);
  if (!timer) {
    const schedule = (ms) => {
      clearInterval(timer);
      timer = setInterval(tickAll, ms);
    };
    schedule(getPollIntervalMs());
    subscribePollInterval(schedule);
  }
  return () => listeners.delete(callback);
}

// 手動更新：不等下一個節拍，立刻通知一次。
export function tickNow() {
  tickAll();
}
