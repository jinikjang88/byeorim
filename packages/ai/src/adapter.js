// AI 어댑터 인터페이스 계약. mock과 실제 LLM 어댑터(Claude, GPT, Gemini)가 모두 따른다.
// 절대 금지선 6번(특정 AI 벤더에 종속시키지 않는다)을 인터페이스에 박는 자리.
// ADR 0009 참조. ADR 0023이 extractSchema를, ADR 0027이 generateCatalog와
// generateTradeOffDoc을 amend로 추가했다.

/**
 * Prospect 단계가 사용자 자연어에서 추출한 구조화된 의도.
 * intent.yml의 extracted 필드와 같은 모양(ADR 0008).
 *
 * @typedef {object} ExtractedIntent
 * @property {string} what - 무엇을 만들고 싶은지
 * @property {string} who - 누구를 위해 만드는지 (비어있을 수 있음)
 * @property {string} why - 왜 만드는지 (비어있을 수 있음)
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
 * 카탈로그 객체. packages/catalog/schemas/catalog.schema.json을 따른다(ADR 0005).
 *
 * @typedef {object} Catalog
 * @property {string} [name]
 * @property {string} [domain]
 * @property {Array<object>} worlds
 * @property {Array<object>} [bundles]
 * @property {Array<object>} blocks
 * @property {Array<object>} [dependencies]
 * @property {Array<object>} [cascades]
 * @property {Array<object>} [prerequisites]
 */

/**
 * generateCatalog 입력. ADR 0027 결정 1.
 *
 * @typedef {object} GenerateCatalogInput
 * @property {string} userInput - 사용자가 적은 자연어 한 마디
 * @property {ExtractedIntent} intent - extractIntent의 결과
 * @property {Catalog|null} seedCatalog - 가장 가까운 시드 카탈로그 또는 null
 */

/**
 * generateCatalog 출력. ADR 0027 결정 2(객체로 한 자리 감싸 미래 메타 자리 열림).
 *
 * @typedef {object} GenerateCatalogResult
 * @property {Catalog} catalog
 */

/**
 * generateTradeOffDoc 입력. ADR 0027 결정 3.
 *
 * @typedef {object} GenerateTradeOffDocInput
 * @property {Catalog} catalog
 * @property {object} intent - intent.yml 객체(extracted, user_input, source 등 포함)
 * @property {Date} [now] - 테스트용 결정적 시각(옵션). 생략 시 new Date()
 */

/**
 * generateTradeOffDoc 출력. doc는 markdown 본문.
 *
 * @typedef {object} GenerateTradeOffDocResult
 * @property {string} doc
 */

/**
 * AI 어댑터. 구현체는 createMockAdapter, createClaudeAdapter 같은 팩토리 함수가 만든다.
 * generateCatalog와 generateTradeOffDoc은 ADR 0027이 ADR 0009를 amend해 추가한 자리.
 *
 * @typedef {object} AiAdapter
 * @property {string} name - 어댑터 식별자 (mock, claude, gpt 등)
 * @property {(userInput: string) => Promise<ExtractedIntent>} extractIntent
 * @property {({ block: object, operation: string }) => Promise<ExtractedSchema>} extractSchema
 * @property {(input: GenerateCatalogInput) => Promise<GenerateCatalogResult>} generateCatalog
 * @property {(input: GenerateTradeOffDocInput) => Promise<GenerateTradeOffDocResult>} generateTradeOffDoc
 */

// 이 파일은 타입 계약만 담는다. 구현은 mock.js, claude.js 등 어댑터별 파일에 둔다
// (CLAUDE.md 섹션 8 파일당 책임).
