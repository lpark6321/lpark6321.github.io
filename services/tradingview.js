// TradingView widget 掛載入口（Page1 C 區 TradingView 分頁）。

let tradingViewScriptPromise = null;

export function loadTradingViewScript() {
  if (tradingViewScriptPromise) return tradingViewScriptPromise;

  tradingViewScriptPromise = new Promise((resolve, reject) => {
    if (window.TradingView) {
      resolve(window.TradingView);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => resolve(window.TradingView);
    script.onerror = () => {
      // 載入失敗不快取，下次掛載時重試（例如筆電剛喚醒、網路尚未連上）。
      tradingViewScriptPromise = null;
      script.remove();
      reject(new Error('TradingView script failed to load'));
    };
    document.head.appendChild(script);
  });

  return tradingViewScriptPromise;
}

export async function mountTradingViewWidget(container, options = {}) {
  if (!container) return () => {};
  const TradingView = await loadTradingViewScript();
  // 載入期間頁面可能已卸載（容器已離開 DOM）：不要再建立 widget。
  if (!TradingView?.widget || !container.isConnected) return () => {};

  container.innerHTML = '';
  const node = document.createElement('div');
  node.id = `tv-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  node.style.cssText = 'width:100%;height:100%;min-height:360px;';
  container.appendChild(node);

  const widget = new TradingView.widget({
    autosize: true,
    symbol: options.symbol || 'INDEX:TWII',
    interval: options.interval || options.timeframe || 'D',
    timezone: 'Asia/Taipei',
    theme: options.theme || 'dark',
    style: options.style || '1',
    locale: 'zh_TW',
    enable_publishing: false,
    hide_side_toolbar: false,
    allow_symbol_change: true,
    container_id: node.id
  });

  return () => {
    if (typeof widget.remove === 'function') widget.remove();
    node.remove();
  };
}
