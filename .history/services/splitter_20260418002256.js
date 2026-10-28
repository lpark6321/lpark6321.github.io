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
