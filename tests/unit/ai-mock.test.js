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
