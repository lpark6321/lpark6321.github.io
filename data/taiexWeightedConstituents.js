export const TAIEX_DATA_DATE = '2026-03-31';
export const TAIEX_SOURCE_URL = 'https://www.taifex.com.tw/cht/2/weightedPriceIndex';
export const TAIEX_COMPONENT_SOURCE_URL = 'https://www.taifex.com.tw/cht/2/weightedPropertion';

// 僅保留 0.1% 以上個股（第 101 名 0.0978% 已低於門檻）
export const TAIEX_STOCK_THRESHOLD = 0.1;
export const TAIEX2_STOCK_THRESHOLD = 0.01;

// 來源：TAIFEX weightedPriceIndex 產業分類及比重（資料日期 2026/03/31）
export const TAIEX_SECTOR_WEIGHTS = [
  { name: '半導體業', weightPct: 54.2005 },
  { name: '電子零組件業', weightPct: 9.5226 },
  { name: '金融保險', weightPct: 8.5033 },
  { name: '電腦及週邊設備業', weightPct: 5.1880 },
  { name: '其他電子業', weightPct: 4.4689 },
  { name: '通信網路業', weightPct: 3.1042 },
  { name: '航運業', weightPct: 1.6079 },
  { name: '電機機械', weightPct: 1.3793 },
  { name: '光電業', weightPct: 1.2889 },
  { name: '塑膠工業', weightPct: 1.2703 },
  { name: '生技醫療業', weightPct: 0.8460 },
  { name: '建材營造', weightPct: 0.8285 },
  { name: '電子通路業', weightPct: 0.7782 },
  { name: '食品工業', weightPct: 0.7506 },
  { name: '其他', weightPct: 0.7305 },
  { name: '鋼鐵工業', weightPct: 0.7262 },
  { name: '汽車工業', weightPct: 0.6682 },
  { name: '油電燃氣業', weightPct: 0.5997 },
  { name: '紡織纖維', weightPct: 0.4707 },
  { name: '化學工業', weightPct: 0.4429 },
  { name: '運動休閒', weightPct: 0.4266 },
  { name: '貿易百貨', weightPct: 0.3643 },
  { name: '水泥工業', weightPct: 0.3366 },
  { name: '綠能環保', weightPct: 0.2684 },
  { name: '電器電纜', weightPct: 0.2520 },
  { name: '橡膠工業', weightPct: 0.2096 },
  { name: '玻璃陶瓷', weightPct: 0.1615 },
  { name: '居家生活', weightPct: 0.1447 },
  { name: '觀光餐旅', weightPct: 0.1356 },
  { name: '造紙工業', weightPct: 0.1228 },
  { name: '數位雲端', weightPct: 0.1032 },
  { name: '資訊服務業', weightPct: 0.0994 }
];

// 規則：只取 1% 以上產業為獨立分區，其餘全部歸入「其他」
export const TAIEX_PRIMARY_SECTORS = TAIEX_SECTOR_WEIGHTS
  .filter((row) => row.weightPct >= 1 && row.name !== '其他')
  .map((row) => row.name);

export const TAIEX_WEIGHTED_SECTOR_ORDER = [...TAIEX_PRIMARY_SECTORS, '其他'];

const PRIMARY_SECTOR_SET = new Set(TAIEX_PRIMARY_SECTORS);
export const TAIEX_OTHER_SECTOR_WEIGHT = +TAIEX_SECTOR_WEIGHTS
  .filter((row) => !PRIMARY_SECTOR_SET.has(row.name))
  .reduce((sum, row) => sum + row.weightPct, 0)
  .toFixed(4);

// 加權2：前 19 大產業（不含原始「其他」）+ 其餘併到「其他」
export const TAIEX2_PRIMARY_SECTORS = [...TAIEX_SECTOR_WEIGHTS]
  .filter((row) => row.name !== '其他')
  .sort((a, b) => b.weightPct - a.weightPct)
  .slice(0, 19)
  .map((row) => row.name);

export const TAIEX2_WEIGHTED_SECTOR_ORDER = [...TAIEX2_PRIMARY_SECTORS, '其他'];

const PRIMARY2_SECTOR_SET = new Set(TAIEX2_PRIMARY_SECTORS);
export const TAIEX2_OTHER_SECTOR_WEIGHT = +TAIEX_SECTOR_WEIGHTS
  .filter((row) => row.name === '其他' || !PRIMARY2_SECTOR_SET.has(row.name))
  .reduce((sum, row) => sum + row.weightPct, 0)
  .toFixed(4);

const YAHOO_SECTOR_BY_TAIEX_SECTOR = {
  半導體業: '半導體',
  電子零組件業: '電子零組件',
  金融保險: '金融',
  電腦及週邊設備業: '電腦及週邊設備',
  其他電子業: '其他電子業',
  通信網路業: '通信網路業',
  航運業: '航運',
  電機機械: '電機機械',
  光電業: '光電',
  塑膠工業: '塑膠工業',
  其他: '其他'
};

const STOCK_SECTOR_BY_CODE = {
  // 半導體業
  '2330': '半導體業',
  '2454': '半導體業',
  '3711': '半導體業',
  '2303': '半導體業',
  '2408': '半導體業',
  '2344': '半導體業',
  '2449': '半導體業',
  '3443': '半導體業',
  '6515': '半導體業',
  '2379': '半導體業',
  '3034': '半導體業',
  '6770': '半導體業',
  '2337': '半導體業',
  '3661': '半導體業',
  '6239': '半導體業',
  '6415': '半導體業',

  // 電子零組件業
  '2308': '電子零組件業',
  '2383': '電子零組件業',
  '3017': '電子零組件業',
  '3037': '電子零組件業',
  '3653': '電子零組件業',
  '2327': '電子零組件業',
  '2368': '電子零組件業',
  '3665': '電子零組件業',
  '2313': '電子零組件業',
  '2059': '電子零組件業',
  '3533': '電子零組件業',
  '4958': '電子零組件業',
  '3044': '電子零組件業',
  '3189': '電子零組件業',
  '6805': '電子零組件業',
  '8210': '電子零組件業',

  // 金融保險
  '2881': '金融保險',
  '2882': '金融保險',
  '2891': '金融保險',
  '2885': '金融保險',
  '2887': '金融保險',
  '2886': '金融保險',
  '2884': '金融保險',
  '2880': '金融保險',
  '2890': '金融保險',
  '2892': '金融保險',
  '5880': '金融保險',
  '2883': '金融保險',
  '2801': '金融保險',
  '5876': '金融保險',
  '5871': '金融保險',
  '2834': '金融保險',
  '2812': '金融保險',

  // 電腦及週邊設備業
  '2382': '電腦及週邊設備業',
  '6669': '電腦及週邊設備業',
  '2357': '電腦及週邊設備業',
  '3231': '電腦及週邊設備業',
  '2395': '電腦及週邊設備業',
  '2376': '電腦及週邊設備業',
  '2356': '電腦及週邊設備業',
  '2324': '電腦及週邊設備業',

  // 其他電子業
  '2317': '其他電子業',
  '2360': '其他電子業',
  '7769': '其他電子業',
  '2301': '其他電子業',
  '2404': '其他電子業',
  '4938': '其他電子業',
  '2474': '其他電子業',

  // 通信網路業
  '2412': '通信網路業',
  '2345': '通信網路業',
  '3045': '通信網路業',
  '4904': '通信網路業',
  '6442': '通信網路業',

  // 航運業
  '2603': '航運業',
  '2615': '航運業',
  '2618': '航運業',
  '2609': '航運業',
  '2610': '航運業',

  // 電機機械
  '1519': '電機機械',
  '1590': '電機機械',
  '1504': '電機機械',

  // 光電業
  '3008': '光電業',
  '3481': '光電業',
  '2409': '光電業',

  // 塑膠工業
  '1303': '塑膠工業',
  '1301': '塑膠工業',
  '1326': '塑膠工業'
};

const TAIEX_WEIGHTED_RAW = [
  { rank: 1, code: '2330', name: '台積電', weightPct: 44.2978 },
  { rank: 2, code: '2308', name: '台達電', weightPct: 3.4791 },
  { rank: 3, code: '2317', name: '鴻海', weightPct: 2.5412 },
  { rank: 4, code: '2454', name: '聯發科', weightPct: 2.3195 },
  { rank: 5, code: '3711', name: '日月光投控', weightPct: 1.4179 },
  { rank: 6, code: '2881', name: '富邦金', weightPct: 1.1692 },
  { rank: 7, code: '2382', name: '廣達', weightPct: 1.0441 },
  { rank: 8, code: '2412', name: '中華電', weightPct: 1.0014 },
  { rank: 9, code: '2882', name: '國泰金', weightPct: 1.0009 },
  { rank: 10, code: '2891', name: '中信金', weightPct: 0.9798 },
  { rank: 11, code: '2383', name: '台光電', weightPct: 0.9042 },
  { rank: 12, code: '2345', name: '智邦', weightPct: 0.8223 },
  { rank: 13, code: '3017', name: '奇鋐', weightPct: 0.7546 },
  { rank: 14, code: '2303', name: '聯電', weightPct: 0.6903 },
  { rank: 15, code: '3037', name: '欣興', weightPct: 0.6797 },
  { rank: 16, code: '7769', name: '鴻勁', weightPct: 0.6121 },
  { rank: 17, code: '2360', name: '致茂', weightPct: 0.6047 },
  { rank: 18, code: '2408', name: '南亞科', weightPct: 0.5970 },
  { rank: 19, code: '6669', name: '緯穎', weightPct: 0.5952 },
  { rank: 20, code: '2885', name: '元大金', weightPct: 0.5790 },
  { rank: 21, code: '1303', name: '南亞', weightPct: 0.5688 },
  { rank: 22, code: '2887', name: '台新新光金', weightPct: 0.5587 },
  { rank: 23, code: '2886', name: '兆豐金', weightPct: 0.5536 },
  { rank: 24, code: '3653', name: '健策', weightPct: 0.5336 },
  { rank: 25, code: '6505', name: '台塑化', weightPct: 0.5094 },
  { rank: 26, code: '2884', name: '玉山金', weightPct: 0.4984 },
  { rank: 27, code: '2327', name: '國巨*', weightPct: 0.4899 },
  { rank: 28, code: '2880', name: '華南金', weightPct: 0.4484 },
  { rank: 29, code: '2890', name: '永豐金', weightPct: 0.4318 },
  { rank: 30, code: '2368', name: '金像電', weightPct: 0.4261 },
  { rank: 31, code: '2603', name: '長榮', weightPct: 0.4192 },
  { rank: 32, code: '2357', name: '華碩', weightPct: 0.3958 },
  { rank: 33, code: '2344', name: '華邦電', weightPct: 0.3940 },
  { rank: 34, code: '3045', name: '台灣大', weightPct: 0.3939 },
  { rank: 35, code: '2892', name: '第一金', weightPct: 0.3936 },
  { rank: 36, code: '1216', name: '統一', weightPct: 0.3915 },
  { rank: 37, code: '3231', name: '緯創', weightPct: 0.3781 },
  { rank: 38, code: '5880', name: '合庫金', weightPct: 0.3569 },
  { rank: 39, code: '3665', name: '貿聯-KY', weightPct: 0.3293 },
  { rank: 40, code: '8046', name: '南電', weightPct: 0.3274 },
  { rank: 41, code: '2883', name: '凱基金', weightPct: 0.3171 },
  { rank: 42, code: '2301', name: '光寶科', weightPct: 0.3159 },
  { rank: 43, code: '4904', name: '遠傳', weightPct: 0.3134 },
  { rank: 44, code: '2449', name: '京元電子', weightPct: 0.3097 },
  { rank: 45, code: '2059', name: '川湖', weightPct: 0.2937 },
  { rank: 46, code: '2002', name: '中鋼', weightPct: 0.2886 },
  { rank: 47, code: '2313', name: '華通', weightPct: 0.2869 },
  { rank: 48, code: '1301', name: '台塑', weightPct: 0.2836 },
  { rank: 49, code: '3443', name: '創意', weightPct: 0.2816 },
  { rank: 50, code: '3008', name: '大立光', weightPct: 0.2792 },
  { rank: 51, code: '2395', name: '研華', weightPct: 0.2675 },
  { rank: 52, code: '3036', name: '文曄', weightPct: 0.2663 },
  { rank: 53, code: '2207', name: '和泰車', weightPct: 0.2614 },
  { rank: 54, code: '1326', name: '台化', weightPct: 0.2557 },
  { rank: 55, code: '6515', name: '穎崴', weightPct: 0.2501 },
  { rank: 56, code: '1519', name: '華城', weightPct: 0.2413 },
  { rank: 57, code: '2379', name: '瑞昱', weightPct: 0.2392 },
  { rank: 58, code: '2801', name: '彰銀', weightPct: 0.2330 },
  { rank: 59, code: '2912', name: '統一超', weightPct: 0.2265 },
  { rank: 60, code: '3034', name: '聯詠', weightPct: 0.2241 },
  { rank: 61, code: '3533', name: '嘉澤', weightPct: 0.2239 },
  { rank: 62, code: '6446', name: '藥華藥', weightPct: 0.2211 },
  { rank: 63, code: '6770', name: '力積電', weightPct: 0.2178 },
  { rank: 64, code: '2337', name: '旺宏', weightPct: 0.2165 },
  { rank: 65, code: '4958', name: '臻鼎-KY', weightPct: 0.2146 },
  { rank: 66, code: '2615', name: '萬海', weightPct: 0.2100 },
  { rank: 67, code: '4938', name: '和碩', weightPct: 0.1984 },
  { rank: 68, code: '1590', name: '亞德客-KY', weightPct: 0.1928 },
  { rank: 69, code: '3661', name: '世芯-KY', weightPct: 0.1907 },
  { rank: 70, code: '3481', name: '群創', weightPct: 0.1849 },
  { rank: 71, code: '5876', name: '上海商銀', weightPct: 0.1840 },
  { rank: 72, code: '5871', name: '中租-KY', weightPct: 0.1819 },
  { rank: 73, code: '2618', name: '長榮航', weightPct: 0.1779 },
  { rank: 74, code: '2609', name: '陽明', weightPct: 0.1762 },
  { rank: 75, code: '3044', name: '健鼎', weightPct: 0.1727 },
  { rank: 76, code: '1101', name: '台泥', weightPct: 0.1679 },
  { rank: 77, code: '3189', name: '景碩', weightPct: 0.1601 },
  { rank: 78, code: '2404', name: '漢唐', weightPct: 0.1519 },
  { rank: 79, code: '1802', name: '台玻', weightPct: 0.1465 },
  { rank: 80, code: '2376', name: '技嘉', weightPct: 0.1447 },
  { rank: 81, code: '6442', name: '光聖', weightPct: 0.1440 },
  { rank: 82, code: '3702', name: '大聯大', weightPct: 0.1434 },
  { rank: 83, code: '2834', name: '臺企銀', weightPct: 0.1415 },
  { rank: 84, code: '2356', name: '英業達', weightPct: 0.1394 },
  { rank: 85, code: '1504', name: '東元', weightPct: 0.1384 },
  { rank: 86, code: '6239', name: '力成', weightPct: 0.1378 },
  { rank: 87, code: '1402', name: '遠東新', weightPct: 0.1366 },
  { rank: 88, code: '6919', name: '康霈*', weightPct: 0.1302 },
  { rank: 89, code: '1605', name: '華新', weightPct: 0.1297 },
  { rank: 90, code: '2347', name: '聯強', weightPct: 0.1227 },
  { rank: 91, code: '2812', name: '台中銀', weightPct: 0.1201 },
  { rank: 92, code: '6139', name: '亞翔', weightPct: 0.1197 },
  { rank: 93, code: '1102', name: '亞泥', weightPct: 0.1194 },
  { rank: 94, code: '6805', name: '富世達', weightPct: 0.1164 },
  { rank: 95, code: '2324', name: '仁寶', weightPct: 0.1153 },
  { rank: 96, code: '2474', name: '可成', weightPct: 0.1081 },
  { rank: 97, code: '2409', name: '友達', weightPct: 0.1062 },
  { rank: 98, code: '6415', name: '矽力*-KY', weightPct: 0.1060 },
  { rank: 99, code: '2610', name: '華航', weightPct: 0.1057 },
  { rank: 100, code: '8210', name: '勤誠', weightPct: 0.1055 }
];

function resolveSector(code) {
  return STOCK_SECTOR_BY_CODE[code] || '其他';
}

function resolveYahooSector(taiexSector) {
  return YAHOO_SECTOR_BY_TAIEX_SECTOR[taiexSector] || '其他';
}

export const TAIEX_WEIGHTED_CONSTITUENTS = TAIEX_WEIGHTED_RAW.map((row) => {
  const sector = resolveSector(row.code);
  return {
    ...row,
    sector,
    yahooSector: resolveYahooSector(sector)
  };
});

export const TAIEX_BY_CODE = Object.fromEntries(
  TAIEX_WEIGHTED_CONSTITUENTS.map((row) => [row.code, row])
);
