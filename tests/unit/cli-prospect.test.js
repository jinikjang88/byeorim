// runProspect 단위 테스트. ADR 0026 7항목 흐름 + mock 어댑터 주입.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runInit, runProspect, interactiveProspect } from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';
import { loadCatalog } from '../../packages/catalog/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-prospect-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function silentLog() {}

function fullAnswers() {
  return {
    what: '동네 빵집 단골 주문 앱',
    who: '카페 단골 손님과 사장님',
    when: '평일 점심 직전',
    where: '손님은 모바일, 사장님은 매장 태블릿',
    why: '전화 주문이 자꾸 끊겨서',
    how_use: 'QR로 메뉴 보고 주문',
    how_manage: '주방 화면에서 주문 확인',
  };
}

test('init 직후 prospect를 돌리면 ADR 0007의 자리가 모두 채워진다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init이 완료된 자리
    runInit({ cwd });
    const adapter = createMockAdapter();
    const fixedNow = new Date('2026-05-03T12:00:00.000Z');
    // When: 7항목 답변으로 prospect를 돌린다 (what에 쇼핑 키워드)
    const result = await runProspect({
      cwd,
      answers: { what: '쇼핑몰', ...{} },
      adapter,
      now: fixedNow,
      log: silentLog,
    });
    // Then: 카탈로그, intent.yml, reality-check.md placeholder가 모두 자리잡았다
    assert.equal(existsSync(result.catalogFile), true);
    assert.equal(existsSync(result.intentFile), true);
    assert.equal(existsSync(result.realityCheckFile), true);
    assert.equal(result.suggestedTemplate, 'commerce');
    assert.equal(result.nextStage, 'smelt');
  });
});

test('intent.yml 형식이 ADR 0026 7항목 결정을 따른다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 prospect 7항목 모두 채움
    runInit({ cwd });
    const fixedNow = new Date('2026-05-03T12:00:00.000Z');
    const answers = { ...fullAnswers(), what: '쇼핑몰 단골 앱' };
    await runProspect({
      cwd,
      answers,
      adapter: createMockAdapter(),
      now: fixedNow,
      log: silentLog,
    });
    // When: intent.yml을 읽어 파싱한다
    const intent = yaml.load(readFileSync(join(cwd, '.beoreum', 'project', 'intent.yml'), 'utf8'));
    // Then: schema_version 2, 7항목, unanswered, source, reality_check_status가 모두 자리한다
    assert.equal(intent.schema_version, 2);
    assert.equal(intent.created_at, '2026-05-03T12:00:00.000Z');
    assert.equal(intent.user_answers.what, '쇼핑몰 단골 앱');
    assert.equal(intent.user_answers.who, '카페 단골 손님과 사장님');
    assert.equal(intent.source, 'template:commerce');
    assert.equal(intent.extracted.what, '쇼핑몰 단골 앱');
    assert.equal(intent.extracted.who, '카페 단골 손님과 사장님');
    assert.equal(intent.extracted.when, '평일 점심 직전');
    assert.equal(intent.extracted.where, '손님은 모바일, 사장님은 매장 태블릿');
    assert.equal(intent.extracted.why, '전화 주문이 자꾸 끊겨서');
    assert.equal(intent.extracted.how_use, 'QR로 메뉴 보고 주문');
    assert.equal(intent.extracted.how_manage, '주방 화면에서 주문 확인');
    assert.deepEqual(intent.unanswered, []);
    // mock 어댑터가 generateRealityCheck를 구현하므로 status가 completed로 진행된다(ADR 0003).
    assert.equal(intent.reality_check_status, 'completed');
  });
});

test('빈 항목은 unanswered 배열에 들어가고 다이어리에 prospect 의도 머리로 추가된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후, when과 how_manage만 비운 답변
    runInit({ cwd });
    const answers = { ...fullAnswers(), when: '', how_manage: '' };
    // When: prospect를 돌린다
    const result = await runProspect({
      cwd,
      answers,
      adapter: createMockAdapter(),
      now: new Date('2026-05-03T12:00:00.000Z'),
      log: silentLog,
    });
    // Then: unanswered가 두 키, diary.md에 두 질문이 prospect 의도 머리 아래 추가됨
    assert.deepEqual(result.unanswered, ['when', 'how_manage']);
    const diary = readFileSync(join(cwd, '.beoreum', 'project', 'diary.md'), 'utf8');
    assert.match(diary, /## 2026-05-03 prospect 의도에서 미뤄둔 질문/);
    assert.match(diary, /- when:/);
    assert.match(diary, /- how_manage:/);
    // 답한 자리는 다이어리에 안 들어간다
    assert.equal(diary.includes('- what:'), false);
    assert.equal(diary.includes('- who:'), false);
  });
});

test('모든 답변이 비어있으면 한국어 에러로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 한 자리, 빈 답변
    runInit({ cwd });
    // When/Then: 한 항목이라도 적어달라는 한국어 안내
    await assert.rejects(
      runProspect({ cwd, answers: {}, adapter: createMockAdapter(), log: silentLog }),
      /한 항목이라도 적어주세요/,
    );
  });
});

test('기존 다이어리 메모는 보존되고 새 단락은 끝에 append된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 사용자가 미리 적어둔 메모가 있는 다이어리
    runInit({ cwd });
    const diaryFile = join(cwd, '.beoreum', 'project', 'diary.md');
    const before = readFileSync(diaryFile, 'utf8');
    const userMemo = '\n## 내 메모\n\n나만의 노트입니다.\n';
    writeFileSync(diaryFile, before + userMemo, 'utf8');
    // When: 빈 항목이 있는 prospect
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      now: new Date('2026-05-03T12:00:00.000Z'),
      log: silentLog,
    });
    // Then: 기존 메모 보존, 새 단락은 끝에
    const after = readFileSync(diaryFile, 'utf8');
    assert.match(after, /나만의 노트입니다\./);
    assert.match(after, /## 2026-05-03 prospect 의도에서 미뤄둔 질문/);
    assert.ok(after.indexOf('나만의 노트') < after.indexOf('의도에서 미뤄둔 질문'));
  });
});

test('복사된 카탈로그가 검증을 통과한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: silentLog,
    });
    const catalog = loadCatalog(join(cwd, '.beoreum', 'project', 'catalog', 'catalog.yml'));
    assert.ok(Array.isArray(catalog.worlds));
    assert.ok(Array.isArray(catalog.blocks));
  });
});

test('state.yml이 prospect 완료를 반영한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: silentLog,
    });
    const state = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    assert.equal(state.current_stage, 'smelt');
    assert.deepEqual(state.completed_stages, ['prospect']);
  });
});

test('채용 키워드는 job-aggregator 템플릿이 복사된다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      answers: { what: '채용 사이트' },
      adapter: createMockAdapter(),
      log: silentLog,
    });
    assert.equal(result.suggestedTemplate, 'job-aggregator');
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.source, 'template:job-aggregator');
  });
});

test('init 없이 prospect를 돌리면 한국어 에러로 init 실행을 안내한다', async () => {
  await withTempCwd(async (cwd) => {
    await assert.rejects(
      runProspect({
        cwd,
        answers: { what: '쇼핑몰' },
        adapter: createMockAdapter(),
        log: silentLog,
      }),
      /beoreum init을 실행해주세요/,
    );
  });
});

test('현재 단계가 prospect가 아니면 한국어 에러로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: silentLog,
    });
    await assert.rejects(
      runProspect({
        cwd,
        answers: { what: '쇼핑몰' },
        adapter: createMockAdapter(),
        log: silentLog,
      }),
      /현재 단계가 prospect가 아닙니다/,
    );
  });
});

test('어댑터가 추천하지 못하면 한국어 에러에 지원 도메인 목록을 함께 보인다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await assert.rejects(
      runProspect({
        cwd,
        answers: { what: '우주여행 가이드 서비스' },
        adapter: createMockAdapter(),
        log: silentLog,
      }),
      /commerce/,
    );
  });
});

test('필수 인자 누락은 한국어로 거부한다', async () => {
  await assert.rejects(runProspect({}), /cwd.*필요합니다/);
  await assert.rejects(
    runProspect({ cwd: '/tmp', adapter: createMockAdapter(), log: silentLog }),
    /한 항목이라도 적어주세요/,
  );
  await assert.rejects(
    runProspect({ cwd: '/tmp', answers: { what: '쇼핑몰' }, log: silentLog }),
    /adapter.*필요합니다/,
  );
});

// ── interactiveProspect: askAnswers 의존성 주입 (ADR 0011 + 0026) ─────────────────────

test('interactiveProspect: askAnswers가 받은 답변으로 prospect가 끝까지 동작한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const askAnswers = async () => ({ what: '쇼핑몰', who: '단골 손님' });
    const askCatalogSource = async ({ suggested }) => ({ kind: 'template', name: suggested });
    const result = await interactiveProspect({
      cwd,
      adapter: createMockAdapter(),
      askAnswers,
      askCatalogSource,
      log: silentLog,
    });
    assert.equal(result.suggestedTemplate, 'commerce');
    assert.equal(result.source, 'template:commerce');
    assert.equal(result.nextStage, 'smelt');
  });
});

test('interactiveProspect: 단계 검증이 askAnswers 호출 전에 일어난다', async () => {
  await withTempCwd(async (cwd) => {
    let askCalled = false;
    const askAnswers = async () => {
      askCalled = true;
      return { what: '쇼핑몰' };
    };
    await assert.rejects(
      interactiveProspect({
        cwd,
        adapter: createMockAdapter(),
        askAnswers,
        log: silentLog,
      }),
      /beoreum init을 실행해주세요/,
    );
    assert.equal(askCalled, false, 'askAnswers는 단계 검증 통과 후에만 호출되어야 한다');
  });
});

test('interactiveProspect: 현재 단계가 prospect가 아니면 한국어로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: silentLog,
    });
    let askCalled = false;
    const askAnswers = async () => {
      askCalled = true;
      return { what: '두 번째 시도' };
    };
    await assert.rejects(
      interactiveProspect({
        cwd,
        adapter: createMockAdapter(),
        askAnswers,
        log: silentLog,
      }),
      /현재 단계가 prospect가 아닙니다/,
    );
    assert.equal(askCalled, false);
  });
});

test('interactiveProspect: cwd와 adapter 누락은 한국어로 거부한다', async () => {
  await assert.rejects(interactiveProspect({}), /cwd.*필요합니다/);
  await assert.rejects(interactiveProspect({ cwd: '/tmp' }), /adapter.*필요합니다/);
});

// ── ADR 0027: 카탈로그 출처 선택과 AI 카탈로그 생성 ─────────────────────

test('source가 ai이면 generateCatalog 결과가 catalog.yml에 쓰이고 source는 ai:adapter', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 7항목 답변, ai 출처 선택
    runInit({ cwd });
    // When: source.kind='ai'로 runProspect
    const result = await runProspect({
      cwd,
      answers: { what: '동네 빵집 단골 주문 앱', who: '단골 손님' },
      adapter: createMockAdapter(),
      source: { kind: 'ai' },
      log: silentLog,
    });
    // Then: source가 ai:mock로 박혔고 catalog.yml이 schema 검증 통과
    assert.equal(result.source, 'ai:mock');
    const catalog = loadCatalog(result.catalogFile);
    assert.ok(Array.isArray(catalog.worlds));
    assert.ok(catalog.worlds.length >= 1);
    assert.ok(Array.isArray(catalog.blocks));
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.source, 'ai:mock');
  });
});

test('source가 명시적 template이면 그 템플릿이 복사되고 source는 template:name', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // 사용자가 추천(commerce)을 무시하고 reservation을 직접 고른 경우
    const result = await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      source: { kind: 'template', name: 'reservation' },
      log: silentLog,
    });
    assert.equal(result.source, 'template:reservation');
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.source, 'template:reservation');
  });
});

test('AI가 만든 카탈로그가 검증에 걸리면 한국어 안내로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // Given: 빈 worlds를 돌려주는 망가진 어댑터
    const adapter = {
      ...createMockAdapter(),
      async generateCatalog() {
        return { worlds: [], blocks: [] };
      },
    };
    // When/Then: catalog.schema.json의 minItems=1을 어겨 거부
    await assert.rejects(
      runProspect({
        cwd,
        answers: { what: '쇼핑몰' },
        adapter,
        source: { kind: 'ai' },
        log: silentLog,
      }),
      /형식 검증에 걸렸어요/,
    );
  });
});

test('suggested_template이 null이고 source 미지정이면 한국어 에러로 안내', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // Given: 추천 못 하는 도메인
    await assert.rejects(
      runProspect({
        cwd,
        answers: { what: '우주여행 가이드 서비스' },
        adapter: createMockAdapter(),
        log: silentLog,
      }),
      /빌트인 템플릿을 추천하지 못했습니다/,
    );
  });
});

test('suggested_template이 null이어도 source.kind=ai로 명시하면 AI 카탈로그가 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      answers: { what: '우주여행 가이드 서비스' },
      adapter: createMockAdapter(),
      source: { kind: 'ai' },
      log: silentLog,
    });
    assert.equal(result.source, 'ai:mock');
    assert.equal(result.suggestedTemplate, null);
  });
});

test('interactiveProspect: askCatalogSource에 suggested가 전달되고 결과가 source가 된다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const askAnswers = async () => ({ what: '쇼핑몰' });
    let suggestedSeen = null;
    const askCatalogSource = async ({ suggested }) => {
      suggestedSeen = suggested;
      return { kind: 'ai' };
    };
    const result = await interactiveProspect({
      cwd,
      adapter: createMockAdapter(),
      askAnswers,
      askCatalogSource,
      log: silentLog,
    });
    assert.equal(suggestedSeen, 'commerce');
    assert.equal(result.source, 'ai:mock');
  });
});

// ── ADR 0003 Reality Check 6영역 통합 ─────────────────

test('Reality Check가 reality-check.md에 6영역 머리로 합성된다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      answers: { what: '쇼핑몰', who: '단골' },
      adapter: createMockAdapter(),
      now: new Date('2026-05-04T09:00:00.000Z'),
      log: silentLog,
    });
    const md = readFileSync(result.realityCheckFile, 'utf8');
    // 6영역 한국어 머리가 모두 자리한다
    assert.match(md, /## 시장 포화도/);
    assert.match(md, /## 진입 비용/);
    assert.match(md, /## 양면 시장 함정/);
    assert.match(md, /## 법적 리스크/);
    assert.match(md, /## 수익 모델 현실/);
    assert.match(md, /## 사라진 서비스들의 묘지/);
    assert.match(md, /생각해볼 질문/);
    // 빈 legal_warnings는 절을 출력하지 않는다
    assert.equal(md.includes('## 법적 메모'), false);
    // intent.yml의 reality_check_status가 completed
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.reality_check_status, 'completed');
    assert.equal(result.realityCheckStatus, 'completed');
  });
});

test('Reality Check 질문이 다이어리에 RC 머리로 분리되어 추가된다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰', who: '단골', when: '주말' },
      adapter: createMockAdapter(),
      now: new Date('2026-05-04T09:00:00.000Z'),
      log: silentLog,
    });
    const diary = readFileSync(join(cwd, '.beoreum', 'project', 'diary.md'), 'utf8');
    // 두 머리가 모두 자리한다(prospect 의도 + Reality Check)
    assert.match(diary, /## 2026-05-04 prospect 의도에서 미뤄둔 질문/);
    assert.match(diary, /## 2026-05-04 Reality Check에서 미뤄둔 질문/);
    // RC 질문은 영역 한국어 제목으로 시작한다
    assert.match(diary, /- 시장 포화도:/);
    assert.match(diary, /- 진입 비용:/);
    assert.match(diary, /- 사라진 서비스들의 묘지:/);
  });
});

test('legal_warnings가 있으면 reality-check.md에 법적 메모 절이 자리한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // Given: legal_warnings를 채워 돌려주는 어댑터
    const adapter = {
      ...createMockAdapter(),
      async generateRealityCheck() {
        return {
          areas: {
            market_saturation: { observation: '', questions: ['q'] },
            entry_cost: { observation: '', questions: ['q'] },
            two_sided_market: { observation: '', questions: ['q'] },
            legal_risk: { observation: '', questions: ['q'] },
            revenue_model: { observation: '', questions: ['q'] },
            graveyard: { observation: '', questions: ['q'] },
          },
          legal_warnings: [
            { item: '미성년자 데이터', reason: '동의 절차가 별도로 필요할 수 있다' },
          ],
        };
      },
    };
    const result = await runProspect({
      cwd,
      answers: { what: '청소년 학습 예약 앱' },
      adapter,
      source: { kind: 'ai' },
      log: silentLog,
    });
    const md = readFileSync(result.realityCheckFile, 'utf8');
    assert.match(md, /## 법적 메모/);
    assert.match(md, /미성년자 데이터: 동의 절차가 별도로 필요할 수 있다/);
  });
});

test('generateRealityCheck를 구현하지 않은 어댑터는 status=skipped로 흘러간다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // Given: generateRealityCheck를 빼낸 어댑터
    const base = createMockAdapter();
    const adapter = {
      name: base.name,
      extractIntent: base.extractIntent,
      extractSchema: base.extractSchema,
      generateCatalog: base.generateCatalog,
      // generateRealityCheck 일부러 안 넣음
    };
    const result = await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter,
      log: silentLog,
    });
    assert.equal(result.realityCheckStatus, 'skipped');
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.reality_check_status, 'skipped');
    const md = readFileSync(result.realityCheckFile, 'utf8');
    assert.match(md, /Reality Check를 지원하지 않아 자리만/);
  });
});
