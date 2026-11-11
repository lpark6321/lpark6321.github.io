// 盤面摘要的計算（Page1 盤中資訊、Page2 市場概況共用）：個股對加權指數的貢獻點數、近 N 日平均。純函式，tests/ 直接測。

// 貢獻點數 ≈ 權重 × 漲跌幅 × 加權昨收（權重是設定檔裡的加權成分權重，日期較舊時會有些誤差）。
// quotes：有 taiexWeightPct 與 changePct 的報價列；回傳依貢獻由大到小排序的 [{ code, name, changePct, points }]。
export function indexContributions(quotes, indexPrevClose) {
  const base = Number(indexPrevClose);
  if (!(base > 0)) return [];
  return [...quotes]
    .filter((row) => Number(row.taiexWeightPct) > 0 && Number.isFinite(Number(row.changePct)))
    .map((row) => ({
      code: String(row.code),
      name: row.name,
      changePct: Number(row.changePct),
      weightPct: Number(row.taiexWeightPct),
      points: (Number(row.taiexWeightPct) / 100) * (Number(row.changePct) / 100) * base
    }))
    .sort((a, b) => b.points - a.points);
}

// 依權重取前 n 檔的貢獻合計與漲跌家數。
export function topWeightSummary(contributions, n = 20) {
  const top = [...contributions].sort((a, b) => b.weightPct - a.weightPct).slice(0, n);
  return {
    points: top.reduce((sum, row) => sum + row.points, 0),
    up: top.filter((row) => row.changePct > 0).length,
    down: top.filter((row) => row.changePct < 0).length,
    count: top.length
  };
}

// values 最後 n 筆的平均；不足 n 筆時用現有的，沒有回傳 null。
export function recentAverage(values, n = 20) {
  const list = values.filter(Number.isFinite).slice(-n);
  return list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : null;
}
