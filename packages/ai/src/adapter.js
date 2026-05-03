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
 * AI 어댑터. 구현체는 createMockAdapter, createClaudeAdapter 같은 팩토리 함수가 만든다.
 *
 * @typedef {object} AiAdapter
 * @property {string} name - 어댑터 식별자 (mock, claude, gpt 등)
 * @property {(answers: ProspectAnswers) => Promise<ExtractedIntent>} extractIntent
 * @property {(args: { answers: ProspectAnswers, seedTemplate?: string|null }) => Promise<Catalog>} generateCatalog
 *   - 사용자 답변에서 카탈로그를 생성한다(ADR 0027). 출력은 catalog.schema.json 검증을 통과해야 한다.
 *     seedTemplate이 주어지면 그 빌트인 템플릿의 worlds/blocks를 영감으로 사용하되 사용자 도메인에 맞춰 변형한다.
 * @property {({ block: object, operation: string }) => Promise<ExtractedSchema>} extractSchema
 */

// 이 파일은 타입 계약만 담는다. 구현은 mock.js, claude.js 등 어댑터별 파일에 둔다
// (CLAUDE.md 섹션 8 파일당 책임).
