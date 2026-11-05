// 高 DPI canvas：依 devicePixelRatio 放大 backing store，之後以 CSS px 座標繪圖（Windows 125%/150% 才不會糊）。
// 尺寸沒變就不重設 width/height（重設會清空畫布並重配記憶體），呼叫端每次重畫前自己 clearRect。回傳 2D context。
export function setupHiDpiCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  const backingW = Math.round(width * dpr);
  const backingH = Math.round(height * dpr);
  if (canvas.width !== backingW) canvas.width = backingW;
  if (canvas.height !== backingH) canvas.height = backingH;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
