// interactiveAnswer 단위 테스트. ADR 0010(decisions.yml 형식)과 ADR 0011(askAnswer 의존성 주입).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runInit, runProspect, runSmelt, interactiveAnswer } from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-answer-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// init → prospect → smelt(coupon)까지 끝낸 자리. coupon 카탈로그 데이터에 cascade 두 결정이 들어있다.
async function setupWithCouponDecisions(cwd) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  return runSmelt({ cwd, blockIds: ['coupon'] });
}

function readDecisions(cwd) {
  return yaml.load(readFileSync(join(cwd, '.beoreum', 'project', 'decisions.yml'), 'utf8'));
}

test('빈 answer 항목을 차례로 askAnswer에 전달하고 답을 적용한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리(coupon에 두 결정)
    await setupWithCouponDecisions(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    // mock askAnswer는 항상 첫 옵션을 고른다(결정성 + 카탈로그 데이터 의존을 명시)
    const askAnswer = async (decision) => decision.options[0];
    // When
    const result = await interactiveAnswer({ cwd, askAnswer, now: fixedNow });
    // Then: 두 결정 모두 답이 들어가고 answered_at이 채워진다
    assert.equal(result.unansweredBefore, 2);
    assert.equal(result.answeredCount, 2);
    assert.equal(result.skippedCount, 0);
    assert.equal(result.allAnswered, true);
    const doc = readDecisions(cwd);
    for (const d of doc.decisions) {
      assert.notEqual(d.answer, '');
      assert.equal(d.answered_at, '2026-04-28T12:00:00.000Z');
    }
  });
});

test('askAnswer가 null을 돌려주면 그 항목을 건너뛰고 빈 answer를 유지한다(동행 톤)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupWithCouponDecisions(cwd);
    // 모든 결정을 건너뛴다
    const askAnswer = async () => null;
    // When
    const result = await interactiveAnswer({ cwd, askAnswer });
    // Then: 답한 항목 0, 건너뛴 항목은 unansweredBefore와 같다
    assert.equal(result.answeredCount, 0);
    assert.equal(result.skippedCount, result.unansweredBefore);
    assert.equal(result.allAnswered, false);
    // decisions.yml의 answer는 그대로 빈 문자열, answered_at은 null
    const doc = readDecisions(cwd);
    for (const d of doc.decisions) {
      assert.equal(d.answer, '');
      assert.equal(d.answered_at, null);
    }
  });
});

test('첫 결정만 답하고 나머지는 건너뛴 뒤 다시 부르면 남은 결정만 다시 묻는다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리
    await setupWithCouponDecisions(cwd);
    // 첫 결정만 답하고 두 번째는 null로 건너뛴다
    let calls = 0;
    const firstPass = async (decision) => {
      calls += 1;
      return calls === 1 ? decision.options[0] : null;
    };
    const r1 = await interactiveAnswer({ cwd, askAnswer: firstPass });
    assert.equal(r1.answeredCount, 1);
    assert.equal(r1.skippedCount, 1);
    // When: 다시 호출 — 답하지 않은 한 건만 askAnswer로 들어와야 한다
    let secondCalls = 0;
    const secondPass = async (decision) => {
      secondCalls += 1;
      return decision.options[0];
    };
    const r2 = await interactiveAnswer({ cwd, askAnswer: secondPass });
    // Then: 두 번째 호출은 한 건만 처리
    assert.equal(secondCalls, 1, '이미 답한 항목은 다시 묻지 않아야 한다');
    assert.equal(r2.unansweredBefore, 1);
    assert.equal(r2.answeredCount, 1);
    assert.equal(r2.allAnswered, true);
  });
});

test('decisions.yml이 없으면 한국어 메시지로 smelt 실행을 안내한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 가지 않은 자리
    runInit({ cwd });
    // When/Then
    await assert.rejects(
      interactiveAnswer({ cwd, askAnswer: async () => null }),
      /beoreum smelt를 실행해주세요/,
    );
  });
});

test('모든 결정이 이미 답한 상태면 askAnswer를 한 번도 부르지 않는다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 두 결정 모두 답한 상태
    await setupWithCouponDecisions(cwd);
    const fillAll = async (decision) => decision.options[0];
    await interactiveAnswer({ cwd, askAnswer: fillAll });
    // When: 다시 호출
    let askCalled = false;
    const result = await interactiveAnswer({
      cwd,
      askAnswer: async () => {
        askCalled = true;
        return null;
      },
    });
    // Then: askAnswer 호출 없음, 모두 답한 상태로 보고
    assert.equal(askCalled, false);
    assert.equal(result.unansweredBefore, 0);
    assert.equal(result.answeredCount, 0);
    assert.equal(result.allAnswered, true);
  });
});

test('decisions.yml에 결정이 한 개도 없으면 답할 자리가 없다고 보고한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: cascade 트리거가 없는 블럭으로 smelt(decisions가 비어있는 자리).
    //       commerce 카탈로그에서 order는 cascade trigger가 아니다.
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: () => {},
    });
    await runSmelt({ cwd, blockIds: ['order'] });
    // When
    const result = await interactiveAnswer({ cwd, askAnswer: async () => null });
    // Then: 빈 결과를 그대로 알려준다
    assert.equal(result.totalCount, 0);
    assert.equal(result.unansweredBefore, 0);
    assert.equal(result.answeredCount, 0);
    assert.equal(result.allAnswered, false, '결정이 없으면 allAnswered는 false');
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(interactiveAnswer({}), /cwd.*필요합니다/);
});
