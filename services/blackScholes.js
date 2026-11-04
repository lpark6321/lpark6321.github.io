// Black-Scholes（歐式選擇權，台指選擇權適用）：理論價、由權利金反推隱含波動率、Greeks。純計算，不讀 store。
// t 為距到期年數、r 為無風險利率（年化、連續複利）、sigma 為年化波動率。

const DEFAULT_RATE = 0.015;

// 標準常態累積分配（Abramowitz–Stegun 7.1.26 近似，誤差 < 1e-7）。
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * poly;
  return x >= 0 ? 1 - tail : tail;
}

function normPdf(x) {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

function d1d2(spot, strike, t, sigma, r) {
  const d1 = (Math.log(spot / strike) + (r + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
  return [d1, d1 - sigma * Math.sqrt(t)];
}

export function bsPrice(type, spot, strike, t, sigma, r = DEFAULT_RATE) {
  if (t <= 0 || sigma <= 0) return Math.max(0, type === 'call' ? spot - strike : strike - spot);
  const [d1, d2] = d1d2(spot, strike, t, sigma, r);
  const discount = strike * Math.exp(-r * t);
  return type === 'call'
    ? spot * normCdf(d1) - discount * normCdf(d2)
    : discount * normCdf(-d2) - spot * normCdf(-d1);
}

// 二分法反推隱含波動率；權利金低於內含價值或高於上限時回傳 null。
export function impliedVol(type, price, spot, strike, t, r = DEFAULT_RATE) {
  if (!(price > 0) || !(t > 0)) return null;
  let low = 0.001;
  let high = 5;
  if (price < bsPrice(type, spot, strike, t, low, r) || price > bsPrice(type, spot, strike, t, high, r)) return null;
  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    if (bsPrice(type, spot, strike, t, mid, r) > price) high = mid;
    else low = mid;
    if (high - low < 1e-6) break;
  }
  return (low + high) / 2;
}

// Delta、Gamma（每點）、Theta（每日）、Vega（波動率每 1%）。
export function bsGreeks(type, spot, strike, t, sigma, r = DEFAULT_RATE) {
  if (!(t > 0) || !(sigma > 0)) return null;
  const [d1, d2] = d1d2(spot, strike, t, sigma, r);
  const sqrtT = Math.sqrt(t);
  const discount = strike * Math.exp(-r * t);
  const thetaYear = type === 'call'
    ? -spot * normPdf(d1) * sigma / (2 * sqrtT) - r * discount * normCdf(d2)
    : -spot * normPdf(d1) * sigma / (2 * sqrtT) + r * discount * normCdf(-d2);
  return {
    delta: type === 'call' ? normCdf(d1) : normCdf(d1) - 1,
    gamma: normPdf(d1) / (spot * sigma * sqrtT),
    theta: thetaYear / 365,
    vega: spot * normPdf(d1) * sqrtT / 100
  };
}

// 'YYYY-MM-DD' 到期日（台指選擇權 13:30 收盤）→ 距今年數；已到期回傳 0。
export function yearsToExpiry(expiry, now = Date.now()) {
  const end = Date.parse(`${expiry}T13:30:00+08:00`);
  return Number.isFinite(end) ? Math.max(0, (end - now) / (365 * 24 * 3600 * 1000)) : 0;
}
