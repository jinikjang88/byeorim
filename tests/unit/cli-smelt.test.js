// runSmelt 단위 테스트. init → prospect → smelt 흐름 위에서 ADR 0010 형식과 동행 톤을 본다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runInit, runProspect, runSmelt, interactiveSmelt } from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-smelt-'));
}

// 비동기 fn이 끝난 뒤 임시 디렉토리를 청소한다. await로 finally가 fn 완료 후에 도는 것을 보장.
async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// init → prospect까지 한 번에 끝낸 자리를 만든다. smelt 단계에 들어와 있는 상태.
async function setupReadyForSmelt(cwd, answers = { what: '쇼핑몰' }) {
  runInit({ cwd });
  await runProspect({ cwd, answers, adapter: createMockAdapter(), log: () => {} });
}

test('정상 흐름: init → prospect → smelt가 두 산출물을 만들고 단계가 shape로 넘어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 쇼핑몰로 prospect까지 끝낸 자리
    await setupReadyForSmelt(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    // When: 한 블럭(commerce 카탈로그에서 추론한 ID)으로 smelt
    const result = await runSmelt({ cwd, blockIds: ['order'], now: fixedNow });
    // Then: 두 산출물이 자리에 있고 다음 단계는 shape
    assert.equal(existsSync(result.selectedBlocksFile), true);
    assert.equal(existsSync(result.decisionsFile), true);
    assert.equal(result.nextStage, 'shape');
  });
});

test('selected-blocks.yml 형식이 ADR 0010 결정 1을 따른다(다섯 필드)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: prospect까지 완료
    await setupReadyForSmelt(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    // When: smelt
    await runSmelt({ cwd, blockIds: ['order'], now: fixedNow });
    // Then: selected-blocks.yml의 다섯 필드가 ADR 형식을 따른다
    const file = join(cwd, '.beoreum', 'project', 'selected-blocks.yml');
    const doc = yaml.load(readFileSync(file, 'utf8'));
    assert.equal(doc.schema_version, 1);
    assert.equal(doc.created_at, '2026-04-28T12:00:00.000Z');
    assert.deepEqual(doc.selected, ['order']);
    assert.ok(Array.isArray(doc.auto_added));
    assert.ok(Array.isArray(doc.affected));
    assert.ok(Array.isArray(doc.prerequisites));
  });
});

test('decisions.yml은 각 질문에 빈 answer와 null answered_at을 미리 둔다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: prospect까지 완료
    await setupReadyForSmelt(cwd);
    // When: cascade가 걸린 블럭을 선택해 smelt 실행.
    //       이 단언은 commerce 카탈로그 데이터(coupon에 두 cascade 질문)에 의존한다(CLAUDE.md 섹션 8 데이터 무관성 노트).
    await runSmelt({ cwd, blockIds: ['coupon'] });
    // Then: decisions.yml에 답 자리가 비어있는 항목이 들어있다
    const file = join(cwd, '.beoreum', 'project', 'decisions.yml');
    const doc = yaml.load(readFileSync(file, 'utf8'));
    assert.ok(doc.decisions.length >= 1, 'cascade 결정이 한 개 이상 수집되어야 한다');
    for (const d of doc.decisions) {
      assert.equal(typeof d.question, 'string');
      assert.ok(Array.isArray(d.options));
      assert.equal(d.answer, '', 'answer는 빈 문자열로 시작해야 한다(동행 톤)');
      assert.equal(d.answered_at, null, 'answered_at은 null로 시작해야 한다');
    }
  });
});

test('requires 의존성으로 끌려온 블럭이 auto_added에 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: prospect까지 완료
    await setupReadyForSmelt(cwd);
    // When: requires 체인을 가진 블럭 선택.
    //       commerce 카탈로그 데이터 의존: refund requires payment, cancel-return.
    await runSmelt({ cwd, blockIds: ['refund'] });
    // Then: auto_added에 끌려온 블럭이 보인다
    const doc = yaml.load(
      readFileSync(join(cwd, '.beoreum', 'project', 'selected-blocks.yml'), 'utf8'),
    );
    assert.equal(doc.auto_added.includes('payment'), true);
    assert.equal(doc.auto_added.includes('cancel-return'), true);
  });
});

test('prerequisites가 객체 전체로 직렬화된다(ADR 0010 결정 4)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: prospect까지 완료
    await setupReadyForSmelt(cwd);
    // When: prereq를 부르는 블럭 선택.
    //       commerce 카탈로그 데이터 의존: payment를 enables하는 prereq가 둘.
    await runSmelt({ cwd, blockIds: ['payment'] });
    // Then: prerequisites 항목이 ID뿐 아니라 name과 enables 등을 가진다
    const doc = yaml.load(
      readFileSync(join(cwd, '.beoreum', 'project', 'selected-blocks.yml'), 'utf8'),
    );
    assert.ok(doc.prerequisites.length >= 1);
    for (const p of doc.prerequisites) {
      assert.equal(typeof p.id, 'string');
      assert.equal(typeof p.name, 'string');
      assert.ok(Array.isArray(p.enables));
    }
  });
});

test('state.yml이 smelt 완료를 반영한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: prospect까지 완료
    await setupReadyForSmelt(cwd);
    // When: smelt
    await runSmelt({ cwd, blockIds: ['order'] });
    // Then: current_stage가 shape로, completed_stages에 prospect와 smelt가 모두 들어간다
    const state = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    assert.equal(state.current_stage, 'shape');
    assert.deepEqual(state.completed_stages, ['prospect', 'smelt']);
  });
});

test('카탈로그에 없는 블럭 ID는 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: prospect까지 완료
    await setupReadyForSmelt(cwd);
    // When/Then: 가상 ID
    await assert.rejects(
      runSmelt({ cwd, blockIds: ['ghost-block', 'order'] }),
      /카탈로그에 없는 블럭 ID가 있습니다.*ghost-block/s,
    );
  });
});

test('현재 단계가 smelt가 아니면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 한 자리(current_stage = prospect)
    runInit({ cwd });
    // When/Then: smelt 호출은 단계 불일치
    await assert.rejects(runSmelt({ cwd, blockIds: ['order'] }), /현재 단계가 smelt가 아닙니다/);
  });
});

test('intent.yml이 누락되면 prospect 안내 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: prospect까지 완료한 뒤 intent.yml만 삭제
    await setupReadyForSmelt(cwd);
    unlinkSync(join(cwd, '.beoreum', 'project', 'intent.yml'));
    // When/Then: 누락 메시지 + prospect 안내
    await assert.rejects(runSmelt({ cwd, blockIds: ['order'] }), /beoreum prospect를 실행해주세요/);
  });
});

test('필수 인자 누락은 한국어로 거부한다', async () => {
  // cwd 누락
  await assert.rejects(runSmelt({}), /cwd.*필요합니다/);
  // blockIds 누락
  await assert.rejects(runSmelt({ cwd: '/tmp' }), /blockIds.*필요합니다/);
  // blockIds 빈 배열
  await assert.rejects(runSmelt({ cwd: '/tmp', blockIds: [] }), /blockIds.*필요합니다/);
});

// ── interactiveSmelt: ADR 0011 picker 의존성 주입 + ADR 0029 추천/검토 ──────────

const proceedConfirm = async () => 'proceed';
const silentLog = () => {};

test('interactiveSmelt: picker가 고른 블럭으로 smelt가 끝까지 동작한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    const pickBlocks = async ({ catalog }) => {
      assert.ok(Array.isArray(catalog.blocks), 'picker는 catalog를 받아야 한다');
      return ['order'];
    };
    const result = await interactiveSmelt({
      cwd,
      pickBlocks,
      confirmSelection: proceedConfirm,
      log: silentLog,
    });
    assert.deepEqual(result.selected, ['order']);
    assert.equal(result.nextStage, 'shape');
  });
});

test('interactiveSmelt: picker가 카탈로그 전체와 추천을 받는다(ADR 0029)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    let received = null;
    const pickBlocks = async (args) => {
      received = args;
      return [args.catalog.blocks[0].id];
    };
    await interactiveSmelt({
      cwd,
      pickBlocks,
      confirmSelection: proceedConfirm,
      log: silentLog,
    });
    assert.ok(received.catalog.blocks.length > 0);
    assert.equal(typeof received.catalog.blocks[0].id, 'string');
    assert.ok(received.recommendation, 'picker는 recommendation을 받아야 한다');
    assert.ok(Array.isArray(received.recommendation.recommended));
    assert.equal(typeof received.recommendation.reasons, 'object');
  });
});

test('interactiveSmelt: adapter가 주어지면 recommendBlocks가 호출되고 결과가 picker로 전달된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    let recCalled = false;
    const adapter = {
      ...createMockAdapter(),
      async recommendBlocks({ answers, catalog }) {
        recCalled = true;
        assert.equal(typeof answers, 'object');
        assert.ok(Array.isArray(catalog.blocks));
        return {
          recommended: ['order'],
          reasons: { order: { user: '핵심으로 보여요', dev: 'order create' } },
        };
      },
    };
    let pickerSawRec = null;
    const pickBlocks = async ({ recommendation }) => {
      pickerSawRec = recommendation;
      return ['order'];
    };
    await interactiveSmelt({
      cwd,
      adapter,
      pickBlocks,
      confirmSelection: proceedConfirm,
      log: silentLog,
    });
    assert.equal(recCalled, true);
    assert.deepEqual(pickerSawRec.recommended, ['order']);
    assert.deepEqual(pickerSawRec.reasons.order, {
      user: '핵심으로 보여요',
      dev: 'order create',
    });
  });
});

test('interactiveSmelt: adapter가 recommendBlocks 미구현이면 빈 추천으로 진행한다(ADR 0029 결정 4)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    const adapter = { name: 'noop' }; // recommendBlocks 없음
    let pickerSawRec = null;
    const pickBlocks = async ({ recommendation }) => {
      pickerSawRec = recommendation;
      return ['order'];
    };
    const logs = [];
    await interactiveSmelt({
      cwd,
      adapter,
      pickBlocks,
      confirmSelection: proceedConfirm,
      log: (m) => logs.push(m),
    });
    assert.deepEqual(pickerSawRec.recommended, []);
    assert.deepEqual(pickerSawRec.reasons, {});
    assert.ok(
      logs.some((m) => /AI 추천 없이 진행/.test(m)),
      '추천 미지원 안내 한국어 한 줄이 있어야 한다',
    );
  });
});

test('interactiveSmelt: confirmSelection이 redo면 picker가 다시 호출된다(ADR 0029 결정 3)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    let pickCount = 0;
    const pickBlocks = async () => {
      pickCount += 1;
      // 첫 번째는 cart, 두 번째는 order로 다른 자리를 골라준다
      return pickCount === 1 ? ['cart'] : ['order'];
    };
    let confirmCount = 0;
    const confirmSelection = async () => {
      confirmCount += 1;
      // 첫 번째는 redo, 두 번째는 proceed
      return confirmCount === 1 ? 'redo' : 'proceed';
    };
    const result = await interactiveSmelt({
      cwd,
      pickBlocks,
      confirmSelection,
      log: silentLog,
    });
    assert.equal(pickCount, 2, 'picker가 두 번 호출되어야 한다');
    assert.equal(confirmCount, 2, 'confirmSelection이 두 번 호출되어야 한다');
    assert.deepEqual(result.selected, ['order']);
  });
});

test('interactiveSmelt: confirmSelection이 받는 인자에 resolved와 blockIds가 들어있다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    let received = null;
    const confirmSelection = async (args) => {
      received = args;
      return 'proceed';
    };
    await interactiveSmelt({
      cwd,
      pickBlocks: async () => ['refund'],
      confirmSelection,
      log: silentLog,
    });
    assert.deepEqual(received.blockIds, ['refund']);
    assert.ok(Array.isArray(received.resolved.autoAdded));
    // refund는 commerce 카탈로그에서 payment를 requires로 끌어온다
    assert.ok(received.resolved.autoAdded.includes('payment'));
  });
});

test('interactiveSmelt: picker가 빈 배열을 돌려주면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    const pickBlocks = async () => [];
    await assert.rejects(
      interactiveSmelt({ cwd, pickBlocks, confirmSelection: proceedConfirm, log: silentLog }),
      /한 개 이상의 블럭을 골라주세요/,
    );
  });
});

test('interactiveSmelt: picker가 카탈로그에 없는 ID를 돌려줘도 runSmelt가 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    const pickBlocks = async () => ['ghost-block'];
    await assert.rejects(
      interactiveSmelt({ cwd, pickBlocks, confirmSelection: proceedConfirm, log: silentLog }),
      /카탈로그에 없는 블럭 ID가 있습니다/,
    );
  });
});

test('interactiveSmelt: 단계 검증이 picker 호출 전에 일어난다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    let pickerCalled = false;
    const pickBlocks = async () => {
      pickerCalled = true;
      return ['order'];
    };
    await assert.rejects(
      interactiveSmelt({ cwd, pickBlocks, confirmSelection: proceedConfirm, log: silentLog }),
      /현재 단계가 smelt가 아닙니다/,
    );
    assert.equal(pickerCalled, false, 'picker는 단계 검증 통과 후에만 호출되어야 한다');
  });
});

test('interactiveSmelt: cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(interactiveSmelt({}), /cwd.*필요합니다/);
});

test('interactiveSmelt: intent.yml schema_version 1 폴백(user_answers 없음)도 빈 답변으로 진행한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    // intent.yml을 schema_version 1 결로 덮어쓴다(user_answers 없음)
    const intentFile = join(cwd, '.beoreum', 'project', 'intent.yml');
    const oldIntent = {
      schema_version: 1,
      created_at: '2025-12-01T00:00:00.000Z',
      user_input: '쇼핑몰 만들어줘',
      source: 'template:commerce',
      extracted: { what: '쇼핑몰', who: '', why: '' },
      reality_check_status: 'pending',
    };
    writeFileSyncFromYaml(intentFile, oldIntent);
    let answersSeen = null;
    const adapter = {
      ...createMockAdapter(),
      async recommendBlocks({ answers }) {
        answersSeen = answers;
        return { recommended: [], reasons: {} };
      },
    };
    await interactiveSmelt({
      cwd,
      adapter,
      pickBlocks: async () => ['order'],
      confirmSelection: proceedConfirm,
      log: silentLog,
    });
    // user_answers가 없어도 빈 객체로 폴백
    assert.deepEqual(answersSeen, {});
  });
});

// ── ADR 0030: block-review-prompt.md 부산물과 두 시점 reason 노출 ─────

test('runSmelt가 끝에 prompts/block-review-prompt.md 부산물을 만든다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    const result = await runSmelt({ cwd, blockIds: ['order'] });
    assert.ok(result.blockReviewPromptFile, 'result.blockReviewPromptFile이 빠짐');
    assert.equal(existsSync(result.blockReviewPromptFile), true);
    assert.match(result.blockReviewPromptFile, /prompts\/block-review-prompt\.md$/);
  });
});

test('block-review-prompt.md 본문에 7항목, 카탈로그 전체 blocks, 선택, 의존성, 추천이 모두 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    const recommendation = {
      recommended: ['order'],
      reasons: { order: { user: '핵심 흐름으로 보여요', dev: 'order create' } },
    };
    const result = await runSmelt({ cwd, blockIds: ['order'], recommendation });
    const md = readFileSync(result.blockReviewPromptFile, 'utf8');
    // 7항목 답변 자리(prospect의 user_answers가 commerce mock이라 what에 쇼핑몰)
    assert.match(md, /## 사용자 7항목 답변/);
    assert.match(md, /what:.*쇼핑몰/);
    // 카탈로그 전체 blocks 자리(ADR 0030 결정 4)
    assert.match(md, /## 카탈로그 전체 블럭/);
    assert.match(md, /총 \d+개 블럭/);
    // 사용자 선택 + 의존성 결과
    assert.match(md, /## 사용자가 고른 블럭/);
    assert.match(md, /## 의존성 해결 결과/);
    assert.match(md, /자동 추가/);
    // 추천 두 시점이 모두 노출(ADR 0030 결정 1)
    assert.match(md, /## AI 추천/);
    assert.match(md, /일반 사용자 시점:.*핵심 흐름으로 보여요/);
    assert.match(md, /개발자 시점:.*order create/);
  });
});

test('block-review-prompt.md 본문이 단축어 풀어쓰기 가이드와 비개발자 톤을 포함한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    const result = await runSmelt({ cwd, blockIds: ['order'] });
    const md = readFileSync(result.blockReviewPromptFile, 'utf8');
    // 외부 AI에게 단축어 풀어쓰기 안내(예: PG, DTO, API)
    assert.match(md, /비기술 창업자/);
    assert.match(md, /일상 한국어/);
    assert.match(md, /PG.*결제대행사/);
    // 부탁드릴 검토 세 자리
    assert.match(md, /1\. 잘 맞는 부분/);
    assert.match(md, /2\. 비어있는 자리/);
    assert.match(md, /3\. 시작 무게/);
  });
});

test('runSmelt에 recommendation을 안 넘겨도 부산물은 빈 추천으로 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSmelt(cwd);
    const result = await runSmelt({ cwd, blockIds: ['order'] });
    const md = readFileSync(result.blockReviewPromptFile, 'utf8');
    assert.match(md, /이번 흐름은 추천이 비어있어요/);
  });
});

// 작은 헬퍼: yaml.dump 대신 단언 명료하게 쓰기 위한 자리
import { writeFileSync as fsWrite } from 'node:fs';
function writeFileSyncFromYaml(path, obj) {
  fsWrite(path, yaml.dump(obj, { sortKeys: false }), 'utf8');
}
