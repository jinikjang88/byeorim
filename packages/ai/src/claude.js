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

// ADR 0029 + ADR 0030 + docs/specs/block-recommendation.md.
// 사용자 답변과 카탈로그를 보고 추천 블럭과 두 시점 이유(user/dev)를 돌려준다.
// smelt picker는 reasons[id].user만 보여주고, dev는 prompt 부산물에서 노출.
const RECOMMEND_SYSTEM_PROMPT = `너는 사용자가 만들고 싶은 서비스에서 어떤 블럭부터 시작하면 좋을지 추천하는 도우미다.
입력으로 7항목 답변(answers)과 카탈로그(catalog)를 받는다.
catalog의 blocks 배열을 보고 사용자 도메인에 가장 어울리는 5~7개를 골라준다.

규칙.
- 사용자의 what(만들고 싶은 것)과 직접 연결된 블럭을 가장 먼저
- 사용자의 why(만드는 이유)를 푸는 자리가 있는 블럭을 그 다음
- 카탈로그 블럭의 priority='required' 자리는 도메인 핵심이라 우대 가능
- 사용자가 답하지 않은 항목은 추측하지 않는다(빈 자리는 빈 자리로)
- 추천은 5~7개. 너무 많으면(>10) 비기술 창업자에게 압도. 추천 못 할 자리는 비운다
- catalog.blocks에 없는 ID는 절대 추천하지 않는다

이유는 두 시점으로 나눠 적는다(ADR 0030).

reasons[블럭ID].user: 비개발자(1순위 사용자, 카페 사장님/학원 원장님)가 읽는 자리.
- 일상 한국어. 단축어 풀어쓰기. 다음 단어들은 절대 그대로 쓰지 말고 풀어 적는다.
  - PG → "결제대행사"
  - DTO → "데이터 모양" 또는 "주고받을 정보의 모양"
  - API → "프로그램 사이의 약속"
  - REST → "웹 표준 방식"
  - CRUD → "만들고 보고 고치고 지우는 자리"
  - SDK → "도구 묶음"
  - JWT → "로그인 증명"
  - OAuth → "다른 서비스 계정으로 로그인"
- 두세 줄 가능. 사용자 답변(answers의 what/why/who 등)의 단어를 인용하면 친근
- 단정형보다 가능성형 결("핵심 흐름이에요"보다 "핵심 흐름으로 보여요", "잘 어울릴 수 있어요")
- 마케팅 카피 형용사("강력한", "획기적인", "본질적인") 금지

reasons[블럭ID].dev: 개발자(3순위 사용자)가 읽는 자리.
- 정확한 기술 용어 OK. PG, DTO, API, REST, CRUD 같은 단축어 사용 가능
- 한 줄 권장. 의존성, 데이터 흐름, 외부 시스템을 짚을 수 있음

두 시점 모두 비어있을 수 있다. 한 시점만 채워도 OK.

추측을 강요하지 않는다. 사용자 답변이 모두 비어있거나 도메인이 모호하면 빈 추천(recommended=[])도 옳다.`;

// reasons[id] 한 자리의 모양: {user, dev} 두 시점 객체(ADR 0030 결정 1).
const REASON_SCHEMA = {
  type: 'object',
  properties: {
    user: { type: 'string' },
    dev: { type: 'string' },
  },
  required: ['user', 'dev'],
};

const RECOMMEND_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    recommended: { type: 'array', items: { type: 'string' } },
    // reasons는 { [blockId]: REASON_SCHEMA } 모양. 키는 동적이라 additionalProperties로 표현.
    reasons: {
      type: 'object',
      additionalProperties: REASON_SCHEMA,
    },
  },
  required: ['recommended', 'reasons'],
  additionalProperties: false,
};

// ADR 0032 + docs/specs/architecture-recommendation.md.
// 사용자 답변과 카탈로그, 사용자가 고른 블럭을 보고 4개 아키텍처 결정에 추천을 돌려준다.
// shape picker는 reasons[key].user만 보여주고, dev는 후속 부산물 자리에서.
// system 프롬프트에 ADR 0012의 4개 결정 옵션 표를 박아 cache 적중을 노린다(ADR 0024).
const RECOMMEND_ARCH_SYSTEM_PROMPT = `너는 사용자가 만들고 싶은 서비스의 아키텍처 결정을 추천하는 도우미다.
입력으로 7항목 답변(answers), 카탈로그(catalog), 사용자가 고른 블럭(selectedBlocks)을 받는다.

다음 네 자리에 추천을 돌려준다(ADR 0012의 표준 옵션 식별자만 사용).

- language: node | java | python
- database: postgresql | mysql | sqlite | mongodb
- api_style: rest | graphql | rpc
- architecture_pattern: monolith | modular-monolith | microservices

규칙.
- 위 표준 식별자(소문자) 외의 값은 절대 돌려주지 않는다
- 사용자가 답하지 않은 항목은 추측하지 않는다(빈 자리는 빈 자리로). 어떤 결정에 추천 못 할 자리가 있으면 그 키를 비워둔다(전부 비어있어도 됨)
- selectedBlocks의 selected/auto_added/affected를 보고 도메인에 어울리는 자리를 고른다
  - 예: 결제/주문/예약 같은 거래성 블럭이 있으면 관계형 데이터베이스(postgresql/mysql) 쪽
  - 예: 블럭이 5개 안팎이면 단순한 구조(monolith). 10개 이상이면 modular-monolith
- 답변의 who(누가 사용)와 where(어디서 사용)이 다양하면 api_style을 rest로(보편)

이유는 두 시점으로 나눠 적는다(ADR 0030의 결을 그대로 따름).

reasons[결정키].user: 비개발자(1순위 사용자, 카페 사장님/학원 원장님)가 읽는 자리.
- 일상 한국어. 단축어 풀어쓰기. 다음 단어들은 절대 그대로 쓰지 말고 풀어 적는다.
  - PG → "결제대행사"
  - DTO → "데이터 모양" 또는 "주고받을 정보의 모양"
  - API → "프로그램 사이의 약속"
  - REST → "웹 표준 방식"
  - CRUD → "만들고 보고 고치고 지우는 자리"
  - SDK → "도구 묶음"
  - JWT → "로그인 증명"
  - OAuth → "다른 서비스 계정으로 로그인"
- 두세 줄 가능. 사용자 답변(answers의 what/why 등)의 단어를 인용하면 친근
- 단정형보다 가능성형 결("가장 흔한 자리예요"보다 "가장 흔한 자리로 보여요")
- 마케팅 카피 형용사("강력한", "획기적인", "본질적인") 금지

reasons[결정키].dev: 개발자(3순위 사용자)가 읽는 자리.
- 정확한 기술 용어 OK. PG, DTO, API, REST, CRUD 같은 단축어 사용 가능
- 한 줄 권장. 트레이드오프, 운영 부담, 의존성을 짚을 수 있음

두 시점 모두 비어있을 수 있다. 한 시점만 채워도 OK.

추측을 강요하지 않는다. 사용자 답변과 선택 블럭이 모호하면 빈 추천(recommended={})도 옳다.`;

const ARCH_REASON_SCHEMA = {
  type: 'object',
  properties: {
    user: { type: 'string' },
    dev: { type: 'string' },
  },
  required: ['user', 'dev'],
};

// recommendArchitecture의 출력 schema. 4개 결정 키는 각각 선택적(필수 아님).
// reasons도 각 키가 선택적. additionalProperties는 막아 비표준 키가 흘러들지 않게 한다.
const RECOMMEND_ARCH_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    recommended: {
      type: 'object',
      properties: {
        language: { type: 'string' },
        database: { type: 'string' },
        api_style: { type: 'string' },
        architecture_pattern: { type: 'string' },
      },
      additionalProperties: false,
    },
    reasons: {
      type: 'object',
      properties: {
        language: ARCH_REASON_SCHEMA,
        database: ARCH_REASON_SCHEMA,
        api_style: ARCH_REASON_SCHEMA,
        architecture_pattern: ARCH_REASON_SCHEMA,
      },
      additionalProperties: false,
    },
  },
  required: ['recommended', 'reasons'],
  additionalProperties: false,
};

// ADR 0012 결정 1의 표준 옵션 식별자. 어댑터 안전망에서 비표준 값을 거를 때 쓴다.
// shape.js의 VALID_VALUES와 같은 자리이지만, 어댑터는 core/cli에 의존하지 않으므로
// 한 번 더 박아둔다(중복 비용보다 의존성 경계를 지키는 결).
const ARCH_VALID_VALUES = {
  language: new Set(['node', 'java', 'python']),
  database: new Set(['postgresql', 'mysql', 'sqlite', 'mongodb']),
  api_style: new Set(['rest', 'graphql', 'rpc']),
  architecture_pattern: new Set(['monolith', 'modular-monolith', 'microservices']),
};

// ADR 0003 + docs/specs/reality-check.md. 6영역 Reality Check 자리.
// 사용자 도메인에 대한 두 번째 시각. 동행 톤 유지, prospect 단계에서는 강한 신호 안 씀.
const REALITY_CHECK_SYSTEM_PROMPT = `너는 사용자가 만들고 싶은 서비스의 시장 가치를 함께 보는 도우미다.
ADR 0003 결정 1로 정한 6영역(market_saturation, entry_cost, two_sided_market, legal_risk, revenue_model, graveyard)에서
사용자가 멈춰 생각할 자리를 만든다.

입력으로 7항목 답변(answers)과 카탈로그(catalog) 두 자리를 받는다.
사용자 도메인을 보고 영역마다 다음을 만든다.

- observation: AI가 본 한두 줄 한국어 관찰. 단정형 대신 가능성형 결로 쓴다("보일 수 있다", "한 번 보세요").
  도메인을 잘 모르면 빈 문자열로 둔다. 그럴듯한 일반론으로 채우지 않는다.
- questions: 사용자가 그 영역에서 멈춰 생각할 한국어 질문 2~4개.
  도메인 맥락으로 다듬는다. 답을 강요하지 않는다.

추가로 legal_warnings 자리를 채운다. 즉각 손해가 발생할 수 있는 법적 항목(개인정보, 인허가, 미성년자 보호 등)이
사용자 도메인에서 보이면 항목과 이유를 적는다. 비어있어도 된다(prospect 단계에서는 차단/경고로 쓰지 않고 모아두기만 함).

톤 가이드.
- 답을 강요하지 않는다(ADR 0003 결정 2). 모든 영역에서 같은 결
- 시장 포화도가 높다고 차단하지 않는다. 수익 모델이 약해 보인다고 차단하지 않는다(ADR 0003 결정 3)
- 마케팅 카피 형용사("강력한", "획기적인") 금지
- 비기술 창업자가 압도되지 않게 한다. 영역마다 한두 줄 관찰 + 질문 2~4개로 끝
- 사용자가 적은 한국어를 영어로 옮기지 않는다`;

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

// ADR 0036. temper의 test_code 자리를 architecture.language별 프레임워크 코드로 채운다.
// system prompt는 도메인 무관(CLAUDE.md 섹션 8). 블럭/endpoint/시나리오 정보는 user 메시지로 들어감.
const TEST_CODE_SYSTEM_PROMPT = `너는 한 시나리오의 테스트 코드를 짜는 도우미다.

입력으로 다음을 받는다.
- block: { id, name, user_desc?, tech_desc? } - 도메인 블럭 정보
- endpoint: { operation, method, path, description? } - HTTP 엔드포인트
- scenario: { kind, given, when, then } - 한국어 Given-When-Then 시나리오
- architecture: { language, database, api_style, architecture_pattern } - 사용자가 shape에서 고른 4개 결정

너의 일은 architecture.language에 맞는 테스트 코드 한 자리를 짜는 것이다. 시나리오 GWT 텍스트의 의도를
코드 단언으로 옮긴다. 출력은 test_code 문자열 한 자리.

언어별 프레임워크 표(이번 출시 표준).

- node → node:test (표준 라이브러리) + supertest로 HTTP 호출. import 결: \`import test from 'node:test'; import assert from 'node:assert'; import request from 'supertest';\`
- java → JUnit 5 + RestAssured 또는 Spring Boot Test. \`@Test\` 메서드 한 개, \`given().when().then()\` 결
- python → pytest + httpx 또는 FastAPI TestClient. \`def test_...():\` 함수 한 개

architecture.language가 위 셋이 아니거나 비어있으면 의사 코드로 폴백(주석으로 의도 한 줄).

규칙.
- 한 시나리오에 한 함수 또는 한 \`@Test\`. 빈 자리(import, beforeEach, fixture)는 주석으로 안내
- 시나리오의 한국어 텍스트(given/when/then)를 함수 이름이나 주석에 인용해 사용자가 추적 쉽게
- 단언은 endpoint.method/path와 시나리오 then의 status code(create→201, list/get/update/search→200, delete→204)에 맞춤
- 응답 body 필드의 정확한 이름은 모르면 placeholder(\`<id>\`, \`<name>\`)로 두고 한국어 주석으로 안내
- 마케팅 카피 형용사("강력한", "획기적인") 금지

test_code는 코드 한 덩어리 문자열. 사용자가 그 자리에 그대로 붙여넣어 시작점을 갖는다.`;

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

// Reality Check 6영역 출력 schema. ADR 0003 결정 1과 docs/specs/reality-check.md.
// 6영역 ID는 표준이라 properties 키 모두 required에 둔다.
const REALITY_CHECK_AREA_SCHEMA = {
  type: 'object',
  properties: {
    observation: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['observation', 'questions'],
};

const REALITY_CHECK_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    areas: {
      type: 'object',
      properties: {
        market_saturation: REALITY_CHECK_AREA_SCHEMA,
        entry_cost: REALITY_CHECK_AREA_SCHEMA,
        two_sided_market: REALITY_CHECK_AREA_SCHEMA,
        legal_risk: REALITY_CHECK_AREA_SCHEMA,
        revenue_model: REALITY_CHECK_AREA_SCHEMA,
        graveyard: REALITY_CHECK_AREA_SCHEMA,
      },
      required: [
        'market_saturation',
        'entry_cost',
        'two_sided_market',
        'legal_risk',
        'revenue_model',
        'graveyard',
      ],
    },
    legal_warnings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['item', 'reason'],
      },
    },
  },
  required: ['areas', 'legal_warnings'],
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

// ADR 0036. fillTestCode 응답 schema. test_code 한 자리.
const TEST_CODE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    test_code: { type: 'string' },
  },
  required: ['test_code'],
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
    async recommendBlocks({ answers, catalog } = {}) {
      const a = answers || {};
      // catalog 전체를 user 메시지로 보내면 토큰 비용이 큰 자리가 있다.
      // 추천에 필요한 자리(blocks의 id/name/user_desc/priority)만 잘라 보낸다.
      const blocks = Array.isArray(catalog?.blocks) ? catalog.blocks : [];
      const compactBlocks = blocks.map((b) => ({
        id: b?.id,
        name: b?.name,
        user_desc: b?.user_desc,
        priority: b?.priority,
      }));
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
          catalog: { blocks: compactBlocks },
        },
        null,
        2,
      );
      const request = buildRequest({
        model: resolvedModel,
        system: RECOMMEND_SYSTEM_PROMPT,
        userText,
        outputSchema: RECOMMEND_OUTPUT_SCHEMA,
        maxTokens: 2048,
      });
      const message = await callParse(request);
      const parsed = extractParsedOutput(message);
      // catalog에 없는 ID는 안전망으로 걸러낸다(어댑터 입장에서 추가 보정).
      const known = new Set(blocks.map((b) => b?.id).filter((id) => typeof id === 'string'));
      const recommended = Array.isArray(parsed.recommended)
        ? parsed.recommended.filter((id) => known.has(id))
        : [];
      // reasons는 { user, dev } 객체 모양(ADR 0030). 옛 string 모양도 user 시점으로 폴백.
      const reasons = {};
      if (parsed.reasons && typeof parsed.reasons === 'object') {
        for (const id of recommended) {
          const r = parsed.reasons[id];
          if (r && typeof r === 'object') {
            reasons[id] = {
              user: typeof r.user === 'string' ? r.user : '',
              dev: typeof r.dev === 'string' ? r.dev : '',
            };
          } else if (typeof r === 'string' && r.trim()) {
            // 옛 어댑터 응답이 string으로 올 자리(미래 호환). user 시점으로 폴백.
            reasons[id] = { user: r, dev: '' };
          }
        }
      }
      return { recommended, reasons };
    },
    async recommendArchitecture({ answers, catalog, selectedBlocks } = {}) {
      const a = answers || {};
      // catalog 전체를 보내면 토큰 비용이 큰 자리가 있다. 추천에 필요한 자리(blocks의 id/name/user_desc/priority)만 잘라 보낸다.
      const blocks = Array.isArray(catalog?.blocks) ? catalog.blocks : [];
      const compactBlocks = blocks.map((b) => ({
        id: b?.id,
        name: b?.name,
        user_desc: b?.user_desc,
        priority: b?.priority,
      }));
      const sb = selectedBlocks || {};
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
          catalog: { blocks: compactBlocks },
          selectedBlocks: {
            selected: Array.isArray(sb.selected) ? sb.selected : [],
            auto_added: Array.isArray(sb.auto_added) ? sb.auto_added : [],
            affected: Array.isArray(sb.affected) ? sb.affected : [],
            prerequisites: Array.isArray(sb.prerequisites) ? sb.prerequisites : [],
          },
        },
        null,
        2,
      );
      const request = buildRequest({
        model: resolvedModel,
        system: RECOMMEND_ARCH_SYSTEM_PROMPT,
        userText,
        outputSchema: RECOMMEND_ARCH_OUTPUT_SCHEMA,
        maxTokens: 2048,
      });
      const message = await callParse(request);
      const parsed = extractParsedOutput(message);
      // 비표준 값은 안전망으로 비운다. ADR 0012 결정 1의 표준 식별자만 통과(ADR 0032 결정 1).
      const recommended = {};
      const rawRecommended =
        parsed.recommended && typeof parsed.recommended === 'object' ? parsed.recommended : {};
      for (const key of Object.keys(ARCH_VALID_VALUES)) {
        const value = rawRecommended[key];
        if (typeof value === 'string' && ARCH_VALID_VALUES[key].has(value)) {
          recommended[key] = value;
        }
      }
      // reasons는 { user, dev } 객체 모양. 옛 string 모양도 user 시점으로 폴백(미래 호환).
      const reasons = {};
      const rawReasons = parsed.reasons && typeof parsed.reasons === 'object' ? parsed.reasons : {};
      for (const key of Object.keys(recommended)) {
        const r = rawReasons[key];
        if (r && typeof r === 'object') {
          reasons[key] = {
            user: typeof r.user === 'string' ? r.user : '',
            dev: typeof r.dev === 'string' ? r.dev : '',
          };
        } else if (typeof r === 'string' && r.trim()) {
          reasons[key] = { user: r, dev: '' };
        }
      }
      return { recommended, reasons };
    },
    async generateRealityCheck({ answers, catalog } = {}) {
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
          catalog: catalog || null,
        },
        null,
        2,
      );
      const request = buildRequest({
        model: resolvedModel,
        system: REALITY_CHECK_SYSTEM_PROMPT,
        userText,
        outputSchema: REALITY_CHECK_OUTPUT_SCHEMA,
        maxTokens: 4096,
      });
      const message = await callParse(request);
      const parsed = extractParsedOutput(message);
      return parsed;
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
    // ADR 0036의 fillTestCode. architecture.language에 맞는 프레임워크 코드를 생성.
    async fillTestCode({ block, endpoint, scenario, architecture } = {}) {
      const userText = JSON.stringify(
        {
          block: {
            id: block?.id,
            name: block?.name,
            user_desc: block?.user_desc,
            tech_desc: block?.tech_desc,
          },
          endpoint: {
            operation: endpoint?.operation,
            method: endpoint?.method,
            path: endpoint?.path,
            description: endpoint?.description,
          },
          scenario: {
            kind: scenario?.kind,
            given: scenario?.given,
            when: scenario?.when,
            then: scenario?.then,
          },
          architecture: {
            language: architecture?.language,
            database: architecture?.database,
            api_style: architecture?.api_style,
            architecture_pattern: architecture?.architecture_pattern,
          },
        },
        null,
        2,
      );
      const request = buildRequest({
        model: resolvedModel,
        system: TEST_CODE_SYSTEM_PROMPT,
        userText,
        outputSchema: TEST_CODE_OUTPUT_SCHEMA,
        maxTokens: 2048,
      });
      const message = await callParse(request);
      const parsed = extractParsedOutput(message);
      return typeof parsed.test_code === 'string' ? parsed.test_code : '';
    },
  };
}
