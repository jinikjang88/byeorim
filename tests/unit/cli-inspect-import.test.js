// inspect-import.js 단위 테스트. ADR 0051 import-review 결.
// confirmFinding 의존성 주입으로 결정적, picker 흐름을 끝까지 검증.

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
  runForge,
  runTemper,
  runSet,
  runInspect,
  applyInspectReview,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'byeorim-inspect-import-'));
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

async function setupReadyForInspectImport(cwd) {
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
  await runForge({ cwd });
  await runTemper({ cwd });
  await runSet({ cwd });
  await runInspect({ cwd });
}

function writeResponse(cwd, body) {
  const path = join(cwd, 'response.md');
  writeFileSync(path, body, 'utf8');
  return path;
}

const VALID_RESPONSE = `검토 끝났어요. 두 가지 결함을 봤어요.

## 검수 결과

\`\`\`yaml
findings:
  - area: 법적 리스크
    severity: concern
    title: 외부 AI가 본 개인정보 결함
    detail: 사용자 도메인이 결제를 다루는데 개인정보 보호 결이 약합니다.
    file: src/features/order/schemas.js

  - area: 성능
    severity: warning
    title: 외부 AI가 본 N+1 자리
    detail: list endpoint에서 N+1 쿼리 가능성을 봤어요.
\`\`\`
`;

const ALWAYS_APPLY = async () => 'apply';
const ALWAYS_SKIP = async () => 'skip';
const ALWAYS_STOP = async () => 'stop';

test('inspect-findings.yml이 없으면 한국어 에러로 거부', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    await assert.rejects(
      applyInspectReview({ cwd, responsePath, log: () => {} }),
      /inspect-findings\.yml이 없습니다/,
    );
  });
});

test('응답 파일이 없으면 한국어 에러', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    await assert.rejects(
      applyInspectReview({ cwd, responsePath: '/no/such/file.md', log: () => {} }),
      /응답 파일을 찾지 못했어요/,
    );
  });
});

test('cwd 또는 responsePath 누락은 한국어 에러', async () => {
  await assert.rejects(applyInspectReview({}), /cwd.*필요합니다/);
  await assert.rejects(applyInspectReview({ cwd: '/tmp' }), /responsePath.*필요합니다/);
});

test('정상 응답: 두 finding 모두 적용하면 external 섹션이 채워지고 report 갱신', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    const result = await applyInspectReview({
      cwd,
      responsePath,
      confirmFinding: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.proposedCount, 2);
    assert.equal(result.appliedCount, 2);
    assert.equal(result.invalidCount, 0);
    assert.equal(result.stopped, false);

    // yml의 external 섹션이 채워짐
    const doc = yaml.load(readFileSync(result.findingsFile, 'utf8'));
    assert.equal(doc.findings.external.length, 2);
    assert.equal(doc.findings.external[0].area, '법적 리스크');
    assert.equal(doc.findings.external[1].area, '성능');

    // report에 [외부 AI] prefix가 박힘
    const report = readFileSync(result.reportFile, 'utf8');
    assert.match(report, /\[외부 AI\] ✗.*외부 AI가 본 개인정보 결함/);
    assert.match(report, /\[외부 AI\] ⚠.*외부 AI가 본 N\+1 자리/);
  });
});

test('모두 건너뛰면 external 섹션은 그대로(이전 빈 배열 보존)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    const result = await applyInspectReview({
      cwd,
      responsePath,
      confirmFinding: ALWAYS_SKIP,
      log: () => {},
    });
    assert.equal(result.appliedCount, 0);
    assert.equal(result.skippedCount, 2);
    const doc = yaml.load(readFileSync(result.findingsFile, 'utf8'));
    assert.deepEqual(doc.findings.external, []);
  });
});

test('첫 finding에서 stop하면 external 안 갱신, stopped=true', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    const result = await applyInspectReview({
      cwd,
      responsePath,
      confirmFinding: ALWAYS_STOP,
      log: () => {},
    });
    assert.equal(result.stopped, true);
    assert.equal(result.appliedCount, 0);
  });
});

test('apply_all_remaining 결: 첫 결정 후 나머지 모두 적용', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    let count = 0;
    const result = await applyInspectReview({
      cwd,
      responsePath,
      confirmFinding: async () => {
        count += 1;
        return count === 1 ? 'apply_all_remaining' : 'skip';
      },
      log: () => {},
    });
    // 첫 호출에 apply_all_remaining이 박혔으니 두 번째는 묻지 않고 자동 적용
    assert.equal(count, 1);
    assert.equal(result.appliedCount, 2);
  });
});

test('재import 결: external 섹션이 통째로 교체된다(ADR 0051 결정 6)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const firstResponse = writeResponse(cwd, VALID_RESPONSE);
    await applyInspectReview({
      cwd,
      responsePath: firstResponse,
      confirmFinding: ALWAYS_APPLY,
      log: () => {},
    });
    const docAfterFirst = yaml.load(
      readFileSync(join(cwd, '.byeorim', 'project', 'inspect-findings.yml'), 'utf8'),
    );
    assert.equal(docAfterFirst.findings.external.length, 2);

    // 두 번째 import: 한 finding만 박힌 응답
    const SECOND = `## 검수 결과

\`\`\`yaml
findings:
  - area: 운영
    severity: warning
    title: 새 운영 결함
    detail: 두 번째 외부 AI 검수의 결.
\`\`\`
`;
    const secondResponse = join(cwd, 'response2.md');
    writeFileSync(secondResponse, SECOND, 'utf8');
    const result = await applyInspectReview({
      cwd,
      responsePath: secondResponse,
      confirmFinding: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.appliedCount, 1);
    const docAfterSecond = yaml.load(readFileSync(result.findingsFile, 'utf8'));
    // 첫 두 finding이 사라지고 새 한 개만 남음 (external 섹션 교체)
    assert.equal(docAfterSecond.findings.external.length, 1);
    assert.equal(docAfterSecond.findings.external[0].title, '새 운영 결함');
  });
});

test('graceful degrade: ## 검수 결과 섹션 없으면 안내 후 종료', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const responsePath = writeResponse(cwd, '자유 형식 검토만 했어요. 형식 안 맞춤.');
    const logs = [];
    const result = await applyInspectReview({
      cwd,
      responsePath,
      confirmFinding: ALWAYS_APPLY,
      log: (line) => logs.push(line),
    });
    assert.equal(result.hasStructuredSection, false);
    assert.match(result.parseError, /못 찾았어요/);
    assert.equal(result.appliedCount, 0);
    assert.ok(logs.some((l) => l.includes('## 검수 결과')));
  });
});

test('형식 어긋난 finding은 invalid로 건너뛰고 안내, 나머지 valid는 적용', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const MIXED = `## 검수 결과

\`\`\`yaml
findings:
  - area: 보안
    severity: invalid_severity
    title: 잘못된 severity
    detail: 이 finding은 invalid로 건너뜀

  - area: 보안
    severity: warning
    title: 정상 finding
    detail: 이건 적용
\`\`\`
`;
    const responsePath = writeResponse(cwd, MIXED);
    const result = await applyInspectReview({
      cwd,
      responsePath,
      confirmFinding: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.proposedCount, 2);
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 1);
  });
});

test('빈 findings 배열은 invalidCount=0, appliedCount=0으로 안전 종료', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const EMPTY = `## 검수 결과

\`\`\`yaml
findings: []
\`\`\`
`;
    const responsePath = writeResponse(cwd, EMPTY);
    const result = await applyInspectReview({
      cwd,
      responsePath,
      confirmFinding: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.proposedCount, 0);
    assert.equal(result.invalidCount, 0);
    assert.equal(result.appliedCount, 0);
  });
});

test('inspect 재실행 시 import한 external이 보존된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspectImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    await applyInspectReview({
      cwd,
      responsePath,
      confirmFinding: ALWAYS_APPLY,
      log: () => {},
    });

    // current_stage를 inspect로 되돌려 재실행
    const stateFile = join(cwd, '.byeorim', 'state.yml');
    const state = yaml.load(readFileSync(stateFile, 'utf8'));
    state.current_stage = 'inspect';
    state.completed_stages = state.completed_stages.filter((s) => s !== 'inspect');
    writeFileSync(stateFile, yaml.dump(state, { sortKeys: false }), 'utf8');

    const reInspect = await runInspect({ cwd });
    // external 보존
    assert.equal(reInspect.externalFindingCount, 2);
  });
});
