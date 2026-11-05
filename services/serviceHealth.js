// 外部服務連得上嗎（標頭顯示用）：取資料的地方經 trackedFetch 發請求，連不上就記下來；標頭只列出目前連不上的服務。
// 只看「連不連得上」：服務有回應但回 HTTP 錯誤算連得上（例如代理開著但 Yahoo 擋請求），由各自的錯誤訊息處理。
const health = new Map();
const listeners = new Set();

export const SERVICE_LABELS = {
  proxy: 'Yahoo 代理（8787）',
  bridge: '券商橋接',
  twse: '證交所'
};

export function reportHealth(service, ok) {
  const previous = health.get(service);
  health.set(service, ok);
  if (previous !== ok) listeners.forEach((callback) => callback());
}

// 回傳目前連不上的服務名稱清單。
export function failingServices() {
  return [...health].filter(([, ok]) => !ok).map(([service]) => service);
}

export function subscribeHealth(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// fetch 本身失敗（服務沒開、逾時）記為連不上；拿到任何回應就是連得上。
export async function trackedFetch(service, url, init) {
  try {
    const response = await fetch(url, init);
    reportHealth(service, true);
    return response;
  } catch (error) {
    reportHealth(service, false);
    throw error;
  }
}
