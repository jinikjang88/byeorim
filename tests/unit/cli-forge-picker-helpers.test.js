// forge-picker-helpers 단위 테스트. 순수 함수라 입출력만 본다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatContractsSummary } from '../../packages/cli/src/forge-picker-helpers.js';

const RESOURCE_CONTRACT = {
  block_id: 'order',
  name: '주문',
  api_style: 'resource',
  endpoints: [
    {
      operation: 'create',
      method: 'POST',
      path: '/orders',
      description: '주문 생성',
      request_schema: { type: 'object' },
      response_schema: { type: 'object' },
    },
    {
      operation: 'list',
      method: 'GET',
      path: '/orders',
      description: '주문 목록 조회',
      request_schema: 'TODO',
      response_schema: 'TODO',
    },
  ],
};

const QUERY_CONTRACT = {
  block_id: 'product-search',
  name: '상품 검색',
  api_style: 'query',
  endpoints: [
    {
      operation: 'search',
      method: 'GET',
      path: '/product-searches',
      description: '상품 검색',
      request_schema: 'TODO',
      response_schema: 'TODO',
    },
  ],
};

const INTERNAL_CONTRACT = {
  block_id: 'pg-integration',
  name: 'PG 연동',
  api_style: 'internal',
  endpoints: [],
  internal: true,
};

test('블럭별 한 줄과 메서드/path 줄을 포함한다(ADR 0034 결정 2)', () => {
  // Given/When
  const summary = formatContractsSummary({
    contracts: [RESOURCE_CONTRACT, QUERY_CONTRACT],
    blockCount: 2,
    endpointCount: 3,
    adapter: { name: 'mock' },
    schemaFilled: true,
  });
  // Then
  assert.ok(summary.includes('블럭 2개, 엔드포인트 3개'), '헤더 라인이 들어있어야 한다');
  assert.ok(summary.includes('주문 (resource, 2개 endpoint)'));
  assert.ok(summary.includes('POST'));
  assert.ok(summary.includes('/orders'));
  assert.ok(summary.includes('주문 생성'));
  assert.ok(summary.includes('상품 검색 (query, 1개 endpoint)'));
});

test('internal 블럭은 "공개 API 없음" 한 줄로 표시한다', () => {
  // Given/When
  const summary = formatContractsSummary({
    contracts: [INTERNAL_CONTRACT],
    blockCount: 1,
    endpointCount: 0,
    adapter: { name: 'mock' },
    schemaFilled: true,
  });
  // Then
  assert.ok(summary.includes('PG 연동 (internal — 공개 API 없음)'));
});

test('schemaFilled=true이면 어댑터 이름과 채움 통계가 들어간다', () => {
  // Given/When
  const summary = formatContractsSummary({
    contracts: [RESOURCE_CONTRACT],
    blockCount: 1,
    endpointCount: 2,
    adapter: { name: 'mock' },
    schemaFilled: true,
  });
  // Then: 4 자리 중 2 자리만 schema 객체(나머지 TODO)
  assert.ok(summary.includes('AI 어댑터: mock'));
  assert.ok(summary.includes('schema 2/4개 채워짐'));
});

test('schemaFilled=false이면 모두 TODO 안내가 들어간다', () => {
  // Given/When
  const summary = formatContractsSummary({
    contracts: [RESOURCE_CONTRACT],
    blockCount: 1,
    endpointCount: 2,
    adapter: null,
    schemaFilled: false,
  });
  // Then
  assert.ok(summary.includes('어댑터가 schema 채움을 지원하지 않아 모두 TODO로 남아있어요'));
});

test('adapterIsDeterministic이면 같은 schema 안내가 들어간다(ADR 0034 결정 3)', () => {
  // Given/When
  const summary = formatContractsSummary({
    contracts: [RESOURCE_CONTRACT],
    blockCount: 1,
    endpointCount: 2,
    adapter: { name: 'mock' },
    schemaFilled: true,
    adapterIsDeterministic: true,
  });
  // Then
  assert.ok(summary.includes('어댑터가 결정적이라'));
  assert.ok(summary.includes('같은 schema'));
});

test('adapterIsDeterministic=false이면 결정성 안내가 안 보인다', () => {
  // Given/When
  const summary = formatContractsSummary({
    contracts: [RESOURCE_CONTRACT],
    blockCount: 1,
    endpointCount: 2,
    adapter: { name: 'claude' },
    schemaFilled: true,
    adapterIsDeterministic: false,
  });
  // Then
  assert.equal(summary.includes('어댑터가 결정적이라'), false);
});

test('빈 contracts 배열도 안전하게 처리한다', () => {
  // Given/When
  const summary = formatContractsSummary({
    contracts: [],
    blockCount: 0,
    endpointCount: 0,
    adapter: null,
    schemaFilled: false,
  });
  // Then: 헤더는 있고 블럭별 자리는 비어있음(에러 없음)
  assert.ok(summary.includes('블럭 0개, 엔드포인트 0개'));
});
