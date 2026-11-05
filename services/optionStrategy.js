// 選擇權策略計算（Page4，純計算不讀 store）：到期損益（元）、最大獲利／損失、損益兩平、鏈上取價、各腳 Greeks。
// 腳位格式 { type: 'call'|'put'|'future', action: 'buy'|'sell', strike, qty, premium, contract? }；期貨腳的 strike 是成交價。
import { TXO_POINT_VALUE, futuresPointValue } from '../data/twDerivatives.js';
import { bsGreeks, impliedVol, yearsToExpiry } from './blackScholes.js';

const sign = (leg) => (leg.action === 'buy' ? 1 : -1);

export function legPointValue(leg) {
  return leg.type === 'future' ? futuresPointValue(leg.contract) : TXO_POINT_VALUE;
}

// 到期時標的價格為 price 的總損益（新台幣）。
export function payoffAt(legs, price) {
  return legs.reduce((sum, leg) => {
    if (leg.type === 'future') return sum + sign(leg) * (price - leg.strike) * leg.qty * legPointValue(leg);
    const intrinsic = leg.type === 'call' ? Math.max(0, price - leg.strike) : Math.max(0, leg.strike - price);
    return sum + sign(leg) * (intrinsic - leg.premium) * leg.qty * TXO_POINT_VALUE;
  }, 0);
}

// 取樣到期損益曲線並算出統計。價格不會低於 0，所以下方有界；標的往上漲沒有上限，看最高價那一端的斜率判斷「無上限」。
export function analyzeStrategy(legs, spot, { range = 0.15, samples = 241 } = {}) {
  const minP = spot * (1 - range);
  const maxP = spot * (1 + range);
  const points = Array.from({ length: samples }, (_, i) => {
    const price = minP + (i / (samples - 1)) * (maxP - minP);
    return { price, pl: payoffAt(legs, price) };
  });
  if (!legs.length) return { points, maxProfit: null, maxLoss: null, profitUnbounded: false, lossUnbounded: false, breakevens: [], net: 0 };

  // 統計用更寬的區間（0 ~ 3 倍現價），避免極值落在圖的範圍外。
  const wide = Array.from({ length: 1201 }, (_, i) => (i / 1200) * spot * 3).concat(legs.map((leg) => leg.strike));
  const values = wide.map((price) => payoffAt(legs, price));
  const top = spot * 3;
  const slopeUp = payoffAt(legs, top + 1) - payoffAt(legs, top);
  const profitUnbounded = slopeUp > 1e-9;
  const lossUnbounded = slopeUp < -1e-9;

  const breakevens = [];
  const sorted = wide.map((price, i) => ({ price, pl: values[i] })).sort((a, b) => a.price - b.price);
  for (let i = 1; i < sorted.length; i += 1) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if ((a.pl < 0 && b.pl >= 0) || (a.pl > 0 && b.pl <= 0)) {
      const price = a.price + ((0 - a.pl) / (b.pl - a.pl)) * (b.price - a.price);
      if (!breakevens.some((p) => Math.abs(p - price) < 0.5)) breakevens.push(price);
    }
  }

  const net = legs.reduce((sum, leg) => sum + (leg.type === 'future' ? 0 : -sign(leg) * leg.premium * leg.qty * TXO_POINT_VALUE), 0);
  return {
    points,
    maxProfit: profitUnbounded ? null : Math.max(...values),
    maxLoss: lossUnbounded ? null : Math.min(...values),
    profitUnbounded,
    lossUnbounded,
    breakevens,
    net
  };
}

function chainRow(chain, type, strike) {
  return (type === 'call' ? chain.calls : chain.puts).find((row) => row.strike === strike) || null;
}

// 鏈上取價：買進用賣價(ask)、賣出用買價(bid)；盤後沒有買賣價時用結算價。取不到回傳 null。
export function chainPrice(chain, type, strike, action) {
  const row = chainRow(chain, type, strike);
  if (!row) return null;
  // 真資料用最後成交價；沒有成交（或示範資料）才看買賣價，再沒有用結算／參考價。
  if (Number(row.last) > 0) return Number(row.last);
  const quote = action === 'buy' ? row.ask : row.bid;
  if (Number.isFinite(Number(quote)) && quote > 0) return Number(quote);
  return Number.isFinite(Number(row.settle)) && row.settle > 0 ? Number(row.settle) : null;
}

// 理論計算用的權利金：成交價，沒有就用買賣價中間，再沒有用結算價。
function fairPrice(row) {
  if (row?.last > 0) return row.last;
  if (row && row.bid > 0 && row.ask > 0) return (row.bid + row.ask) / 2;
  return row?.settle > 0 ? row.settle : null;
}

// 每隻腳的 Greeks（新台幣）：Delta 元/點、Gamma 元/點²、Theta 元/日、Vega 元/波動率 1%；IV 是由權利金反推的隱含波動率。
export function legGreeks(leg, chain, spot = chain.spotPrice) {
  const scale = sign(leg) * leg.qty;
  if (leg.type === 'future') return { iv: null, delta: scale * legPointValue(leg), gamma: 0, theta: 0, vega: 0 };
  const t = yearsToExpiry(chain.expiry);
  const price = fairPrice(chainRow(chain, leg.type, leg.strike));
  const iv = price ? impliedVol(leg.type, price, spot, leg.strike, t) : null;
  const greeks = iv ? bsGreeks(leg.type, spot, leg.strike, t, iv) : null;
  if (!greeks) return { iv: null, delta: null, gamma: null, theta: null, vega: null };
  const money = scale * TXO_POINT_VALUE;
  return { iv, delta: greeks.delta * money, gamma: greeks.gamma * money, theta: greeks.theta * money, vega: greeks.vega * money };
}
