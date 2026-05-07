// import-helpers.js 단위 테스트. ADR 0054.
// 6개 헬퍼의 결정성과 기본 동작을 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readResponseFile,
  runValidationLoop,
  runChangePicker,
  logGracefulDegrade,
  logSummary,
} from '../../packages/cli/src/import-helpers.js';

// ── readResponseFile ──────────────────────────────────────

test('readResponseFile: 파일이 있으면 본문 반환', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beoreum-import-helpers-'));
  try {
    const path = join(dir, 'r.md');
    writeFileSync(path, '본문', 'utf8');
    assert.equal(readResponseFile(path), '본문');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readResponseFile: ENOENT는 한국어 메시지로 변환', () => {
  assert.throws(() => readResponseFile('/no/such/file.md'), /응답 파일을 찾지 못했어요/);
});

// ── runValidationLoop ─────────────────────────────────────

test('runValidationLoop: validate가 invalid면 invalidNotes에 사유와 함께', () => {
  const proposed = [{ a: 1 }, { a: 2 }];
  const validate = (item) =>
    item.a === 1 ? { valid: true } : { valid: false, reason: 'a가 1이 아님' };
  const result = runValidationLoop({ proposed, validate });
  assert.equal(result.validItems.length, 1);
  assert.equal(result.invalidNotes.length, 1);
  assert.match(result.invalidNotes[0], /a가 1이 아님/);
});

test('runValidationLoop: locate가 ok=false면 invalidNotes에 사유', () => {
  const proposed = [{ a: 1 }, { a: 2 }];
  const validate = () => ({ valid: true });
  const locate = (item) =>
    item.a === 1 ? { ok: true, payload: 'P1' } : { ok: false, reason: '위치 못 찾음' };
  const describe = (item) => `a=${item.a}`;
  const result = runValidationLoop({ proposed, validate, locate, describe });
  assert.equal(result.validItems.length, 1);
  // located는 locate가 반환한 객체 통째로 (호출자가 located.payload 같은 결로 접근)
  assert.equal(result.validItems[0].located.payload, 'P1');
  assert.equal(result.validItems[0].located.ok, true);
  assert.match(result.invalidNotes[0], /a=2 - 위치 못 찾음/);
});

test('runValidationLoop: locate 없으면 형식만 검증', () => {
  const proposed = [{ a: 1 }];
  const result = runValidationLoop({
    proposed,
    validate: () => ({ valid: true }),
  });
  assert.equal(result.validItems.length, 1);
  assert.equal(result.validItems[0].located, undefined);
});

// ── runChangePicker ───────────────────────────────────────

test('runChangePicker: 모두 apply', async () => {
  const items = [{ change: 'a' }, { change: 'b' }];
  const applied = [];
  const result = await runChangePicker({
    items,
    applyOne: (item) => applied.push(item.change),
    confirmChange: async () => 'apply',
    log: () => {},
  });
  assert.equal(result.appliedCount, 2);
  assert.equal(result.skippedCount, 0);
  assert.equal(result.stopped, false);
  assert.deepEqual(applied, ['a', 'b']);
});

test('runChangePicker: 모두 skip', async () => {
  const items = [{ change: 'a' }, { change: 'b' }];
  const result = await runChangePicker({
    items,
    applyOne: () => {},
    confirmChange: async () => 'skip',
    log: () => {},
  });
  assert.equal(result.appliedCount, 0);
  assert.equal(result.skippedCount, 2);
});

test('runChangePicker: stop 결로 중단', async () => {
  const items = [{ change: 'a' }, { change: 'b' }];
  let count = 0;
  const result = await runChangePicker({
    items,
    applyOne: () => {},
    confirmChange: async () => {
      count += 1;
      return count === 1 ? 'apply' : 'stop';
    },
    log: () => {},
  });
  assert.equal(result.appliedCount, 1);
  assert.equal(result.stopped, true);
});

test('runChangePicker: apply_all_remaining 후 묻지 않음', async () => {
  const items = [{ change: 'a' }, { change: 'b' }, { change: 'c' }];
  let count = 0;
  const result = await runChangePicker({
    items,
    applyOne: () => {},
    confirmChange: async () => {
      count += 1;
      return count === 1 ? 'apply_all_remaining' : 'skip';
    },
    log: () => {},
  });
  assert.equal(count, 1);
  assert.equal(result.appliedCount, 3);
});

test('runChangePicker: skip_all_remaining 후 묻지 않음', async () => {
  const items = [{ change: 'a' }, { change: 'b' }, { change: 'c' }];
  let count = 0;
  const result = await runChangePicker({
    items,
    applyOne: () => {},
    confirmChange: async () => {
      count += 1;
      return count === 1 ? 'skip_all_remaining' : 'apply';
    },
    log: () => {},
  });
  assert.equal(count, 1);
  assert.equal(result.appliedCount, 0);
  assert.equal(result.skippedCount, 3);
});

// ── logGracefulDegrade ────────────────────────────────────

test('logGracefulDegrade: 섹션 이름과 yml 이름이 안내에 박힌다', () => {
  const logs = [];
  logGracefulDegrade({
    log: (line) => logs.push(line),
    parseResult: { parseError: '섹션 못 찾음' },
    ymlName: 'contracts.yml',
    sectionName: '## 제안된 변경 사항',
  });
  assert.ok(logs.some((l) => l.includes('## 제안된 변경 사항')));
  assert.ok(logs.some((l) => l.includes('contracts.yml')));
  assert.ok(logs.some((l) => l.includes('섹션 못 찾음')));
});

test('logGracefulDegrade: parseError 없어도 안전', () => {
  const logs = [];
  logGracefulDegrade({
    log: (line) => logs.push(line),
    parseResult: null,
    ymlName: 'x.yml',
  });
  assert.ok(logs.length > 0);
});

// ── logSummary ────────────────────────────────────────────

test('logSummary: 적용/건너뜀 수가 박힌다', () => {
  const logs = [];
  logSummary({ log: (l) => logs.push(l), appliedCount: 2, skippedCount: 1, stopped: false });
  assert.ok(logs.some((l) => l.includes('적용 2개')));
  assert.ok(logs.some((l) => l.includes('건너뜀 1개')));
});

test('logSummary: stopped면 남은 수도 박힌다', () => {
  const logs = [];
  logSummary({
    log: (l) => logs.push(l),
    appliedCount: 1,
    skippedCount: 0,
    stopped: true,
    total: 3,
  });
  assert.ok(logs.some((l) => l.includes('멈춤')));
  assert.ok(logs.some((l) => l.includes('남은 2개')));
});
