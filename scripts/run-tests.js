// Node 18/20에서 `node --test`가 glob 인자를 펼치지 못하는 결을 우회한다.
// CI bash가 따옴표 결로 ** 패턴을 펼치지 않아 리터럴이 node에 그대로 전달되는 자리.
// Node 22.5+에서는 --test가 glob을 직접 받지만, 매트릭스 호환을 위해 항상 이 결로 실행한다.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function findTests(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      results.push(...findTests(path));
    } else if (path.endsWith('.test.js')) {
      results.push(path);
    }
  }
  return results;
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('Usage: node scripts/run-tests.js <dir>...');
  process.exit(2);
}

const files = dirs.flatMap(findTests);
if (files.length === 0) {
  console.error(`No *.test.js found under: ${dirs.join(', ')}`);
  process.exit(2);
}

const result = spawnSync('node', ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
