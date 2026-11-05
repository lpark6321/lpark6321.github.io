// 設定檔原始檔的解析（tools/configParsers.mjs）：用小段手寫資料，不讀 data/config/source/ 的大檔。
import assert from 'node:assert/strict';
import {
  buildTaiex,
  buildVolumeWeights,
  parseConstituentCsv,
  parseFiveSecondStats,
  parseHolidays,
  parseIndustry,
  parseLegacyVolumeWeights,
  parseTaiexWeightsHtml,
  toIsoDate
} from '../tools/configParsers.mjs';

assert.equal(toIsoDate('20261105'), '2026-11-05');
assert.equal(toIsoDate('1151105'), '2026-11-05', '民國年');
assert.equal(toIsoDate('abc'), '');

// 休市表：排除「開始交易／最後交易」與週末，同日只留一筆
assert.deepEqual(parseHolidays({ data: [
  ['2026-01-01', '中華民國開國紀念日', ''],
  ['2026-01-02', '國曆新年開始交易日', ''],
  ['2026-02-11', '農曆春節前最後交易日', ''],
  ['2026-02-12', '市場無交易，僅辦理結算交割作業', ''],
  ['2026-02-15', '農曆除夕及春節', ''],
  ['2026-01-01', '重複', '']
] }), [['2026-01-01', '中華民國開國紀念日'], ['2026-02-12', '市場無交易，僅辦理結算交割作業']]);
assert.deepEqual(parseHolidays([{ Date: '1151225', Name: '行憲紀念日' }]), [['2026-12-25', '行憲紀念日']], 'OpenAPI 格式');

assert.deepEqual(parseIndustry([{ 公司代號: '2330 ', 產業別: '24' }, { 公司代號: '9999', 產業別: 'XX' }]), { 2330: '半導體業', 9999: '其他' });

// 期交所權重頁：資料日期與每列（左右兩欄）
const html = `<p>資料日期： 2026/10/30</p><table>
<tr><td headers="rank_a">1</td><td headers="name_a">2330</td><td headers="name_a">台積電</td><td headers="propertion_a">40.1234%</td>
<td headers="rank_b">2</td><td headers="name_b">2454</td><td headers="name_b">聯發科</td><td headers="propertion_b">3.5%</td></tr>
<tr><td headers="rank_a">3</td><td headers="name_a">1101</td><td headers="name_a">台泥</td><td headers="propertion_a">0.05%</td></tr></table>`;
const weights = parseTaiexWeightsHtml(html);
assert.equal(weights.dataDate, '2026-10-30');
assert.deepEqual(weights.rows.map((row) => [row.rank, row.code, row.weightPct]), [[1, '2330', 40.1234], [2, '2454', 3.5], [3, '1101', 0.05]]);

const taiex = buildTaiex(weights, { 2330: '半導體業', 2454: '半導體業', 1101: '水泥工業' }, 0.1);
assert.equal(taiex.constituents.length, 2, '低於門檻的不留');
assert.equal(taiex.constituents[0].sector, '半導體業');
assert.deepEqual(taiex.sectorWeights.map((row) => row.name), ['半導體業', '水泥工業'], '產業權重用全部成分股');
assert.equal(taiex.sectorWeights[0].weightPct, 43.6234);

assert.deepEqual(parseConstituentCsv('code,name,weightPct,majorGroup\n2330,台積電,63.17,電子\n2881,富邦金,2.1,金融\n').map((row) => [row.rank, row.code, row.weightPct, row.majorGroup]),
  [[1, '2330', 63.17, '電子'], [2, '2881', 2.1, '金融']]);

assert.deepEqual(parseLegacyVolumeWeights('\uFEFF時間,加權,標準差\n09:00:00,0.5,0\n09:00:05,2,0.1\n'), [[32400, 0.5, 0], [32405, 2, 0.1]]);

// 量能權重：倍數 = 收盤累積成交金額 ÷ 該時點累積成交金額，取多日平均與母體標準差
const day = (values) => ({ data: values.map(([time, value]) => [time, '', '', '', '', '', '', String(value)]) });
const a = parseFiveSecondStats(day([['09:00:05', 100], ['13:30:00', 400]]));
const b = parseFiveSecondStats(day([['09:00:05', 100], ['13:30:00', 200]]));
assert.deepEqual(a, [[32405, 100], [48600, 400]]);
assert.deepEqual(buildVolumeWeights([a, b]), [[32405, 3, 1], [48600, 1, 0]]);
