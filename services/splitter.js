// 可拖曳分隔線服務：提供左右欄位寬度調整並回傳解除綁定函式。
export function bindHorizontalSplitter(handle, options = {}) {
  if (!handle) return () => {};

  const getValue = options.getValue || (() => 0);
  const setValue = options.setValue || (() => {});
  const min = Number.isFinite(options.min) ? options.min : 160;
  const max = Number.isFinite(options.max) ? options.max : Number.POSITIVE_INFINITY;
  const deltaSign = options.deltaSign === -1 ? -1 : 1;

  let dragging = false;
  let startX = 0;
  let startValue = 0;

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', stop);
  };

  const onMove = (event) => {
    if (!dragging) return;
    const dx = (event.clientX - startX) * deltaSign;
    const next = Math.max(min, Math.min(max, startValue + dx));
    setValue(next);
    event.preventDefault();
  };

  const onDown = (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startValue = Number(getValue()) || 0;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    event.preventDefault();
  };

  handle.addEventListener('mousedown', onDown);

  return () => {
    handle.removeEventListener('mousedown', onDown);
    stop();
  };
}

// 各頁的欄寬都存在版面元素的 CSS 變數（例如 --p1-left-w）：拖曳時讀目前寬度、寫回變數。
export function bindCssVarSplitter(handle, el, varName, { fallback = 320, ...options } = {}) {
  return bindHorizontalSplitter(handle, {
    ...options,
    getValue: () => {
      const value = parseFloat(getComputedStyle(el).getPropertyValue(varName));
      return Number.isFinite(value) ? value : fallback;
    },
    setValue: (px) => el.style.setProperty(varName, `${px}px`)
  });
}
