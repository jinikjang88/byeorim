// runInspect 단위 테스트. ADR 0016(6영역 정적 체크리스트, 강한 신호, 시장 재검 참조, done marker).

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
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-inspect-'));
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

async function setupReadyForInspect(cwd, blockIds = ['order']) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  await runSmelt({ cwd, blockIds });
  await interactiveShape({
    cwd,
    askArchitecture: async () => REST_CHOICES,
    confirmArchitecture: async () => 'proceed',
  });
  await runForge({ cwd });
  await runTemper({ cwd });
  await runSet({ cwd });
}

function readReport(cwd) {
  return readFileSync(join(cwd, '.beoreum', 'project', 'inspect-report.md'), 'utf8');
}

test('정상 흐름: 7단계 끝까지 가서 inspect-report.md를 만들고 done marker로 전환된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: set까지 끝낸 자리
    await setupReadyForInspect(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    // When
    const result = await runInspect({ cwd, now: fixedNow });
    // Then
    assert.equal(result.areaCount, 6);
    assert.equal(result.isDone, true);
    const report = readReport(cwd);
    assert.match(report, /2026-04-28T12:00:00\.000Z/);
    assert.match(report, /벼름의 마지막 단계 비춤/);
  });
});

test('report에 6영역이 모두 등장한다(ADR 0016 결정 1)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const report = readReport(cwd);
    assert.match(report, /## 1\. 보안/);
    assert.match(report, /## 2\. 성능/);
    assert.match(report, /## 3\. 운영/);
    assert.match(report, /## 4\. 확장성/);
    assert.match(report, /## 5\. 법적 리스크/);
    assert.match(report, /## 6\. 시장 재검/);
  });
});

test('각 영역이 markdown 체크박스 질문을 가진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const report = readReport(cwd);
    // markdown checkbox(- [ ]) 형식
    assert.match(report, /- \[ \] /);
    // 영역별 최소 한 개 이상의 질문이 있다는 단언으로 갈음
    const checkboxCount = (report.match(/- \[ \] /g) || []).length;
    assert.ok(checkboxCount >= 6, '체크박스 질문이 6개 이상이어야 한다(영역당 최소 1개)');
  });
});

test('법적 리스크 영역에 강한 신호 blockquote가 있다(ADR 0003 결정 3)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const report = readReport(cwd);
    // ADR 0003 결정 3 언급과 변호사 자문 안내가 blockquote(>)로 들어간다
    assert.match(report, /> ⚠ 이 영역은 출시 직전 강한 신호 자리입니다/);
    assert.match(report, /변호사 자문/);
    assert.match(report, /ADR 0003 결정 3/);
  });
});

test('시장 재검 영역에 reality-check.md 경로 안내가 있다(ADR 0016 결정 4)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const report = readReport(cwd);
    assert.match(report, /\.beoreum\/project\/reality-check\.md/);
    assert.match(report, /다시 읽어보세요/);
  });
});

test('마무리 섹션에 다이어리와 합성 README 경로 안내가 있다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const report = readReport(cwd);
    assert.match(report, /## 마무리/);
    assert.match(report, /\.beoreum\/project\/diary\.md/);
    assert.match(report, /\.beoreum\/project\/generated\/README\.md/);
    assert.match(report, /7단계 흐름이 끝났습니다/);
  });
});

test('state.yml이 done marker로 전환되고 7단계 모두 completed_stages에 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const state = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    assert.equal(state.current_stage, 'done');
    assert.deepEqual(state.completed_stages, [
      'prospect',
      'smelt',
      'shape',
      'forge',
      'temper',
      'set',
      'inspect',
    ]);
  });
});

test('inspect 재실행은 done marker 때문에 단계 불일치로 거부된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    // 두 번째 inspect는 current_stage='done'이라 거부
    await assert.rejects(runInspect({ cwd }), /현재 단계가 inspect가 아닙니다.*현재: done/);
  });
});

test('현재 단계가 inspect가 아니면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await assert.rejects(runInspect({ cwd }), /현재 단계가 inspect가 아닙니다/);
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(runInspect({}), /cwd.*필요합니다/);
});

// ── ADR 0049: 정적 규칙 코드 검수 ──────────────────────

test('정상 흐름이 끝나면 inspect-report.md에 코드 검수 섹션이 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    const result = await runInspect({ cwd });
    assert.ok(result.findingCount > 0, 'finding이 한 개 이상 있어야 한다');
    assert.equal(typeof result.concernCount, 'number');
    const report = readFileSync(result.reportFile, 'utf8');
    // 6영역마다 "코드 검수" 섹션
    const matches = report.match(/### 코드 검수 \(정적 규칙\)/g) || [];
    assert.equal(matches.length, 6, '6영역 모두 코드 검수 섹션이 있어야 한다');
  });
});

test('ADR 0046 baseline이 박힌 코드는 보안 영역에 pass finding이 여러 개', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const reportFile = join(cwd, '.beoreum', 'project', 'inspect-report.md');
    const report = readFileSync(reportFile, 'utf8');
    // pass 마커가 보안 영역에 여러 개
    assert.match(report, /✓.*JWT_SECRET startup 검사가 박혀 있습니다/);
    assert.match(report, /✓.*\/health endpoint가 인증 없이 공개됩니다/);
    assert.match(report, /✓.*prod placeholder 가드가 박혀 있습니다/);
    assert.match(report, /✓.*보안 plugin이 모두 등록되었습니다/);
  });
});

test('frontend의 CSP meta와 vite prod 가드가 pass로 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const reportFile = join(cwd, '.beoreum', 'project', 'inspect-report.md');
    const report = readFileSync(reportFile, 'utf8');
    assert.match(report, /✓.*index\.html에 CSP meta가 박혀 있습니다/);
    assert.match(report, /✓.*prod build에서 placeholder 가드가 동작합니다/);
  });
});

test('성능/확장성/법적/시장 재검 영역은 AI 검수 안내 결로 비어있다(ADR 0050 자리)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const reportFile = join(cwd, '.beoreum', 'project', 'inspect-report.md');
    const report = readFileSync(reportFile, 'utf8');
    // 네 영역 머리 다음에 ADR 0050 안내가 한 줄
    const matches = report.match(/_\(이 영역은 ADR 0050의 AI 검수에서 보강됩니다\)_/g) || [];
    // 시장 재검은 architecture를 봐도 finding이 없을 수 있음. 최소 3개(성능/확장성/법적/시장 재검 중)
    assert.ok(matches.length >= 3, `AI 안내가 3개 이상 있어야 한다(실제: ${matches.length})`);
  });
});

test('concern severity가 있으면 머리에 강한 신호 blockquote가 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    // generated/backend의 server.js를 의도적으로 망가뜨려 concern 발생 시뮬레이션
    const serverFile = join(cwd, '.beoreum', 'project', 'generated', 'backend', 'src', 'server.js');
    const broken = `// 망가진 server.js (테스트용)\nimport Fastify from 'fastify';\nconst app = Fastify();\napp.listen({ port: 3000 });\n`;
    writeFileSync(serverFile, broken, 'utf8');

    const result = await runInspect({ cwd });
    assert.ok(result.concernCount > 0, 'concern이 한 개 이상 있어야 한다');
    const report = readFileSync(result.reportFile, 'utf8');
    // 머리에 강한 신호 안내
    assert.match(report, /> ⚠ concern severity의 결함이/);
  });
});

test('finding이 영역별로 grouping되어 표시된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForInspect(cwd);
    await runInspect({ cwd });
    const reportFile = join(cwd, '.beoreum', 'project', 'inspect-report.md');
    const report = readFileSync(reportFile, 'utf8');
    // 보안 섹션과 운영 섹션 안에 코드 검수가 있어야 한다
    const securityIdx = report.indexOf('## 1. 보안');
    const performanceIdx = report.indexOf('## 2. 성능');
    const securityFindings = report.slice(securityIdx, performanceIdx);
    assert.match(securityFindings, /### 코드 검수/);
    assert.match(securityFindings, /✓/);
  });
});
