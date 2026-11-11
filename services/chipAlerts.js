// 籌碼提醒（純函式，回傳要送進通知中心的一則或 null）：外資台指期淨未平倉單日大增減、盤中預估成交金額爆量。
import { recentAverage } from './marketOverview.js';

export const CHIP_ALERT_RULES = {
  foreignOiChange: 5000, // 口（大台）
  amountRatio: 1.5, // 預估成交金額 ÷ 20 日均量
  amountFromMinute: 9 * 60 + 30 // 開盤半小時內預估量不準，09:30 後才判斷
};

const signed = (value) => `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString('en-US')}`;

// rows：三大法人持倉成本的外資列 [{ date, netOI, change }]（store institutional.foreign）。
export function foreignOiNotice(rows, rules = CHIP_ALERT_RULES) {
  const last = rows?.at(-1);
  if (!last || !(Math.abs(last.change) >= rules.foreignOiChange)) return null;
  return {
    kind: 'chips',
    title: `外資台指期淨未平倉 ${signed(last.change)} 口`,
    body: `${last.date} 淨部位 ${signed(last.netOI)} 口`,
    key: `chips|foreign-oi|${last.date}`
  };
}

// taiex：{ volEstimate(億) }；history：[{ date, amountYi }]（不含今天的列才算均量）；today 'YYYY-MM-DD'、minute 台北當日分鐘。
export function amountNotice(taiex, history, today, minute, rules = CHIP_ALERT_RULES) {
  if (minute < rules.amountFromMinute || !(taiex?.volEstimate > 0)) return null;
  const avg = recentAverage((history || []).filter((row) => row.date < today).map((row) => row.amountYi), 20);
  if (!avg || taiex.volEstimate < avg * rules.amountRatio) return null;
  return {
    kind: 'chips',
    title: `預估成交金額 ${Math.round(taiex.volEstimate).toLocaleString('en-US')} 億`,
    body: `是 20 日均量 ${Math.round(avg).toLocaleString('en-US')} 億的 ${(taiex.volEstimate / avg).toFixed(2)} 倍`,
    key: `chips|amount|${today}`
  };
}
