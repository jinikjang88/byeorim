// buildArchitectureReviewPromptMarkdown 단위 테스트. ADR 0033의 외부 AI 검토 프롬프트.
// shape-prompt.js의 합성 함수가 모든 자리(7항목, 카탈로그, 선택, 4개 결정, 옵션 표, 추천 두 시점)를
// 마크다운에 잘 담는지 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildArchitectureReviewPromptMarkdown } from '../../packages/cli/index.js';

const FIXED_CHOICES = {
  language: 'node',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

// shape.js의 ARCHITECTURE_CHOICES와 같은 결의 fixture. 12개 표준 옵션.
const CHOICES_TABLE = {
  language: [
    { value: 'node', name: 'Node.js (JavaScript/TypeScript)' },
    { value: 'java', name: 'Java (Spring Boot)' },
    { value: 'python', name: 'Python (FastAPI/Django)' },
  ],
  database: [
    { value: 'postgresql', name: 'PostgreSQL (관계형, 가장 보편)' },
    { value: 'mysql', name: 'MySQL (관계형, 호스팅 풍부)' },
    { value: 'sqlite', name: 'SQLite (파일 기반, 작은 규모)' },
    { value: 'mongodb', name: 'MongoDB (문서형, 유연한 스키마)' },
  ],
  api_style: [
    { value: 'rest', name: 'REST (HTTP 자원 중심)' },
    { value: 'graphql', name: 'GraphQL (쿼리 중심)' },
    { value: 'rpc', name: 'RPC (메서드 호출 중심)' },
  ],
  architecture_pattern: [
    { value: 'monolith', name: '한 덩어리(Monolith) 가장 단순' },
    { value: 'modular-monolith', name: '모듈형 한 덩어리(Modular Monolith) 균형' },
    { value: 'microservices', name: '마이크로서비스(Microservices) 분산' },
  ],
};

test('헤더와 푸터에 외부 AI 안내와 마커가 들어간다', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: { recommended: {}, reasons: {} },
  });
  assert.match(md, /# 아키텍처 검토 프롬프트/);
  assert.match(md, /외부 AI/);
  // 마커: ─ 막대(붙여넣기 자리 안내)
  const markerCount = (md.match(/──────────────────────────────────────────/g) || []).length;
  assert.equal(markerCount, 2, '시작/끝 마커 두 자리');
});

test('시스템 텍스트가 검토 항목 셋과 단축어 풀어쓰기 가이드를 가진다', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: { recommended: {}, reasons: {} },
  });
  // 비개발자 톤
  assert.match(md, /비기술 창업자/);
  assert.match(md, /일상 한국어/);
  // 단축어 풀어쓰기(PG, DTO, API 등)
  assert.match(md, /PG는 "결제대행사"/);
  assert.match(md, /DTO는 "데이터 모양"/);
  assert.match(md, /API는 "프로그램 사이의 약속"/);
  // 검토 셋(ADR 0033 결정 3)
  assert.match(md, /1. 도메인 적합성/);
  assert.match(md, /2. 결정 사이 트레이드오프/);
  assert.match(md, /3. 시작 무게/);
});

test('7항목 답변이 모두 노출된다(빈 자리는 (비어있음) 표시)', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: { what: '쇼핑몰', who: '단골', when: '평일 점심' },
    catalog: { blocks: [] },
    selectedBlocks: {},
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: { recommended: {}, reasons: {} },
  });
  assert.match(md, /## 사용자 7항목 답변/);
  assert.match(md, /- what: 쇼핑몰/);
  assert.match(md, /- who: 단골/);
  assert.match(md, /- when: 평일 점심/);
  // 비어있는 자리(where, why, how_use, how_manage)
  assert.match(md, /- where: \(비어있음\)/);
  assert.match(md, /- why: \(비어있음\)/);
  assert.match(md, /- how_use: \(비어있음\)/);
  assert.match(md, /- how_manage: \(비어있음\)/);
});

test('카탈로그 전체 blocks가 풀어쓰여 들어간다(ADR 0033 결정 2)', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: {},
    catalog: {
      blocks: [
        { id: 'b1', name: '블럭1', user_desc: '첫 자리', priority: 'required' },
        { id: 'b2', name: '블럭2', user_desc: '두 번째 자리' },
      ],
    },
    selectedBlocks: {},
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: { recommended: {}, reasons: {} },
  });
  assert.match(md, /## 카탈로그 전체 블럭/);
  assert.match(md, /총 2개 블럭/);
  assert.match(md, /- b1 \[required\] \(블럭1\): 첫 자리/);
  assert.match(md, /- b2 \(블럭2\): 두 번째 자리/);
});

test('선택 블럭과 자동 추가 블럭이 두 자리로 갈려 노출된다', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: { selected: ['order'], auto_added: ['payment', 'refund'] },
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: { recommended: {}, reasons: {} },
  });
  assert.match(md, /## 사용자가 고른 블럭/);
  assert.match(md, /사용자가 직접 고른 블럭: 1개/);
  assert.match(md, /- order/);
  assert.match(md, /의존성으로 자동 추가된 블럭: 2개/);
  assert.match(md, /- payment/);
  assert.match(md, /- refund/);
});

test('4개 결정과 사용자 선택값이 한국어로 풀어쓰여 노출된다', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: { recommended: {}, reasons: {} },
  });
  assert.match(md, /## 4개 아키텍처 결정/);
  assert.match(md, /- 언어: node \(Node\.js/);
  assert.match(md, /- 저장소: postgresql \(PostgreSQL/);
  assert.match(md, /- API 형태: rest \(REST/);
  assert.match(md, /- 코드 구조: modular-monolith \(모듈형 한 덩어리/);
});

test('12개 표준 옵션 표가 4개 결정 각각 풀어쓰여 들어간다(ADR 0033 결정 2)', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: { recommended: {}, reasons: {} },
  });
  assert.match(md, /## 표준 옵션 표/);
  // 4개 결정 머리
  assert.match(md, /### 언어 \(language\)/);
  assert.match(md, /### 저장소 \(database\)/);
  assert.match(md, /### API 형태 \(api_style\)/);
  assert.match(md, /### 코드 구조 \(architecture_pattern\)/);
  // 모든 12개 옵션이 들어가는지
  assert.match(md, /- node: Node\.js/);
  assert.match(md, /- java: Java/);
  assert.match(md, /- python: Python/);
  assert.match(md, /- postgresql: PostgreSQL/);
  assert.match(md, /- mysql: MySQL/);
  assert.match(md, /- sqlite: SQLite/);
  assert.match(md, /- mongodb: MongoDB/);
  assert.match(md, /- rest: REST/);
  assert.match(md, /- graphql: GraphQL/);
  assert.match(md, /- rpc: RPC/);
  assert.match(md, /- monolith: 한 덩어리/);
  assert.match(md, /- modular-monolith: 모듈형 한 덩어리/);
  assert.match(md, /- microservices: 마이크로서비스/);
});

test('AI 추천이 두 시점({user, dev}) 모두 풀어쓰여 노출된다(ADR 0033 결정 4)', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: {
      recommended: { language: 'node', database: 'postgresql' },
      reasons: {
        language: { user: '쇼핑몰에 익숙한 자리예요', dev: 'Node + Express 보편' },
        database: { user: '관계형이 안전해 보여요', dev: 'PG ACID' },
      },
    },
  });
  assert.match(md, /## AI 추천/);
  assert.match(md, /- language: node/);
  assert.match(md, /일반 사용자 시점: 쇼핑몰에 익숙한 자리예요/);
  assert.match(md, /개발자 시점: Node \+ Express 보편/);
  assert.match(md, /- database: postgresql/);
  assert.match(md, /일반 사용자 시점: 관계형이 안전해 보여요/);
  assert.match(md, /개발자 시점: PG ACID/);
});

test('추천이 빈 객체이면 안내 한 줄로 graceful', () => {
  const md = buildArchitectureReviewPromptMarkdown({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
    choices: FIXED_CHOICES,
    choicesTable: CHOICES_TABLE,
    recommendation: { recommended: {}, reasons: {} },
  });
  assert.match(md, /이번 흐름은 추천이 비어있어요/);
});

test('인자가 비어있어도(undefined) 안전하게 마크다운을 만든다', () => {
  const md = buildArchitectureReviewPromptMarkdown({});
  assert.match(md, /# 아키텍처 검토 프롬프트/);
  assert.match(md, /총 0개 블럭/);
  assert.match(md, /사용자가 직접 고른 블럭: 0개/);
  assert.match(md, /이번 흐름은 추천이 비어있어요/);
});

test('형식 안내 뒤에 예시 응답이 한 덩이 박혀 외부 AI가 결을 따라가게 한다', () => {
  const md = buildArchitectureReviewPromptMarkdown({});
  assert.match(md, /예시 응답/);
  // 자유 형식 헤딩과 형식 섹션이 한 결로 들어있다
  assert.match(md, /## 도메인 적합성[\s\S]*## 제안된 변경 사항[\s\S]*kind: decision_modify/);
});
