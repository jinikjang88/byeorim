// 의존성 해결기 단위 테스트. Given-When-Then 패턴 (CLAUDE.md 섹션 4)

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveAll, resolveRequired, collectDecisions } from '../../packages/core/index.js';

const req = (source, target, reason = '') => ({ source, target, type: 'requires', reason });
const aff = (source, target, reason = '') => ({ source, target, type: 'affects', reason });

const makeCatalog = (overrides = {}) => ({
  dependencies: [],
  cascades: [],
  prerequisites: [],
  ...overrides,
});

// ── 기본 동작 ────────────────────────────────────────

test('의존성 없는 단일 블럭 선택 시 자기 자신만 반환한다', () => {
  // Given: 의존성과 cascade가 없는 카탈로그
  const catalog = makeCatalog();
  // When: product 한 개를 선택해 해결한다
  const result = resolveAll(['product'], catalog);
  // Then: 선택된 블럭만 남고 자동 추가도 영향도 없다
  assert.deepEqual(result.allBlocks, ['product']);
  assert.deepEqual(result.autoAdded, []);
  assert.deepEqual(result.affected, []);
  assert.deepEqual(result.prerequisites, []);
  assert.deepEqual(result.decisions, []);
});

test('빈 선택은 빈 결과를 돌려준다', () => {
  // Given: 어떤 카탈로그
  const catalog = makeCatalog({ dependencies: [req('order', 'payment')] });
  // When: 선택 목록이 비어있다
  const result = resolveAll([], catalog);
  // Then: 모든 결과가 비어있다
  assert.deepEqual(result.allBlocks, []);
  assert.deepEqual(result.autoAdded, []);
  assert.deepEqual(result.affected, []);
});

// ── requires 의존성 해결 ─────────────────────────────

test('직접 requires 의존성을 자동 추가한다', () => {
  // Given: order가 cart, payment를 requires
  const catalog = makeCatalog({
    dependencies: [req('order', 'cart'), req('order', 'payment')],
  });
  // When: order만 선택
  const result = resolveAll(['order'], catalog);
  // Then: cart와 payment가 autoAdded에 들어가고 order는 들어가지 않는다
  assert.deepEqual(new Set(result.allBlocks), new Set(['order', 'cart', 'payment']));
  assert.deepEqual(new Set(result.autoAdded), new Set(['cart', 'payment']));
  assert.equal(result.autoAdded.includes('order'), false);
});

test('간접 requires 체인을 재귀적으로 따라간다', () => {
  // Given: order → payment → pg-integration
  const catalog = makeCatalog({
    dependencies: [req('order', 'payment'), req('payment', 'pg-integration')],
  });
  // When: order만 선택
  const result = resolveAll(['order'], catalog);
  // Then: 두 단계 떨어진 pg-integration까지 자동 추가된다
  assert.equal(result.allBlocks.includes('pg-integration'), true);
  assert.equal(result.autoAdded.includes('pg-integration'), true);
});

test('이미 선택된 블럭은 autoAdded에 넣지 않는다', () => {
  // Given: order requires payment
  const catalog = makeCatalog({ dependencies: [req('order', 'payment')] });
  // When: order와 payment를 둘 다 선택
  const result = resolveAll(['order', 'payment'], catalog);
  // Then: payment는 allBlocks에 있지만 autoAdded에는 없다
  assert.equal(result.allBlocks.includes('payment'), true);
  assert.equal(result.autoAdded.includes('payment'), false);
});

// ── 순환 참조 방지 ───────────────────────────────────

test('A→B→C→A 순환에서 무한 루프에 빠지지 않는다', () => {
  // Given: 세 블럭이 서로를 requires로 가리킨다
  const catalog = makeCatalog({
    dependencies: [req('A', 'B'), req('B', 'C'), req('C', 'A')],
  });
  // When: A를 선택
  const result = resolveAll(['A'], catalog);
  // Then: 세 블럭 모두 한 번씩만 들어간다
  assert.deepEqual(new Set(result.allBlocks), new Set(['A', 'B', 'C']));
  assert.equal(result.allBlocks.length, 3);
});

test('자기 자신을 requires해도 안전하게 멈춘다', () => {
  // Given: A가 자기 자신을 requires
  const catalog = makeCatalog({ dependencies: [req('A', 'A')] });
  // When: A를 선택
  const result = resolveAll(['A'], catalog);
  // Then: A 한 개만 남고 autoAdded는 비어있다
  assert.deepEqual(result.allBlocks, ['A']);
  assert.deepEqual(result.autoAdded, []);
});

// ── affects 관계 ─────────────────────────────────────

test('선택된 블럭의 affects 대상을 affected로 모은다', () => {
  // Given: coupon이 payment, refund에 영향
  const catalog = makeCatalog({
    dependencies: [aff('coupon', 'payment'), aff('coupon', 'refund')],
  });
  // When: coupon만 선택
  const result = resolveAll(['coupon'], catalog);
  // Then: 두 블럭이 affected에 들어간다
  assert.deepEqual(new Set(result.affected), new Set(['payment', 'refund']));
});

test('이미 required로 들어간 블럭은 affected에 다시 넣지 않는다', () => {
  // Given: order가 payment를 requires이자 affects
  const catalog = makeCatalog({
    dependencies: [req('order', 'payment'), aff('order', 'payment')],
  });
  // When: order만 선택
  const result = resolveAll(['order'], catalog);
  // Then: payment는 allBlocks에만 있고 affected에는 없다
  assert.equal(result.allBlocks.includes('payment'), true);
  assert.equal(result.affected.includes('payment'), false);
});

// ── prerequisites ────────────────────────────────────

test('선택된 블럭을 enables하는 준비물만 모은다', () => {
  // Given: PG 계약은 payment를 enables, AWS 계정은 notification을 enables
  const catalog = makeCatalog({
    prerequisites: [
      { id: 'pg-contract', name: 'PG 계약', enables: ['payment'] },
      { id: 'aws-setup', name: 'AWS 계정', enables: ['notification'] },
    ],
  });
  // When: payment만 선택
  const result = resolveAll(['payment'], catalog);
  // Then: PG 계약 한 개만 남는다
  assert.equal(result.prerequisites.length, 1);
  assert.equal(result.prerequisites[0].id, 'pg-contract');
});

test('enables가 없는 준비물은 무시한다', () => {
  // Given: 어떤 블럭도 enables하지 않는 고아 준비물
  const catalog = makeCatalog({ prerequisites: [{ id: 'orphan', name: '고립' }] });
  // When: 아무 블럭이나 선택
  const result = resolveAll(['payment'], catalog);
  // Then: 빈 배열이 돌아온다
  assert.deepEqual(result.prerequisites, []);
});

// ── cascade 결정 수집 ────────────────────────────────

test('선택된 블럭에 걸린 cascade 질문을 수집한다', () => {
  // Given: coupon에 두 질문이 걸린 cascade
  const catalog = makeCatalog({
    cascades: [
      {
        trigger: 'coupon',
        ask_questions: [
          {
            question: '쿠폰 환불 시 복원할까요?',
            options: ['복원', '소멸'],
            cascade_effects: ['환불 로직에 분기 추가'],
          },
          {
            question: '쿠폰 비용은 누가 부담하나요?',
            options: ['플랫폼', '판매자'],
            cascade_effects: ['정산 로직에 분담 계산 추가'],
          },
        ],
      },
    ],
  });
  // When: coupon을 선택
  const result = resolveAll(['coupon'], catalog);
  // Then: 두 질문이 모두 수집되고 trigger 정보가 보존된다
  assert.equal(result.decisions.length, 2);
  assert.equal(result.decisions[0].trigger, 'coupon');
  assert.equal(result.decisions[0].question, '쿠폰 환불 시 복원할까요?');
  assert.deepEqual(result.decisions[0].options, ['복원', '소멸']);
  assert.deepEqual(result.decisions[0].cascade_effects, ['환불 로직에 분기 추가']);
});

test('선택되지 않은 블럭의 cascade는 무시한다', () => {
  // Given: coupon에 cascade가 걸려있는데 사용자는 order를 선택
  const catalog = makeCatalog({
    cascades: [
      {
        trigger: 'coupon',
        ask_questions: [{ question: '쿠폰 질문', options: [] }],
      },
    ],
  });
  // When: order만 선택
  const result = resolveAll(['order'], catalog);
  // Then: 결정이 비어있다
  assert.deepEqual(result.decisions, []);
});

test('requires로 자동 추가된 블럭의 cascade도 수집한다', () => {
  // Given: order requires payment, payment에 cascade 질문이 걸려있다
  const catalog = makeCatalog({
    dependencies: [req('order', 'payment')],
    cascades: [
      {
        trigger: 'payment',
        ask_questions: [{ question: '결제 실패 정책', options: ['재시도', '취소'] }],
      },
    ],
  });
  // When: order만 선택
  const result = resolveAll(['order'], catalog);
  // Then: payment가 자동 추가되었으므로 그 cascade도 따라온다
  assert.equal(result.decisions.length, 1);
  assert.equal(result.decisions[0].trigger, 'payment');
});

// ── 다이아몬드 의존성 ────────────────────────────────

test('다이아몬드 의존성에서 공통 노드를 한 번만 추가한다', () => {
  // Given: A→B, A→C, B→D, C→D
  const catalog = makeCatalog({
    dependencies: [req('A', 'B'), req('A', 'C'), req('B', 'D'), req('C', 'D')],
  });
  // When: A만 선택
  const result = resolveAll(['A'], catalog);
  // Then: D가 한 번만 들어가고 전체 4개 블럭이 된다
  const dCount = result.allBlocks.filter((id) => id === 'D').length;
  assert.equal(dCount, 1);
  assert.equal(result.allBlocks.length, 4);
});

// ── 복합 시나리오 ────────────────────────────────────

test('requires + affects + prerequisites + cascade가 함께 동작한다', () => {
  // Given: order requires cart, payment. payment affects settlement. order에 cascade.
  //        PG 계약은 payment를 enables.
  const catalog = makeCatalog({
    dependencies: [req('order', 'cart'), req('order', 'payment'), aff('payment', 'settlement')],
    cascades: [
      {
        trigger: 'order',
        ask_questions: [{ question: '부분 취소 허용?', options: ['예', '아니오'] }],
      },
    ],
    prerequisites: [{ id: 'pg-contract', name: 'PG 계약', enables: ['payment'] }],
  });
  // When: order만 선택
  const result = resolveAll(['order'], catalog);
  // Then: 자동 추가, 영향, 결정, 준비물이 한 번에 잡힌다
  assert.equal(result.allBlocks.includes('cart'), true);
  assert.equal(result.allBlocks.includes('payment'), true);
  assert.deepEqual(new Set(result.autoAdded), new Set(['cart', 'payment']));
  assert.equal(result.affected.includes('settlement'), true);
  assert.equal(result.decisions.length, 1);
  assert.equal(result.prerequisites.length, 1);
});

// ── 보조 함수 단위 테스트 ────────────────────────────

test('resolveRequired는 시작 블럭 자신은 결과에서 뺀다', () => {
  // Given: order requires payment
  const deps = [req('order', 'payment')];
  // When: order에서 출발해 requires만 모은다
  const result = resolveRequired('order', deps);
  // Then: payment 한 개만 나오고 order는 빠진다
  assert.deepEqual(result, ['payment']);
});

test('collectDecisions는 입력 카탈로그가 비어있어도 빈 배열을 돌려준다', () => {
  // Given: cascades 없는 카탈로그
  const catalog = {};
  // When: 어떤 블럭이든 결정을 수집
  const result = collectDecisions(['anything'], catalog);
  // Then: 빈 배열
  assert.deepEqual(result, []);
});
