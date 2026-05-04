// smelt-picker-helpers.js 단위 테스트(ADR 0031). 순수 함수만 다룬다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildBlockHierarchy,
  lookupBlockDetail,
  buildBlockDescription,
  truncateOneLine,
} from '../../packages/cli/src/smelt-picker-helpers.js';

test('buildBlockHierarchy: worlds → bundles → blocks 두 단계 그룹화', () => {
  const catalog = {
    worlds: [
      { id: 'w-a', title: '세계 A', order: 1 },
      { id: 'w-b', title: '세계 B', order: 2 },
    ],
    bundles: [
      { id: 'bn-a1', world_id: 'w-a', title: '번들 A1' },
      { id: 'bn-a2', world_id: 'w-a', title: '번들 A2' },
      { id: 'bn-b1', world_id: 'w-b', title: '번들 B1' },
    ],
    blocks: [
      { id: 'block1', bundle_id: 'bn-a1', name: 'B1' },
      { id: 'block2', bundle_id: 'bn-a2', name: 'B2' },
      { id: 'block3', bundle_id: 'bn-b1', name: 'B3' },
    ],
  };
  const result = buildBlockHierarchy(catalog);
  // 두 세계, 각 세계 안에 정확한 번들과 블럭
  assert.equal(result.length, 2);
  assert.equal(result[0].world.id, 'w-a');
  assert.equal(result[0].groups.length, 2);
  assert.equal(result[0].groups[0].bundle.id, 'bn-a1');
  assert.equal(result[0].groups[0].blocks[0].id, 'block1');
  assert.equal(result[0].groups[1].bundle.id, 'bn-a2');
  assert.equal(result[1].world.id, 'w-b');
  assert.equal(result[1].groups[0].blocks[0].id, 'block3');
});

test('buildBlockHierarchy: world.order로 정렬한다', () => {
  const catalog = {
    worlds: [
      { id: 'w-c', title: 'C', order: 3 },
      { id: 'w-a', title: 'A', order: 1 },
      { id: 'w-b', title: 'B', order: 2 },
    ],
    bundles: [
      { id: 'bn-a', world_id: 'w-a', title: 'BN-A' },
      { id: 'bn-b', world_id: 'w-b', title: 'BN-B' },
      { id: 'bn-c', world_id: 'w-c', title: 'BN-C' },
    ],
    blocks: [
      { id: 'b-c', bundle_id: 'bn-c', name: 'C' },
      { id: 'b-a', bundle_id: 'bn-a', name: 'A' },
      { id: 'b-b', bundle_id: 'bn-b', name: 'B' },
    ],
  };
  const result = buildBlockHierarchy(catalog);
  assert.deepEqual(
    result.map((w) => w.world.id),
    ['w-a', 'w-b', 'w-c'],
  );
});

test('buildBlockHierarchy: bundle 없는 블럭은 world 직속(그룹의 bundle이 null)', () => {
  const catalog = {
    worlds: [{ id: 'w-x', title: 'X', order: 1 }],
    bundles: [],
    blocks: [{ id: 'b1', name: 'B1' }], // bundle_id 없음 → "기타" world로
  };
  const result = buildBlockHierarchy(catalog);
  // bundle도 없고 world 매핑 없으므로 "기타" 그룹으로
  assert.equal(result.length, 1);
  assert.equal(result[0].world.id, 'w-other');
  assert.equal(result[0].groups[0].bundle, null);
  assert.equal(result[0].groups[0].blocks[0].id, 'b1');
});

test('buildBlockHierarchy: bundle.world_id가 알려지지 않은 world면 "기타"로', () => {
  const catalog = {
    worlds: [{ id: 'w-known', title: '알려진' }],
    bundles: [{ id: 'bn-orphan', world_id: 'w-missing', title: '고아 번들' }],
    blocks: [
      { id: 'b1', bundle_id: 'bn-orphan', name: 'B1' },
      { id: 'b2', name: 'B2' }, // bundle 없음
    ],
  };
  const result = buildBlockHierarchy(catalog);
  // 모두 "기타" world로 갔으므로 한 그룹
  assert.equal(result.length, 1);
  assert.equal(result[0].world.id, 'w-other');
});

test('buildBlockHierarchy: worlds가 비어있으면 모두 "기타" 한 그룹', () => {
  const catalog = {
    worlds: [],
    bundles: [],
    blocks: [
      { id: 'b1', name: 'B1' },
      { id: 'b2', name: 'B2' },
    ],
  };
  const result = buildBlockHierarchy(catalog);
  assert.equal(result.length, 1);
  assert.equal(result[0].world.id, 'w-other');
  assert.equal(result[0].groups[0].blocks.length, 2);
});

test('buildBlockHierarchy: 빈 카탈로그는 빈 배열', () => {
  assert.deepEqual(buildBlockHierarchy({}), []);
  assert.deepEqual(buildBlockHierarchy(null), []);
});

test('lookupBlockDetail: catalog에 있으면 name과 user_desc를 끌어온다', () => {
  const catalog = {
    blocks: [{ id: 'order', name: '주문', user_desc: '손님이 상품을 주문하는 자리' }],
  };
  const detail = lookupBlockDetail(catalog, 'order');
  assert.equal(detail.id, 'order');
  assert.equal(detail.name, '주문');
  assert.equal(detail.user_desc, '손님이 상품을 주문하는 자리');
});

test('lookupBlockDetail: catalog에 없으면 폴백(name=id, user_desc 빈 문자열)', () => {
  const detail = lookupBlockDetail({ blocks: [] }, 'ghost');
  assert.equal(detail.id, 'ghost');
  assert.equal(detail.name, 'ghost');
  assert.equal(detail.user_desc, '');
});

test('buildBlockDescription: user_desc + priority + effort_days + concerns가 한 단락', () => {
  const block = {
    user_desc: '주문 자리',
    priority: 'required',
    effort_days: 5,
    concerns: ['file-upload', 'security'],
  };
  const desc = buildBlockDescription(block);
  assert.match(desc, /주문 자리/);
  assert.match(desc, /필수 자리예요/);
  assert.match(desc, /예상 작업 5일/);
  assert.match(desc, /주의: file-upload, security/);
});

test('buildBlockDescription: 없는 자리는 안 보인다', () => {
  const desc = buildBlockDescription({ user_desc: '간단 자리' });
  assert.equal(desc, '간단 자리');
});

test('buildBlockDescription: priority가 optional이면 표시 안 함', () => {
  const desc = buildBlockDescription({ user_desc: 'X', priority: 'optional' });
  assert.equal(desc, 'X');
});

test('buildBlockDescription: 빈 블럭은 빈 문자열', () => {
  assert.equal(buildBlockDescription({}), '');
  assert.equal(buildBlockDescription(null), '');
});

test('truncateOneLine: 최대 길이를 넘기면 …로 자른다', () => {
  const long = 'a'.repeat(100);
  const cut = truncateOneLine(long, 30);
  assert.equal(cut.length, 30);
  assert.ok(cut.endsWith('…'));
});

test('truncateOneLine: 줄바꿈을 공백으로 바꾼다', () => {
  const text = 'first\nsecond\nthird';
  assert.equal(truncateOneLine(text), 'first second third');
});

test('truncateOneLine: 짧은 문자열은 그대로', () => {
  assert.equal(truncateOneLine('short', 30), 'short');
});

test('truncateOneLine: 비문자열은 빈 문자열', () => {
  assert.equal(truncateOneLine(null), '');
  assert.equal(truncateOneLine(undefined), '');
  assert.equal(truncateOneLine(42), '');
});
