// buildContractsReviewPromptMarkdown 단위 테스트. ADR 0035의 외부 AI 계약 검토 프롬프트.
// 모든 자리(7항목, 카탈로그, 선택, 아키텍처, contracts와 schema)가 마크다운에 잘 담기는지 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildContractsReviewPromptMarkdown } from '../../packages/cli/index.js';

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
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      response_schema: {
        type: 'object',
        properties: { id: { type: 'string' }, created_at: { type: 'string' } },
      },
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

const PG_INTERNAL = {
  block_id: 'pg-integration',
  name: 'PG 연동',
  api_style: 'internal',
  endpoints: [],
  internal: true,
};

test('헤더와 푸터에 외부 AI 안내와 마커가 들어간다', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
  });
  assert.match(md, /# 계약 검토 프롬프트/);
  assert.match(md, /외부 AI/);
  const markerCount = (md.match(/──────────────────────────────────────────/g) || []).length;
  assert.equal(markerCount, 2, '시작/끝 마커 두 자리');
});

test('시스템 텍스트가 검토 항목 셋과 단축어 풀어쓰기 가이드를 가진다', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
  });
  // 비개발자 톤
  assert.match(md, /비기술 창업자/);
  assert.match(md, /일상 한국어/);
  // 단축어 풀어쓰기(API, REST, schema, endpoint)
  assert.match(md, /API는 "프로그램 사이의 약속"/);
  assert.match(md, /REST는 "웹 표준 방식"/);
  assert.match(md, /endpoint는 "프로그램이 받는 자리"/);
  assert.match(md, /schema는 "데이터 모양"/);
  // 검토 셋(ADR 0035 결정 3)
  assert.match(md, /1\. endpoint 누락\/과다/);
  assert.match(md, /2\. schema 도메인 적합성/);
  assert.match(md, /3\. 시작 무게/);
});

test('7항목 답변이 모두 노출된다(빈 자리는 (비어있음))', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: { what: '쇼핑몰', who: '카페 사장님' },
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
  });
  assert.match(md, /- what: 쇼핑몰/);
  assert.match(md, /- who: 카페 사장님/);
  // 비어있는 자리는 (비어있음) 표시
  assert.match(md, /- when: \(비어있음\)/);
  assert.match(md, /- how_use: \(비어있음\)/);
});

test('카탈로그 전체 블럭이 priority/이름/설명과 함께 노출된다', () => {
  const md = buildContractsReviewPromptMarkdown({
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
  });
  assert.match(md, /총 2개 블럭/);
  assert.match(md, /- order \[core\] \(주문\): 고객의 주문/);
  assert.match(md, /- review \(리뷰\): 상품 리뷰/);
});

test('선택 블럭과 자동 추가가 따로 노출된다', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: { selected: ['refund'], auto_added: ['payment', 'cancel-return'] },
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
  });
  assert.match(md, /사용자가 직접 고른 블럭: 1개/);
  assert.match(md, /- refund/);
  assert.match(md, /의존성으로 자동 추가된 블럭: 2개/);
  assert.match(md, /- payment/);
  assert.match(md, /- cancel-return/);
});

test('비어있는 선택은 (없음)으로 표시된다', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: { selected: [], auto_added: [] },
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
  });
  assert.match(md, /사용자가 직접 고른 블럭: 0개/);
  assert.match(md, /- \(없음\)/);
});

test('4개 아키텍처 결정이 한국어 라벨로 노출된다', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
  });
  assert.match(md, /- 언어: node/);
  assert.match(md, /- 저장소: postgresql/);
  assert.match(md, /- API 형태: rest/);
  assert.match(md, /- 코드 구조: modular-monolith/);
});

test('contracts의 endpoint와 채워진 schema가 풀어쓰기로 노출된다(ADR 0035 결정 4)', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [ORDER_CONTRACT],
  });
  // 블럭 헤더
  assert.match(md, /### 주문 \(order, resource, endpoint 2개\)/);
  // endpoint 줄
  assert.match(md, /POST \/orders {2}\(create\)/);
  assert.match(md, /설명: 주문 생성/);
  // 채워진 schema(JSON Schema 객체가 YAML로 풀어쓰기)
  assert.match(md, /request_schema:/);
  assert.match(md, /type: object/);
  assert.match(md, /properties:/);
  assert.match(md, /name:/);
  // TODO 자리는 안내 한 줄
  assert.match(md, /\(TODO — 아직 채워지지 않음\)/);
});

test('internal 블럭은 "공개 API 없음" 헤더 한 줄로 노출된다', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [PG_INTERNAL],
  });
  assert.match(md, /### PG 연동 \(pg-integration, internal — 공개 API 없음\)/);
});

test('비어있는 contracts는 "(계약이 비어있어요)" 한 줄', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
  });
  assert.match(md, /\(계약이 비어있어요\)/);
});

test('응답 형식 안내 섹션과 4종 변경 형식이 들어있다(ADR 0039)', () => {
  const md = buildContractsReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    architecture: FIXED_ARCHITECTURE,
    contracts: [],
  });
  // 응답 형식 안내 섹션 헤더
  assert.match(md, /## 응답 형식 안내/);
  // 외부 AI에게 ## 제안된 변경 사항 섹션을 추가하라고 안내
  assert.match(md, /## 제안된 변경 사항/);
  // 4종 kind가 형식 예시에 등장
  assert.match(md, /kind: endpoint_add/);
  assert.match(md, /kind: endpoint_remove/);
  assert.match(md, /kind: schema_modify/);
  assert.match(md, /kind: description_modify/);
  // 코드 펜스가 ```yaml로 안내됨
  assert.match(md, /```yaml/);
});

test('형식 안내 뒤에 예시 응답이 한 덩이 박혀 외부 AI가 결을 따라가게 한다', () => {
  const md = buildContractsReviewPromptMarkdown({});
  assert.match(md, /예시 응답/);
  assert.match(md, /## 도메인 적합성[\s\S]*## 제안된 변경 사항[\s\S]*kind: endpoint_add/);
});
