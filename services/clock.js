// 全域時鐘服務：用單一 timer 廣播目前時間，避免各元件重複建立計時器。
const listeners = new Set();
let timer = null;

// startClock：函式用途註解，說明此處封裝一段可重用的流程。
export function startClock(intervalMs = 1000) {
  if (timer) return;
  // 段落說明：建立定時更新流程。
  timer = setInterval(() => {
    const now = new Date();
    listeners.forEach((cb) => cb(now));
  }, intervalMs);
}

// stopClock：函式用途註解，說明此處封裝一段可重用的流程。
export function stopClock() {
  if (!timer) return;
  // 段落說明：清除定時器，避免頁面卸載後繼續執行。
  clearInterval(timer);
  timer = null;
}

// subscribeClock：函式用途註解，說明此處封裝一段可重用的流程。
export function subscribeClock(callback) {
  listeners.add(callback);
  callback(new Date());
  return () => listeners.delete(callback);
}
