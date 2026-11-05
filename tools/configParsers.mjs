// 設定檔原始檔的解析函式（tools/rebuild-config.mjs 與 tests/ 共用）。輸入原始檔文字，輸出設定檔用的資料；不讀寫檔案。

// 證交所上市公司基本資料（t187ap03_L）的產業別代碼 → 產業名稱（與期交所加權指數產業分類同名）。
export const INDUSTRY_NAMES = {
  '01': '水泥工業', '02': '食品工業', '03': '塑膠工業', '04': '紡織纖維', '05': '電機機械', '06': '電器電纜',
  '08': '玻璃陶瓷', '09': '造紙工業', '10': '鋼鐵工業', '11': '橡膠工業', '12': '汽車工業', '14': '建材營造',
  '15': '航運業', '16': '觀光餐旅', '17': '金融保險', '18': '貿易百貨', '20': '其他', '21': '化學工業',
  '22': '生技醫療業', '23': '油電燃氣業', '24': '半導體業', '25': '電腦及週邊設備業', '26': '光電業',
  '27': '通信網路業', '28': '電子零組件業', '29': '電子通路業', '30': '資訊服務業', '31': '其他電子業',
  '35': '綠能環保', '36': '數位雲端', '37': '運動休閒', '38': '居家生活', '91': '存託憑證'
};

const num = (value) => {
  const text = String(value ?? '').replace(/,/g, '').trim();
  return text === '' || text === '--' ? NaN : Number(text);
};
const round = (value, digits) => +value.toFixed(digits);

// 'YYYYMMDD' 或民國 'YYYMMDD' → 'YYYY-MM-DD'。
export function toIsoDate(text) {
  const digits = String(text).replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  if (digits.length === 7) return `${Number(digits.slice(0, 3)) + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
  return '';
}

// 證交所「市場開休市日期」：rwd 格式 { data: [[日期, 名稱, 說明]] } 或 OpenAPI 格式 [{ Date, Name }]。
// 回傳平日的休市日 [[日期, 名稱]]，依日期排序（不含「開始交易」「最後交易」這種有交易的日子；週末本來就不開市，不列）。
export function parseHolidays(json) {
  const rows = Array.isArray(json) ? json.map((row) => [row.Date, row.Name]) : (json?.data || []);
  const byDate = new Map();
  rows
    .filter(([, name]) => !/開始交易|最後交易/.test(String(name)))
    .forEach(([date, name]) => {
      const iso = toIsoDate(date);
      if (iso && ![0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay()) && !byDate.has(iso)) byDate.set(iso, String(name ?? '').trim());
    });
  return [...byDate].sort(([a], [b]) => a.localeCompare(b));
}

// 證交所 t187ap03_L → { 代碼: 產業名稱 }。
export function parseIndustry(json) {
  return Object.fromEntries((json || []).map((row) => [String(row['公司代號']).trim(), INDUSTRY_NAMES[row['產業別']] || '其他']));
}

// 期交所「臺灣證券交易所 發行量加權股價指數成分股暨市值比重」頁（futuresQADetail）。
// 表格每列有 a、b 兩組：排行、代碼、名稱、比重。回傳 { dataDate, rows: [{ rank, code, name, weightPct }] }。
export function parseTaiexWeightsHtml(html) {
  const cells = [...html.matchAll(/<td[^>]*headers=["']?(rank|name|propertion)_([ab])["']?[^>]*>([\s\S]*?)<\/td>/g)]
    .map(([, kind, side, inner]) => ({ kind, side, text: inner.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() }));
  const current = { a: null, b: null };
  const rows = [];
  cells.forEach(({ kind, side, text }) => {
    if (kind === 'rank') {
      current[side] = { rank: Number(text), fields: [] };
      return;
    }
    const row = current[side];
    if (!row) return;
    if (kind === 'name') row.fields.push(text);
    if (kind === 'propertion') {
      const [code, name] = row.fields;
      const weightPct = num(text.replace('%', ''));
      if (code && Number.isFinite(row.rank) && Number.isFinite(weightPct)) rows.push({ rank: row.rank, code, name, weightPct });
      current[side] = null;
    }
  });
  const date = html.replace(/<[^>]*>/g, ' ').match(/資料日期[:：]\s*(\d{4})\/(\d{2})\/(\d{2})/);
  return { dataDate: date ? `${date[1]}-${date[2]}-${date[3]}` : '', rows: rows.sort((x, y) => x.rank - y.rank) };
}

// 加權指數：全部成分股依產業別加總成產業權重；個股只保留權重 ≥ keepPct 的（市場地圖與報價清單用）。
export function buildTaiex({ rows, dataDate }, industry, keepPct = 0.1) {
  const withSector = rows.map((row) => ({ ...row, sector: industry[row.code] || '其他' }));
  const sectorTotals = new Map();
  withSector.forEach((row) => sectorTotals.set(row.sector, (sectorTotals.get(row.sector) || 0) + row.weightPct));
  return {
    dataDate,
    sectorWeights: [...sectorTotals.entries()].map(([name, weight]) => ({ name, weightPct: round(weight, 4) })).sort((a, b) => b.weightPct - a.weightPct),
    constituents: withSector.filter((row) => row.weightPct >= keepPct).map(({ rank, code, name, weightPct, sector }) => ({ rank, code, name, weightPct, sector }))
  };
}

// 成分股 CSV（台灣50、中型100、摩台）：第一列欄位名稱 code,name,weightPct[,majorGroup]，依檔案順序當排名。
export function parseConstituentCsv(text) {
  const [header, ...lines] = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#'));
  const keys = header.split(',').map((key) => key.trim());
  return lines.map((line, index) => {
    const values = line.split(',').map((value) => value.trim());
    const row = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
    return { rank: index + 1, code: row.code, name: row.name, weightPct: num(row.weightPct), ...(row.majorGroup ? { majorGroup: row.majorGroup } : {}) };
  }).filter((row) => row.code && Number.isFinite(row.weightPct));
}

// 舊版量能權重表 CSV（時間,加權,標準差）→ [[當日秒數, 倍數, 標準差]]。
export function parseLegacyVolumeWeights(text) {
  return text.replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map((line) => {
    const [time, weight, stddev] = line.split(',').map((cell) => cell.trim());
    const [hh, mm, ss = 0] = time.split(':').map(Number);
    return [hh * 3600 + mm * 60 + Number(ss), Number(weight), Number(stddev)];
  }).filter((row) => row.every(Number.isFinite));
}

// 證交所「每 5 秒委託成交統計」（MI_5MINS，rwd 格式）→ [[當日秒數, 累積成交金額]]。
export function parseFiveSecondStats(json) {
  return (json?.data || []).map((row) => {
    const [hh, mm, ss] = String(row[0]).split(':').map(Number);
    return [hh * 3600 + mm * 60 + ss, num(row[7])];
  }).filter(([second, value]) => Number.isFinite(second) && Number.isFinite(value));
}

// 量能權重：每個 5 秒時點的倍數 = 當天收盤累積成交金額 ÷ 該時點累積成交金額，跨多天取平均與標準差。
// 預估全日量 = 目前累積量 × 該時點倍數。days 是每天的 [[秒數, 累積金額]]。
export function buildVolumeWeights(days) {
  const samples = new Map();
  days.forEach((rows) => {
    const final = rows.at(-1)?.[1];
    if (!(final > 0)) return;
    rows.forEach(([second, value]) => {
      if (!(value > 0)) return;
      if (!samples.has(second)) samples.set(second, []);
      samples.get(second).push(final / value);
    });
  });
  return [...samples.entries()].sort((a, b) => a[0] - b[0]).map(([second, values]) => {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
    return [second, round(mean, 8), round(sd, 8)];
  });
}

// 量能權重的期間選項：最近幾個交易日。
export const VOLUME_PERIODS = { month: 20, quarter: 60, year: 250, all: Infinity };
