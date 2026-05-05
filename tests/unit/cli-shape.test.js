// interactiveShape 단위 테스트. ADR 0012(architecture.yml 형식과 4개 결정),
// ADR 0011(askArchitecture 의존성 주입), ADR 0032(아키텍처 추천과 검토 흐름),
// ADR 0033(외부 검토 프롬프트 부산물).

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
  interactiveAnswer,
  interactiveShape,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-shape-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// init → prospect → smelt까지 끝낸 자리. shape 단계에 들어와 있는 상태.
async function setupReadyForShape(cwd, blockIds = ['order']) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  await runSmelt({ cwd, blockIds });
}

const FIXED_CHOICES = {
  language: 'node',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

// 검토 단계를 자동으로 'proceed'로 통과시키는 confirm. 대부분의 테스트가 그대로 진행하는 자리.
const ALWAYS_PROCEED = async () => 'proceed';

test('정상 흐름: shape이 architecture.yml을 만들고 단계가 forge로 넘어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupReadyForShape(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    const askArchitecture = async () => FIXED_CHOICES;
    // When
    const result = await interactiveShape({
      cwd,
      askArchitecture,
      confirmArchitecture: ALWAYS_PROCEED,
      now: fixedNow,
      log: () => {},
    });
    // Then: architecture.yml이 자리잡고 다음 단계는 forge
    assert.equal(result.nextStage, 'forge');
    const doc = yaml.load(readFileSync(result.architectureFile, 'utf8'));
    assert.equal(doc.schema_version, 1);
    assert.equal(doc.created_at, '2026-04-28T12:00:00.000Z');
    assert.equal(doc.language, 'node');
    assert.equal(doc.database, 'postgresql');
    assert.equal(doc.api_style, 'rest');
    assert.equal(doc.architecture_pattern, 'modular-monolith');
  });
});

test('context와 recommendation이 askArchitecture에 함께 전달된다(ADR 0032 결정 2)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: coupon으로 smelt(cascade 결정 두 개 생성)
    await setupReadyForShape(cwd, ['coupon']);
    let receivedArgs = null;
    const askArchitecture = async (args) => {
      receivedArgs = args;
      return FIXED_CHOICES;
    };
    // When
    await interactiveShape({
      cwd,
      askArchitecture,
      confirmArchitecture: ALWAYS_PROCEED,
      log: () => {},
    });
    // Then: context와 recommendation 둘 다 자리잡힘
    assert.equal(typeof receivedArgs, 'object');
    assert.equal(typeof receivedArgs.context, 'object');
    assert.equal(typeof receivedArgs.recommendation, 'object');
    assert.equal(typeof receivedArgs.context.selectedCount, 'number');
    assert.equal(typeof receivedArgs.context.autoAddedCount, 'number');
    assert.equal(typeof receivedArgs.context.decisionsTotal, 'number');
    assert.equal(typeof receivedArgs.context.decisionsAnswered, 'number');
    assert.equal(typeof receivedArgs.context.decisionsPending, 'number');
    // coupon 카탈로그 데이터에는 cascade가 두 개 걸려있다
    assert.equal(receivedArgs.context.decisionsTotal >= 1, true);
  });
});

test('cascade 답안이 채워진 뒤 shape를 돌리면 답한 수가 맥락에 반영된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: coupon으로 smelt → answer로 일부 답
    await setupReadyForShape(cwd, ['coupon']);
    let firstCall = true;
    await interactiveAnswer({
      cwd,
      askAnswer: async (decision) => {
        // 첫 결정만 답하고 나머지는 건너뛴다
        if (firstCall) {
          firstCall = false;
          return decision.options[0];
        }
        return null;
      },
    });
    // When: shape의 askArchitecture가 받는 context를 본다
    let receivedArgs = null;
    const askArchitecture = async (args) => {
      receivedArgs = args;
      return FIXED_CHOICES;
    };
    await interactiveShape({
      cwd,
      askArchitecture,
      confirmArchitecture: ALWAYS_PROCEED,
      log: () => {},
    });
    // Then: decisionsAnswered가 1, decisionsPending이 1 이상
    assert.equal(receivedArgs.context.decisionsAnswered, 1);
    assert.ok(receivedArgs.context.decisionsPending >= 1);
  });
});

test('state.yml이 shape 완료를 반영한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupReadyForShape(cwd);
    // When
    await interactiveShape({
      cwd,
      askArchitecture: async () => FIXED_CHOICES,
      confirmArchitecture: ALWAYS_PROCEED,
      log: () => {},
    });
    // Then: current_stage가 forge로, completed_stages에 prospect/smelt/shape가 모두 들어간다
    const state = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    assert.equal(state.current_stage, 'forge');
    assert.deepEqual(state.completed_stages, ['prospect', 'smelt', 'shape']);
  });
});

test('단계 검증이 askArchitecture 호출 전에 일어난다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 한 자리(current_stage = prospect)
    runInit({ cwd });
    let askCalled = false;
    const askArchitecture = async () => {
      askCalled = true;
      return FIXED_CHOICES;
    };
    // When/Then
    await assert.rejects(
      interactiveShape({
        cwd,
        askArchitecture,
        confirmArchitecture: ALWAYS_PROCEED,
        log: () => {},
      }),
      /현재 단계가 shape가 아닙니다/,
    );
    assert.equal(askCalled, false, 'askArchitecture는 단계 검증 통과 후에만 호출되어야 한다');
  });
});

test('selected-blocks.yml이 누락되면 smelt 안내 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 하고 state.yml을 강제로 shape로 옮긴 자리
    runInit({ cwd });
    const stateFile = join(cwd, '.beoreum', 'state.yml');
    const state = yaml.load(readFileSync(stateFile, 'utf8'));
    state.current_stage = 'shape';
    state.completed_stages = ['prospect', 'smelt'];
    const { writeFileSync } = await import('node:fs');
    writeFileSync(stateFile, yaml.dump(state, { sortKeys: false }), 'utf8');
    // When/Then: 입력 파일 부재
    await assert.rejects(
      interactiveShape({
        cwd,
        askArchitecture: async () => FIXED_CHOICES,
        confirmArchitecture: ALWAYS_PROCEED,
        log: () => {},
      }),
      /beoreum smelt를 실행해주세요/,
    );
  });
});

test('표준 옵션이 아닌 값은 ADR 0012의 표준을 따르지 않는다는 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupReadyForShape(cwd);
    // When/Then: 가짜 값
    await assert.rejects(
      interactiveShape({
        cwd,
        askArchitecture: async () => ({
          ...FIXED_CHOICES,
          language: 'cobol',
        }),
        confirmArchitecture: ALWAYS_PROCEED,
        log: () => {},
      }),
      /language의 값 "cobol"는 표준 옵션이 아닙니다/,
    );
  });
});

test('필수 결정이 누락되면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupReadyForShape(cwd);
    // When/Then: language를 빼고 돌려준다
    await assert.rejects(
      interactiveShape({
        cwd,
        askArchitecture: async () => {
          const { language: _omit, ...rest } = FIXED_CHOICES;
          return rest;
        },
        confirmArchitecture: ALWAYS_PROCEED,
        log: () => {},
      }),
      /language 결정이 비어있습니다/,
    );
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(interactiveShape({}), /cwd.*필요합니다/);
});

// ── ADR 0032 추천 + 검토 흐름 ─────────────────────────────────

test('adapter가 주어지면 recommendArchitecture 결과가 askArchitecture에 전달된다(ADR 0032 결정 1)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리 + mock 어댑터(recommendArchitecture 구현)
    await setupReadyForShape(cwd);
    const adapter = createMockAdapter();
    let receivedArgs = null;
    const askArchitecture = async (args) => {
      receivedArgs = args;
      return FIXED_CHOICES;
    };
    // When
    await interactiveShape({
      cwd,
      adapter,
      askArchitecture,
      confirmArchitecture: ALWAYS_PROCEED,
      log: () => {},
    });
    // Then: 추천 결과가 흘러옴(mock은 4개 결정에 표준 첫 옵션을 추천)
    assert.equal(receivedArgs.recommendation.recommended.language, 'node');
    assert.equal(receivedArgs.recommendation.recommended.database, 'postgresql');
    assert.equal(receivedArgs.recommendation.recommended.api_style, 'rest');
    assert.equal(receivedArgs.recommendation.recommended.architecture_pattern, 'monolith');
    // 두 시점 reasons가 채워져 있다(picker가 user만 노출)
    assert.equal(typeof receivedArgs.recommendation.reasons.language.user, 'string');
    assert.equal(typeof receivedArgs.recommendation.reasons.language.dev, 'string');
  });
});

test('adapter가 recommendArchitecture를 구현하지 않으면 빈 추천으로 진행한다(ADR 0032 결정 4)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리. recommendArchitecture 없는 어댑터.
    await setupReadyForShape(cwd);
    const adapterNoArchRec = {
      name: 'partial',
      // 다른 메서드들은 명시 안 함. recommendArchitecture만 없으면 됨.
    };
    let receivedRecommendation = null;
    let logMessages = [];
    const askArchitecture = async ({ recommendation }) => {
      receivedRecommendation = recommendation;
      return FIXED_CHOICES;
    };
    // When
    await interactiveShape({
      cwd,
      adapter: adapterNoArchRec,
      askArchitecture,
      confirmArchitecture: ALWAYS_PROCEED,
      log: (msg) => logMessages.push(msg),
    });
    // Then: 빈 추천. 한국어 안내 한 줄.
    assert.deepEqual(receivedRecommendation, { recommended: {}, reasons: {} });
    assert.ok(
      logMessages.some((m) => m.includes('AI 추천 없이 진행')),
      '어댑터 미구현 시 한국어 안내가 있어야 함',
    );
  });
});

test('adapter가 없으면 빈 추천으로 진행한다(graceful)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리. adapter 미주입.
    await setupReadyForShape(cwd);
    let receivedRecommendation = null;
    const askArchitecture = async ({ recommendation }) => {
      receivedRecommendation = recommendation;
      return FIXED_CHOICES;
    };
    // When
    await interactiveShape({
      cwd,
      askArchitecture,
      confirmArchitecture: ALWAYS_PROCEED,
      log: () => {},
    });
    // Then: 빈 추천
    assert.deepEqual(receivedRecommendation, { recommended: {}, reasons: {} });
  });
});

test('confirmArchitecture가 redo를 돌려주면 askArchitecture를 다시 호출한다(ADR 0032 결정 3)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupReadyForShape(cwd);
    let askCallCount = 0;
    const askArchitecture = async () => {
      askCallCount += 1;
      // 첫 호출에서 한 자리 잘못 골랐다고 가정. 두 번째 호출에서 올바른 값.
      if (askCallCount === 1) {
        return { ...FIXED_CHOICES, language: 'java' };
      }
      return FIXED_CHOICES;
    };
    let confirmCallCount = 0;
    const confirmArchitecture = async () => {
      confirmCallCount += 1;
      // 첫 confirm은 redo, 두 번째는 proceed
      return confirmCallCount === 1 ? 'redo' : 'proceed';
    };
    // When
    const result = await interactiveShape({
      cwd,
      askArchitecture,
      confirmArchitecture,
      log: () => {},
    });
    // Then: ask 두 번, confirm 두 번. 산출물은 두 번째 선택이 들어감
    assert.equal(askCallCount, 2);
    assert.equal(confirmCallCount, 2);
    assert.equal(result.choices.language, 'node');
    const doc = yaml.load(readFileSync(result.architectureFile, 'utf8'));
    assert.equal(doc.language, 'node');
  });
});

test('confirmArchitecture가 받는 choices는 askArchitecture가 돌려준 값과 같다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupReadyForShape(cwd);
    let receivedChoices = null;
    const confirmArchitecture = async ({ choices }) => {
      receivedChoices = choices;
      return 'proceed';
    };
    // When
    await interactiveShape({
      cwd,
      askArchitecture: async () => FIXED_CHOICES,
      confirmArchitecture,
      log: () => {},
    });
    // Then
    assert.deepEqual(receivedChoices, FIXED_CHOICES);
  });
});

// ── ADR 0033: architecture-review-prompt.md 부산물 ─────

test('shape이 끝나면 prompts/architecture-review-prompt.md 부산물이 자리잡는다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupReadyForShape(cwd);
    // When: 추천 없이 shape 진행
    const result = await interactiveShape({
      cwd,
      askArchitecture: async () => FIXED_CHOICES,
      confirmArchitecture: async () => 'proceed',
      log: () => {},
    });
    // Then
    assert.ok(result.architectureReviewPromptFile, 'result.architectureReviewPromptFile이 빠짐');
    assert.equal(existsSync(result.architectureReviewPromptFile), true);
    assert.match(result.architectureReviewPromptFile, /prompts\/architecture-review-prompt\.md$/);
  });
});

test('architecture-review-prompt.md 본문에 4개 결정과 추천 두 시점이 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리. 추천을 두 시점으로 넣은 어댑터.
    await setupReadyForShape(cwd);
    const adapter = {
      name: 'test',
      async recommendArchitecture() {
        return {
          recommended: { language: 'node', database: 'postgresql' },
          reasons: {
            language: { user: '쇼핑몰에 익숙해요', dev: 'Node + Express' },
            database: { user: '관계형이 안전해요', dev: 'PG ACID' },
          },
        };
      },
    };
    // When
    const result = await interactiveShape({
      cwd,
      adapter,
      askArchitecture: async () => FIXED_CHOICES,
      confirmArchitecture: async () => 'proceed',
      log: () => {},
    });
    const md = readFileSync(result.architectureReviewPromptFile, 'utf8');
    // 4개 결정 사용자 선택값
    assert.match(md, /## 4개 아키텍처 결정/);
    assert.match(md, /언어: node/);
    assert.match(md, /저장소: postgresql/);
    assert.match(md, /API 형태: rest/);
    assert.match(md, /코드 구조: modular-monolith/);
    // 추천 두 시점이 둘 다 노출(ADR 0033 결정 4)
    assert.match(md, /## AI 추천/);
    assert.match(md, /일반 사용자 시점: 쇼핑몰에 익숙해요/);
    assert.match(md, /개발자 시점: Node \+ Express/);
    assert.match(md, /일반 사용자 시점: 관계형이 안전해요/);
    assert.match(md, /개발자 시점: PG ACID/);
    // 카탈로그 전체와 12개 표준 옵션 표
    assert.match(md, /## 카탈로그 전체 블럭/);
    assert.match(md, /## 표준 옵션 표/);
    assert.match(md, /- node: Node\.js/);
    assert.match(md, /- mongodb: MongoDB/);
    // 검토 셋
    assert.match(md, /1. 도메인 적합성/);
    assert.match(md, /2. 결정 사이 트레이드오프/);
    assert.match(md, /3. 시작 무게/);
  });
});

// ── 작업 C+D: picker context 요약과 옵션 description ─────

test('askArchitecture가 context와 log를 받아 picker 시작에 요약을 출력할 수 있다', async () => {
  // 헬퍼(formatContextSummary)의 출력 결은 shape-picker-helpers 단위 테스트가 본다.
  // 여기서는 interactiveShape가 askArchitecture에 context와 log를 흘려준다는 약속만 본다.
  await withTempCwd(async (cwd) => {
    await setupReadyForShape(cwd);
    const logged = [];
    let receivedArgs = null;
    const askArchitecture = async (args) => {
      receivedArgs = args;
      args.log('TRACE:askArchitecture가 log를 받음');
      return FIXED_CHOICES;
    };
    await interactiveShape({
      cwd,
      askArchitecture,
      confirmArchitecture: ALWAYS_PROCEED,
      log: (msg) => logged.push(msg),
    });
    // context 자리잡힘
    assert.equal(typeof receivedArgs.context.selectedCount, 'number');
    assert.equal(typeof receivedArgs.context.autoAddedCount, 'number');
    // log가 askArchitecture에 흘러감
    assert.equal(typeof receivedArgs.log, 'function');
    assert.ok(logged.includes('TRACE:askArchitecture가 log를 받음'));
  });
});

test('어댑터가 없어도 부산물은 빈 추천으로 자리잡는다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리. adapter 미주입.
    await setupReadyForShape(cwd);
    // When
    const result = await interactiveShape({
      cwd,
      askArchitecture: async () => FIXED_CHOICES,
      confirmArchitecture: async () => 'proceed',
      log: () => {},
    });
    const md = readFileSync(result.architectureReviewPromptFile, 'utf8');
    // 추천 자리는 비어있음 안내(ADR 0033 결정 4)
    assert.match(md, /## AI 추천/);
    assert.match(md, /이번 흐름은 추천이 비어있어요/);
    // 다른 자리는 모두 살아남(4개 결정, 표준 옵션 표 등)
    assert.match(md, /## 4개 아키텍처 결정/);
    assert.match(md, /## 표준 옵션 표/);
  });
});
