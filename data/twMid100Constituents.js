// 中型100成分資料：提供 Page6 市場地圖分組與權重比例。
export const MID100_DATA_DATE = '2026-04-17';
export const MID100_SOURCE_URL = 'https://www.wantgoo.com/stock/etf/0051/constituent';

export const MID100_MAJOR_GROUP_ORDER = ['電子', '金融', '航運', '傳產', '其他'];

const FINANCIAL_CODES = new Set(['5871', '2801', '5876', '2834', '2812', '2845', '2838']);
const SHIPPING_CODES = new Set(['2615', '2618', '2609', '2610', '2633', '2646', '2645']);
const OTHER_CODES = new Set(['6446', '6472', '1795', '2258']);

const ELECTRONIC_CODES = new Set([
  '3037', '3665', '2313', '2379', '3034', '3036', '6515', '3443', '3481', '3533',
  '3044', '4958', '4938', '2404', '3702', '6239', '2376', '2324', '8046', '2356',
  '3189', '6442', '6415', '2347', '6805', '2474', '2409', '2353', '2385', '3706',
  '6285', '2377', '8210', '3023', '5434', '2354', '6409', '7750', '6531', '6176',
  '2451', '5269', '3005', '6789', '6191', '7799', '6526'
]);

// resolveMid100Group：函式用途註解，說明此處封裝一段可重用的流程。
function resolveMid100Group(code) {
  if (FINANCIAL_CODES.has(code)) return '金融';
  if (SHIPPING_CODES.has(code)) return '航運';
  if (OTHER_CODES.has(code)) return '其他';
  if (ELECTRONIC_CODES.has(code)) return '電子';
  return '傳產';
}

const MID100_RAW = [
  { code: '3037', name: '欣興', weightPct: 5.46, rank: 1 },
  { code: '3665', name: '貿聯-KY', weightPct: 3.33, rank: 2 },
  { code: '2313', name: '華通', weightPct: 2.62, rank: 3 },
  { code: '2379', name: '瑞昱', weightPct: 2.48, rank: 4 },
  { code: '3034', name: '聯詠', weightPct: 2.33, rank: 5 },
  { code: '3036', name: '文曄', weightPct: 2.04, rank: 6 },
  { code: '6515', name: '穎崴', weightPct: 1.99, rank: 7 },
  { code: '3443', name: '創意', weightPct: 1.88, rank: 8 },
  { code: '3481', name: '群創', weightPct: 1.87, rank: 9 },
  { code: '3533', name: '嘉澤', weightPct: 1.85, rank: 10 },
  { code: '6770', name: '力積電', weightPct: 1.82, rank: 11 },
  { code: '6446', name: '藥華藥', weightPct: 1.8, rank: 12 },
  { code: '5871', name: '中租-KY', weightPct: 1.74, rank: 13 },
  { code: '1101', name: '台泥', weightPct: 1.63, rank: 14 },
  { code: '3044', name: '健鼎', weightPct: 1.61, rank: 15 },
  { code: '4958', name: '臻鼎-KY', weightPct: 1.61, rank: 16 },
  { code: '1326', name: '台化', weightPct: 1.6, rank: 17 },
  { code: '2801', name: '彰銀', weightPct: 1.6, rank: 18 },
  { code: '5876', name: '上海商銀', weightPct: 1.58, rank: 19 },
  { code: '4938', name: '和碩', weightPct: 1.56, rank: 20 },
  { code: '1590', name: '亞德客-KY', weightPct: 1.49, rank: 21 },
  { code: '2404', name: '漢唐', weightPct: 1.43, rank: 22 },
  { code: '3702', name: '大聯大', weightPct: 1.39, rank: 23 },
  { code: '6239', name: '力成', weightPct: 1.37, rank: 24 },
  { code: '2912', name: '統一超', weightPct: 1.27, rank: 25 },
  { code: '2376', name: '技嘉', weightPct: 1.27, rank: 26 },
  { code: '2324', name: '仁寶', weightPct: 1.21, rank: 27 },
  { code: '1519', name: '華城', weightPct: 1.2, rank: 28 },
  { code: '8046', name: '南電', weightPct: 1.18, rank: 29 },
  { code: '2615', name: '萬海', weightPct: 1.16, rank: 30 },
  { code: '2834', name: '臺企銀', weightPct: 1.13, rank: 31 },
  { code: '2356', name: '英業達', weightPct: 1.1, rank: 32 },
  { code: '3189', name: '景碩', weightPct: 1.07, rank: 33 },
  { code: '6442', name: '光聖', weightPct: 1.04, rank: 34 },
  { code: '1605', name: '華新', weightPct: 0.99, rank: 35 },
  { code: '6415', name: '矽力*-KY', weightPct: 0.99, rank: 36 },
  { code: '2347', name: '聯強', weightPct: 0.99, rank: 37 },
  { code: '2618', name: '長榮航', weightPct: 0.98, rank: 38 },
  { code: '2609', name: '陽明', weightPct: 0.97, rank: 39 },
  { code: '6805', name: '富世達', weightPct: 0.95, rank: 40 },
  { code: '2474', name: '可成', weightPct: 0.95, rank: 41 },
  { code: '2409', name: '友達', weightPct: 0.92, rank: 42 },
  { code: '6139', name: '亞翔', weightPct: 0.9, rank: 43 },
  { code: '1504', name: '東元', weightPct: 0.89, rank: 44 },
  { code: '1102', name: '亞泥', weightPct: 0.86, rank: 45 },
  { code: '1402', name: '遠東新', weightPct: 0.84, rank: 46 },
  { code: '2353', name: '宏碁', weightPct: 0.84, rank: 47 },
  { code: '2812', name: '台中銀', weightPct: 0.83, rank: 48 },
  { code: '2027', name: '大成鋼', weightPct: 0.79, rank: 49 },
  { code: '2385', name: '群光', weightPct: 0.73, rank: 50 },
  { code: '2049', name: '上銀', weightPct: 0.72, rank: 51 },
  { code: '3706', name: '神達', weightPct: 0.7, rank: 52 },
  { code: '8996', name: '高力', weightPct: 0.69, rank: 53 },
  { code: '9904', name: '寶成', weightPct: 0.68, rank: 54 },
  { code: '1476', name: '儒鴻', weightPct: 0.65, rank: 55 },
  { code: '6285', name: '啟碁', weightPct: 0.64, rank: 56 },
  { code: '2105', name: '正新', weightPct: 0.62, rank: 57 },
  { code: '2377', name: '微星', weightPct: 0.62, rank: 58 },
  { code: '8210', name: '勤誠', weightPct: 0.61, rank: 59 },
  { code: '1513', name: '中興電', weightPct: 0.6, rank: 60 },
  { code: '3023', name: '信邦', weightPct: 0.6, rank: 61 },
  { code: '8464', name: '億豐', weightPct: 0.59, rank: 62 },
  { code: '2633', name: '台灣高鐵', weightPct: 0.57, rank: 63 },
  { code: '1477', name: '聚陽', weightPct: 0.55, rank: 64 },
  { code: '2610', name: '華航', weightPct: 0.55, rank: 65 },
  { code: '5434', name: '崇越', weightPct: 0.55, rank: 66 },
  { code: '1802', name: '台玻', weightPct: 0.54, rank: 67 },
  { code: '2354', name: '鴻準', weightPct: 0.53, rank: 68 },
  { code: '6409', name: '旭隼', weightPct: 0.53, rank: 69 },
  { code: '2542', name: '興富發', weightPct: 0.51, rank: 70 },
  { code: '7750', name: '新代', weightPct: 0.49, rank: 71 },
  { code: '6531', name: '愛普*', weightPct: 0.49, rank: 72 },
  { code: '1503', name: '士電', weightPct: 0.48, rank: 73 },
  { code: '1229', name: '聯華', weightPct: 0.46, rank: 74 },
  { code: '6176', name: '瑞儀', weightPct: 0.44, rank: 75 },
  { code: '2451', name: '創見', weightPct: 0.42, rank: 76 },
  { code: '9945', name: '潤泰新', weightPct: 0.41, rank: 77 },
  { code: '5269', name: '祥碩', weightPct: 0.41, rank: 78 },
  { code: '3005', name: '神基', weightPct: 0.41, rank: 79 },
  { code: '2371', name: '大同', weightPct: 0.38, rank: 80 },
  { code: '9910', name: '豐泰', weightPct: 0.38, rank: 81 },
  { code: '2006', name: '東和鋼鐵', weightPct: 0.34, rank: 82 },
  { code: '2845', name: '遠東銀', weightPct: 0.33, rank: 83 },
  { code: '6789', name: '采鈺', weightPct: 0.33, rank: 84 },
  { code: '1319', name: '東陽', weightPct: 0.32, rank: 85 },
  { code: '6472', name: '保瑞', weightPct: 0.32, rank: 86 },
  { code: '2915', name: '潤泰全', weightPct: 0.31, rank: 87 },
  { code: '6781', name: 'AES-KY', weightPct: 0.31, rank: 88 },
  { code: '1795', name: '美時', weightPct: 0.29, rank: 89 },
  { code: '2646', name: '星宇航空', weightPct: 0.28, rank: 90 },
  { code: '6191', name: '精成科', weightPct: 0.26, rank: 91 },
  { code: '7799', name: '禾榮科', weightPct: 0.22, rank: 92 },
  { code: '2838', name: '聯邦銀', weightPct: 0.19, rank: 93 },
  { code: '2645', name: '長榮航太', weightPct: 0.18, rank: 94 },
  { code: '6526', name: '達發', weightPct: 0.18, rank: 95 },
  { code: '2539', name: '櫻花建', weightPct: 0.16, rank: 96 },
  { code: '8454', name: '富邦媒', weightPct: 0.16, rank: 97 },
  { code: '4583', name: '台灣精銳', weightPct: 0.09, rank: 98 },
  { code: '6890', name: '來億-KY', weightPct: 0.09, rank: 99 },
  { code: '2258', name: '鴻華先進-創', weightPct: 0.04, rank: 100 }
];

export const MID100_CONSTITUENTS = MID100_RAW.map((row) => ({
  ...row,
  majorGroup: resolveMid100Group(row.code)
}));

export const MID100_BY_CODE = Object.fromEntries(
  MID100_CONSTITUENTS.map((row) => [row.code, row])
);
