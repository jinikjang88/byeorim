// temper-picker-helpers 단위 테스트. 순수 함수라 입출력만 본다.
// ADR 0037 결정 2(검토 화면 표시 깊이)와 결정 3(결정성 안내).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatScenariosSummary } from '../../packages/cli/src/temper-picker-helpers.js';

const RESOURCE_BLOCK = {
  block_id: 'order',
  name: '주문',
  api_style: 'resource',
  endpoints: [
    {
      operation: 'create',
      method: 'POST',
      path: '/orders',
      scenarios: [
        {
          kind: 'happy_path',
          given: '유효한 주문 입력 데이터가 준비되어 있다',
          when: 'POST /orders로 주문 생성을 요청한다',
          then: '201 응답과 함께 새 식별자가 돌아온다',
          test_code: '// TODO: ...',
        },
      ],
    },
    {
      operation: 'list',
      method: 'GET',
      path: '/orders',
      scenarios: [
        {
          kind: 'happy_path',
          given: '주문이 0개 이상 저장되어 있다',
          when: 'GET /orders로 목록을 조회한다',
          then: '200 응답과 함께 주문 목록이 돌아온다',
          test_code: 'TODO',
        },
      ],
    },
  ],
};

const QUERY_BLOCK = {
  block_id: 'product-search',
  name: '상품 검색',
  api_style: 'query',
  endpoints: [
    {
      operation: 'search',
      method: 'GET',
      path: '/product-searches',
      scenarios: [
        {
          kind: 'happy_path',
          given: '검색 조건이 준비되어 있다',
          when: 'GET /product-searches로 검색을 요청한다',
          then: '200 응답과 함께 결과 목록이 돌아온다',
          test_code: 'TODO',
        },
      ],
    },
  ],
};

const INTERNAL_BLOCK = {
  block_id: 'pg-integration',
  name: 'PG 연동',
  api_style: 'internal',
  endpoints: [],
};

test('블럭별 한 줄과 메서드/path/시나리오 종류 줄을 포함한다(ADR 0037 결정 2)', () => {
  // Given/When
  const summary = formatScenariosSummary({
    scenarios: [RESOURCE_BLOCK, QUERY_BLOCK],
    blockCount: 2,
    scenarioCount: 3,
    adapter: { name: 'mock' },
    testCodeFilled: true,
  });
  // Then
  assert.ok(summary.includes('블럭 2개, 시나리오 3개'), '헤더 라인이 들어있어야 한다');
  assert.ok(summary.includes('주문 (resource, 2개 시나리오)'));
  assert.ok(summary.includes('POST'));
  assert.ok(summary.includes('/orders'));
  assert.ok(summary.includes('happy_path'));
  assert.ok(summary.includes('상품 검색 (query, 1개 시나리오)'));
});

test('internal 블럭은 "시나리오 없음" 한 줄로 표시한다', () => {
  // Given/When
  const summary = formatScenariosSummary({
    scenarios: [INTERNAL_BLOCK],
    blockCount: 1,
    scenarioCount: 0,
    adapter: { name: 'mock' },
    testCodeFilled: true,
  });
  // Then
  assert.ok(summary.includes('PG 연동 (internal — 시나리오 없음)'));
});

test('testCodeFilled=true이면 어댑터 이름과 채움 통계가 들어간다', () => {
  // Given/When
  const summary = formatScenariosSummary({
    scenarios: [RESOURCE_BLOCK],
    blockCount: 1,
    scenarioCount: 2,
    adapter: { name: 'mock' },
    testCodeFilled: true,
  });
  // Then: 2 시나리오 중 1개만 채워짐(create는 채움, list는 TODO)
  assert.ok(summary.includes('AI 어댑터: mock'));
  assert.ok(summary.includes('test_code 1/2개 채워짐'));
});

test('testCodeFilled=false이면 모두 TODO 안내가 들어간다', () => {
  // Given/When
  const summary = formatScenariosSummary({
    scenarios: [RESOURCE_BLOCK],
    blockCount: 1,
    scenarioCount: 2,
    adapter: null,
    testCodeFilled: false,
  });
  // Then
  assert.ok(summary.includes('어댑터가 test_code 채움을 지원하지 않아 모두 TODO로 남아있어요'));
});

test('adapterIsDeterministic이면 같은 test_code 안내가 들어간다(ADR 0037 결정 3)', () => {
  // Given/When
  const summary = formatScenariosSummary({
    scenarios: [RESOURCE_BLOCK],
    blockCount: 1,
    scenarioCount: 2,
    adapter: { name: 'mock' },
    testCodeFilled: true,
    adapterIsDeterministic: true,
  });
  // Then
  assert.ok(summary.includes('어댑터가 결정적이라'));
  assert.ok(summary.includes('같은 test_code'));
});

test('adapterIsDeterministic=false이면 결정성 안내가 안 보인다', () => {
  // Given/When
  const summary = formatScenariosSummary({
    scenarios: [RESOURCE_BLOCK],
    blockCount: 1,
    scenarioCount: 2,
    adapter: { name: 'claude' },
    testCodeFilled: true,
    adapterIsDeterministic: false,
  });
  // Then
  assert.equal(summary.includes('어댑터가 결정적이라'), false);
});

test('빈 scenarios 배열도 안전하게 처리한다', () => {
  // Given/When
  const summary = formatScenariosSummary({
    scenarios: [],
    blockCount: 0,
    scenarioCount: 0,
    adapter: null,
    testCodeFilled: false,
  });
  // Then: 헤더는 있고 블럭별 자리는 비어있음(에러 없음)
  assert.ok(summary.includes('블럭 0개, 시나리오 0개'));
});
