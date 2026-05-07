// buildScenariosReviewPromptMarkdown 단위 테스트. ADR 0038의 외부 AI 시나리오 검토 프롬프트.
// 모든 자리(7항목, 카탈로그, 선택, 아키텍처, contracts, 시나리오)가 마크다운에 잘 담기는지 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildScenariosReviewPromptMarkdown } from '../../packages/cli/index.js';

const FIXED_ARCHITECTURE = {
  language: 'node',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

const ORDER_CONTRACT = {
  block_id: 'order',
  name: '주문',
  api_style: 'resource',
  endpoints: [
    {
      operation: 'create',
      method: 'POST',
      path: '/orders',
      description: '주문 생성',
      request_schema: {
        type: 'object',
        properties: { quantity: { type: 'integer' } },
        required: ['quantity'],
      },
      response_schema: 'TODO',
    },
  ],
};

const ORDER_SCENARIOS = {
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
          test_code: "const res = await request(app).post('/orders').send({ quantity: 1 });",
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

const PG_INTERNAL_SCENARIOS = {
  block_id: 'pg-integration',
  name: 'PG 연동',
  api_style: 'internal',
  endpoints: [],
};

test('헤더와 푸터에 외부 AI 안내와 마커가 들어간다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  assert.match(md, /# 테스트 시나리오 검토 프롬프트/);
  assert.match(md, /외부 AI/);
  const markerCount = (md.match(/──────────────────────────────────────────/g) || []).length;
  assert.equal(markerCount, 2, '시작/끝 마커 두 자리');
});

test('시스템 텍스트가 검토 항목 셋과 단축어 풀어쓰기 가이드를 가진다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  // 비개발자 톤
  assert.match(md, /비기술 창업자/);
  assert.match(md, /일상 한국어/);
  // 단축어 풀어쓰기(GWT, happy_path, test_code, schema)
  assert.match(md, /happy_path는 "정상 흐름"/);
  assert.match(md, /test_code는 "테스트 코드"/);
  assert.match(md, /GWT는 "Given-When-Then 세 단계"/);
  assert.match(md, /schema는 "데이터 모양"/);
  // 검토 셋(ADR 0038 결정 3)
  assert.match(md, /1\. 시나리오 종류 누락/);
  assert.match(md, /2\. test_code 도메인 적합성/);
  assert.match(md, /3\. 시작 무게/);
});

test('7항목 답변이 모두 노출된다(빈 자리는 (비어있음))', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: { what: '쇼핑몰', who: '카페 사장님' },
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  assert.match(md, /- what: 쇼핑몰/);
  assert.match(md, /- who: 카페 사장님/);
  // 비어있는 자리는 (비어있음) 표시
  assert.match(md, /- when: \(비어있음\)/);
  assert.match(md, /- how_use: \(비어있음\)/);
});

test('카탈로그 전체 블럭이 priority/이름/설명과 함께 노출된다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: {
      blocks: [
        { id: 'order', name: '주문', user_desc: '고객의 주문', priority: 'core' },
        { id: 'review', name: '리뷰', user_desc: '상품 리뷰' },
      ],
    },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  assert.match(md, /총 2개 블럭/);
  assert.match(md, /- order \[core\] \(주문\): 고객의 주문/);
  assert.match(md, /- review \(리뷰\): 상품 리뷰/);
});

test('선택 블럭과 자동 추가가 따로 노출된다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: { selected: ['refund'], auto_added: ['payment', 'cancel-return'] },
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  assert.match(md, /사용자가 직접 고른 블럭: 1개/);
  assert.match(md, /- refund/);
  assert.match(md, /의존성으로 자동 추가된 블럭: 2개/);
  assert.match(md, /- payment/);
  assert.match(md, /- cancel-return/);
});

test('비어있는 선택은 (없음)으로 표시된다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: { selected: [], auto_added: [] },
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  assert.match(md, /사용자가 직접 고른 블럭: 0개/);
  assert.match(md, /- \(없음\)/);
});

test('4개 아키텍처 결정이 한국어 라벨로 노출된다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  assert.match(md, /- 언어: node/);
  assert.match(md, /- 저장소: postgresql/);
  assert.match(md, /- API 형태: rest/);
  assert.match(md, /- 코드 구조: modular-monolith/);
});

test('contracts 섹션에 endpoint와 schema가 풀어쓰기로 노출된다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [ORDER_CONTRACT],
    scenarios: [],
  });
  // 블럭 헤더
  assert.match(md, /### 주문 \(order, resource, endpoint 1개\)/);
  // endpoint 줄
  assert.match(md, /POST \/orders {2}\(create\)/);
  // 채워진 schema(JSON Schema 객체가 YAML로 풀어쓰기)
  assert.match(md, /request_schema:/);
  assert.match(md, /quantity:/);
  // TODO 자리는 안내 한 줄
  assert.match(md, /\(TODO — 아직 채워지지 않음\)/);
});

test('시나리오 섹션에 GWT와 test_code 코드 블록이 노출된다(ADR 0038 결정 4)', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [ORDER_SCENARIOS],
  });
  // 블럭 헤더(시나리오 개수 표기)
  assert.match(md, /### 주문 \(order, resource, 시나리오 2개\)/);
  // GWT 텍스트
  assert.match(md, /- given: 유효한 주문 입력 데이터가 준비되어 있다/);
  assert.match(md, /- when: POST \/orders로 주문 생성을 요청한다/);
  assert.match(md, /- then: 201 응답과 함께 새 식별자가 돌아온다/);
  // 채워진 test_code는 ```js 코드 블록(node language → js 라벨)
  assert.match(md, /```js/);
  assert.match(md, /request\(app\)\.post\('\/orders'\)/);
  // TODO 자리는 안내 한 줄
  assert.match(md, /\(TODO — 아직 채워지지 않음\)/);
});

test('language가 java면 코드 블록 라벨이 java로 노출된다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: { ...FIXED_ARCHITECTURE, language: 'java' },
    contracts: [],
    scenarios: [
      {
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
                given: 'g',
                when: 'w',
                then: 't',
                test_code: 'assertThat(response.statusCode()).isEqualTo(201);',
              },
            ],
          },
        ],
      },
    ],
  });
  assert.match(md, /```java/);
});

test('language가 python이면 코드 블록 라벨이 python으로 노출된다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: { ...FIXED_ARCHITECTURE, language: 'python' },
    contracts: [],
    scenarios: [
      {
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
                given: 'g',
                when: 'w',
                then: 't',
                test_code: 'assert response.status_code == 201',
              },
            ],
          },
        ],
      },
    ],
  });
  assert.match(md, /```python/);
});

test('language가 표준 옵션 밖이면 라벨 없는 코드 블록(```)으로 폴백', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: { ...FIXED_ARCHITECTURE, language: 'kotlin' },
    contracts: [],
    scenarios: [
      {
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
                given: 'g',
                when: 'w',
                then: 't',
                test_code: 'val response = ...',
              },
            ],
          },
        ],
      },
    ],
  });
  // 라벨 없는 펜스(``` 다음 줄에 코드)
  assert.match(md, /\n {4}```\n/);
});

test('internal 블럭은 "시나리오 없음" 헤더 한 줄로 노출된다', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [PG_INTERNAL_SCENARIOS],
  });
  assert.match(md, /### PG 연동 \(pg-integration, internal — 시나리오 없음\)/);
});

test('비어있는 시나리오는 "(시나리오가 비어있어요)" 한 줄', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  assert.match(md, /\(시나리오가 비어있어요\)/);
});

test('응답 형식 안내 섹션과 4종 변경 형식이 들어있다(ADR 0040)', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [],
  });
  assert.match(md, /## 응답 형식 안내/);
  assert.match(md, /## 제안된 변경 사항/);
  assert.match(md, /kind: scenario_add/);
  assert.match(md, /kind: scenario_remove/);
  assert.match(md, /kind: gwt_modify/);
  assert.match(md, /kind: test_code_modify/);
  assert.match(md, /```yaml/);
});

test('빈 문자열 test_code도 TODO와 같은 결로 한 줄 안내', () => {
  const md = buildScenariosReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
    scenarios: [
      {
        block_id: 'order',
        name: '주문',
        api_style: 'resource',
        endpoints: [
          {
            operation: 'create',
            method: 'POST',
            path: '/orders',
            scenarios: [{ kind: 'happy_path', given: 'g', when: 'w', then: 't', test_code: '' }],
          },
        ],
      },
    ],
  });
  assert.match(md, /\(TODO — 아직 채워지지 않음\)/);
});
