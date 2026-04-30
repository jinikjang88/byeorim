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
