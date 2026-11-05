// CSV 產生與解析（services/csv.js）：引號、逗號、換行、空值。
import assert from 'node:assert/strict';
import { splitCsvLine, toCsv } from '../services/csv.js';

assert.equal(toCsv([['代碼', '名稱'], ['2330', '台積電'], [1, null]]), '代碼,名稱\r\n2330,台積電\r\n1,');
assert.equal(toCsv([['a,b', 'say "hi"', 'x\ny']]), '"a,b","say ""hi""","x\ny"');
assert.deepEqual(splitCsvLine(toCsv([['a,b', 'say "hi"', 'plain']])), ['a,b', 'say "hi"', 'plain']);
