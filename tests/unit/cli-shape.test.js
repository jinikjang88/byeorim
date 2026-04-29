// interactiveShape 단위 테스트. ADR 0012(architecture.yml 형식과 4개 결정)와
// ADR 0011(askArchitecture 의존성 주입).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    userInput: '쇼핑몰 만들어줘',
    adapter: createMockAdapter(),
  });
  await runSmelt({ cwd, blockIds });
}

const FIXED_CHOICES = {
  language: 'node',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

test('정상 흐름: shape이 architecture.yml을 만들고 단계가 forge로 넘어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupReadyForShape(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    const askArchitecture = async () => FIXED_CHOICES;
    // When
    const result = await interactiveShape({ cwd, askArchitecture, now: fixedNow });
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

test('context가 askArchitecture에 전달된다(맥락 표시 자리)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: coupon으로 smelt(cascade 결정 두 개 생성)
    await setupReadyForShape(cwd, ['coupon']);
    let receivedContext = null;
    const askArchitecture = async (context) => {
      receivedContext = context;
      return FIXED_CHOICES;
    };
    // When
    await interactiveShape({ cwd, askArchitecture });
    // Then: 맥락 객체에 selected/auto_added/decisions 같은 자리가 채워져 있다
    assert.equal(typeof receivedContext, 'object');
    assert.equal(typeof receivedContext.selectedCount, 'number');
    assert.equal(typeof receivedContext.autoAddedCount, 'number');
    assert.equal(typeof receivedContext.decisionsTotal, 'number');
    assert.equal(typeof receivedContext.decisionsAnswered, 'number');
    assert.equal(typeof receivedContext.decisionsPending, 'number');
    // coupon 카탈로그 데이터에는 cascade가 두 개 걸려있다
    assert.equal(receivedContext.decisionsTotal >= 1, true);
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
    let receivedContext = null;
    const askArchitecture = async (context) => {
      receivedContext = context;
      return FIXED_CHOICES;
    };
    await interactiveShape({ cwd, askArchitecture });
    // Then: decisionsAnswered가 1, decisionsPending이 1 이상
    assert.equal(receivedContext.decisionsAnswered, 1);
    assert.ok(receivedContext.decisionsPending >= 1);
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
      interactiveShape({ cwd, askArchitecture }),
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
      interactiveShape({ cwd, askArchitecture: async () => FIXED_CHOICES }),
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
      }),
      /language 결정이 비어있습니다/,
    );
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(interactiveShape({}), /cwd.*필요합니다/);
});
