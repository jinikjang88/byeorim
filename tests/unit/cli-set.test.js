// runSet 단위 테스트. ADR 0015(set의 MVP는 README 합성과 verify-report placeholder).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import {
  runInit,
  runProspect,
  runSmelt,
  interactiveAnswer,
  interactiveShape,
  runForge,
  runTemper,
  runSet,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-set-'));
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

// init → prospect → smelt → shape → forge → temper까지 끝낸 자리. set 단계에 들어와 있음.
async function setupReadyForSet(cwd, blockIds = ['order']) {
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
  });
  await runForge({ cwd });
  await runTemper({ cwd });
}

function readReadme(cwd) {
  return readFileSync(join(cwd, '.beoreum', 'project', 'generated', 'README.md'), 'utf8');
}

test('정상 흐름: 7단계 끝까지 가서 README와 verify-report가 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: temper까지 끝낸 자리
    await setupReadyForSet(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    // When
    const result = await runSet({ cwd, now: fixedNow });
    // Then
    assert.equal(result.nextStage, 'inspect');
    const readme = readReadme(cwd);
    const verifyReport = readFileSync(join(cwd, '.beoreum', 'project', 'verify-report.md'), 'utf8');
    assert.match(readme, /벼름의 7단계/);
    assert.match(readme, /2026-04-28T12:00:00\.000Z/);
    assert.match(verifyReport, /이 자리는 다음 출시에서 채워집니다/);
  });
});

test('README는 ADR 0015의 7개 표준 섹션을 모두 가진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd);
    await runSet({ cwd });
    const readme = readReadme(cwd);
    assert.match(readme, /## 1\. 프로젝트 개요/);
    assert.match(readme, /## 2\. 만들 블럭/);
    assert.match(readme, /## 3\. cascade 결정/);
    assert.match(readme, /## 4\. 아키텍처 결정/);
    assert.match(readme, /## 5\. API 계약/);
    assert.match(readme, /## 6\. 테스트 의도/);
    assert.match(readme, /## 7\. 다음 단계/);
  });
});

test('프로젝트 개요 섹션이 intent.yml에서 합성된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd);
    await runSet({ cwd });
    const readme = readReadme(cwd);
    // mock 어댑터는 commerce 키워드로 what="쇼핑몰"을 잡는다
    assert.match(readme, /무엇을 만드시나요: 쇼핑몰/);
    // who와 why는 mock에서 빈 문자열이라 "(아직 답하지 않음)"이 들어가야 한다
    assert.match(readme, /누구를 위해 만드시나요: _\(아직 답하지 않음\)_/);
    assert.match(readme, /왜 만드시나요: _\(아직 답하지 않음\)_/);
    // 카탈로그 출처
    assert.match(readme, /카탈로그 출처: template:commerce/);
  });
});

test('만들 블럭 섹션에 selected, auto_added, prerequisites가 모두 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: refund(requires로 payment, cancel-return을 끌어온다, prereq도 따라온다)
    await setupReadyForSet(cwd, ['refund']);
    // When
    await runSet({ cwd });
    // Then
    const readme = readReadme(cwd);
    assert.match(readme, /직접 고른 블럭/);
    assert.match(readme, /의존성으로 따라온 블럭/);
    assert.match(readme, /World 0 준비물/);
    // refund와 payment 둘 다 README에 등장한다
    assert.match(readme, /\brefund\b/);
    assert.match(readme, /\bpayment\b/);
  });
});

test('답한 결정과 빈 결정이 별도 섹션으로 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: coupon으로 smelt(cascade 두 결정), 첫 결정만 답함
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: () => {},
    });
    await runSmelt({ cwd, blockIds: ['coupon'] });
    let firstCall = true;
    await interactiveAnswer({
      cwd,
      askAnswer: async (decision) => {
        if (firstCall) {
          firstCall = false;
          return decision.options[0];
        }
        return null;
      },
    });
    await interactiveShape({ cwd, askArchitecture: async () => REST_CHOICES });
    await runForge({ cwd });
    await runTemper({ cwd });
    // When
    await runSet({ cwd });
    // Then
    const readme = readReadme(cwd);
    assert.match(readme, /### 답한 결정/);
    assert.match(readme, /### 답하지 못한 결정/);
    // 답함과 답못함의 합이 전체와 같다는 안내
    assert.match(readme, /총 \d+개 중 1개 답함, \d+개 남음/);
  });
});

test('아키텍처 결정 섹션이 architecture.yml에서 합성된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd);
    await runSet({ cwd });
    const readme = readReadme(cwd);
    assert.match(readme, /언어: `node`/);
    assert.match(readme, /저장소: `postgresql`/);
    assert.match(readme, /API 형식: `rest`/);
    assert.match(readme, /코드 구조: `modular-monolith`/);
  });
});

test('API 계약 섹션이 contracts.yml의 endpoint 정보를 표로 보여준다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const readme = readReadme(cwd);
    // 표 헤더 + order의 5개 endpoint
    assert.match(readme, /\| Operation \| Method \| Path \| 설명 \|/);
    assert.match(readme, /`create`/);
    assert.match(readme, /`POST`/);
    assert.match(readme, /`DELETE`/);
  });
});

test('internal 블럭은 "공개 API 없음" 표시로 등장한다', async () => {
  await withTempCwd(async (cwd) => {
    // payment는 pg-integration(internal)을 requires로 끌어온다
    await setupReadyForSet(cwd, ['payment']);
    await runSet({ cwd });
    const readme = readReadme(cwd);
    assert.match(readme, /internal: 공개 API 없음/);
  });
});

test('테스트 의도 섹션이 GWT 텍스트로 채워진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const readme = readReadme(cwd);
    assert.match(readme, /Given/);
    assert.match(readme, /When/);
    assert.match(readme, /Then/);
    // operation 템플릿이 잡은 한국어 텍스트(create의 then)가 들어와야 한다
    assert.match(readme, /201 응답/);
  });
});

test('state.yml이 inspect로 전환된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd);
    await runSet({ cwd });
    const state = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    assert.equal(state.current_stage, 'inspect');
    assert.deepEqual(state.completed_stages, [
      'prospect',
      'smelt',
      'shape',
      'forge',
      'temper',
      'set',
    ]);
  });
});

test('현재 단계가 set이 아니면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // 한국어 조사("set이/set가")는 영문 식별자 받침에 따라 다르지만 ensureStage는 일관되게
    // "${stage}가 아닙니다"를 쓴다. 자연스러운 조사 처리는 별도 자리(워크로그 참고).
    await assert.rejects(runSet({ cwd }), /현재 단계가 set가 아닙니다/);
  });
});

test('test-scenarios.yml이 없으면 temper 안내 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: () => {},
    });
    await runSmelt({ cwd, blockIds: ['order'] });
    await interactiveShape({ cwd, askArchitecture: async () => REST_CHOICES });
    await runForge({ cwd });
    // temper 건너뜀: 강제로 stage를 set로 옮긴다
    const stateFile = join(cwd, '.beoreum', 'state.yml');
    const state = yaml.load(readFileSync(stateFile, 'utf8'));
    state.current_stage = 'set';
    state.completed_stages = ['prospect', 'smelt', 'shape', 'forge', 'temper'];
    writeFileSync(stateFile, yaml.dump(state, { sortKeys: false }), 'utf8');
    await assert.rejects(runSet({ cwd }), /beoreum temper를 실행해주세요/);
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(runSet({}), /cwd.*필요합니다/);
});
