// 瀏覽器測試：node tests/browser.mjs
// 用無頭 Chrome（CDP）在三種畫面大小開主儀表板的 7 頁，檢查：沒有 JS 例外、沒有橫向捲軸、沒有元素超出畫面、標頭不會太高。
// 截圖存到 tests/.browser-shots/（不進 git）。8000 埠沒有網頁伺服器時自己開一個；行情需要另外開 Yahoo 代理（GIO.cmd yahoo），沒開也能跑版面檢查。
// Chrome 路徑可用環境變數 CHROME_PATH 指定。不在 tests/run.mjs 裡，因為需要 Chrome。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = path.join(root, 'tests', '.browser-shots');
const SIZES = [
  { name: '1280x720@150%', width: 1280, height: 720, dpr: 1.5, maxHeader: 130 },
  { name: '1536x864@125%', width: 1536, height: 864, dpr: 1.25, maxHeader: 110 },
  { name: '1920x1080', width: 1920, height: 1080, dpr: 1, maxHeader: 100 }
];
const PAGES = ['page1', 'page2', 'page3', 'page4', 'page5', 'page6', 'page7'];
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.png': 'image/png', '.svg': 'image/svg+xml' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 8000 埠已有伺服器（例如 GIO.cmd web）就沿用，否則開一個只讀 repo 檔案的靜態伺服器。
async function ensureServer() {
  try {
    if ((await fetch('http://127.0.0.1:8000/index_hide.html')).ok) return null;
  } catch {
    // 沒有在跑，下面自己開。
  }
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(8000, '127.0.0.1', resolve));
  return server;
}

async function startChrome() {
  const chrome = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!chrome) throw new Error('找不到 Chrome，請用 CHROME_PATH 指定');
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gio-browser-test-'));
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((target) => target.type === 'page');
      if (page) return { proc, profile, wsUrl: page.webSocketDebuggerUrl };
    } catch {
      // Chrome 還在啟動。
    }
    await sleep(200);
  }
  proc.kill();
  throw new Error('Chrome 沒有啟動');
}

// 每一頁量測：標頭高度、橫向捲軸、超出畫面的元素（放在可橫捲容器裡的不算，例如表格、權值股卡片列）。
// 只看 auto／scroll：.shell__main 是 overflow:hidden，超出右緣的內容會被直接切掉，那正是要抓的版面問題。
const MEASURE = `(() => {
  const vw = innerWidth;
  const insideScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const outside = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.closest('[hidden], .shell-menu__list') || !el.getClientRects().length || insideScroller(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 1;
  }).map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList[0] ? '.' + el.classList[0] : '')).slice(0, 5);
  return JSON.stringify({
    header: Math.round(document.querySelector('.shell__header').getBoundingClientRect().height),
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    outside
  });
})()`;

const server = await ensureServer();
const { proc, profile, wsUrl } = await startChrome();
const ws = new WebSocket(wsUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve));
let id = 0;
const pending = new Map();
const exceptions = [];
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const detail = msg.params.exceptionDetails;
    exceptions.push(`${detail.exception?.description?.split('\n')[0] || detail.text} @ ${detail.url || ''}:${detail.lineNumber}`);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  id += 1;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

const failures = [];
try {
  fs.rmSync(shotDir, { recursive: true, force: true });
  fs.mkdirSync(shotDir, { recursive: true });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8000/index_hide.html#page1' });
  await sleep(6000);
  for (const size of SIZES) {
    await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.dpr, mobile: false });
    for (const page of PAGES) {
      const before = exceptions.length;
      await evaluate(`location.hash = '#${page}'`);
      await sleep(2500);
      const m = JSON.parse(await evaluate(MEASURE));
      const problems = [];
      if (m.scrollX > 0) problems.push(`橫向捲軸 ${m.scrollX}px`);
      if (m.outside.length) problems.push(`超出畫面 ${m.outside.join(', ')}`);
      if (m.header > size.maxHeader) problems.push(`標頭 ${m.header}px > ${size.maxHeader}px`);
      if (exceptions.length > before) problems.push(...exceptions.slice(before).map((text) => `例外 ${text}`));
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shotDir, `${size.name}-${page}.png`), Buffer.from(shot.result.data, 'base64'));
      console.log(`${problems.length ? '✗' : '✓'} ${size.name} ${page}（標頭 ${m.header}px）${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
      if (problems.length) failures.push(`${size.name} ${page}`);
    }
  }
} finally {
  ws.close();
  proc.kill();
  server?.close();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
console.log(failures.length ? `\n${failures.length} 項有問題；截圖在 tests/.browser-shots/` : '\n全部通過；截圖在 tests/.browser-shots/');
process.exitCode = failures.length ? 1 : 0;
