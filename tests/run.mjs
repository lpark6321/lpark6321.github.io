// 測試入口：node tests/run.mjs
// 先跑靜態檢查（語法、import 能不能對上、分層方向、沒用到的 import），再逐一載入 tests/*.test.mjs（丟例外＝失敗）。
// 不需要瀏覽器或網路；瀏覽器畫面請另外開 index_hide.html 手動確認。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { staticProblems } from './static.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let failed = 0;

const problems = staticProblems(root);
if (problems.length) {
  failed += problems.length;
  console.log('✗ 靜態檢查');
  problems.forEach((problem) => console.log(`    ${problem}`));
} else {
  console.log('✓ 靜態檢查');
}

for (const file of fs.readdirSync(here).filter((name) => name.endsWith('.test.mjs')).sort()) {
  try {
    await import(pathToFileURL(path.join(here, file)));
    console.log(`✓ ${file}`);
  } catch (error) {
    failed += 1;
    console.log(`✗ ${file}\n    ${error.stack?.split('\n').slice(0, 3).join('\n    ') || error}`);
  }
}

console.log(failed ? `\n${failed} 項失敗` : '\n全部通過');
process.exitCode = failed ? 1 : 0;
