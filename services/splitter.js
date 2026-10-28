// 可拖曳分隔線服務：提供左右欄位寬度調整並回傳解除綁定函式。
export function bindHorizontalSplitter(handle, options = {}) {
  // 段落說明：回傳清理函式，供頁面卸載時釋放資源。
  if (!handle) return () => {};

  // getValue：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const getValue = options.getValue || (() => 0);
  // setValue：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const setValue = options.setValue || (() => {});
  const min = Number.isFinite(options.min) ? options.min : 160;
  const max = Number.isFinite(options.max) ? options.max : Number.POSITIVE_INFINITY;
  const deltaSign = options.deltaSign === -1 ? -1 : 1;

  let dragging = false;
  let startX = 0;
  let startValue = 0;

  // stop：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const stop = () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', stop);
  };

  // onMove：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const onMove = (event) => {
    if (!dragging) return;
    const dx = (event.clientX - startX) * deltaSign;
    const next = Math.max(min, Math.min(max, startValue + dx));
    setValue(next);
    event.preventDefault();
  };

  // onDown：箭頭函式用途註解，用於此區塊內的回呼或輔助流程。
  const onDown = (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startValue = Number(getValue()) || 0;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    // 段落說明：綁定使用者互動事件。
    window.addEventListener('mousemove', onMove);
    // 段落說明：綁定使用者互動事件。
    window.addEventListener('mouseup', stop);
    event.preventDefault();
  };

  // 段落說明：綁定使用者互動事件。
  handle.addEventListener('mousedown', onDown);

  // 段落說明：回傳清理函式，供頁面卸載時釋放資源。
  return () => {
    handle.removeEventListener('mousedown', onDown);
    stop();
  };
}
