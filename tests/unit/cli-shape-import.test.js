// shape-import.js 단위 테스트. ADR 0053 import-review 결.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import {
  runInit,
  runProspect,
  runSmelt,
  interactiveShape,
  applyShapeReview,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-shape-import-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const REST_CHOICES = {
  language: 'node',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

async function setupReadyForImport(cwd) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  await runSmelt({ cwd, blockIds: ['order'] });
  await interactiveShape({
    cwd,
    askArchitecture: async () => REST_CHOICES,
    confirmArchitecture: async () => 'proceed',
  });
}

function writeResponse(cwd, body) {
  const path = join(cwd, 'response.md');
  writeFileSync(path, body, 'utf8');
  return path;
}

const VALID_RESPONSE = `검토 끝났어요.

## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: decision_modify
    target_key: language
    new_value: python
    reason: 데이터 처리가 핵심이라 python이 어울려요

  - kind: decision_modify
    target_key: database
    new_value: mongodb
    reason: 스키마가 자주 바뀌는 도메인
\`\`\`
`;

const ALWAYS_APPLY = async () => 'apply';
const ALWAYS_SKIP = async () => 'skip';
const ALWAYS_STOP = async () => 'stop';

test('architecture.yml이 없으면 한국어 에러', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    await assert.rejects(
      applyShapeReview({ cwd, responsePath, log: () => {} }),
      /architecture\.yml이\(가\) 없습니다/,
    );
  });
});

test('응답 파일이 없으면 한국어 에러', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    await assert.rejects(
      applyShapeReview({ cwd, responsePath: '/no/such/file.md', log: () => {} }),
      /응답 파일을 찾지 못했어요/,
    );
  });
});

test('cwd 또는 responsePath 누락은 한국어 에러', async () => {
  await assert.rejects(applyShapeReview({}), /cwd.*필요합니다/);
  await assert.rejects(applyShapeReview({ cwd: '/tmp' }), /responsePath.*필요합니다/);
});

test('decision_modify 적용: architecture.yml의 4개 필드가 갱신된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.proposedCount, 2);
    assert.equal(result.appliedCount, 2);

    const doc = yaml.load(readFileSync(result.architectureFile, 'utf8'));
    assert.equal(doc.language, 'python');
    assert.equal(doc.database, 'mongodb');
    // 다른 두 필드는 그대로
    assert.equal(doc.api_style, 'rest');
    assert.equal(doc.architecture_pattern, 'modular-monolith');
  });
});

test('모두 건너뛰면 architecture.yml 안 건드림', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const archFile = join(cwd, '.beoreum', 'project', 'architecture.yml');
    const before = readFileSync(archFile, 'utf8');
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_SKIP,
      log: () => {},
    });
    assert.equal(result.appliedCount, 0);
    assert.equal(result.skippedCount, 2);
    const after = readFileSync(archFile, 'utf8');
    assert.equal(before, after);
  });
});

test('첫 변경에서 stop하면 architecture.yml 안 건드림', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_STOP,
      log: () => {},
    });
    assert.equal(result.stopped, true);
    assert.equal(result.appliedCount, 0);
  });
});

test('apply_all_remaining: 첫 결정 후 나머지 모두 적용', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    let count = 0;
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        count += 1;
        return count === 1 ? 'apply_all_remaining' : 'skip';
      },
      log: () => {},
    });
    assert.equal(count, 1);
    assert.equal(result.appliedCount, 2);
  });
});

test('graceful degrade: 섹션 없으면 안내 후 종료', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(cwd, '자유 형식뿐. 형식 안 맞춤.');
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.hasStructuredSection, false);
    assert.match(result.parseError, /못 찾았어요/);
    assert.equal(result.appliedCount, 0);
  });
});

test('표준 옵션이 아닌 new_value는 invalid로 거부', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const INVALID_VALUE = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: decision_modify
    target_key: language
    new_value: rust
    reason: 외부 AI가 표준 밖 값을 줬음
\`\`\`
`;
    const responsePath = writeResponse(cwd, INVALID_VALUE);
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('알 수 없는 target_key는 invalid', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const BAD_KEY = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: decision_modify
    target_key: foo_bar
    new_value: python
    reason: 잘못된 key
\`\`\`
`;
    const responsePath = writeResponse(cwd, BAD_KEY);
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('이미 같은 값으로 박혀있으면 invalid (no-op)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const SAME_VALUE = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: decision_modify
    target_key: language
    new_value: node
    reason: 이미 같음
\`\`\`
`;
    const responsePath = writeResponse(cwd, SAME_VALUE);
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('알 수 없는 kind는 invalid', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const BAD_KIND = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: option_add
    target_key: language
    new_value: rust
    reason: 옵션 추가는 별도 ADR
\`\`\`
`;
    const responsePath = writeResponse(cwd, BAD_KIND);
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('빈 changes 배열은 안전 종료', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const EMPTY = `## 제안된 변경 사항

\`\`\`yaml
changes: []
\`\`\`
`;
    const responsePath = writeResponse(cwd, EMPTY);
    const result = await applyShapeReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.proposedCount, 0);
    assert.equal(result.appliedCount, 0);
  });
});
