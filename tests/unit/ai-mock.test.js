// Mock AI 어댑터 단위 테스트. 결정성과 휴리스틱이 ADR 0009 약속을 지키는지 본다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createMockAdapter } from '../../packages/ai/index.js';

test('mock 어댑터는 name이 mock이고 extractIntent를 가진다', () => {
  // Given: 팩토리로 생성한 어댑터
  const adapter = createMockAdapter();
  // Then: 인터페이스 약속을 지킨다
  assert.equal(adapter.name, 'mock');
  assert.equal(typeof adapter.extractIntent, 'function');
});

test('같은 입력은 항상 같은 결과를 돌려준다(결정성)', async () => {
  // Given: 두 번 호출
  const adapter = createMockAdapter();
  // When: 같은 입력
  const a = await adapter.extractIntent('쇼핑몰 만들어줘');
  const b = await adapter.extractIntent('쇼핑몰 만들어줘');
  // Then: 결과가 같다
  assert.deepEqual(a, b);
});

test('쇼핑 키워드는 commerce 템플릿을 추천한다', async () => {
  // Given: 쇼핑 관련 입력
  const adapter = createMockAdapter();
  // When/Then: commerce가 추천된다
  for (const input of [
    '쇼핑몰 만들어줘',
    '온라인 마켓 짓고 싶어',
    '주문 받는 사이트',
    '결제 시스템',
  ]) {
    const intent = await adapter.extractIntent(input);
    assert.equal(intent.suggested_template, 'commerce', `"${input}"이 commerce를 추천하지 않음`);
  }
});

test('채용 키워드는 job-aggregator 템플릿을 추천한다', async () => {
  // Given: 채용 관련 입력
  const adapter = createMockAdapter();
  // When/Then: job-aggregator가 추천된다
  for (const input of ['채용 사이트 만들어줘', '구인 공고 모으는 서비스', '일자리 검색']) {
    const intent = await adapter.extractIntent(input);
    assert.equal(
      intent.suggested_template,
      'job-aggregator',
      `"${input}"이 job-aggregator를 추천하지 않음`,
    );
  }
});

test('예약 키워드는 reservation 템플릿을 추천한다', async () => {
  // Given: 예약/대관/클래스 관련 입력. 매니페스토 IV의 1순위 사용자(학원 원장님, 카페 사장님 등)가
  // 만나볼 도메인. 한 단어가 들어가면 reservation을 추천한다.
  const adapter = createMockAdapter();
  // When/Then
  for (const input of [
    '학원 수강 예약 시스템',
    '카페 룸예약 사이트',
    '공방 클래스 신청',
    '미용실 부킹 앱',
    '시간표 만들기',
  ]) {
    const intent = await adapter.extractIntent(input);
    assert.equal(
      intent.suggested_template,
      'reservation',
      `"${input}"이 reservation을 추천하지 않음`,
    );
  }
});

test('알 수 없는 도메인은 추천 없이 null을 돌려준다', async () => {
  // Given: 키워드 표에 없는 도메인 입력
  const adapter = createMockAdapter();
  // When
  const intent = await adapter.extractIntent('우주여행 가이드 서비스');
  // Then: suggested_template이 null이고 호출자가 처리한다
  assert.equal(intent.suggested_template, null);
});

test('what 추출은 동사 앞부분을 잡고, who와 why는 빈 문자열로 둔다', async () => {
  // Given: "쇼핑몰 만들어줘"
  const adapter = createMockAdapter();
  // When
  const intent = await adapter.extractIntent('쇼핑몰 만들어줘');
  // Then: what에 "쇼핑몰", who/why는 빈 문자열(실제 LLM 어댑터가 채울 자리)
  assert.equal(intent.what, '쇼핑몰');
  assert.equal(intent.who, '');
  assert.equal(intent.why, '');
});

test('빈 입력은 빈 결과로 처리한다', async () => {
  // Given: 빈 문자열
  const adapter = createMockAdapter();
  // When
  const intent = await adapter.extractIntent('');
  // Then: 모든 필드가 안전한 기본값
  assert.equal(intent.what, '');
  assert.equal(intent.who, '');
  assert.equal(intent.why, '');
  assert.equal(intent.suggested_template, null);
});

// ── extractSchema (ADR 0023) ─────────────────────────────────

test('extractSchema: create operation은 request와 response를 모두 가진다', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.extractSchema({ block: { id: 'order' }, operation: 'create' });
  assert.equal(result.request.type, 'object');
  assert.ok(result.request.properties);
  assert.equal(result.response.type, 'object');
  assert.ok(result.response.properties.id);
  assert.ok(result.response.required.includes('id'));
});

test('extractSchema: list operation은 request 없이 items 배열 응답', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.extractSchema({ block: { id: 'any' }, operation: 'list' });
  assert.equal(result.request, null);
  assert.equal(result.response.type, 'object');
  assert.equal(result.response.properties.items.type, 'array');
});

test('extractSchema: delete는 request도 response도 null', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.extractSchema({ block: { id: 'any' }, operation: 'delete' });
  assert.equal(result.request, null);
  assert.equal(result.response, null);
});

test('extractSchema: 같은 입력은 같은 출력(결정성)', async () => {
  const adapter = createMockAdapter();
  const a = await adapter.extractSchema({ block: { id: 'a' }, operation: 'create' });
  const b = await adapter.extractSchema({ block: { id: 'a' }, operation: 'create' });
  assert.deepEqual(a, b);
});

test('extractSchema: 알 수 없는 operation은 null/null 반환', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.extractSchema({ block: {}, operation: 'unknown' });
  assert.equal(result.request, null);
  assert.equal(result.response, null);
});

test('extractSchema: 출력이 깊은 복사라 호출 자리에서 변경해도 표가 안 바뀐다', async () => {
  const adapter = createMockAdapter();
  const a = await adapter.extractSchema({ block: {}, operation: 'create' });
  a.request.properties.injected = { type: 'string' };
  const b = await adapter.extractSchema({ block: {}, operation: 'create' });
  assert.equal(b.request.properties.injected, undefined);
});

// ── generateCatalog (ADR 0026, 0027) ─────────────────────────

test('generateCatalog: seedCatalog 구조를 보존하면서 name과 domain만 갈아끼운다', async () => {
  const adapter = createMockAdapter();
  const seed = {
    name: '시드 이름',
    domain: 'seed-domain',
    worlds: [{ id: 'w-a', title: '월드 A' }],
    blocks: [{ id: 'b-x', name: 'B', user_desc: '설명' }],
    dependencies: [],
  };
  const { catalog } = await adapter.generateCatalog({
    userInput: '쇼핑몰 만들어줘',
    intent: { what: '쇼핑몰', who: '', why: '', suggested_template: 'commerce' },
    seedCatalog: seed,
  });
  // name은 사용자 입력에서 뽑은 한국어, domain은 ASCII fallback
  assert.equal(catalog.name, '쇼핑몰');
  assert.equal(catalog.domain, 'beoreum-project'); // 한글만 있는 입력은 ASCII로 변환 시 비어 'beoreum-project' fallback
  // worlds, blocks, dependencies는 시드 그대로
  assert.deepEqual(catalog.worlds, seed.worlds);
  assert.deepEqual(catalog.blocks, seed.blocks);
  assert.deepEqual(catalog.dependencies, seed.dependencies);
});

test('generateCatalog: 출력이 깊은 복사라 호출 자리에서 변경해도 시드가 안 바뀐다', async () => {
  const adapter = createMockAdapter();
  const seed = {
    worlds: [{ id: 'w-a', title: '월드 A' }],
    blocks: [{ id: 'b-x', name: 'B', user_desc: '설명' }],
  };
  const { catalog } = await adapter.generateCatalog({
    userInput: '쇼핑',
    intent: { what: '쇼핑', who: '', why: '', suggested_template: null },
    seedCatalog: seed,
  });
  catalog.worlds.push({ id: 'w-injected', title: '주입' });
  assert.equal(seed.worlds.length, 1, '시드의 worlds가 변경되지 않아야 한다');
});

test('generateCatalog: seedCatalog가 null이면 한국어 안내 에러', async () => {
  const adapter = createMockAdapter();
  await assert.rejects(
    adapter.generateCatalog({
      userInput: '쇼핑',
      intent: { what: '쇼핑', who: '', why: '', suggested_template: null },
      seedCatalog: null,
    }),
    /seedCatalog가 필요합니다/,
  );
});

test('generateCatalog: 같은 입력은 같은 결과 (결정성)', async () => {
  const adapter = createMockAdapter();
  const seed = {
    worlds: [{ id: 'w', title: 'W' }],
    blocks: [{ id: 'b', name: 'B', user_desc: 'd' }],
  };
  const a = await adapter.generateCatalog({
    userInput: '쇼핑몰',
    intent: { what: '쇼핑몰', who: '', why: '', suggested_template: null },
    seedCatalog: seed,
  });
  const b = await adapter.generateCatalog({
    userInput: '쇼핑몰',
    intent: { what: '쇼핑몰', who: '', why: '', suggested_template: null },
    seedCatalog: seed,
  });
  assert.deepEqual(a, b);
});

// ── generateTradeOffDoc (ADR 0028) ─────────────────────────

test('generateTradeOffDoc: 헤더와 worlds → bundles → blocks 트리 헤딩이 보인다', async () => {
  const adapter = createMockAdapter();
  const catalog = {
    worlds: [
      { id: 'w-a', title: '월드 A', description: 'A 세계', order: 1 },
      { id: 'w-b', title: '월드 B', order: 2 },
    ],
    bundles: [
      { id: 'bn-a1', world_id: 'w-a', title: '번들 A1', description: 'A1 설명' },
    ],
    blocks: [
      {
        id: 'block-a1',
        bundle_id: 'bn-a1',
        name: '블럭 A1',
        user_desc: '블럭 A1 사용자 설명',
        analogy: '비유 한 줄',
        concerns: ['concurrency'],
        priority: 'required',
      },
    ],
    dependencies: [],
    cascades: [],
    prerequisites: [],
  };
  const { doc } = await adapter.generateTradeOffDoc({
    catalog,
    intent: { extracted: { what: '테스트' }, user_input: '테스트 입력' },
    now: new Date('2026-05-01T00:00:00.000Z'),
  });
  assert.match(doc, /^# 테스트 설계$/m);
  assert.match(doc, /^## 월드 A \(`w-a`\)$/m);
  assert.match(doc, /^## 월드 B \(`w-b`\)$/m);
  assert.match(doc, /^### 번들 A1 \(`bn-a1`\)$/m);
  assert.match(doc, /^#### 블럭 A1 \(`block-a1`\)$/m);
  assert.match(doc, /블럭 A1 사용자 설명/);
  assert.match(doc, /비유: 비유 한 줄/);
  assert.match(doc, /관심사: concurrency/);
  assert.match(doc, /트레이드오프:/);
  assert.match(doc, /생성 시각: 2026-05-01T00:00:00\.000Z/);
});

test('generateTradeOffDoc: 데이터 무관성 - 시드의 특정 ID를 본문에 박지 않고 구조만 본다', async () => {
  const adapter = createMockAdapter();
  // 두 다른 도메인 카탈로그가 같은 구조를 가지면 같은 결로 동작해야 한다
  const catalogA = {
    worlds: [{ id: 'w-1', title: '세계 1' }],
    bundles: [{ id: 'bn-1', world_id: 'w-1', title: '번들 1' }],
    blocks: [{ id: 'block-도메인A', bundle_id: 'bn-1', name: '도메인A 블럭', user_desc: '설명' }],
  };
  const catalogB = {
    worlds: [{ id: 'w-1', title: '세계 1' }],
    bundles: [{ id: 'bn-1', world_id: 'w-1', title: '번들 1' }],
    blocks: [{ id: 'block-도메인B', bundle_id: 'bn-1', name: '도메인B 블럭', user_desc: '설명' }],
  };
  const intent = { extracted: { what: '같은 입력' }, user_input: '같은 입력' };
  const now = new Date('2026-05-01T00:00:00.000Z');
  const a = await adapter.generateTradeOffDoc({ catalog: catalogA, intent, now });
  const b = await adapter.generateTradeOffDoc({ catalog: catalogB, intent, now });
  // 두 본문의 구조가 같아야 함(블럭 이름과 ID만 다르고 트리 헤딩 패턴 동일)
  const headingsA = (a.doc.match(/^##+ /gm) || []).length;
  const headingsB = (b.doc.match(/^##+ /gm) || []).length;
  assert.equal(headingsA, headingsB);
});

test('generateTradeOffDoc: requires/affects/cascades가 트레이드오프 카운트로 풀린다', async () => {
  const adapter = createMockAdapter();
  const catalog = {
    worlds: [{ id: 'w', title: 'W' }],
    bundles: [{ id: 'bn', world_id: 'w', title: '번들' }],
    blocks: [
      { id: 'a', bundle_id: 'bn', name: 'A', user_desc: 'A 설명' },
      { id: 'b', bundle_id: 'bn', name: 'B', user_desc: 'B 설명' },
      { id: 'c', bundle_id: 'bn', name: 'C', user_desc: 'C 설명' },
    ],
    dependencies: [
      { source: 'a', target: 'b', type: 'requires' },
      { source: 'a', target: 'c', type: 'affects' },
    ],
    cascades: [
      {
        trigger: 'a',
        ask_questions: [{ question: '결정 한 자리?', options: ['옵션1', '옵션2'] }],
      },
    ],
  };
  const { doc } = await adapter.generateTradeOffDoc({
    catalog,
    intent: { extracted: { what: '테스트' }, user_input: '테스트' },
    now: new Date('2026-05-01T00:00:00.000Z'),
  });
  // 블럭 A의 단락에 카운트 신호가 보임
  assert.match(doc, /1개 자리가 함께 따라옵니다/);
  assert.match(doc, /다른 1개 자리의 동작 방식이 바뀝니다/);
  assert.match(doc, /1개 결정을 같이 정해야 합니다/);
});

test('generateTradeOffDoc: 같은 입력은 같은 출력 (결정성)', async () => {
  const adapter = createMockAdapter();
  const catalog = {
    worlds: [{ id: 'w', title: 'W' }],
    bundles: [{ id: 'bn', world_id: 'w', title: '번들' }],
    blocks: [{ id: 'a', bundle_id: 'bn', name: 'A', user_desc: '설명' }],
  };
  const intent = { extracted: { what: '같은 입력' }, user_input: '같은 입력' };
  const now = new Date('2026-05-01T00:00:00.000Z');
  const a = await adapter.generateTradeOffDoc({ catalog, intent, now });
  const b = await adapter.generateTradeOffDoc({ catalog, intent, now });
  assert.equal(a.doc, b.doc);
});
