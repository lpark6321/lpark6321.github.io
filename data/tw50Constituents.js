// 台灣50成分資料：提供 Page6 市場地圖分組與權重比例。
export const TW50_DATA_DATE = '2026-04-17';
export const TW50_SOURCE_URL = 'https://www.wantgoo.com/stock/etf/0050/constituent';

export const TW50_MAJOR_GROUP_ORDER = ['電子', '金融', '傳產'];

export const TW50_CONSTITUENTS = [
  { code: '2330', name: '台積電', weightPct: 63.17, majorGroup: '電子', rank: 1 },
  { code: '2308', name: '台達電', weightPct: 3.93, majorGroup: '電子', rank: 2 },
  { code: '2317', name: '鴻海', weightPct: 3.37, majorGroup: '電子', rank: 3 },
  { code: '2454', name: '聯發科', weightPct: 3.23, majorGroup: '電子', rank: 4 },
  { code: '3711', name: '日月光投控', weightPct: 1.58, majorGroup: '電子', rank: 5 },
  { code: '2891', name: '中信金', weightPct: 1.34, majorGroup: '金融', rank: 6 },
  { code: '2345', name: '智邦', weightPct: 1.1, majorGroup: '電子', rank: 7 },
  { code: '2383', name: '台光電', weightPct: 1.09, majorGroup: '電子', rank: 8 },
  { code: '2382', name: '廣達', weightPct: 1.08, majorGroup: '電子', rank: 9 },
  { code: '2881', name: '富邦金', weightPct: 1.05, majorGroup: '金融', rank: 10 },
  { code: '2882', name: '國泰金', weightPct: 0.96, majorGroup: '金融', rank: 11 },
  { code: '2303', name: '聯電', weightPct: 0.96, majorGroup: '電子', rank: 12 },
  { code: '3017', name: '奇鋐', weightPct: 0.94, majorGroup: '電子', rank: 13 },
  { code: '2360', name: '致茂', weightPct: 0.79, majorGroup: '電子', rank: 14 },
  { code: '2887', name: '台新新光金', weightPct: 0.78, majorGroup: '金融', rank: 15 },
  { code: '2412', name: '中華電', weightPct: 0.74, majorGroup: '電子', rank: 16 },
  { code: '2884', name: '玉山金', weightPct: 0.71, majorGroup: '金融', rank: 17 },
  { code: '2885', name: '元大金', weightPct: 0.71, majorGroup: '金融', rank: 18 },
  { code: '2886', name: '兆豐金', weightPct: 0.66, majorGroup: '金融', rank: 19 },
  { code: '2890', name: '永豐金', weightPct: 0.57, majorGroup: '金融', rank: 20 },
  { code: '2357', name: '華碩', weightPct: 0.55, majorGroup: '電子', rank: 21 },
  { code: '3231', name: '緯創', weightPct: 0.55, majorGroup: '電子', rank: 22 },
  { code: '2327', name: '國巨*', weightPct: 0.55, majorGroup: '電子', rank: 23 },
  { code: '1303', name: '南亞', weightPct: 0.53, majorGroup: '傳產', rank: 24 },
  { code: '1216', name: '統一', weightPct: 0.51, majorGroup: '傳產', rank: 25 },
  { code: '6669', name: '緯穎', weightPct: 0.5, majorGroup: '電子', rank: 26 },
  { code: '3653', name: '健策', weightPct: 0.47, majorGroup: '電子', rank: 27 },
  { code: '2880', name: '華南金', weightPct: 0.45, majorGroup: '金融', rank: 28 },
  { code: '2892', name: '第一金', weightPct: 0.45, majorGroup: '金融', rank: 29 },
  { code: '2883', name: '凱基金', weightPct: 0.44, majorGroup: '金融', rank: 30 },
  { code: '2368', name: '金像電', weightPct: 0.43, majorGroup: '電子', rank: 31 },
  { code: '2449', name: '京元電子', weightPct: 0.42, majorGroup: '電子', rank: 32 },
  { code: '2344', name: '華邦電', weightPct: 0.41, majorGroup: '電子', rank: 33 },
  { code: '2301', name: '光寶科', weightPct: 0.4, majorGroup: '電子', rank: 34 },
  { code: '5880', name: '合庫金', weightPct: 0.36, majorGroup: '金融', rank: 35 },
  { code: '2408', name: '南亞科', weightPct: 0.33, majorGroup: '電子', rank: 36 },
  { code: '2603', name: '長榮', weightPct: 0.32, majorGroup: '傳產', rank: 37 },
  { code: '2002', name: '中鋼', weightPct: 0.31, majorGroup: '傳產', rank: 38 },
  { code: '3008', name: '大立光', weightPct: 0.3, majorGroup: '電子', rank: 39 },
  { code: '3661', name: '世芯-KY', weightPct: 0.29, majorGroup: '電子', rank: 40 },
  { code: '7769', name: '鴻勁', weightPct: 0.29, majorGroup: '電子', rank: 41 },
  { code: '1301', name: '台塑', weightPct: 0.28, majorGroup: '傳產', rank: 42 },
  { code: '2059', name: '川湖', weightPct: 0.26, majorGroup: '電子', rank: 43 },
  { code: '4904', name: '遠傳', weightPct: 0.24, majorGroup: '電子', rank: 44 },
  { code: '3045', name: '台灣大', weightPct: 0.23, majorGroup: '電子', rank: 45 },
  { code: '2395', name: '研華', weightPct: 0.21, majorGroup: '電子', rank: 46 },
  { code: '2207', name: '和泰車', weightPct: 0.2, majorGroup: '傳產', rank: 47 },
  { code: '6919', name: '康霈*', weightPct: 0.12, majorGroup: '傳產', rank: 48 },
  { code: '6505', name: '台塑化', weightPct: 0.1, majorGroup: '傳產', rank: 49 }
];

export const TW50_BY_CODE = Object.fromEntries(
  TW50_CONSTITUENTS.map((row) => [row.code, row])
);
