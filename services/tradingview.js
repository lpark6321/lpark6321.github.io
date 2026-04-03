let scriptPromise = null;

export function loadTradingViewScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.TradingView) {
      resolve(window.TradingView);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => resolve(window.TradingView);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function mountTradingView(container, options = {}) {
  await loadTradingViewScript();
  if (!window.TradingView || !container) return () => {};
  const node = document.createElement('div');
  node.style.width = '100%';
  node.style.height = '100%';
  container.appendChild(node);
  new window.TradingView.widget({
    autosize: true,
    symbol: options.symbol || 'TWSE:TAIEX',
    interval: options.interval || 'D',
    timezone: 'Asia/Taipei',
    theme: 'dark',
    style: '1',
    locale: 'zh_TW',
    container_id: node.id = `tv-${Date.now()}`
  });
  return () => node.remove();
}
