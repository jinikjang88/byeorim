// interactiveTemper 단위 테스트. ADR 0037(인터랙티브 검토 흐름) + ADR 0038(외부 검토 프롬프트).
// 검토 화면 표시는 cli-temper-picker-helpers.test.js, 프롬프트 합성은 cli-temper-prompt.test.js에서 따로 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import {
  runInit,
  runProspect,
  runSmelt,
  interactiveShape,
  runForge,
  interactiveTemper,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'byeorim-temper-i-'));
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

async function setupReadyForTemper(cwd, blockIds = ['order']) {
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
}

function readScenarios(cwd) {
  return yaml.load(readFileSync(join(cwd, '.byeorim', 'project', 'test-scenarios.yml'), 'utf8'));
}

test('proceed를 누르면 test-scenarios.yml을 쓰고 다음 단계로 advance한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝낸 자리
    await setupReadyForTemper(cwd, ['order']);
    // When
    const result = await interactiveTemper({
      cwd,
      adapter: createMockAdapter(),
      confirmScenarios: async () => 'proceed',
      log: () => {},
    });
    // Then
    const doc = readScenarios(cwd);
    assert.equal(doc.schema_version, 1);
    assert.equal(doc.architecture_api_style, 'rest');
    assert.equal(result.nextStage, 'set');
    const stateDoc = yaml.load(readFileSync(join(cwd, '.byeorim', 'state.yml'), 'utf8'));
    assert.equal(stateDoc.current_stage, 'set');
  });
});

test('redo를 누르면 scenarios를 다시 만들고 두 번째 proceed에서 진행한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝낸 자리
    await setupReadyForTemper(cwd, ['order']);
    let calls = 0;
    // When
    const result = await interactiveTemper({
      cwd,
      adapter: createMockAdapter(),
      confirmScenarios: async () => {
        calls += 1;
        return calls === 1 ? 'redo' : 'proceed';
      },
      log: () => {},
    });
    // Then: confirmScenarios가 두 번 불렸고 결과는 정상
    assert.equal(calls, 2);
    assert.equal(result.nextStage, 'set');
    assert.ok(readScenarios(cwd));
  });
});

test('confirmScenarios에 scenarios/blockCount/scenarioCount/testCodeFilled가 전달된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order 한 개 선택. resource라 5개 endpoint × 1 시나리오
    await setupReadyForTemper(cwd, ['order']);
    let captured = null;
    // When
    await interactiveTemper({
      cwd,
      adapter: createMockAdapter(),
      confirmScenarios: async (args) => {
        captured = args;
        return 'proceed';
      },
      log: () => {},
    });
    // Then
    assert.ok(captured, 'confirmScenarios에 인자가 전달되어야 한다');
    assert.ok(Array.isArray(captured.scenarios));
    assert.equal(captured.blockCount, captured.scenarios.length);
    const total = captured.scenarios.reduce(
      (sum, b) => sum + (b.endpoints || []).reduce((s, ep) => s + (ep.scenarios || []).length, 0),
      0,
    );
    assert.equal(captured.scenarioCount, total);
    assert.equal(captured.testCodeFilled, true);
    assert.ok(captured.adapter);
    assert.equal(captured.adapter.name, 'mock');
    // mock 어댑터는 결정적 어댑터
    assert.equal(captured.adapterIsDeterministic, true);
  });
});

test('adapter가 없으면 testCodeFilled=false로 진행하고 안내 한 줄이 출력된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝낸 자리
    await setupReadyForTemper(cwd, ['order']);
    const logs = [];
    let captured = null;
    // When
    await interactiveTemper({
      cwd,
      adapter: null,
      confirmScenarios: async (args) => {
        captured = args;
        return 'proceed';
      },
      log: (msg) => logs.push(String(msg)),
    });
    // Then: testCodeFilled false, 안내 한 줄 노출, 모든 test_code가 TODO
    assert.equal(captured.testCodeFilled, false);
    assert.ok(
      logs.some((l) => l.includes('test_code 자동 채움 없이')),
      '어댑터 없음 안내가 출력되어야 한다',
    );
    const doc = readScenarios(cwd);
    for (const b of doc.scenarios) {
      for (const ep of b.endpoints || []) {
        for (const s of ep.scenarios || []) {
          assert.equal(s.test_code, 'TODO');
        }
      }
    }
  });
});

test('adapter가 fillTestCode를 구현하지 않으면 testCodeFilled=false로 흐른다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: fillTestCode 없는 어댑터(다른 메서드만 가짐)
    await setupReadyForTemper(cwd, ['order']);
    const partialAdapter = { name: 'partial' };
    let captured = null;
    // When
    await interactiveTemper({
      cwd,
      adapter: partialAdapter,
      confirmScenarios: async (args) => {
        captured = args;
        return 'proceed';
      },
      log: () => {},
    });
    // Then
    assert.equal(captured.testCodeFilled, false);
    assert.equal(captured.adapterIsDeterministic, false);
  });
});

test('redo가 어댑터 호출을 다시 한다(매 루프마다 buildScenarios)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: fillTestCode 호출 횟수를 세는 어댑터
    await setupReadyForTemper(cwd, ['order']);
    let fillCalls = 0;
    let firstRoundScenarioCount = null;
    const countingAdapter = {
      name: 'counting',
      async fillTestCode() {
        fillCalls += 1;
        return '// counted';
      },
    };
    let confirmCalls = 0;
    // When: redo 한 번, 두 번째에 proceed
    await interactiveTemper({
      cwd,
      adapter: countingAdapter,
      confirmScenarios: async ({ scenarioCount }) => {
        confirmCalls += 1;
        if (confirmCalls === 1) {
          firstRoundScenarioCount = scenarioCount;
          return 'redo';
        }
        return 'proceed';
      },
      log: () => {},
    });
    // Then: confirmScenarios는 두 번 불렸고 어댑터는 두 라운드만큼 호출됨
    assert.equal(confirmCalls, 2);
    assert.ok(firstRoundScenarioCount > 0, '첫 라운드에 시나리오가 만들어져야 한다');
    // 매 시나리오당 한 번씩 fillTestCode. 두 라운드.
    assert.equal(fillCalls, firstRoundScenarioCount * 2);
  });
});

test('현재 단계가 temper가 아니면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 한 자리(current_stage = prospect)
    runInit({ cwd });
    // When/Then
    await assert.rejects(
      interactiveTemper({ cwd, log: () => {} }),
      /현재 단계가 temper가 아닙니다/,
    );
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(interactiveTemper({}), /cwd.*필요합니다/);
});

test('proceed 시 test-scenarios-review-prompt.md 부산물이 생성된다(ADR 0038)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝낸 자리
    await setupReadyForTemper(cwd, ['order']);
    // When
    const result = await interactiveTemper({
      cwd,
      adapter: createMockAdapter(),
      confirmScenarios: async () => 'proceed',
      log: () => {},
    });
    // Then: 결과에 부산물 경로가 들어있고 실제 파일이 생성됨
    assert.ok(result.scenariosReviewPromptFile);
    assert.equal(
      result.scenariosReviewPromptFile,
      join(cwd, '.byeorim', 'project', 'prompts', 'test-scenarios-review-prompt.md'),
    );
    assert.equal(existsSync(result.scenariosReviewPromptFile), true);
    const md = readFileSync(result.scenariosReviewPromptFile, 'utf8');
    // 헤더와 검토 셋이 들어있다
    assert.match(md, /# 테스트 시나리오 검토 프롬프트/);
    assert.match(md, /1\. 시나리오 종류 누락/);
    assert.match(md, /2\. test_code 도메인 적합성/);
    assert.match(md, /3\. 시작 무게/);
  });
});

test('부산물에 7항목 답변, 카탈로그, 선택 블럭, 아키텍처, contracts, 시나리오가 모두 담긴다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝낸 자리(prospect 답변에 what이 들어있음)
    await setupReadyForTemper(cwd, ['order']);
    // When
    const result = await interactiveTemper({
      cwd,
      adapter: createMockAdapter(),
      confirmScenarios: async () => 'proceed',
      log: () => {},
    });
    const md = readFileSync(result.scenariosReviewPromptFile, 'utf8');
    // Then: 6개 섹션 헤더가 모두 보임
    assert.match(md, /## 사용자 7항목 답변/);
    assert.match(md, /## 카탈로그 전체 블럭/);
    assert.match(md, /## 사용자가 고른 블럭/);
    assert.match(md, /## 4개 아키텍처 결정/);
    assert.match(md, /## API 계약 요약/);
    assert.match(md, /## 테스트 시나리오/);
    // 7항목에서 what이 노출
    assert.match(md, /- what: 쇼핑몰/);
    // 아키텍처 결정값 노출
    assert.match(md, /- 언어: node/);
    assert.match(md, /- API 형태: rest/);
    // 선택한 블럭(order)이 노출
    assert.match(md, /- order/);
    // mock 어댑터의 test_code가 ```js 코드 블록으로 들어감(language=node → js 라벨)
    assert.match(md, /```js/);
  });
});

test('redo 후 proceed에서도 부산물이 마지막 시나리오로 갱신된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 두 번째 라운드에서 proceed
    await setupReadyForTemper(cwd, ['order']);
    let calls = 0;
    // When
    const result = await interactiveTemper({
      cwd,
      adapter: createMockAdapter(),
      confirmScenarios: async () => {
        calls += 1;
        return calls === 1 ? 'redo' : 'proceed';
      },
      log: () => {},
    });
    // Then: 부산물이 한 번만 만들어지고 시나리오 개수가 시나리오와 일치
    assert.ok(existsSync(result.scenariosReviewPromptFile));
    const md = readFileSync(result.scenariosReviewPromptFile, 'utf8');
    // 시나리오 5개 블럭 헤더가 보임(order는 resource → 5 endpoint × 1 시나리오)
    assert.match(md, /시나리오 5개/);
  });
});

test('adapter 없이 proceed해도 부산물은 생성된다(test_code TODO 자리도 안내됨)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝낸 자리
    await setupReadyForTemper(cwd, ['order']);
    // When: 어댑터 없이 진행
    const result = await interactiveTemper({
      cwd,
      adapter: null,
      confirmScenarios: async () => 'proceed',
      log: () => {},
    });
    // Then: 부산물이 만들어지고 모든 test_code 자리가 TODO 안내
    assert.ok(existsSync(result.scenariosReviewPromptFile));
    const md = readFileSync(result.scenariosReviewPromptFile, 'utf8');
    assert.match(md, /\(TODO — 아직 채워지지 않음\)/);
  });
});

test('claude 같은 비결정 어댑터에서는 결정성 안내가 false로 전달된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 이름이 claude인 가상 어댑터
    await setupReadyForTemper(cwd, ['order']);
    const claudeLike = {
      name: 'claude',
      async fillTestCode() {
        return '// claude generated';
      },
    };
    let captured = null;
    // When
    await interactiveTemper({
      cwd,
      adapter: claudeLike,
      confirmScenarios: async (args) => {
        captured = args;
        return 'proceed';
      },
      log: () => {},
    });
    // Then
    assert.equal(captured.adapterIsDeterministic, false);
    assert.equal(captured.testCodeFilled, true);
  });
});
