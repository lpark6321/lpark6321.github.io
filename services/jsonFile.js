// 檔案匯出／匯入（自選股、選擇權策略、設定備份、選股結果共用）。內容驗證由呼叫端負責（例如 sanitizeWatchlist、sanitizeLegs）。

export function downloadJson(filename, data) {
  downloadText(filename, JSON.stringify(data, null, 2), 'application/json');
}

// CSV 前面加 BOM，Excel 直接開才不會變亂碼。
export function downloadCsv(filename, csvText) {
  downloadText(filename, `\uFEFF${csvText}`, 'text/csv;charset=utf-8');
}

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// 讀入使用者選的檔案，必須是 JSON 陣列；不是就丟例外，訊息給畫面顯示。
export async function readJsonArrayFile(file) {
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data)) throw new Error('檔案內容不是 JSON 陣列');
  return data;
}

// 開一個隱藏的檔案選擇框，選好檔案後呼叫 onFile(file)；回傳開啟函式。
export function createFilePicker(onFile, accept = 'application/json,.json') {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = ''; // 清空才能再次選同一個檔案
    if (file) await onFile(file);
  });
  const open = () => input.click();
  open.destroy = () => input.remove();
  return open;
}
