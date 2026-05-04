// AI 어댑터 인터페이스 계약. mock과 실제 LLM 어댑터(Claude, GPT, Gemini)가 모두 따른다.
// 절대 금지선 6번(특정 AI 벤더에 종속시키지 않는다)을 인터페이스에 박는 자리.
// ADR 0009 참조.

/**
 * Prospect 단계가 사용자에게 차례로 묻는 7항목 답변.
 * ADR 0026 결정 1로 정한 자리. 각 항목은 비어있을 수 있다(답을 강요하지 않는 동행 톤).
 *
 * @typedef {object} ProspectAnswers
 * @property {string} what - 어떤 서비스를 만들고 싶은지
 * @property {string} who - 누가 사용하는지
 * @property {string} when - 언제 쓰는지
 * @property {string} where - 어디에서 쓰는지
 * @property {string} why - 왜 만드는지
 * @property {string} how_use - 사용자가 어떻게 쓰는지
 * @property {string} how_manage - 운영자가 어떻게 관리하는지
 */

/**
 * Prospect 단계가 7항목 답변을 받아 정리한 결과.
 * intent.yml의 extracted 필드와 같은 모양(ADR 0008 + 0026).
 *
 * @typedef {object} ExtractedIntent
 * @property {string} what
 * @property {string} who
 * @property {string} when
 * @property {string} where
 * @property {string} why
 * @property {string} how_use
 * @property {string} how_manage
 * @property {string|null} suggested_template - 추천 빌트인 템플릿 이름 또는 null
 */

/**
 * JSON Schema 부분집합. ADR 0023 결정 2의 형식.
 * extractSchema의 출력과 contracts.yml의 request_schema/response_schema 값.
 *
 * @typedef {object} Schema
 * @property {'object'|'string'|'integer'|'number'|'boolean'|'array'} type
 * @property {Object<string, Schema>} [properties] - type='object'일 때
 * @property {string[]} [required] - type='object'일 때
 * @property {Schema} [items] - type='array'일 때
 */

/**
 * extractSchema 출력. request는 body가 없는 operation(get/list/delete 등)에서 null.
 *
 * @typedef {object} ExtractedSchema
 * @property {Schema|null} request
 * @property {Schema|null} response
 */

/**
 * 카탈로그 객체. packages/catalog/schemas/catalog.schema.json의 모양을 따른다.
 * generateCatalog의 반환 타입(ADR 0027). 다음 단계(smelt)가 이 모양을 그대로 읽는다.
 *
 * @typedef {object} Catalog
 * @property {string} [name]
 * @property {string} [domain]
 * @property {Array<object>} worlds
 * @property {Array<object>} blocks
 * @property {Array<object>} [bundles]
 * @property {Array<object>} [dependencies]
 * @property {Array<object>} [cascades]
 * @property {Array<object>} [prerequisites]
 */

/**
 * Reality Check 한 영역의 결과(ADR 0003 + docs/specs/reality-check.md).
 *
 * @typedef {object} RealityCheckArea
 * @property {string} observation - AI의 한두 줄 한국어 관찰. 모르면 빈 문자열
 * @property {string[]} questions - 사용자가 멈춰 생각할 한국어 질문 2~4개
 */

/**
 * Reality Check 6영역 리포트.
 * 키는 표준 영역 ID(market_saturation, entry_cost, two_sided_market, legal_risk, revenue_model, graveyard).
 *
 * @typedef {object} RealityCheckReport
 * @property {{[area: string]: RealityCheckArea}} areas - 6영역 결과
 * @property {Array<{item: string, reason: string}>} legal_warnings - 즉각 손해 가능 법적 항목 모음(ADR 0003 결정 3)
 *   - prospect 단계에서는 차단/경고로 쓰지 않고 모아두기만 한다. Inspect 단계가 다시 본다
 *   - 비어있을 수 있다
 */

/**
 * Smelt 단계의 블럭 추천 한 자리에 대한 두 시점 이유(ADR 0030).
 *
 * @typedef {object} RecommendationReason
 * @property {string} user - 비개발자(1순위 사용자)가 읽는 한국어 일상어. 단축어 풀어쓰기. 빈 문자열 허용
 * @property {string} dev - 개발자(3순위 사용자)가 읽는 기술 한 줄. 단축어 사용 가능. 빈 문자열 허용
 */

/**
 * Smelt 단계의 블럭 추천 결과(ADR 0029 + ADR 0030 + docs/specs/block-recommendation.md).
 *
 * @typedef {object} BlockRecommendation
 * @property {string[]} recommended - 추천 블럭 ID 배열(우선순위 순, 최대 10개)
 * @property {{[blockId: string]: RecommendationReason}} reasons - 블럭 ID별 두 시점 추천 이유
 *   - reasons의 키는 recommended의 ID 부분집합. 모든 추천에 이유가 있어야 하지는 않음
 *   - picker는 reasons[id].user만 보여줌(ADR 0030 결정 2). dev는 prompt 부산물에서만 노출
 */

/**
 * AI 어댑터. 구현체는 createMockAdapter, createClaudeAdapter 같은 팩토리 함수가 만든다.
 *
 * @typedef {object} AiAdapter
 * @property {string} name - 어댑터 식별자 (mock, claude, gpt 등)
 * @property {(answers: ProspectAnswers) => Promise<ExtractedIntent>} extractIntent
 * @property {(args: { answers: ProspectAnswers, seedTemplate?: string|null }) => Promise<Catalog>} generateCatalog
 *   - 사용자 답변에서 카탈로그를 생성한다(ADR 0027). 출력은 catalog.schema.json 검증을 통과해야 한다.
 *     seedTemplate이 주어지면 그 빌트인 템플릿의 worlds/blocks를 영감으로 사용하되 사용자 도메인에 맞춰 변형한다.
 * @property {(args: { answers: ProspectAnswers, catalog: Catalog }) => Promise<RealityCheckReport>} generateRealityCheck
 *   - 7항목 답변과 카탈로그를 받아 Reality Check 6영역 리포트를 만든다(ADR 0003 + docs/specs/reality-check.md).
 *     동행 톤(답을 강요하지 않음). 강한 신호는 prospect 단계에서 안 쓰고 legal_warnings로 모아둔다
 * @property {(args: { answers: ProspectAnswers, catalog: Catalog }) => Promise<BlockRecommendation>} [recommendBlocks]
 *   - 사용자 답변과 카탈로그를 받아 추천 블럭과 이유를 돌려준다(ADR 0029).
 *     선택 메서드. 어댑터가 구현 안 하면 smelt가 빈 추천으로 진행(graceful degradation)
 * @property {({ block: object, operation: string }) => Promise<ExtractedSchema>} extractSchema
 */

// 이 파일은 타입 계약만 담는다. 구현은 mock.js, claude.js 등 어댑터별 파일에 둔다
// (CLAUDE.md 섹션 8 파일당 책임).
