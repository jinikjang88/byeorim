// 카탈로그 스키마 검증 단위 테스트. Given-When-Then 패턴 (CLAUDE.md 섹션 4)

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateCatalog } from '../../packages/catalog/index.js';

const minimalCatalog = () => ({
  worlds: [{ id: 'w-one', title: '세계 1' }],
  blocks: [{ id: 'block-a', name: 'A', user_desc: '블럭 A 설명' }],
});

test('정상적인 최소 카탈로그는 통과한다', () => {
  // Given: worlds와 blocks만 있는 최소 카탈로그
  const catalog = minimalCatalog();
  // When: 검증을 돌린다
  const result = validateCatalog(catalog);
  // Then: 유효하다고 판정된다
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
});

test('worlds가 비어있으면 거부한다', () => {
  // Given: worlds가 빈 배열인 카탈로그
  const catalog = { worlds: [], blocks: [{ id: 'a', name: 'A', user_desc: 'd' }] };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 형식 오류로 거부된다
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'schema'));
});

test('blocks가 누락되면 거부한다', () => {
  // Given: blocks 키가 빠진 카탈로그
  const catalog = { worlds: [{ id: 'w', title: 't' }] };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 거부된다
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'schema'));
});

test('block의 user_desc가 누락되면 거부한다', () => {
  // Given: user_desc 없는 block
  const catalog = {
    worlds: [{ id: 'w', title: 't' }],
    blocks: [{ id: 'b', name: 'B' }],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 형식 오류
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'schema'));
});

test('dependency type이 알려지지 않은 값이면 거부한다', () => {
  // Given: type이 unknown인 의존성
  const catalog = {
    worlds: [{ id: 'w', title: 't' }],
    blocks: [
      { id: 'a', name: 'A', user_desc: 'a' },
      { id: 'b', name: 'B', user_desc: 'b' },
    ],
    dependencies: [{ source: 'a', target: 'b', type: 'unknown' }],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 형식 오류
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'schema'));
});

test('ID 패턴이 잘못되면 거부한다', () => {
  // Given: 대문자가 들어간 ID
  const catalog = {
    worlds: [{ id: 'W-One', title: 't' }],
    blocks: [{ id: 'b', name: 'B', user_desc: 'd' }],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 형식 오류
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'schema'));
});

test('알려지지 않은 추가 필드는 거부한다', () => {
  // Given: 스키마에 정의되지 않은 mystery 필드를 가진 카탈로그
  const catalog = {
    ...minimalCatalog(),
    mystery: 'extra',
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 형식 오류
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'schema'));
});

test('존재하지 않는 block을 참조하는 의존성은 거부한다', () => {
  // Given: target이 카탈로그에 없는 의존성
  const catalog = {
    worlds: [{ id: 'w', title: 't' }],
    blocks: [{ id: 'a', name: 'A', user_desc: 'a' }],
    dependencies: [{ source: 'a', target: 'ghost', type: 'requires' }],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 참조 오류
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'reference' && e.path.includes('target')));
});

test('block의 bundle_id가 카탈로그에 없으면 거부한다', () => {
  // Given: 존재하지 않는 bundle을 가리키는 block
  const catalog = {
    worlds: [{ id: 'w', title: 't' }],
    bundles: [{ id: 'bun', world_id: 'w', title: '번들' }],
    blocks: [{ id: 'a', name: 'A', user_desc: 'a', bundle_id: 'ghost-bundle' }],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 참조 오류
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'reference' && e.path.includes('bundle_id')));
});

test('동일 ID가 두 번 나오면 중복으로 거부한다', () => {
  // Given: 같은 id를 가진 두 block
  const catalog = {
    worlds: [{ id: 'w', title: 't' }],
    blocks: [
      { id: 'dup', name: '하나', user_desc: 'd1' },
      { id: 'dup', name: '둘', user_desc: 'd2' },
    ],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 중복 오류
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'reference' && e.message.includes('중복')));
});

test('cascade.add_blocks가 가상 ID를 가리키면 거부한다', () => {
  // Given: cascade가 존재하지 않는 block 추가를 시도
  const catalog = {
    worlds: [{ id: 'w', title: 't' }],
    blocks: [{ id: 'a', name: 'A', user_desc: 'a' }],
    cascades: [{ trigger: 'a', add_blocks: ['ghost'] }],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 참조 오류
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.kind === 'reference' && e.path.includes('cascades') && e.path.includes('add_blocks'),
    ),
  );
});

test('prerequisite의 enables가 가상 block을 가리키면 거부한다', () => {
  // Given: enables에 존재하지 않는 block을 적은 prerequisite
  const catalog = {
    worlds: [{ id: 'w', title: 't' }],
    blocks: [{ id: 'a', name: 'A', user_desc: 'a' }],
    prerequisites: [{ name: '사업자등록', enables: ['ghost-block'] }],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 참조 오류
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'reference' && e.path.includes('enables')));
});

test('형식 오류와 참조 오류가 섞여 있으면 모두 모아서 반환한다', () => {
  // Given: 형식 오류 한 개와 참조 오류 한 개가 섞인 카탈로그
  const catalog = {
    worlds: [{ id: 'w', title: 't' }],
    blocks: [{ id: 'a', name: 'A' }],
    dependencies: [{ source: 'a', target: 'ghost', type: 'requires' }],
  };
  // When: 검증한다
  const result = validateCatalog(catalog);
  // Then: 두 종류 오류가 한 번에 들어온다. 첫 위반에서 멈추지 않는다
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.kind === 'schema'));
  assert.ok(result.errors.some((e) => e.kind === 'reference'));
});
