// Mock AI 어댑터 단위 테스트. 결정성과 휴리스틱이 ADR 0009 + ADR 0026 약속을 지키는지 본다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createMockAdapter } from '../../packages/ai/index.js';

test('mock 어댑터는 name이 mock이고 extractIntent를 가진다', () => {
  const adapter = createMockAdapter();
  assert.equal(adapter.name, 'mock');
  assert.equal(typeof adapter.extractIntent, 'function');
});

test('같은 답변은 항상 같은 결과를 돌려준다(결정성)', async () => {
  const adapter = createMockAdapter();
  const a = await adapter.extractIntent({ what: '쇼핑몰' });
  const b = await adapter.extractIntent({ what: '쇼핑몰' });
  assert.deepEqual(a, b);
});

test('쇼핑 키워드는 commerce 템플릿을 추천한다', async () => {
  // Given: 쇼핑 관련 답변. mock은 모든 답변 텍스트를 합쳐 키워드를 본다(ADR 0026).
  const adapter = createMockAdapter();
  const cases = [
    { what: '쇼핑몰' },
    { what: '온라인 마켓' },
    { what: '주문 사이트' },
    { who: '결제하는 손님' },
  ];
  for (const answers of cases) {
    const intent = await adapter.extractIntent(answers);
    assert.equal(
      intent.suggested_template,
      'commerce',
      `${JSON.stringify(answers)}이 commerce를 추천하지 않음`,
    );
  }
});

test('채용 키워드는 job-aggregator 템플릿을 추천한다', async () => {
  const adapter = createMockAdapter();
  const cases = [
    { what: '채용 사이트' },
    { what: '구인 공고 모으는 서비스' },
    { what: '일자리 검색' },
  ];
  for (const answers of cases) {
    const intent = await adapter.extractIntent(answers);
    assert.equal(
      intent.suggested_template,
      'job-aggregator',
      `${JSON.stringify(answers)}이 job-aggregator를 추천하지 않음`,
    );
  }
});

test('예약 키워드는 reservation 템플릿을 추천한다', async () => {
  // Given: 예약/대관/클래스 관련 답변. 매니페스토 IV의 1순위 사용자(학원 원장님, 카페 사장님 등)가
  // 만나볼 도메인.
  const adapter = createMockAdapter();
  const cases = [
    { what: '학원 수강 예약 시스템' },
    { what: '카페 룸예약 사이트' },
    { what: '공방 클래스 신청' },
    { what: '미용실 부킹 앱' },
    { what: '시간표 만들기' },
  ];
  for (const answers of cases) {
    const intent = await adapter.extractIntent(answers);
    assert.equal(
      intent.suggested_template,
      'reservation',
      `${JSON.stringify(answers)}이 reservation을 추천하지 않음`,
    );
  }
});

test('알 수 없는 도메인은 추천 없이 null을 돌려준다', async () => {
  const adapter = createMockAdapter();
  const intent = await adapter.extractIntent({ what: '우주여행 가이드 서비스' });
  assert.equal(intent.suggested_template, null);
});

test('답변을 그대로 통과시키고 빈 자리는 빈 문자열로 둔다', async () => {
  // Given: 일부 항목만 답함
  const adapter = createMockAdapter();
  // When
  const intent = await adapter.extractIntent({
    what: '동네 빵집 단골 주문 앱',
    who: '카페 단골',
  });
  // Then: 답한 자리는 그대로, 답 안 한 자리는 빈 문자열
  assert.equal(intent.what, '동네 빵집 단골 주문 앱');
  assert.equal(intent.who, '카페 단골');
  assert.equal(intent.when, '');
  assert.equal(intent.where, '');
  assert.equal(intent.why, '');
  assert.equal(intent.how_use, '');
  assert.equal(intent.how_manage, '');
});

test('빈 객체 답변은 7항목 모두 빈 문자열, suggested_template은 null', async () => {
  const adapter = createMockAdapter();
  const intent = await adapter.extractIntent({});
  for (const key of ['what', 'who', 'when', 'where', 'why', 'how_use', 'how_manage']) {
    assert.equal(intent[key], '', `${key}가 빈 문자열이 아님`);
  }
  assert.equal(intent.suggested_template, null);
});

test('인자 없이 호출해도 안전한 기본값으로 처리한다', async () => {
  const adapter = createMockAdapter();
  const intent = await adapter.extractIntent();
  assert.equal(intent.what, '');
  assert.equal(intent.suggested_template, null);
});

// ── generateCatalog (ADR 0027) ─────────────────────────────────

test('generateCatalog: 답변에서 검증 통과 카탈로그를 결정적으로 돌려준다', async () => {
  // Given: 7항목 답변
  const adapter = createMockAdapter();
  const answers = { what: '동네 빵집 주문 앱', who: '단골 손님', how_manage: '매장 태블릿' };
  // When: 두 번 호출
  const a = await adapter.generateCatalog({ answers });
  const b = await adapter.generateCatalog({ answers });
  // Then: 결정적이고 catalog.schema.json이 요구하는 worlds/blocks를 가진다
  assert.deepEqual(a, b);
  assert.ok(Array.isArray(a.worlds));
  assert.ok(a.worlds.length >= 1);
  assert.ok(Array.isArray(a.blocks));
  assert.ok(a.blocks.length >= 1);
});

test('generateCatalog: name과 domain이 사용자 답변에서 도출된다', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.generateCatalog({
    answers: { what: '카페 주문 앱' },
  });
  assert.equal(result.name, '카페 주문 앱');
  // 한국어는 소문자/숫자/하이픈 슬러그 변환에서 거의 다 빠지므로 fallback이 잡는다
  assert.ok(/^[a-z][a-z0-9-]*$/.test(result.domain), `domain="${result.domain}"가 패턴에 안 맞음`);
});

test('generateCatalog: 빈 answers에도 검증 통과 카탈로그를 돌려준다', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.generateCatalog({ answers: {} });
  assert.ok(Array.isArray(result.worlds));
  assert.ok(result.worlds.length >= 1);
  assert.ok(Array.isArray(result.blocks));
});

test('generateCatalog: 인자 없이 호출해도 안전한 기본값', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.generateCatalog();
  assert.ok(Array.isArray(result.worlds));
  assert.ok(Array.isArray(result.blocks));
});

// ── generateRealityCheck (ADR 0003 + docs/specs/reality-check.md) ─────────────────

test('generateRealityCheck: 6영역과 legal_warnings를 모두 가진 결정적 리포트를 돌려준다', async () => {
  // Given: 7항목 답변과 카탈로그
  const adapter = createMockAdapter();
  const answers = { what: '동네 빵집 단골 주문 앱', who: '카페 단골' };
  const catalog = { worlds: [{ id: 'w-x', title: 'X' }], blocks: [] };
  // When: 두 번 호출
  const a = await adapter.generateRealityCheck({ answers, catalog });
  const b = await adapter.generateRealityCheck({ answers, catalog });
  // Then: 결정적이고 6영역 모두 자리한다
  assert.deepEqual(a, b);
  for (const area of [
    'market_saturation',
    'entry_cost',
    'two_sided_market',
    'legal_risk',
    'revenue_model',
    'graveyard',
  ]) {
    assert.ok(a.areas[area], `${area} 영역이 빠짐`);
    assert.equal(a.areas[area].observation, '');
    assert.ok(Array.isArray(a.areas[area].questions));
    assert.ok(a.areas[area].questions.length >= 2, `${area} 질문이 2개 미만`);
  }
  assert.ok(Array.isArray(a.legal_warnings));
  assert.equal(a.legal_warnings.length, 0);
});

test('generateRealityCheck: 인자 없이 호출해도 6영역 표준 시드를 돌려준다', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.generateRealityCheck();
  assert.ok(result.areas.market_saturation.questions.length >= 2);
  assert.equal(result.legal_warnings.length, 0);
});

// ── recommendBlocks (ADR 0029 + docs/specs/block-recommendation.md) ─────────────

test('recommendBlocks: priority=required 블럭이 먼저, 부족분은 catalog 순서로 채워 5개', async () => {
  const adapter = createMockAdapter();
  const catalog = {
    blocks: [
      { id: 'b1', name: 'B1', user_desc: '...' },
      { id: 'b2', name: 'B2', user_desc: '...', priority: 'required' },
      { id: 'b3', name: 'B3', user_desc: '...' },
      { id: 'b4', name: 'B4', user_desc: '...', priority: 'required' },
      { id: 'b5', name: 'B5', user_desc: '...' },
      { id: 'b6', name: 'B6', user_desc: '...' },
      { id: 'b7', name: 'B7', user_desc: '...' },
    ],
  };
  const result = await adapter.recommendBlocks({ answers: { what: '쇼핑몰' }, catalog });
  // required 둘이 먼저 + 부족분 채워 5개
  assert.deepEqual(result.recommended.slice(0, 2), ['b2', 'b4']);
  assert.equal(result.recommended.length, 5);
  // reasons는 두 시점 객체(ADR 0030 결정 1). 모든 추천에 user/dev 둘 다 한 줄
  for (const id of result.recommended) {
    assert.equal(typeof result.reasons[id], 'object');
    assert.equal(typeof result.reasons[id].user, 'string');
    assert.equal(typeof result.reasons[id].dev, 'string');
    assert.ok(result.reasons[id].user.length > 0, `${id}의 user 시점이 비어있음`);
    assert.ok(result.reasons[id].dev.length > 0, `${id}의 dev 시점이 비어있음`);
  }
  // required 블럭의 user는 "핵심"을 짚는 일상어
  assert.match(result.reasons.b2.user, /핵심/);
  // required 블럭의 dev는 priority=required를 짚는다
  assert.match(result.reasons.b2.dev, /priority=required/);
});

test('recommendBlocks: 두 시점 reasons가 단축어 자리(dev)와 일상어 자리(user)로 갈린다(ADR 0030)', async () => {
  const adapter = createMockAdapter();
  const catalog = {
    blocks: [{ id: 'a', name: 'A', user_desc: '...' }], // priority 없음
  };
  const result = await adapter.recommendBlocks({ answers: {}, catalog });
  const r = result.reasons.a;
  // user 시점은 일상어("골라봤어요")
  assert.match(r.user, /골라봤어요|봤어요|해봤/);
  // dev 시점은 기술 용어 OK("heuristic", "fallback")
  assert.match(r.dev, /heuristic|fallback/i);
});

test('recommendBlocks: 결정적이다(같은 입력은 같은 출력)', async () => {
  const adapter = createMockAdapter();
  const catalog = { blocks: [{ id: 'a', name: 'A', user_desc: '...' }] };
  const a = await adapter.recommendBlocks({ answers: { what: '쇼핑' }, catalog });
  const b = await adapter.recommendBlocks({ answers: { what: '쇼핑' }, catalog });
  assert.deepEqual(a, b);
});

test('recommendBlocks: 빈 catalog는 빈 추천을 돌려준다', async () => {
  const adapter = createMockAdapter();
  const a = await adapter.recommendBlocks({ answers: { what: 'x' }, catalog: { blocks: [] } });
  assert.deepEqual(a, { recommended: [], reasons: {} });
  const b = await adapter.recommendBlocks({ answers: {}, catalog: {} });
  assert.deepEqual(b, { recommended: [], reasons: {} });
});

test('recommendBlocks: 인자 없이 호출해도 빈 결과', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.recommendBlocks();
  assert.deepEqual(result, { recommended: [], reasons: {} });
});

test('recommendBlocks: 너무 많으면 앞 10개로 자른다', async () => {
  const adapter = createMockAdapter();
  const catalog = {
    blocks: Array.from({ length: 15 }, (_, i) => ({
      id: `b${i}`,
      name: `B${i}`,
      user_desc: '...',
      priority: 'required', // 15개 모두 required로
    })),
  };
  const result = await adapter.recommendBlocks({ answers: {}, catalog });
  assert.equal(result.recommended.length, 10);
});

// ── recommendArchitecture (ADR 0032 + docs/specs/architecture-recommendation.md) ─────────────

test('recommendArchitecture: 4개 결정에 ADR 0012의 첫 옵션을 추천한다', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.recommendArchitecture({
    answers: { what: '쇼핑몰' },
    catalog: { blocks: [] },
    selectedBlocks: { selected: ['order'], auto_added: [], affected: [], prerequisites: [] },
  });
  assert.deepEqual(result.recommended, {
    language: 'node',
    database: 'postgresql',
    api_style: 'rest',
    architecture_pattern: 'monolith',
  });
});

test('recommendArchitecture: 4개 결정 모두에 두 시점 reasons가 채워진다', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.recommendArchitecture({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
  });
  for (const key of ['language', 'database', 'api_style', 'architecture_pattern']) {
    assert.equal(typeof result.reasons[key], 'object');
    assert.equal(typeof result.reasons[key].user, 'string');
    assert.equal(typeof result.reasons[key].dev, 'string');
    assert.ok(result.reasons[key].user.length > 0, `${key}의 user 시점이 비어있음`);
    assert.ok(result.reasons[key].dev.length > 0, `${key}의 dev 시점이 비어있음`);
  }
  // user 시점은 일상어, dev 시점은 기술 용어
  assert.match(result.reasons.language.user, /골라봤어요|자리|봤어요/);
  assert.match(result.reasons.language.dev, /heuristic|ADR/i);
});

test('recommendArchitecture: 결정적이다(같은 입력은 같은 출력)', async () => {
  const adapter = createMockAdapter();
  const a = await adapter.recommendArchitecture({
    answers: { what: '쇼핑' },
    catalog: { blocks: [] },
    selectedBlocks: { selected: ['x'] },
  });
  const b = await adapter.recommendArchitecture({
    answers: { what: '쇼핑' },
    catalog: { blocks: [] },
    selectedBlocks: { selected: ['x'] },
  });
  assert.deepEqual(a, b);
});

test('recommendArchitecture: 인자 없이 호출해도 표준 옵션을 돌려준다', async () => {
  const adapter = createMockAdapter();
  const result = await adapter.recommendArchitecture();
  assert.equal(result.recommended.language, 'node');
  assert.equal(result.recommended.database, 'postgresql');
  assert.equal(result.recommended.api_style, 'rest');
  assert.equal(result.recommended.architecture_pattern, 'monolith');
});

test('recommendArchitecture: answers와 selectedBlocks와 무관하게 결정성 보장', async () => {
  const adapter = createMockAdapter();
  // 도메인 다른 두 입력
  const a = await adapter.recommendArchitecture({
    answers: { what: '쇼핑' },
    catalog: { blocks: [{ id: 'order', priority: 'required' }] },
    selectedBlocks: { selected: ['order'], auto_added: ['payment'] },
  });
  const b = await adapter.recommendArchitecture({
    answers: { what: '예약' },
    catalog: { blocks: [{ id: 'booking' }] },
    selectedBlocks: { selected: ['booking'] },
  });
  // mock은 입력을 보지 않으므로 같은 결과
  assert.deepEqual(a.recommended, b.recommended);
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

// ADR 0036 fillTestCode

test('fillTestCode: GWT 텍스트를 인용한 의도 한 줄 주석을 돌려준다', async () => {
  const adapter = createMockAdapter();
  const code = await adapter.fillTestCode({
    block: { id: 'order', name: '주문' },
    endpoint: { operation: 'create', method: 'POST', path: '/orders' },
    scenario: {
      kind: 'happy_path',
      given: '유효한 주문 입력 데이터가 준비되어 있다',
      when: 'POST /orders로 주문 생성을 요청한다',
      then: '201 응답과 함께 새 식별자가 돌아온다',
    },
    architecture: { language: 'node' },
  });
  assert.match(code, /^\/\/ TODO:/);
  assert.match(code, /유효한 주문 입력 데이터가 준비되어 있다을 준비하고/);
  assert.match(code, /POST \/orders로 주문 생성을 요청한다을 호출해/);
  assert.match(code, /201 응답과 함께 새 식별자가 돌아온다을 검증한다/);
});

test('fillTestCode: 결정적이다(같은 입력은 같은 출력)', async () => {
  const adapter = createMockAdapter();
  const args = {
    block: { id: 'a', name: 'A' },
    endpoint: { operation: 'list', method: 'GET', path: '/a' },
    scenario: { kind: 'happy_path', given: 'g', when: 'w', then: 't' },
    architecture: { language: 'java' },
  };
  const a = await adapter.fillTestCode(args);
  const b = await adapter.fillTestCode(args);
  assert.equal(a, b);
});

test('fillTestCode: 시나리오 GWT가 모두 비어있으면 빈 문자열', async () => {
  const adapter = createMockAdapter();
  const code = await adapter.fillTestCode({
    block: { id: 'a', name: 'A' },
    endpoint: { operation: 'unknown', method: 'GET', path: '/a' },
    scenario: { kind: 'happy_path', given: '', when: '', then: '' },
    architecture: { language: 'node' },
  });
  assert.equal(code, '');
});

test('fillTestCode: architecture.language와 무관하게 결정적', async () => {
  const adapter = createMockAdapter();
  const base = {
    block: { id: 'a', name: 'A' },
    endpoint: { operation: 'create', method: 'POST', path: '/a' },
    scenario: { kind: 'happy_path', given: 'g', when: 'w', then: 't' },
  };
  const node = await adapter.fillTestCode({ ...base, architecture: { language: 'node' } });
  const java = await adapter.fillTestCode({ ...base, architecture: { language: 'java' } });
  // mock은 언어 무관 결이라 출력이 같다(언어별 분기는 claude의 자리)
  assert.equal(node, java);
});

test('fillTestCode: 인자 없이 호출해도 빈 문자열로 안전', async () => {
  const adapter = createMockAdapter();
  const code = await adapter.fillTestCode();
  assert.equal(code, '');
});
