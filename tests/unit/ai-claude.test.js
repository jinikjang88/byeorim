// Claude AI 어댑터 단위 테스트. ADR 0024 + ADR 0026의 약속을 지키는지 본다.
// LLM 호출 없이 결정적으로 돌도록 client 의존성 주입(ADR 0024 결정 7)을 활용한다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AuthenticationError, RateLimitError, APIConnectionError } from '@anthropic-ai/sdk';
import { createClaudeAdapter } from '../../packages/ai/index.js';

// 가짜 SDK client. messages.parse만 약속한다.
// captured 배열로 호출 인자를 잡아 어댑터의 프롬프트 조립을 검증.
function makeFakeClient(handler) {
  const captured = [];
  return {
    captured,
    messages: {
      async parse(request) {
        captured.push(request);
        return handler(request, captured.length - 1);
      },
    },
  };
}

const EMPTY_INTENT = {
  what: '',
  who: '',
  when: '',
  where: '',
  why: '',
  how_use: '',
  how_manage: '',
  suggested_template: null,
};

function intentResponse(parsed) {
  return { parsed_output: { ...EMPTY_INTENT, ...parsed }, content: [] };
}

function schemaResponse(parsed) {
  return { parsed_output: parsed, content: [] };
}

test('claude 어댑터는 name이 claude이고 여섯 메서드를 가진다', () => {
  const client = makeFakeClient(() => intentResponse({}));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  assert.equal(adapter.name, 'claude');
  assert.equal(typeof adapter.extractIntent, 'function');
  assert.equal(typeof adapter.extractSchema, 'function');
  assert.equal(typeof adapter.generateCatalog, 'function');
  assert.equal(typeof adapter.generateRealityCheck, 'function');
  assert.equal(typeof adapter.recommendBlocks, 'function');
  assert.equal(typeof adapter.recommendArchitecture, 'function');
});

test('extractIntent: parsed_output 7항목을 그대로 결과 모양으로 반환한다', async () => {
  // Given: 7항목 + suggested_template를 채운 응답
  const client = makeFakeClient(() =>
    intentResponse({
      what: '쇼핑몰',
      who: '카페 사장님',
      when: '평일 점심',
      where: '매장 카운터',
      why: '추가 매출',
      how_use: 'QR 주문',
      how_manage: '관리자 화면',
      suggested_template: 'commerce',
    }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  const intent = await adapter.extractIntent({ what: '쇼핑몰' });
  // Then: 모양이 보존된다
  assert.deepEqual(intent, {
    what: '쇼핑몰',
    who: '카페 사장님',
    when: '평일 점심',
    where: '매장 카운터',
    why: '추가 매출',
    how_use: 'QR 주문',
    how_manage: '관리자 화면',
    suggested_template: 'commerce',
  });
});

test('extractIntent: parsed_output의 누락 필드는 안전한 기본값으로 채워진다', async () => {
  // Given: what만 채워진 응답(나머지 필드 누락)
  const client = makeFakeClient(() => ({ parsed_output: { what: '쇼핑몰' }, content: [] }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  const intent = await adapter.extractIntent({ what: '쇼핑몰' });
  // Then: 빈 문자열과 null로 채워진다
  assert.equal(intent.what, '쇼핑몰');
  assert.equal(intent.who, '');
  assert.equal(intent.when, '');
  assert.equal(intent.where, '');
  assert.equal(intent.why, '');
  assert.equal(intent.how_use, '');
  assert.equal(intent.how_manage, '');
  assert.equal(intent.suggested_template, null);
});

test('extractIntent: 요청에 system, structured output, adaptive thinking이 박혀있다', async () => {
  // Given
  const client = makeFakeClient(() => intentResponse({}));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  await adapter.extractIntent({ what: '쇼핑몰' });
  // Then: 첫 호출의 인자를 본다
  const req = client.captured[0];
  assert.equal(req.model, 'claude-opus-4-7'); // ADR 0024 결정 4
  assert.deepEqual(req.thinking, { type: 'adaptive' }); // adaptive thinking
  assert.equal(req.output_config.format.type, 'json_schema'); // ADR 0024 결정 5
  // 8필드 schema가 박혀있다(ADR 0026)
  assert.ok(req.output_config.format.schema);
  assert.deepEqual(
    req.output_config.format.schema.required.sort(),
    ['how_manage', 'how_use', 'suggested_template', 'what', 'when', 'where', 'who', 'why'].sort(),
  );
  // system은 cache_control breakpoint가 박힌 배열
  assert.ok(Array.isArray(req.system));
  assert.equal(req.system[0].type, 'text');
  assert.deepEqual(req.system[0].cache_control, { type: 'ephemeral' });
  // user 메시지는 7항목 답변을 JSON으로 넣은 것
  assert.equal(req.messages[0].role, 'user');
  const parsedUser = JSON.parse(req.messages[0].content);
  assert.equal(parsedUser.what, '쇼핑몰');
  assert.equal(parsedUser.who, '');
});

test('extractSchema: parsed_output의 request/response를 그대로 반환한다', async () => {
  // Given: extractSchema 응답
  const fakeSchema = {
    type: 'object',
    properties: { item_id: { type: 'string' }, quantity: { type: 'integer' } },
    required: ['item_id', 'quantity'],
  };
  const client = makeFakeClient(() =>
    schemaResponse({
      request: fakeSchema,
      response: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  const result = await adapter.extractSchema({
    block: { id: 'order', name: '주문' },
    operation: 'create',
  });
  // Then
  assert.deepEqual(result.request, fakeSchema);
  assert.equal(result.response.type, 'object');
  assert.deepEqual(result.response.required, ['id']);
});

test('extractSchema: request/response가 null인 경우 그대로 null을 보존한다', async () => {
  const client = makeFakeClient(() => schemaResponse({ request: null, response: null }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const result = await adapter.extractSchema({ block: { id: 'x' }, operation: 'delete' });
  assert.equal(result.request, null);
  assert.equal(result.response, null);
});

test('extractSchema: user 메시지에 block과 operation이 JSON으로 들어간다', async () => {
  const client = makeFakeClient(() => schemaResponse({ request: null, response: null }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.extractSchema({
    block: { id: 'order', name: '주문', tech_desc: '주문 처리' },
    operation: 'create',
  });
  const req = client.captured[0];
  const userText = req.messages[0].content;
  const parsed = JSON.parse(userText);
  assert.equal(parsed.block.id, 'order');
  assert.equal(parsed.block.name, '주문');
  assert.equal(parsed.block.tech_desc, '주문 처리');
  assert.equal(parsed.operation, 'create');
});

test('extractIntent: parsed_output이 없으면 첫 텍스트 블럭의 JSON으로 백업 파싱', async () => {
  // Given: parsed_output 없이 content만 채워진 응답
  const client = makeFakeClient(() => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          what: '쇼핑몰',
          who: '',
          when: '',
          where: '',
          why: '',
          how_use: '',
          how_manage: '',
          suggested_template: 'commerce',
        }),
      },
    ],
  }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const intent = await adapter.extractIntent({ what: '쇼핑몰' });
  assert.equal(intent.what, '쇼핑몰');
  assert.equal(intent.suggested_template, 'commerce');
});

test('extractIntent: 응답이 비어있으면 한국어 에러를 던진다', async () => {
  const client = makeFakeClient(() => ({}));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await assert.rejects(
    () => adapter.extractIntent({ what: 'x' }),
    /구조화된 출력을 찾지 못했습니다/,
  );
});

// SDK APIError 계열은 Headers-like 객체를 요구한다(get 메서드).
const fakeHeaders = new Headers();

test('SDK AuthenticationError를 한국어 메시지로 변환한다', async () => {
  const client = {
    messages: {
      async parse() {
        throw new AuthenticationError(
          401,
          { error: { message: 'invalid' } },
          'unauth',
          fakeHeaders,
        );
      },
    },
  };
  const adapter = createClaudeAdapter({ apiKey: 'sk-bad', client });
  await assert.rejects(
    () => adapter.extractIntent({ what: 'x' }),
    (err) => {
      assert.match(err.message, /Anthropic API 키가 잘못되었거나 만료되었습니다/);
      assert.ok(err.cause instanceof AuthenticationError, 'cause에 원본 에러가 있다');
      return true;
    },
  );
});

test('SDK RateLimitError를 한국어 메시지로 변환한다', async () => {
  const client = {
    messages: {
      async parse() {
        throw new RateLimitError(429, { error: { message: 'too many' } }, 'rate', fakeHeaders);
      },
    },
  };
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await assert.rejects(() => adapter.extractIntent({ what: 'x' }), /호출 제한에 걸렸습니다/);
});

test('SDK APIConnectionError를 한국어 메시지로 변환한다', async () => {
  const client = {
    messages: {
      async parse() {
        throw new APIConnectionError({ message: 'network down' });
      },
    },
  };
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await assert.rejects(() => adapter.extractIntent({ what: 'x' }), /연결하지 못했습니다/);
});

test('알 수 없는 에러는 일반 한국어 메시지에 원본을 포함해 변환한다', async () => {
  const client = {
    messages: {
      async parse() {
        throw new Error('something weird');
      },
    },
  };
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await assert.rejects(
    () => adapter.extractIntent({ what: 'x' }),
    /Anthropic API 호출에 실패했습니다: something weird/,
  );
});

test('BEOREUM_AI_MODEL 환경 변수가 model보다 우선시된다', async () => {
  const original = process.env.BEOREUM_AI_MODEL;
  process.env.BEOREUM_AI_MODEL = 'claude-haiku-4-5';
  try {
    const client = makeFakeClient(() => intentResponse({}));
    const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
    await adapter.extractIntent({ what: 'x' });
    assert.equal(client.captured[0].model, 'claude-haiku-4-5');
  } finally {
    if (original === undefined) delete process.env.BEOREUM_AI_MODEL;
    else process.env.BEOREUM_AI_MODEL = original;
  }
});

test('명시적 model 인자는 환경 변수가 없을 때 사용된다', async () => {
  const original = process.env.BEOREUM_AI_MODEL;
  delete process.env.BEOREUM_AI_MODEL;
  try {
    const client = makeFakeClient(() => intentResponse({}));
    const adapter = createClaudeAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-6', client });
    await adapter.extractIntent({ what: 'x' });
    assert.equal(client.captured[0].model, 'claude-sonnet-4-6');
  } finally {
    if (original !== undefined) process.env.BEOREUM_AI_MODEL = original;
  }
});

test('baseURL 인자는 client가 명시 주입되면 무시된다 (ADR 0025, ADR 0024 결정 7)', async () => {
  const client = makeFakeClient(() => intentResponse({}));
  const adapter = createClaudeAdapter({
    apiKey: 'sk-test',
    baseURL: 'http://localhost:3000',
    client,
  });
  await adapter.extractIntent({ what: 'x' });
  assert.equal(client.captured.length, 1);
});

// ── generateCatalog (ADR 0027) ─────────────────────────────────

function catalogResponse(parsed) {
  return { parsed_output: parsed, content: [] };
}

test('generateCatalog: parsed_output을 그대로 결과로 돌려준다', async () => {
  // Given: 카탈로그 응답
  const fakeCatalog = {
    name: '동네 빵집 단골 주문 앱',
    domain: 'bakery-app',
    worlds: [{ id: 'w-customer', title: '손님 세계' }],
    blocks: [{ id: 'b-order', name: '주문', user_desc: '손님이 주문' }],
  };
  const client = makeFakeClient(() => catalogResponse(fakeCatalog));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  const result = await adapter.generateCatalog({
    answers: { what: '동네 빵집 단골 주문 앱' },
    seedTemplate: 'commerce',
  });
  // Then
  assert.deepEqual(result, fakeCatalog);
});

test('generateCatalog: user 메시지에 answers와 seedTemplate이 JSON으로 들어간다', async () => {
  const client = makeFakeClient(() =>
    catalogResponse({ worlds: [{ id: 'w-x', title: 'X' }], blocks: [] }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.generateCatalog({
    answers: { what: '쇼핑몰', who: '단골' },
    seedTemplate: 'commerce',
  });
  const req = client.captured[0];
  const parsed = JSON.parse(req.messages[0].content);
  assert.equal(parsed.answers.what, '쇼핑몰');
  assert.equal(parsed.answers.who, '단골');
  assert.equal(parsed.seedTemplate, 'commerce');
});

test('generateCatalog: max_tokens가 카탈로그용 8192로 늘어난다', async () => {
  const client = makeFakeClient(() =>
    catalogResponse({ worlds: [{ id: 'w-x', title: 'X' }], blocks: [] }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.generateCatalog({ answers: { what: '쇼핑몰' } });
  assert.equal(client.captured[0].max_tokens, 8192);
});

test('generateCatalog: extractIntent의 max_tokens 1024와는 다르다(평면 응답이 아니라 길다)', async () => {
  const client = makeFakeClient((req) => {
    if (req.system[0].text.includes('의도를 정리하는')) {
      return intentResponse({ what: '쇼핑몰', suggested_template: 'commerce' });
    }
    return catalogResponse({ worlds: [{ id: 'w-x', title: 'X' }], blocks: [] });
  });
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.extractIntent({ what: '쇼핑몰' });
  await adapter.generateCatalog({ answers: { what: '쇼핑몰' } });
  assert.equal(client.captured[0].max_tokens, 1024); // intent
  assert.equal(client.captured[1].max_tokens, 8192); // catalog
});

test('generateCatalog: seedTemplate이 null이면 그대로 null로 전달된다', async () => {
  const client = makeFakeClient(() =>
    catalogResponse({ worlds: [{ id: 'w-x', title: 'X' }], blocks: [] }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.generateCatalog({ answers: { what: '우주여행' }, seedTemplate: null });
  const parsed = JSON.parse(client.captured[0].messages[0].content);
  assert.equal(parsed.seedTemplate, null);
});

// ── generateRealityCheck (ADR 0003 + docs/specs/reality-check.md) ─────────────────

function realityCheckResponse(parsed) {
  return { parsed_output: parsed, content: [] };
}

const RC_EMPTY = {
  areas: {
    market_saturation: { observation: '', questions: ['q1', 'q2'] },
    entry_cost: { observation: '', questions: ['q1', 'q2'] },
    two_sided_market: { observation: '', questions: ['q1', 'q2'] },
    legal_risk: { observation: '', questions: ['q1', 'q2'] },
    revenue_model: { observation: '', questions: ['q1', 'q2'] },
    graveyard: { observation: '', questions: ['q1', 'q2'] },
  },
  legal_warnings: [],
};

test('generateRealityCheck: parsed_output을 그대로 결과로 돌려준다', async () => {
  const fakeReport = {
    areas: {
      market_saturation: {
        observation: '비슷한 자리가 한두 곳 보인다',
        questions: ['경쟁자가 누구인가요'],
      },
      entry_cost: { observation: '', questions: ['초기 자금이 얼마인가요'] },
      two_sided_market: { observation: '', questions: ['양쪽이 필요한가요'] },
      legal_risk: { observation: '', questions: ['인허가가 필요한가요'] },
      revenue_model: { observation: '', questions: ['누가 돈을 내나요'] },
      graveyard: { observation: '', questions: ['닫은 서비스가 떠오르나요'] },
    },
    legal_warnings: [{ item: '개인정보 처리', reason: '미성년자 데이터 가능성' }],
  };
  const client = makeFakeClient(() => realityCheckResponse(fakeReport));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const result = await adapter.generateRealityCheck({
    answers: { what: '동네 빵집 단골 주문 앱' },
    catalog: { worlds: [{ id: 'w-x', title: 'X' }], blocks: [] },
  });
  assert.deepEqual(result, fakeReport);
});

test('generateRealityCheck: user 메시지에 answers와 catalog가 JSON으로 들어간다', async () => {
  const client = makeFakeClient(() => realityCheckResponse(RC_EMPTY));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.generateRealityCheck({
    answers: { what: '쇼핑몰', who: '단골' },
    catalog: { worlds: [{ id: 'w-c', title: 'C' }], blocks: [] },
  });
  const parsed = JSON.parse(client.captured[0].messages[0].content);
  assert.equal(parsed.answers.what, '쇼핑몰');
  assert.equal(parsed.answers.who, '단골');
  assert.equal(parsed.catalog.worlds[0].id, 'w-c');
});

test('generateRealityCheck: max_tokens가 4096이고 system은 RC 프롬프트(6영역 ID 포함)', async () => {
  const client = makeFakeClient(() => realityCheckResponse(RC_EMPTY));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.generateRealityCheck({ answers: { what: '쇼핑몰' }, catalog: {} });
  const req = client.captured[0];
  assert.equal(req.max_tokens, 4096);
  // ADR 0003의 6영역 ID가 system 프롬프트에 박혀있어야 한다
  assert.match(req.system[0].text, /market_saturation/);
  assert.match(req.system[0].text, /legal_warnings/);
});

test('generateRealityCheck: structured output schema가 6영역과 legal_warnings를 required로 가진다', async () => {
  const client = makeFakeClient(() => realityCheckResponse(RC_EMPTY));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.generateRealityCheck({ answers: {}, catalog: {} });
  const schema = client.captured[0].output_config.format.schema;
  assert.deepEqual(schema.required.sort(), ['areas', 'legal_warnings'].sort());
  assert.deepEqual(
    schema.properties.areas.required.sort(),
    [
      'entry_cost',
      'graveyard',
      'legal_risk',
      'market_saturation',
      'revenue_model',
      'two_sided_market',
    ].sort(),
  );
});

// ── recommendBlocks (ADR 0029 + docs/specs/block-recommendation.md) ─────────

function recommendResponse(parsed) {
  return { parsed_output: parsed, content: [] };
}

test('recommendBlocks: parsed_output을 받아 catalog에 있는 ID만 통과시킨다(안전망)', async () => {
  // Given: AI가 catalog에 있는 b1과 없는 ghost를 함께 추천. reasons는 ADR 0030의 두 시점 객체.
  const client = makeFakeClient(() =>
    recommendResponse({
      recommended: ['b1', 'ghost', 'b2'],
      reasons: {
        b1: { user: '일상어 r1', dev: 'tech r1' },
        ghost: { user: '버려질 자리', dev: 'discarded' },
        b2: { user: '일상어 r2', dev: 'tech r2' },
      },
    }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const result = await adapter.recommendBlocks({
    answers: { what: 'x' },
    catalog: {
      blocks: [
        { id: 'b1', name: 'B1' },
        { id: 'b2', name: 'B2' },
      ],
    },
  });
  // Then: ghost는 걸러지고 b1, b2만 남는다. reasons는 두 시점 객체.
  assert.deepEqual(result.recommended, ['b1', 'b2']);
  assert.deepEqual(result.reasons.b1, { user: '일상어 r1', dev: 'tech r1' });
  assert.deepEqual(result.reasons.b2, { user: '일상어 r2', dev: 'tech r2' });
  assert.equal(result.reasons.ghost, undefined);
});

test('recommendBlocks: 옛 string 형식 reasons는 user 시점으로 폴백된다(미래 호환)', async () => {
  const client = makeFakeClient(() =>
    recommendResponse({
      recommended: ['b1'],
      reasons: { b1: '단순 한 줄 이유' },
    }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const result = await adapter.recommendBlocks({
    answers: {},
    catalog: { blocks: [{ id: 'b1', name: 'B1' }] },
  });
  assert.deepEqual(result.reasons.b1, { user: '단순 한 줄 이유', dev: '' });
});

test('recommendBlocks: system 프롬프트에 단축어 풀어쓰기 가이드(PG → 결제대행사)가 박혀있다(ADR 0030)', async () => {
  const client = makeFakeClient(() => recommendResponse({ recommended: [], reasons: {} }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.recommendBlocks({ answers: {}, catalog: { blocks: [] } });
  const text = client.captured[0].system[0].text;
  assert.match(text, /PG → "결제대행사"/);
  assert.match(text, /reasons\[블럭ID\]\.user/);
  assert.match(text, /reasons\[블럭ID\]\.dev/);
});

test('recommendBlocks: max_tokens가 2048이고 system 프롬프트가 추천 결을 가진다', async () => {
  const client = makeFakeClient(() => recommendResponse({ recommended: [], reasons: {} }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.recommendBlocks({ answers: {}, catalog: { blocks: [] } });
  const req = client.captured[0];
  assert.equal(req.max_tokens, 2048);
  assert.match(req.system[0].text, /추천/);
  assert.match(req.system[0].text, /priority='required'/);
});

test('recommendBlocks: user 메시지에 answers와 compact catalog(blocks만)가 들어간다', async () => {
  const client = makeFakeClient(() => recommendResponse({ recommended: [], reasons: {} }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.recommendBlocks({
    answers: { what: '쇼핑몰', who: '단골' },
    catalog: {
      worlds: [{ id: 'w-x', title: 'X', description: 'unused' }],
      blocks: [{ id: 'b1', name: 'B1', user_desc: 'd1', priority: 'required' }],
      cascades: [{ trigger: 'b1', ask_questions: [] }], // 추천에 안 씀
    },
  });
  const parsed = JSON.parse(client.captured[0].messages[0].content);
  assert.equal(parsed.answers.what, '쇼핑몰');
  assert.equal(parsed.catalog.blocks[0].id, 'b1');
  assert.equal(parsed.catalog.blocks[0].priority, 'required');
  // worlds나 cascades는 추천 호출에 안 보낸다(토큰 절약)
  assert.equal(parsed.catalog.worlds, undefined);
  assert.equal(parsed.catalog.cascades, undefined);
});

test('recommendBlocks: structured output schema가 recommended/reasons를 required로 가진다', async () => {
  const client = makeFakeClient(() => recommendResponse({ recommended: [], reasons: {} }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.recommendBlocks({ answers: {}, catalog: { blocks: [] } });
  const schema = client.captured[0].output_config.format.schema;
  assert.deepEqual(schema.required.sort(), ['reasons', 'recommended'].sort());
  assert.equal(schema.additionalProperties, false);
});

test('recommendBlocks: parsed_output이 recommended를 안 줘도 빈 배열로 안전하게 폴백', async () => {
  const client = makeFakeClient(() => recommendResponse({})); // 빈 객체
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const result = await adapter.recommendBlocks({
    answers: {},
    catalog: { blocks: [{ id: 'b1', name: 'B1' }] },
  });
  assert.deepEqual(result, { recommended: [], reasons: {} });
});

// ── recommendArchitecture (ADR 0032 + docs/specs/architecture-recommendation.md) ─────────

function archResponse(parsed) {
  return { parsed_output: parsed, content: [] };
}

test('recommendArchitecture: parsed_output을 받아 표준 식별자만 통과시킨다(안전망)', async () => {
  // Given: AI가 비표준 값(kotlin, redis)과 표준 값을 함께 돌려준다
  const client = makeFakeClient(() =>
    archResponse({
      recommended: {
        language: 'kotlin', // 비표준
        database: 'postgresql', // 표준
        api_style: 'rest', // 표준
        architecture_pattern: 'serverless', // 비표준
      },
      reasons: {
        language: { user: '버려질', dev: 'discarded' },
        database: { user: '관계형', dev: 'pg' },
        api_style: { user: '웹 표준', dev: 'rest' },
        architecture_pattern: { user: '버려질', dev: 'discarded' },
      },
    }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const result = await adapter.recommendArchitecture({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
  });
  // Then: 비표준은 비워지고 표준만 남는다. reasons도 비표준 키는 비워진다.
  assert.equal(result.recommended.language, undefined);
  assert.equal(result.recommended.database, 'postgresql');
  assert.equal(result.recommended.api_style, 'rest');
  assert.equal(result.recommended.architecture_pattern, undefined);
  assert.equal(result.reasons.language, undefined);
  assert.deepEqual(result.reasons.database, { user: '관계형', dev: 'pg' });
  assert.equal(result.reasons.architecture_pattern, undefined);
});

test('recommendArchitecture: 옛 string 형식 reasons는 user 시점으로 폴백된다(미래 호환)', async () => {
  const client = makeFakeClient(() =>
    archResponse({
      recommended: { language: 'node' },
      reasons: { language: '단순 한 줄 이유' },
    }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const result = await adapter.recommendArchitecture({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
  });
  assert.deepEqual(result.reasons.language, { user: '단순 한 줄 이유', dev: '' });
});

test('recommendArchitecture: system 프롬프트에 단축어 풀어쓰기 가이드와 표준 옵션 표가 박혀있다', async () => {
  const client = makeFakeClient(() => archResponse({ recommended: {}, reasons: {} }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.recommendArchitecture({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
  });
  const text = client.captured[0].system[0].text;
  // ADR 0030의 단축어 풀어쓰기(PG → 결제대행사)
  assert.match(text, /PG → "결제대행사"/);
  // ADR 0012 결정 1의 4개 키와 옵션
  assert.match(text, /language: node \| java \| python/);
  assert.match(text, /database: postgresql \| mysql \| sqlite \| mongodb/);
  assert.match(text, /api_style: rest \| graphql \| rpc/);
  assert.match(text, /architecture_pattern: monolith \| modular-monolith \| microservices/);
  // 두 시점 reasons 가이드
  assert.match(text, /reasons\[결정키\]\.user/);
  assert.match(text, /reasons\[결정키\]\.dev/);
});

test('recommendArchitecture: max_tokens가 2048이고 schema가 recommended/reasons를 required로 가진다', async () => {
  const client = makeFakeClient(() => archResponse({ recommended: {}, reasons: {} }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.recommendArchitecture({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
  });
  const req = client.captured[0];
  assert.equal(req.max_tokens, 2048);
  const schema = req.output_config.format.schema;
  assert.deepEqual(schema.required.sort(), ['reasons', 'recommended'].sort());
  assert.equal(schema.additionalProperties, false);
});

test('recommendArchitecture: user 메시지에 answers, compact catalog, selectedBlocks가 들어간다', async () => {
  const client = makeFakeClient(() => archResponse({ recommended: {}, reasons: {} }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  await adapter.recommendArchitecture({
    answers: { what: '쇼핑몰', who: '단골' },
    catalog: {
      worlds: [{ id: 'w-x', title: 'X' }],
      blocks: [{ id: 'b1', name: 'B1', user_desc: 'd1', priority: 'required' }],
      cascades: [{ trigger: 'b1' }], // 추천에 안 씀
    },
    selectedBlocks: {
      selected: ['b1'],
      auto_added: ['b2'],
      affected: [],
      prerequisites: [],
    },
  });
  const parsed = JSON.parse(client.captured[0].messages[0].content);
  assert.equal(parsed.answers.what, '쇼핑몰');
  assert.equal(parsed.catalog.blocks[0].id, 'b1');
  assert.equal(parsed.catalog.blocks[0].priority, 'required');
  // worlds나 cascades는 추천 호출에 안 보낸다(토큰 절약)
  assert.equal(parsed.catalog.worlds, undefined);
  assert.equal(parsed.catalog.cascades, undefined);
  // selectedBlocks는 정규화되어 들어간다
  assert.deepEqual(parsed.selectedBlocks.selected, ['b1']);
  assert.deepEqual(parsed.selectedBlocks.auto_added, ['b2']);
});

test('recommendArchitecture: parsed_output이 recommended를 안 줘도 빈 객체로 안전하게 폴백', async () => {
  const client = makeFakeClient(() => archResponse({})); // 빈 객체
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  const result = await adapter.recommendArchitecture({
    answers: {},
    catalog: { blocks: [] },
    selectedBlocks: {},
  });
  assert.deepEqual(result, { recommended: {}, reasons: {} });
});
