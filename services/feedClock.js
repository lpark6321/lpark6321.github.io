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

// 每秒時鐘：各頁的時鐘、倒數與標頭的台股狀態共用一個計時器，沒有訂閱者就停。callback 收到當下的 Date。
const secondListeners = new Set();
let secondTimer = null;

export function subscribeSecond(callback) {
  secondListeners.add(callback);
  secondTimer ??= setInterval(() => {
    const now = new Date();
    secondListeners.forEach((listener) => {
      try {
        listener(now);
      } catch (error) {
        console.error('[feedClock] second listener failed:', error);
      }
    });
  }, 1000);
  return () => {
    secondListeners.delete(callback);
    if (!secondListeners.size) {
      clearInterval(secondTimer);
      secondTimer = null;
    }
  };
}

// 手動更新：不等下一個節拍，立刻通知一次。
export function tickNow() {
  tickAll();
}
