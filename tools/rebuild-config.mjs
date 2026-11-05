#!/usr/bin/env node
// 重算 data/config/marketConfig.json（休市日、加權權重、台灣50、中型100、摩台、量能權重）。
// 只讀 data/config/source/ 的原始檔；加 --download 會先把能自動下載的原始檔抓進 source/。
// 每項原始檔去哪裡找、檔名格式，見 data/config/README.md。
//
// 用法：
//   node tools/rebuild-config.mjs                  互動模式：偵測量能資料天數，跳出期間選擇
//   node tools/rebuild-config.mjs --period=quarter 量能權重用最近 60 個交易日（month / quarter / year / all / legacy）
//   node tools/rebuild-config.mjs --download --days=60   先下載休市表、權重頁、產業別與最近 60 個交易日的每 5 秒統計
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  VOLUME_PERIODS,
  buildTaiex,
  buildVolumeWeights,
  parseConstituentCsv,
  parseFiveSecondStats,
  parseHolidays,
  parseIndustry,
  parseLegacyVolumeWeights,
  parseTaiexWeightsHtml
} from './configParsers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_DIR = path.join(ROOT, 'data', 'config');
const SOURCE = path.join(CONFIG_DIR, 'source');
const OUT = path.join(CONFIG_DIR, 'marketConfig.json');
const KEEP_TAIEX_PCT = 0.1; // 加權成分股只保留權重 ≥ 0.1% 的（約前 100 名），產業權重仍用全部成分股加總
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));

const dir = (name) => path.join(SOURCE, name);
const listFiles = (name, ext) => (fs.existsSync(dir(name)) ? fs.readdirSync(dir(name)).filter((f) => f.endsWith(ext)).sort() : []);
const latestFile = (name, ext) => listFiles(name, ext).at(-1);
const readText = (name, file) => fs.readFileSync(path.join(dir(name), file), 'utf8');
const readJson = (name, file) => JSON.parse(readText(name, file));
const dateInName = (file) => file?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.text();
}

// ---- 下載（--download）：證交所與期交所有公開網址的原始檔 ----
async function download(days) {
  const year = new Date().getFullYear();
  for (const y of [year, year + 1]) {
    const json = JSON.parse(await fetchText(`https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?date=${y}0101&response=json`));
    if (json.data?.length) {
      fs.writeFileSync(path.join(dir('holidays'), `${y}.json`), JSON.stringify(json));
      console.log(`下載 休市表 ${y}（${json.data.length} 筆）`);
    } else {
      console.log(`休市表 ${y} 證交所尚未公布`);
    }
  }

  const html = await fetchText('https://www.taifex.com.tw/cht/9/futuresQADetail');
  const { dataDate } = parseTaiexWeightsHtml(html);
  fs.writeFileSync(path.join(dir('taiex-weights'), `futuresQADetail_${dataDate || 'unknown'}.html`), html);
  console.log(`下載 加權權重頁（資料日期 ${dataDate}）`);

  fs.writeFileSync(path.join(dir('industry'), 't187ap03_L.json'), await fetchText('https://openapi.twse.com.tw/v1/opendata/t187ap03_L'));
  console.log('下載 上市公司產業別');

  // 每 5 秒統計：往回補最近 days 個交易日缺的檔。證交所會擋太密集的請求，每次間隔 3 秒。
  const holidays = new Set(listFiles('holidays', '.json').flatMap((f) => parseHolidays(readJson('holidays', f)).map(([date]) => date)));
  const have = new Set(listFiles('volume-5sec', '.json').map((f) => f.slice(0, 8)));
  let collected = 0;
  for (let back = 1; collected < days && back < days * 2 + 30; back += 1) {
    const date = new Date(Date.now() + 8 * 3600 * 1000 - back * 86400 * 1000);
    const iso = date.toISOString().slice(0, 10);
    if ([0, 6].includes(date.getUTCDay()) || holidays.has(iso)) continue;
    collected += 1;
    const key = iso.replaceAll('-', '');
    if (have.has(key)) continue;
    await sleep(3000);
    try {
      const json = JSON.parse(await fetchText(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_5MINS?date=${key}&response=json`));
      if (json.stat === 'OK' && json.data?.length) {
        fs.writeFileSync(path.join(dir('volume-5sec'), `${key}.json`), JSON.stringify(json));
        console.log(`下載 每 5 秒統計 ${iso}`);
      }
    } catch (error) {
      console.warn(`每 5 秒統計 ${iso} 下載失敗：${error.message}`);
    }
  }
}

// ---- 量能權重期間：沒指定就互動詢問 ----
async function choosePeriod(dayCount) {
  if (args.period) return args.period;
  if (!dayCount) {
    console.log('volume-5sec/ 沒有每日統計檔，量能權重沿用 legacy-weights.csv。');
    return 'legacy';
  }
  if (!process.stdin.isTTY) return 'all';
  const options = [
    ['month', `月（最近 ${Math.min(VOLUME_PERIODS.month, dayCount)} 個交易日）`],
    ['quarter', `季（最近 ${Math.min(VOLUME_PERIODS.quarter, dayCount)} 個交易日）`],
    ['year', `年（最近 ${Math.min(VOLUME_PERIODS.year, dayCount)} 個交易日）`],
    ['all', `所有（${dayCount} 個交易日）`],
    ['legacy', '沿用 legacy-weights.csv']
  ];
  console.log(`\n偵測到 ${dayCount} 個交易日的每 5 秒成交統計。量能權重要用哪一段？`);
  options.forEach(([, label], i) => console.log(`  ${i + 1}) ${label}`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('請輸入編號（Enter = 4 所有）：');
  rl.close();
  return options[Number(answer) - 1]?.[0] || 'all';
}

function volumeWeights(period) {
  const files = listFiles('volume-5sec', '.json');
  if (period === 'legacy' || !files.length) {
    return { source: 'data/config/source/volume-5sec/legacy-weights.csv（舊版權重表）', period: 'legacy', days: null, dateRange: '', rows: parseLegacyVolumeWeights(readText('volume-5sec', 'legacy-weights.csv')) };
  }
  const limit = VOLUME_PERIODS[period] ?? Infinity;
  const picked = files.slice(-limit);
  const toIso = (f) => `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;
  return {
    source: '證交所 每5秒委託成交統計 MI_5MINS（累積成交金額）',
    period,
    days: picked.length,
    dateRange: `${toIso(picked[0])} ~ ${toIso(picked.at(-1))}`,
    rows: buildVolumeWeights(picked.map((f) => parseFiveSecondStats(readJson('volume-5sec', f))))
  };
}

function constituents(name, label) {
  const file = latestFile(name, '.csv');
  return {
    source: file ? `data/config/source/${name}/${file}（${label}）` : `尚未放入原始檔（${label}）`,
    dataDate: dateInName(file),
    constituents: file ? parseConstituentCsv(readText(name, file)) : []
  };
}

// 陣列、只有基本值的物件收成一行，設定檔才不會長到幾萬行。
function stringify(config) {
  return `${JSON.stringify(config, null, 2)
    .replace(/\{\n([^{}[\]]*?)\n\s*\}/g, (m, body) => `{ ${body.split('\n').map((s) => s.trim()).join(' ')} }`)
    .replace(/\[\n([^{}[\]]*?)\n\s*\]/g, (m, body) => `[${body.split('\n').map((s) => s.trim()).join(' ')}]`)}\n`;
}

async function main() {
  if (args.download) await download(Number(args.days) || VOLUME_PERIODS.month);

  const holidayFiles = listFiles('holidays', '.json');
  const holidays = holidayFiles.flatMap((f) => parseHolidays(readJson('holidays', f)));
  const weightsFile = latestFile('taiex-weights', '.html');
  if (!weightsFile) throw new Error('data/config/source/taiex-weights/ 沒有權重頁原始檔');
  const industry = parseIndustry(readJson('industry', 't187ap03_L.json'));
  const taiex = buildTaiex(parseTaiexWeightsHtml(readText('taiex-weights', weightsFile)), industry, KEEP_TAIEX_PCT);
  const period = await choosePeriod(listFiles('volume-5sec', '.json').length);

  const config = {
    generatedAt: new Date().toISOString(),
    holidays: {
      source: '證交所 市場開休市日期（data/config/source/holidays/）',
      years: holidayFiles.map((f) => Number(f.slice(0, 4))),
      days: holidays
    },
    taiex: { source: `期交所 加權股價指數成分股暨市值比重（${weightsFile}）＋證交所產業別 t187ap03_L`, keepPct: KEEP_TAIEX_PCT, ...taiex },
    tw50: constituents('tw50', '台灣50 成分股'),
    mid100: constituents('mid100', '中型100 成分股'),
    msci: constituents('msci', '摩台 MSCI 台灣指數成分股'),
    volumeWeights: volumeWeights(period)
  };

  const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  fs.writeFileSync(OUT, stringify(config));

  console.log('\n已寫入 data/config/marketConfig.json');
  console.log(`  休市日：${config.holidays.years.join('、')} 年，共 ${holidays.length} 天`);
  console.log(`  加權權重：資料日期 ${taiex.dataDate}，${taiex.constituents.length} 檔（≥ ${KEEP_TAIEX_PCT}%），${taiex.sectorWeights.length} 個產業`);
  console.log(`  台灣50：${config.tw50.constituents.length} 檔（${config.tw50.dataDate}）；中型100：${config.mid100.constituents.length} 檔（${config.mid100.dataDate}）；摩台：${config.msci.constituents.length} 檔`);
  console.log(`  量能權重：${config.volumeWeights.period}${config.volumeWeights.days ? `，${config.volumeWeights.days} 天（${config.volumeWeights.dateRange}）` : ''}，${config.volumeWeights.rows.length} 個時點`);
  if (previous?.taiex) {
    const top = (c) => c.taiex.constituents.slice(0, 10).map((row) => row.code).join(',');
    if (top(previous) !== top(config)) console.log(`  注意：十大權值股變了 ${top(previous)} → ${top(config)}`);
  }
}

main().catch((error) => {
  console.error(`重算失敗：${error.message}`);
  process.exitCode = 1;
});
