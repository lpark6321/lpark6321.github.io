const listeners = new Set();
let timer = null;

export function startClock(intervalMs = 1000) {
  if (timer) return;
  timer = setInterval(() => {
    const now = new Date();
    listeners.forEach((cb) => cb(now));
  }, intervalMs);
}

export function stopClock() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export function subscribeClock(callback) {
  listeners.add(callback);
  callback(new Date());
  return () => listeners.delete(callback);
}
