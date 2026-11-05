// 靜態檢查：每個瀏覽器端 .js 能解析、相對 import 都找得到檔案與匯出名稱、分層方向正確（data → services → components → pages）、
// 沒有 import 了卻沒用的名稱。回傳問題清單（空陣列＝通過）。
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', '.history', '.claude', 'node_modules']);
const LAYER_ORDER = { data: 0, services: 1, providers: 1, components: 2, pages: 3 };

function listFiles(root) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|html)$/.test(entry.name)) files.push(full);
    }
  })(root);
  return files;
}

// 拿掉 import 與 export 關鍵字後丟給 Function 檢查語法（不執行）。Node 端的 bridges 用 CommonJS／Node API，略過。
function parseProblem(source) {
  const body = source
    .replace(/^\s*import\s[^;]*;/gm, (m) => '\n'.repeat(m.split('\n').length - 1))
    .replace(/^export\s+(default\s+)?/gm, '');
  try {
    new Function(body);
    return '';
  } catch (error) {
    return error.message;
  }
}

export function staticProblems(root) {
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  const src = Object.fromEntries(listFiles(root).map((f) => [rel(f), fs.readFileSync(f, 'utf8')]));
  const problems = [];

  const exportsOf = {};
  for (const [file, s] of Object.entries(src)) {
    const names = new Set();
    for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/g)) names.add(m[1]);
    for (const m of s.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach((x) => names.add(x.trim().split(/\s+as\s+/).pop()));
    exportsOf[file] = names;
  }

  for (const [file, s] of Object.entries(src)) {
    if (file.endsWith('.js') && !file.startsWith('bridges/')) {
      const error = parseProblem(s);
      if (error) problems.push(`語法錯誤 ${file}: ${error}`);
    }
    for (const m of s.matchAll(/import\s*(?:\{([^}]*)\}|([\w$]+))?\s*(?:from\s*)?['"]([^'"]+)['"]/g)) {
      const spec = m[3];
      if (!spec.startsWith('.')) continue;
      const target = rel(path.join(path.dirname(path.join(root, file)), spec));
      if (target.endsWith('.json')) {
        if (!fs.existsSync(path.join(root, target))) problems.push(`找不到 ${file} -> ${spec}`);
        continue;
      }
      if (!src[target]) {
        problems.push(`找不到 ${file} -> ${spec}`);
        continue;
      }
      const names = (m[1] || '').split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      names.filter((name) => !exportsOf[target].has(name)).forEach((name) => problems.push(`${target} 沒有匯出 ${name}（${file}）`));
      const from = LAYER_ORDER[file.split('/')[0]];
      const to = LAYER_ORDER[target.split('/')[0]];
      if (from !== undefined && to !== undefined && to > from) problems.push(`分層反了：${file} import ${target}`);
      // import 進來的名稱至少要再出現一次
      (m[1] || '').split(',').map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach((name) => {
        const count = (s.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) || []).length;
        if (count < 2) problems.push(`沒用到的 import ${name}（${file}）`);
      });
    }
  }
  return problems;
}
