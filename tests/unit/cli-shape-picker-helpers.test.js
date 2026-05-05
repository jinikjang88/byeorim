// shape-picker-helpers 단위 테스트. 순수 함수의 결을 본다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildOptionDescription,
  formatContextSummary,
  formatChoicesSummary,
} from '../../packages/cli/src/shape-picker-helpers.js';

// ── buildOptionDescription ──────────────────────────────────

test('buildOptionDescription: AI 추천 user reason이 있으면 그것을 우선한다', () => {
  const opt = { value: 'node', name: 'Node.js', tradeoff: '프론트와 통일' };
  const result = buildOptionDescription(opt, '쇼핑몰에 익숙한 자리예요');
  assert.equal(result, '쇼핑몰에 익숙한 자리예요');
});

test('buildOptionDescription: 추천 reason이 비면 옵션 tradeoff를 보여준다', () => {
  const opt = { value: 'node', name: 'Node.js', tradeoff: '프론트와 통일' };
  assert.equal(buildOptionDescription(opt, ''), '프론트와 통일');
  assert.equal(buildOptionDescription(opt, '   '), '프론트와 통일'); // 공백만이면 비어있음 처리
  assert.equal(buildOptionDescription(opt), '프론트와 통일');
});

test('buildOptionDescription: tradeoff도 reason도 없으면 빈 문자열', () => {
  assert.equal(buildOptionDescription({ value: 'x', name: 'X' }, ''), '');
  assert.equal(buildOptionDescription({ value: 'x', name: 'X' }), '');
  assert.equal(buildOptionDescription(null, ''), '');
  assert.equal(buildOptionDescription(undefined, undefined), '');
});

// ── formatContextSummary ────────────────────────────────────

test('formatContextSummary: 머리에 "지금까지 빚은 자리" 출력과 카운트 한 줄', () => {
  const result = formatContextSummary({
    selectedCount: 3,
    autoAddedCount: 2,
    affectedCount: 1,
    prerequisitesCount: 0,
    decisionsTotal: 0,
    decisionsAnswered: 0,
    decisionsPending: 0,
  });
  assert.match(result, /지금까지 빚은 자리/);
  assert.match(result, /블럭 3개 선택, 자동 추가 2개, 영향 1개/);
  // prerequisitesCount=0이면 그 줄은 안 나옴
  assert.equal(/외부 준비물/.test(result), false);
  // decisionsTotal=0이면 cascade 줄도 안 나옴
  assert.equal(/cascade 결정/.test(result), false);
  // 마지막 안내
  assert.match(result, /이제 4개 자리를 차례로 골라요/);
});

test('formatContextSummary: prerequisites와 cascade decisions가 있으면 함께 노출', () => {
  const result = formatContextSummary({
    selectedCount: 1,
    autoAddedCount: 0,
    affectedCount: 0,
    prerequisitesCount: 2,
    decisionsTotal: 3,
    decisionsAnswered: 1,
    decisionsPending: 2,
  });
  assert.match(result, /외부 준비물 2개/);
  assert.match(result, /cascade 결정 3개 중 1개 답함, 2개 남음/);
});

test('formatContextSummary: 빈 context도 안전하게 다룬다', () => {
  const result = formatContextSummary();
  assert.match(result, /지금까지 빚은 자리/);
  assert.match(result, /블럭 0개 선택, 자동 추가 0개, 영향 0개/);
});

// ── formatChoicesSummary ────────────────────────────────────

test('formatChoicesSummary: 4개 결정 모두 한국어 이름과 tradeoff 한 줄로 풀어쓴다', () => {
  const choicesTable = {
    language: [{ value: 'node', name: 'Node.js', tradeoff: '프론트와 통일' }],
    database: [{ value: 'postgresql', name: 'PostgreSQL', tradeoff: '안전한 기본값' }],
    api_style: [{ value: 'rest', name: 'REST', tradeoff: '가장 보편' }],
    architecture_pattern: [{ value: 'monolith', name: '한 덩어리', tradeoff: '가장 단순' }],
  };
  const result = formatChoicesSummary(
    {
      language: 'node',
      database: 'postgresql',
      api_style: 'rest',
      architecture_pattern: 'monolith',
    },
    choicesTable,
  );
  assert.match(result, /언어: Node\.js/);
  assert.match(result, /프론트와 통일/);
  assert.match(result, /저장소: PostgreSQL/);
  assert.match(result, /안전한 기본값/);
  assert.match(result, /API 형태: REST/);
  assert.match(result, /가장 보편/);
  assert.match(result, /코드 구조: 한 덩어리/);
  assert.match(result, /가장 단순/);
});

test('formatChoicesSummary: tradeoff가 비면 이름만 보여준다', () => {
  const choicesTable = {
    language: [{ value: 'node', name: 'Node.js' }], // tradeoff 없음
    database: [{ value: 'postgresql', name: 'PostgreSQL' }],
    api_style: [{ value: 'rest', name: 'REST' }],
    architecture_pattern: [{ value: 'monolith', name: 'Monolith' }],
  };
  const result = formatChoicesSummary(
    {
      language: 'node',
      database: 'postgresql',
      api_style: 'rest',
      architecture_pattern: 'monolith',
    },
    choicesTable,
  );
  assert.match(result, /언어: Node\.js/);
  // tradeoff 없으면 이름 다음 줄에 들여쓰기 빈 자리 없음
  const lines = result.split('\n');
  const langLineIndex = lines.findIndex((l) => l.includes('언어:'));
  assert.equal(lines[langLineIndex + 1].includes('저장소:'), true);
});

test('formatChoicesSummary: choicesTable에 없는 값이면 영문 식별자 그대로 보여준다(graceful)', () => {
  const result = formatChoicesSummary(
    { language: 'kotlin' },
    { language: [{ value: 'node', name: 'Node.js' }] },
  );
  assert.match(result, /언어: kotlin/);
});

test('formatChoicesSummary: 인자가 비어있어도 안전하게 4개 자리를 (비어있음)으로 보여준다', () => {
  const result = formatChoicesSummary();
  assert.match(result, /언어: \(비어있음\)/);
  assert.match(result, /저장소: \(비어있음\)/);
  assert.match(result, /API 형태: \(비어있음\)/);
  assert.match(result, /코드 구조: \(비어있음\)/);
});
