// TradingView 相關掛載入口：保留 widget 分頁，並回匯自有 Lightweight Charts 掛載函式。
import { mountMarketChart } from './marketChart.js';

let tradingViewScriptPromise = null;

// loadTradingViewScript：函式用途註解，說明此處封裝一段可重用的流程。
export function loadTradingViewScript() {
  if (tradingViewScriptPromise) return tradingViewScriptPromise;

  tradingViewScriptPromise = new Promise((resolve, reject) => {
    if (window.TradingView) {
      resolve(window.TradingView);
      return;
    }

    // 段落說明：建立新的 DOM 節點。
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => resolve(window.TradingView);
    script.onerror = () => reject(new Error('TradingView script failed to load'));
    // 段落說明：將建立好的節點掛回頁面。
    document.head.appendChild(script);
  });

  return tradingViewScriptPromise;
}

// mountTradingViewWidget：函式用途註解，說明此處封裝一段可重用的流程。
export async function mountTradingViewWidget(container, options = {}) {
  // 段落說明：回傳清理函式，供頁面卸載時釋放資源。
  if (!container) return () => {};
  const TradingView = await loadTradingViewScript();
  // 段落說明：回傳清理函式，供頁面卸載時釋放資源。
  if (!TradingView?.widget) return () => {};

  // 段落說明：建立此區塊的 DOM 結構。
  container.innerHTML = '';
  // 段落說明：建立新的 DOM 節點。
  const node = document.createElement('div');
  node.id = `tv-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  node.style.cssText = 'width:100%;height:100%;min-height:360px;';
  // 段落說明：將建立好的節點掛回頁面。
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

  // 段落說明：回傳清理函式，供頁面卸載時釋放資源。
  return () => {
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    if (typeof widget.remove === 'function') widget.remove();
    // 段落說明：移除 DOM 節點或釋放畫面資源。
    node.remove();
  };
}

// Backward-compatible names used by older page code.
export { mountMarketChart, mountMarketChart as mountLightweightChart };
export const mountTradingView = mountTradingViewWidget;
