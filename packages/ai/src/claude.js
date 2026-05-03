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
// 사용자 입력(extractIntent의 7항목 답변, extractSchema의 block/operation)은 user 메시지로만 들어간다.
// ADR 0026이 7항목 흐름을 정한 자리.
const INTENT_SYSTEM_PROMPT = `너는 사용자가 만들고 싶은 서비스의 의도를 정리하는 도우미다.
사용자는 일곱 자리에 한국어 또는 영어로 답변을 제공한다. 각 답변은 비어있을 수 있다.

- what: 만들고 싶은 것의 이름
- who: 누가 사용하는가
- when: 언제 사용하는가
- where: 어디에서 사용하는가
- why: 왜 만드는가
- how_use: 사용자가 어떤 흐름으로 쓰는가
- how_manage: 운영자가 어떻게 관리하는가

너의 일은 답변을 보고 다음 두 가지를 한다.

1) 답변을 그대로 받아서 정리해 돌려준다. 사용자가 적은 한국어를 영어로 옮기지 않는다.
   비어있는 자리는 빈 문자열 그대로 둔다. 그럴듯한 일반론으로 채우지 않는다.
2) suggested_template을 정한다. 후보는 "commerce"(쇼핑/마켓/결제),
   "job-aggregator"(채용/구인/일자리), "reservation"(예약/대관/클래스/강좌/시간표) 셋.
   답변에서 어느 후보에도 속하지 않으면 null.

추측을 강요하지 않는다. 답변이 모두 비어있으면 suggested_template은 null이다.`;

// ADR 0027 결정 4. 사용자 도메인에 맞춘 카탈로그 생성 자리.
// 빌트인 3개 템플릿이 사용자 도메인을 못 담을 때 AI가 합성한다.
const CATALOG_SYSTEM_PROMPT = `너는 사용자가 만들고 싶은 서비스에 맞는 도메인 카탈로그를 생성하는 도우미다.

입력으로 다음을 받는다.
- answers: 7항목 답변 객체 (what, who, when, where, why, how_use, how_manage)
- seedTemplate: 영감으로 쓸 빌트인 템플릿 이름 또는 null

너의 일은 다음 모양의 카탈로그 객체를 만드는 것이다.

- name: 카탈로그 표시명 (사람이 읽는 한 줄)
- domain: 영문 슬러그 (소문자/숫자/하이픈, 첫 글자 영문)
- worlds: 역할별 또는 활동 영역별 세계 3~6개. 각 세계는 id(예: w-user), title, description을 가진다
- blocks: 각 세계 안에서 의미 있는 기능 단위 5~12개. id(예: b-order), name, user_desc(비기술 창업자가 읽는 일상 언어 설명), tech_desc(엔지니어가 읽는 기술 설명)
- dependencies: 명확한 인과만. id source/target과 type("requires" 또는 "affects"), reason. 추측은 비운다
- cascades: 한 블럭이 트리거됐을 때 사용자에게 더 묻고 싶은 질문(ask_questions). 도메인 상식 기반. 비어도 됨
- prerequisites: 외부 조건(비용, 시간, 허가, 인프라) name과 enables 배열. 떠오르지 않으면 빈 배열

ID 규칙은 소문자/숫자/하이픈만, 첫 글자는 영문. 예: w-user, b-order, p-permit.

시드 템플릿이 주어지면 그 worlds/blocks 구조를 참고하되 사용자 답변에 맞춰 변형한다.
시드가 null이면 사용자 답변만 보고 처음부터 만든다.

추측을 강요하지 않는다. 사용자 답변에서 근거를 찾지 못한 자리는 비워둔다(예: 빈 dependencies, 빈 cascades, 빈 prerequisites). 그럴듯한 일반론으로 채우지 않는다.

비기술 창업자가 다음 단계(smelt의 블럭 선택)에서 읽을 자리이므로 user_desc는 일상 한국어로 쓴다.`;

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

// extractIntent의 구조화된 응답 schema. ADR 0026 결정 1로 7항목 + suggested_template.
const INTENT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    what: { type: 'string' },
    who: { type: 'string' },
    when: { type: 'string' },
    where: { type: 'string' },
    why: { type: 'string' },
    how_use: { type: 'string' },
    how_manage: { type: 'string' },
    suggested_template: { type: ['string', 'null'] },
  },
  required: ['what', 'who', 'when', 'where', 'why', 'how_use', 'how_manage', 'suggested_template'],
  additionalProperties: false,
};

// catalog.schema.json의 부분집합. SDK structured output 자리에 그대로 넘긴다.
// 전체 catalog.schema.json은 $ref와 enum, pattern을 쓰므로 SDK 호환을 위해 부분집합으로 다시 적는다.
// catalog.schema.json이 진실의 자리이고 이 부분집합은 SDK가 받을 수 있는 모양으로 옮긴 것.
// 둘이 어긋나지 않도록 prospect.js에서 catalog.schema.json으로 한 번 더 검증한다(ADR 0027 결정 3).
const CATALOG_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    domain: { type: 'string' },
    worlds: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['id', 'title'],
      },
    },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          user_desc: { type: 'string' },
          tech_desc: { type: 'string' },
          bundle_id: { type: 'string' },
        },
        required: ['id', 'name', 'user_desc'],
      },
    },
    bundles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          world_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['id', 'world_id', 'title'],
      },
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
          type: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['source', 'target', 'type'],
      },
    },
    cascades: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          trigger: { type: 'string' },
          add_blocks: { type: 'array', items: { type: 'string' } },
          ask_questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
              },
              required: ['question'],
            },
          },
        },
        required: ['trigger'],
      },
    },
    prerequisites: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phase: { type: 'string' },
          where: { type: 'string' },
          time: { type: 'string' },
          cost: { type: 'string' },
          enables: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'enables'],
      },
    },
  },
  required: ['worlds', 'blocks'],
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
// max_tokens는 응답이 작은 자리(intent/schema 둘 다 평면 객체)는 1024로 충분.
// generateCatalog는 카탈로그가 길어 8192를 넘긴다(ADR 0027 토큰 비용 자리).
function buildRequest({ model, system, userText, outputSchema, maxTokens = 1024 }) {
  return {
    model,
    max_tokens: maxTokens,
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
    async extractIntent(answers) {
      const a = answers || {};
      const userText = JSON.stringify(
        {
          what: typeof a.what === 'string' ? a.what : '',
          who: typeof a.who === 'string' ? a.who : '',
          when: typeof a.when === 'string' ? a.when : '',
          where: typeof a.where === 'string' ? a.where : '',
          why: typeof a.why === 'string' ? a.why : '',
          how_use: typeof a.how_use === 'string' ? a.how_use : '',
          how_manage: typeof a.how_manage === 'string' ? a.how_manage : '',
        },
        null,
        2,
      );
      const request = buildRequest({
        model: resolvedModel,
        system: INTENT_SYSTEM_PROMPT,
        userText,
        outputSchema: INTENT_OUTPUT_SCHEMA,
      });
      const message = await callParse(request);
      const parsed = extractParsedOutput(message);
      return {
        what: typeof parsed.what === 'string' ? parsed.what : '',
        who: typeof parsed.who === 'string' ? parsed.who : '',
        when: typeof parsed.when === 'string' ? parsed.when : '',
        where: typeof parsed.where === 'string' ? parsed.where : '',
        why: typeof parsed.why === 'string' ? parsed.why : '',
        how_use: typeof parsed.how_use === 'string' ? parsed.how_use : '',
        how_manage: typeof parsed.how_manage === 'string' ? parsed.how_manage : '',
        suggested_template:
          typeof parsed.suggested_template === 'string' ? parsed.suggested_template : null,
      };
    },
    async generateCatalog({ answers, seedTemplate } = {}) {
      const a = answers || {};
      const userText = JSON.stringify(
        {
          answers: {
            what: typeof a.what === 'string' ? a.what : '',
            who: typeof a.who === 'string' ? a.who : '',
            when: typeof a.when === 'string' ? a.when : '',
            where: typeof a.where === 'string' ? a.where : '',
            why: typeof a.why === 'string' ? a.why : '',
            how_use: typeof a.how_use === 'string' ? a.how_use : '',
            how_manage: typeof a.how_manage === 'string' ? a.how_manage : '',
          },
          seedTemplate: seedTemplate || null,
        },
        null,
        2,
      );
      const request = buildRequest({
        model: resolvedModel,
        system: CATALOG_SYSTEM_PROMPT,
        userText,
        outputSchema: CATALOG_OUTPUT_SCHEMA,
        maxTokens: 8192,
      });
      const message = await callParse(request);
      const parsed = extractParsedOutput(message);
      // catalog.schema.json 검증은 prospect.js가 한다(ADR 0027 결정 3, 한 자리에서만 검증).
      return parsed;
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
