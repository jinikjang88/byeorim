// Claude AI 어댑터 단위 테스트. ADR 0024의 약속을 지키는지 본다.
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

function intentResponse(parsed) {
  return { parsed_output: parsed, content: [] };
}

function schemaResponse(parsed) {
  return { parsed_output: parsed, content: [] };
}

test('claude 어댑터는 name이 claude이고 두 메서드를 가진다', () => {
  // Given: 팩토리로 생성한 어댑터
  const client = makeFakeClient(() =>
    intentResponse({ what: '', who: '', why: '', suggested_template: null }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // Then: 인터페이스 약속을 지킨다
  assert.equal(adapter.name, 'claude');
  assert.equal(typeof adapter.extractIntent, 'function');
  assert.equal(typeof adapter.extractSchema, 'function');
});

test('extractIntent: parsed_output을 그대로 결과 모양으로 반환한다', async () => {
  // Given: 응답을 결정짓는 fake client
  const client = makeFakeClient(() =>
    intentResponse({
      what: '쇼핑몰',
      who: '카페 사장님',
      why: '추가 매출',
      suggested_template: 'commerce',
    }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  const intent = await adapter.extractIntent('쇼핑몰 만들어줘');
  // Then: 모양이 보존된다
  assert.deepEqual(intent, {
    what: '쇼핑몰',
    who: '카페 사장님',
    why: '추가 매출',
    suggested_template: 'commerce',
  });
});

test('extractIntent: parsed_output의 누락 필드는 안전한 기본값으로 채워진다', async () => {
  // Given: 부분만 채워진 응답
  const client = makeFakeClient(() => intentResponse({ what: '쇼핑몰' }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  const intent = await adapter.extractIntent('쇼핑몰');
  // Then: 빈 문자열과 null로 채워진다
  assert.equal(intent.what, '쇼핑몰');
  assert.equal(intent.who, '');
  assert.equal(intent.why, '');
  assert.equal(intent.suggested_template, null);
});

test('extractIntent: 요청에 system, structured output, adaptive thinking이 박혀있다', async () => {
  // Given
  const client = makeFakeClient(() =>
    intentResponse({ what: '', who: '', why: '', suggested_template: null }),
  );
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  await adapter.extractIntent('쇼핑몰 만들어줘');
  // Then: 첫 호출의 인자를 본다
  const req = client.captured[0];
  assert.equal(req.model, 'claude-opus-4-7'); // ADR 0024 결정 4
  assert.deepEqual(req.thinking, { type: 'adaptive' }); // adaptive thinking
  assert.equal(req.output_config.format.type, 'json_schema'); // ADR 0024 결정 5
  assert.ok(req.output_config.format.schema, 'output schema가 있어야 한다');
  // system은 cache_control breakpoint가 박힌 배열
  assert.ok(Array.isArray(req.system));
  assert.equal(req.system[0].type, 'text');
  assert.deepEqual(req.system[0].cache_control, { type: 'ephemeral' });
  // user 메시지는 입력 그대로
  assert.equal(req.messages[0].role, 'user');
  assert.equal(req.messages[0].content, '쇼핑몰 만들어줘');
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
  // Given: delete operation 흉내
  const client = makeFakeClient(() => schemaResponse({ request: null, response: null }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  const result = await adapter.extractSchema({ block: { id: 'x' }, operation: 'delete' });
  // Then
  assert.equal(result.request, null);
  assert.equal(result.response, null);
});

test('extractSchema: user 메시지에 block과 operation이 JSON으로 들어간다', async () => {
  // Given
  const client = makeFakeClient(() => schemaResponse({ request: null, response: null }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  await adapter.extractSchema({
    block: { id: 'order', name: '주문', tech_desc: '주문 처리' },
    operation: 'create',
  });
  // Then
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
          why: '',
          suggested_template: 'commerce',
        }),
      },
    ],
  }));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When
  const intent = await adapter.extractIntent('쇼핑몰 만들어줘');
  // Then
  assert.equal(intent.what, '쇼핑몰');
  assert.equal(intent.suggested_template, 'commerce');
});

test('extractIntent: 응답이 비어있으면 한국어 에러를 던진다', async () => {
  // Given: parsed_output도 content도 없는 응답
  const client = makeFakeClient(() => ({}));
  const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
  // When/Then
  await assert.rejects(() => adapter.extractIntent('x'), /구조화된 출력을 찾지 못했습니다/);
});

// SDK APIError 계열은 Headers-like 객체를 요구한다(get 메서드).
const fakeHeaders = new Headers();

test('SDK AuthenticationError를 한국어 메시지로 변환한다', async () => {
  // Given: 인증 에러를 던지는 client
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
  // When/Then
  await assert.rejects(
    () => adapter.extractIntent('x'),
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
  await assert.rejects(() => adapter.extractIntent('x'), /호출 제한에 걸렸습니다/);
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
  await assert.rejects(() => adapter.extractIntent('x'), /연결하지 못했습니다/);
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
    () => adapter.extractIntent('x'),
    /Anthropic API 호출에 실패했습니다: something weird/,
  );
});

test('BEOREUM_AI_MODEL 환경 변수가 model보다 우선시된다', async () => {
  // Given
  const original = process.env.BEOREUM_AI_MODEL;
  process.env.BEOREUM_AI_MODEL = 'claude-haiku-4-5';
  try {
    const client = makeFakeClient(() =>
      intentResponse({ what: '', who: '', why: '', suggested_template: null }),
    );
    const adapter = createClaudeAdapter({ apiKey: 'sk-test', client });
    // When
    await adapter.extractIntent('x');
    // Then
    assert.equal(client.captured[0].model, 'claude-haiku-4-5');
  } finally {
    if (original === undefined) delete process.env.BEOREUM_AI_MODEL;
    else process.env.BEOREUM_AI_MODEL = original;
  }
});

test('명시적 model 인자는 환경 변수가 없을 때 사용된다', async () => {
  // Given
  const original = process.env.BEOREUM_AI_MODEL;
  delete process.env.BEOREUM_AI_MODEL;
  try {
    const client = makeFakeClient(() =>
      intentResponse({ what: '', who: '', why: '', suggested_template: null }),
    );
    const adapter = createClaudeAdapter({ apiKey: 'sk-test', model: 'claude-sonnet-4-6', client });
    // When
    await adapter.extractIntent('x');
    // Then
    assert.equal(client.captured[0].model, 'claude-sonnet-4-6');
  } finally {
    if (original !== undefined) process.env.BEOREUM_AI_MODEL = original;
  }
});
