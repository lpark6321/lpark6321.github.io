// Taiwan Stock Universe - static data
// Prices come from store.js (live/simulated)

export const TW_STOCK_UNIVERSE = [
  // ── 半導體 ──
  { code: '2330', name: '台積電', sector: '半導體', subSector: '晶圓代工', marketCap: 25000, isIn0050: true },
  { code: '2303', name: '聯電', sector: '半導體', subSector: '晶圓代工', marketCap: 580, isIn0050: true },
  { code: '2454', name: '聯發科', sector: '半導體', subSector: 'IC設計', marketCap: 1800, isIn0050: true },
  { code: '2379', name: '瑞昱', sector: '半導體', subSector: 'IC設計', marketCap: 320, isIn0050: false },
  { code: '2408', name: '南亞科', sector: '半導體', subSector: '記憶體', marketCap: 290, isIn0050: false },
  { code: '3711', name: '日月光', sector: '半導體', subSector: '封測', marketCap: 580, isIn0050: true },
  { code: '2449', name: '京元電子', sector: '半導體', subSector: '封測', marketCap: 110, isIn0050: false },
  { code: '3034', name: '聯詠', sector: '半導體', subSector: 'IC設計', marketCap: 280, isIn0050: false },
  { code: '6533', name: '矽力-KY', sector: '半導體', subSector: 'IC設計', marketCap: 200, isIn0050: false },

  // ── 電子零組件 ──
  { code: '2317', name: '鴻海', sector: '電子零組件', subSector: 'EMS', marketCap: 1800, isIn0050: true },
  { code: '2354', name: '鴻準', sector: '電子零組件', subSector: '機殼', marketCap: 145, isIn0050: false },
  { code: '2308', name: '台達電', sector: '電子零組件', subSector: '電源', marketCap: 680, isIn0050: true },
  { code: '2382', name: '廣達', sector: '電子零組件', subSector: 'ODM', marketCap: 650, isIn0050: true },
  { code: '2357', name: '華碩', sector: '電子零組件', subSector: '品牌PC', marketCap: 220, isIn0050: false },
  { code: '2353', name: '宏碁', sector: '電子零組件', subSector: '品牌PC', marketCap: 130, isIn0050: false },
  { code: '3231', name: '緯創', sector: '電子零組件', subSector: 'ODM', marketCap: 280, isIn0050: false },
  { code: '2324', name: '仁寶', sector: '電子零組件', subSector: 'ODM', marketCap: 185, isIn0050: false },

  // ── 金融 ──
  { code: '2891', name: '中信金', sector: '金融', subSector: '金控', marketCap: 620, isIn0050: true },
  { code: '2882', name: '國泰金', sector: '金融', subSector: '金控', marketCap: 680, isIn0050: true },
  { code: '2881', name: '富邦金', sector: '金融', subSector: '金控', marketCap: 720, isIn0050: true },
  { code: '2886', name: '兆豐金', sector: '金融', subSector: '金控', marketCap: 420, isIn0050: true },
  { code: '2884', name: '玉山金', sector: '金融', subSector: '金控', marketCap: 320, isIn0050: false },
  { code: '2885', name: '元大金', sector: '金融', subSector: '金控', marketCap: 290, isIn0050: false },
  { code: '2887', name: '台新金', sector: '金融', subSector: '金控', marketCap: 240, isIn0050: false },
  { code: '2890', name: '永豐金', sector: '金融', subSector: '金控', marketCap: 180, isIn0050: false },
  { code: '5880', name: '合庫金', sector: '金融', subSector: '金控', marketCap: 310, isIn0050: false },

  // ── 傳產 ──
  { code: '1301', name: '台塑', sector: '傳產', subSector: '石化', marketCap: 480, isIn0050: true },
  { code: '1303', name: '南亞', sector: '傳產', subSector: '石化', marketCap: 430, isIn0050: true },
  { code: '1326', name: '台化', sector: '傳產', subSector: '石化', marketCap: 320, isIn0050: true },
  { code: '1101', name: '台泥', sector: '傳產', subSector: '水泥', marketCap: 195, isIn0050: false },
  { code: '1216', name: '統一', sector: '傳產', subSector: '食品', marketCap: 285, isIn0050: false },
  { code: '2207', name: '和泰車', sector: '傳產', subSector: '汽車', marketCap: 175, isIn0050: false },

  // ── 光電 ──
  { code: '2395', name: '研華', sector: '光電', subSector: '工控', marketCap: 185, isIn0050: false },
  { code: '3008', name: '大立光', sector: '光電', subSector: '鏡頭', marketCap: 640, isIn0050: true },
  { code: '2412', name: '中華電', sector: '光電', subSector: '電信', marketCap: 580, isIn0050: true },

  // ── 航運 ──
  { code: '2603', name: '長榮', sector: '航運', subSector: '貨運', marketCap: 480, isIn0050: true },
  { code: '2609', name: '陽明', sector: '航運', subSector: '貨運', marketCap: 280, isIn0050: false },
  { code: '2615', name: '萬海', sector: '航運', subSector: '貨運', marketCap: 190, isIn0050: false },

  // ── 傳媒 ──
  { code: '2891', name: '中信金', sector: '金融', subSector: '金控', marketCap: 320, isIn0050: false },

  // ── ETF ──
  { code: '0050', name: '元大台灣50', sector: 'ETF', subSector: '寬基', marketCap: 3200, isIn0050: false },
  { code: '0056', name: '元大高股息', sector: 'ETF', subSector: '高息', marketCap: 1800, isIn0050: false },
  { code: '00878', name: '國泰永續', sector: 'ETF', subSector: 'ESG', marketCap: 1200, isIn0050: false },
  { code: '006208', name: '富邦台50', sector: 'ETF', subSector: '寬基', marketCap: 580, isIn0050: false },
]

// Sector display order (controls left-to-right rendering priority)
export const SECTOR_ORDER = ['半導體', '電子零組件', '金融', '傳產', '光電', '航運', 'ETF']

// Sector accent colors (for sector header background)
export const SECTOR_COLORS = {
  '半導體': '#1a2840',
  '電子零組件': '#1a2030',
  '金融': '#1a2820',
  '傳產': '#2a2010',
  '光電': '#20202a',
  '航運': '#102025',
  'ETF': '#202028',
}
