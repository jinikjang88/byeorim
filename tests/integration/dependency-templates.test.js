// 실제 templates/ 카탈로그 데이터에 대고 의존성 해결기를 돌린다.
// loadCatalog가 검증을 먼저 통과시키므로 resolveAll만 의미 있는 자리에서 단언한다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveAll } from '../../packages/core/index.js';
import { loadCatalog } from '../../packages/catalog/index.js';
import { templatePath } from '../../packages/templates/index.js';

function load(name) {
  return loadCatalog(templatePath(name));
}

// ── commerce ─────────────────────────────────────────

test('commerce: coupon만 선택하면 결제, 환불, 정산이 affected로 잡힌다', () => {
  // Given: 검증을 통과한 commerce 카탈로그
  const catalog = load('commerce');
  // When: coupon 한 개만 선택
  const result = resolveAll(['coupon'], catalog);
  // Then: 카탈로그 데이터상 coupon의 영향은 affects로 기록되어 있으므로
  //       payment, refund, settlement는 allBlocks가 아니라 affected에 들어간다.
  //       MANIFESTO의 "쿠폰을 넣었으면 환불, 정산, 결제도 따라온다"는 약속이 데이터에 살아있는지 본다.
  assert.deepEqual(result.allBlocks, ['coupon']);
  assert.deepEqual(result.autoAdded, []);
  assert.equal(result.affected.includes('payment'), true);
  assert.equal(result.affected.includes('refund'), true);
  assert.equal(result.affected.includes('settlement'), true);
});

test('commerce: coupon 선택 시 cascade 질문 두 개가 모인다', () => {
  // Given: commerce 카탈로그
  const catalog = load('commerce');
  // When: coupon을 선택
  const result = resolveAll(['coupon'], catalog);
  // Then: catalog.yml의 coupon cascade에 등록된 두 질문이 모두 수집된다
  const couponDecisions = result.decisions.filter((d) => d.trigger === 'coupon');
  assert.equal(couponDecisions.length, 2);
  // 질문 텍스트로도 한 번 더 확인. 카탈로그가 바뀌면 같이 갱신해야 한다는 신호다.
  assert.ok(couponDecisions.some((d) => d.question.includes('환불하면 쿠폰을 돌려줄까요')));
  assert.ok(couponDecisions.some((d) => d.question.includes('쿠폰 할인 비용은 누가 부담')));
});

test('commerce: payment 선택 시 pg-integration이 requires로 따라오고 prereq도 잡힌다', () => {
  // Given: commerce 카탈로그
  const catalog = load('commerce');
  // When: payment만 선택
  const result = resolveAll(['payment'], catalog);
  // Then: payment requires pg-integration이므로 자동 추가된다
  assert.equal(result.allBlocks.includes('pg-integration'), true);
  assert.equal(result.autoAdded.includes('pg-integration'), true);
  // 그리고 PG 계약/사업자등록처럼 payment 또는 pg-integration을 enables하는 prereq가 잡힌다
  const prereqIds = result.prerequisites.map((p) => p.id);
  assert.equal(prereqIds.includes('prereq-pg-contract'), true);
  assert.equal(prereqIds.includes('prereq-biz-register'), true);
});

test('commerce: refund 선택 시 결제와 취소/반품이 함께 끌려 들어온다', () => {
  // Given: commerce 카탈로그
  const catalog = load('commerce');
  // When: refund만 선택
  const result = resolveAll(['refund'], catalog);
  // Then: refund requires payment, refund requires cancel-return이므로 둘 다 자동 추가
  assert.equal(result.autoAdded.includes('payment'), true);
  assert.equal(result.autoAdded.includes('cancel-return'), true);
  // payment의 의존성 체인을 따라 pg-integration까지 끌려와야 한다
  assert.equal(result.allBlocks.includes('pg-integration'), true);
});

// ── job-aggregator ───────────────────────────────────

test('job-aggregator: 카탈로그 전체 블럭을 선택해도 해결이 끝까지 돌아간다', () => {
  // Given: 검증을 통과한 job-aggregator 카탈로그
  const catalog = load('job-aggregator');
  const allBlockIds = catalog.blocks.map((b) => b.id);
  // When: 모든 블럭을 한 번에 선택해 의존성 해결을 돌린다
  const result = resolveAll(allBlockIds, catalog);
  // Then: 결과 블럭 수가 입력 수와 같고(이미 모두 선택), 추가 자동 추가가 없다
  assert.deepEqual(new Set(result.allBlocks), new Set(allBlockIds));
  assert.deepEqual(result.autoAdded, []);
});

test('job-aggregator: 카탈로그의 모든 requires 의존성이 실제 도달 가능한 블럭만 가리킨다', () => {
  // Given: job-aggregator 카탈로그
  const catalog = load('job-aggregator');
  const blockIds = new Set(catalog.blocks.map((b) => b.id));
  // When: 각 블럭에서 출발해 resolveAll을 돌린다
  // Then: 결과의 모든 ID가 카탈로그의 blocks 안에 존재한다.
  //       카탈로그 검증이 ID 무결성을 이미 보장하지만, 해결기가 그 보장을 깨지 않는지 본다.
  for (const id of blockIds) {
    const result = resolveAll([id], catalog);
    for (const got of result.allBlocks) {
      assert.equal(blockIds.has(got), true, `${id} 시작에서 알 수 없는 블럭 ${got} 등장`);
    }
    for (const got of result.affected) {
      assert.equal(blockIds.has(got), true, `${id} 시작에서 알 수 없는 affected 블럭 ${got} 등장`);
    }
  }
});
