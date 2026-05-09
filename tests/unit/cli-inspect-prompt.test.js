// inspect-prompt.js 단위 테스트. ADR 0051 외부 검수 부산물의 형식과 결을 검증한다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildInspectReviewPromptMarkdown } from '../../packages/cli/index.js';

const SAMPLE_INPUT = {
  language: 'node',
  files: {
    'src/server.js': 'import Fastify from "fastify";\nconst app = Fastify();',
    'src/features/order/routes.js': '// order routes',
  },
  intent: { extracted: { what: '쇼핑몰', who: '카페 사장님' } },
  architecture: { language: 'node', database: 'postgresql', api_style: 'rest' },
  contracts: {
    architecture_api_style: 'rest',
    contracts: [
      {
        block_id: 'order',
        name: '주문',
        api_style: 'resource',
        endpoints: [{ operation: 'create', method: 'POST', path: '/orders' }],
      },
    ],
  },
  scenarios: {
    scenarios: [
      {
        block_id: 'order',
        name: '주문',
        endpoints: [
          {
            operation: 'create',
            scenarios: [{ kind: 'happy_path' }],
          },
        ],
      },
    ],
  },
};

test('헤더와 푸터(──── 마커)가 박힌다', () => {
  const md = buildInspectReviewPromptMarkdown(SAMPLE_INPUT);
  assert.match(md, /# 검수 자리 프롬프트/);
  assert.match(md, /──────────────────────────────────────────/);
});

test('SYSTEM_TEXT가 6영역과 severity 셋을 한국어로 안내', () => {
  const md = buildInspectReviewPromptMarkdown(SAMPLE_INPUT);
  for (const area of ['보안', '성능', '운영', '확장성', '법적 리스크', '시장 재검']) {
    assert.match(md, new RegExp(area));
  }
  for (const sev of ['pass', 'warning', 'concern']) {
    assert.match(md, new RegExp(sev));
  }
});

test('files 섹션에 파일 본문이 코드 펜스로 박힌다', () => {
  const md = buildInspectReviewPromptMarkdown(SAMPLE_INPUT);
  assert.match(md, /### src\/server\.js/);
  assert.match(md, /import Fastify/);
  assert.match(md, /### src\/features\/order\/routes\.js/);
  assert.match(md, /\/\/ order routes/);
});

test('intent.extracted가 yaml 블록으로 박힌다', () => {
  const md = buildInspectReviewPromptMarkdown(SAMPLE_INPUT);
  assert.match(md, /사용자 답변/);
  assert.match(md, /쇼핑몰/);
  assert.match(md, /카페 사장님/);
});

test('contracts 요약과 scenarios 요약이 박힌다', () => {
  const md = buildInspectReviewPromptMarkdown(SAMPLE_INPUT);
  assert.match(md, /API 계약 요약/);
  assert.match(md, /order/);
  assert.match(md, /테스트 시나리오 요약/);
  assert.match(md, /happy_path|scenario_count/);
});

test('응답 형식 안내 섹션이 박힌다(## 검수 결과 마커)', () => {
  const md = buildInspectReviewPromptMarkdown(SAMPLE_INPUT);
  assert.match(md, /## 응답 형식 안내/);
  assert.match(md, /## 검수 결과/);
  assert.match(md, /findings:/);
  assert.match(md, /pass \| warning \| concern/);
});

test('language 미정/files 비어있음에도 안전하게 박힌다', () => {
  const md = buildInspectReviewPromptMarkdown({
    language: null,
    files: {},
    intent: {},
    architecture: {},
    contracts: {},
    scenarios: {},
  });
  assert.match(md, /_\(미정\)_/);
  assert.match(md, /_\(파일이 없습니다\)_/);
});

test('인자 없이 호출해도 throw하지 않고 안전한 결로 박힌다', () => {
  const md = buildInspectReviewPromptMarkdown();
  assert.match(md, /# 검수 자리 프롬프트/);
});

test('형식 안내 뒤에 예시 응답이 한 덩이 박혀 외부 AI가 결을 따라가게 한다', () => {
  const md = buildInspectReviewPromptMarkdown(SAMPLE_INPUT);
  assert.match(md, /예시 응답/);
  // 자유 형식 섹션과 검수 결과가 한 결로 들어있다
  assert.match(md, /## 보안[\s\S]*## 검수 결과[\s\S]*findings:/);
});
