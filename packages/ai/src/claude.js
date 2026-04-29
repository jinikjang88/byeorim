// Claude AI 어댑터. ADR 0009의 AiAdapter 인터페이스를 @anthropic-ai/sdk로 구현한다.
// extractIntent와 extractSchema 둘 다 structured output(json_schema)으로 응답 형식 강제.
// 시스템 프롬프트에는 prompt caching breakpoint를 박아 반복 호출 비용을 줄인다.
// ADR 0024 결정 표를 그대로 따른다.
//
// 단위 테스트는 client 의존성 주입(ADR 0024 결정 7)으로 LLM 호출 없이 결정적으로 돈다.
// CLAUDE.md 섹션 4의 5초 미만 약속을 지키는 자리.

import Anthropic, {
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
  APIConnectionTimeoutError,
} from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-opus-4-7';

// 도메인 무관 시스템 프롬프트. ADR 0024의 prompt caching 약속을 위해 항상 같은 바이트로 둔다.
// 사용자 입력(extractIntent의 자연어, extractSchema의 block/operation)은 user 메시지로만 들어간다.
const INTENT_SYSTEM_PROMPT = `너는 사용자가 만들고 싶은 서비스의 의도를 추출하는 도우미다.
사용자가 한국어 또는 영어로 한 마디를 적으면, 다음 셋을 추출한다.

- what: 사용자가 만들고 싶은 것의 이름. 명사구로 짧게.
- who: 사용자가 그것을 누구를 위해 만드는지. 입력에서 추측할 수 없으면 빈 문자열.
- why: 사용자가 그것을 왜 만드는지. 입력에서 추측할 수 없으면 빈 문자열.
- suggested_template: 빌트인 템플릿 후보 중 하나. 후보는 "commerce"(쇼핑/마켓/결제), "job-aggregator"(채용/구인/일자리). 둘 다 아니면 null.

추측을 강요하지 않는다. 입력이 모호하면 빈 문자열과 null을 그대로 둔다.`;

const SCHEMA_SYSTEM_PROMPT = `너는 한 도메인 블럭의 한 operation에 대한 JSON Schema를 생성하는 도우미다.

입력으로 다음을 받는다.
- block: { id, name, user_desc?, tech_desc? } 형태의 블럭 정보
- operation: 다음 중 하나 (create, list, get, update, delete, search)

출력은 다음 두 자리.
- request: 요청 body의 JSON Schema 또는 null. body가 없는 operation(get/list/delete/search)은 null.
- response: 응답 body의 JSON Schema 또는 null. delete는 null. 그 외는 스키마 객체.

스키마 형식은 다음 부분집합만 사용한다.
- type: "object" | "string" | "integer" | "number" | "boolean" | "array"
- object일 때 properties와 required
- array일 때 items
- 그 이상의 검증(pattern, enum, format 등)은 사용하지 않음

블럭의 도메인 의미를 보고 그 블럭다운 필드를 추정한다. 예시: 주문 블럭의 create는 quantity, item_id 같은 필드를 가질 것. 모르면 generic 필드(name, description)로 둔다.`;

// extractIntent의 구조화된 응답 schema.
const INTENT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    what: { type: 'string' },
    who: { type: 'string' },
    why: { type: 'string' },
    suggested_template: { type: ['string', 'null'] },
  },
  required: ['what', 'who', 'why', 'suggested_template'],
  additionalProperties: false,
};

// JSON Schema 부분집합. extractSchema 출력의 request/response 자리에 들어갈 모양.
// ADR 0023 결정 2의 형식과 같다.
const SCHEMA_NODE = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['object', 'string', 'integer', 'number', 'boolean', 'array'],
    },
    properties: { type: 'object' },
    required: { type: 'array', items: { type: 'string' } },
    items: { type: 'object' },
  },
  required: ['type'],
  additionalProperties: false,
};

const SCHEMA_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    request: { anyOf: [SCHEMA_NODE, { type: 'null' }] },
    response: { anyOf: [SCHEMA_NODE, { type: 'null' }] },
  },
  required: ['request', 'response'],
  additionalProperties: false,
};

// SDK 에러를 한국어 메시지로 변환한다(ADR 0024 결정 6).
// 원본 에러는 cause로 묶어둬 디버깅 자리(향후 --verbose)가 잡을 수 있게 한다.
function translateError(err) {
  if (err instanceof AuthenticationError) {
    return new Error(
      'Anthropic API 키가 잘못되었거나 만료되었습니다. ANTHROPIC_API_KEY 환경 변수를 다시 확인해주세요',
      { cause: err },
    );
  }
  if (err instanceof RateLimitError) {
    return new Error('Anthropic API 호출 제한에 걸렸습니다. 잠시 후 다시 시도해주세요', {
      cause: err,
    });
  }
  if (err instanceof APIConnectionTimeoutError || err instanceof APIConnectionError) {
    return new Error('Anthropic API에 연결하지 못했습니다. 네트워크 상태를 확인해주세요', {
      cause: err,
    });
  }
  return new Error(`Anthropic API 호출에 실패했습니다: ${err.message || err}`, { cause: err });
}

// 응답에서 구조화된 출력을 꺼낸다. SDK가 messages.parse로 호출되면 parsed_output에 들어온다.
// parse 호출이 실패하거나 형식이 어긋나면 한국어 에러로 변환한다.
function extractParsedOutput(message) {
  if (message && message.parsed_output && typeof message.parsed_output === 'object') {
    return message.parsed_output;
  }
  // SDK가 parsed_output을 못 채운 자리에 대비한 백업: 첫 텍스트 블럭에서 JSON 파싱.
  const block = Array.isArray(message?.content)
    ? message.content.find((b) => b.type === 'text')
    : null;
  if (!block || typeof block.text !== 'string') {
    throw new Error('Anthropic 응답에서 구조화된 출력을 찾지 못했습니다');
  }
  try {
    return JSON.parse(block.text);
  } catch (err) {
    throw new Error(`Anthropic 응답을 JSON으로 해석하지 못했습니다: ${err.message}`, {
      cause: err,
    });
  }
}

// system 메시지 블럭을 만든다. cache_control breakpoint를 마지막 블럭에 박아
// 두 번째 호출부터 prompt cache 적중을 노린다(ADR 0024 prompt caching 정책).
function cachedSystem(text) {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

// 공통 호출 인자. structured output, adaptive thinking, cached system prompt를 모두 켠다.
// max_tokens는 응답이 작은 자리(intent/schema 둘 다 평면 객체)라 1024로 충분하다.
function buildRequest({ model, system, userText, outputSchema }) {
  return {
    model,
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system: cachedSystem(system),
    messages: [{ role: 'user', content: userText }],
    output_config: {
      format: { type: 'json_schema', schema: outputSchema },
    },
  };
}

// Claude AI 어댑터를 만든다.
//
// 입력:
//   apiKey  - Anthropic API 키. 미지정 시 ANTHROPIC_API_KEY 환경 변수에서 읽힘
//   model   - 사용할 모델 ID (기본 claude-opus-4-7). BEOREUM_AI_MODEL 환경 변수가 우선시됨
//   client  - 옵셔널 SDK 인스턴스(테스트 주입용). 없으면 new Anthropic({ apiKey, baseURL })로 만든다
//   baseURL - 옵셔널. 외부 브릿지 서버 URL. 주어지면 SDK가 그쪽으로 호출(ADR 0025).
//             client가 명시적으로 주입되면 무시됨
//
// @returns {import('./adapter.js').AiAdapter}
export function createClaudeAdapter({ apiKey, model, client, baseURL } = {}) {
  const resolvedModel = model || process.env.BEOREUM_AI_MODEL || DEFAULT_MODEL;
  const resolvedClient =
    client ||
    new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      ...(baseURL ? { baseURL } : {}),
    });

  async function callParse(request) {
    try {
      return await resolvedClient.messages.parse(request);
    } catch (err) {
      throw translateError(err);
    }
  }

  return {
    name: 'claude',
    async extractIntent(userInput) {
      const request = buildRequest({
        model: resolvedModel,
        system: INTENT_SYSTEM_PROMPT,
        userText: userInput || '',
        outputSchema: INTENT_OUTPUT_SCHEMA,
      });
      const message = await callParse(request);
      const parsed = extractParsedOutput(message);
      return {
        what: typeof parsed.what === 'string' ? parsed.what : '',
        who: typeof parsed.who === 'string' ? parsed.who : '',
        why: typeof parsed.why === 'string' ? parsed.why : '',
        suggested_template:
          typeof parsed.suggested_template === 'string' ? parsed.suggested_template : null,
      };
    },
    async extractSchema({ block, operation }) {
      const userText = JSON.stringify(
        {
          block: {
            id: block?.id,
            name: block?.name,
            user_desc: block?.user_desc,
            tech_desc: block?.tech_desc,
          },
          operation,
        },
        null,
        2,
      );
      const request = buildRequest({
        model: resolvedModel,
        system: SCHEMA_SYSTEM_PROMPT,
        userText,
        outputSchema: SCHEMA_OUTPUT_SCHEMA,
      });
      const message = await callParse(request);
      const parsed = extractParsedOutput(message);
      return {
        request: parsed.request === null || parsed.request === undefined ? null : parsed.request,
        response:
          parsed.response === null || parsed.response === undefined ? null : parsed.response,
      };
    },
  };
}
