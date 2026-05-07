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
 * Smelt 단계의 산출물(selected-blocks.yml의 모양, ADR 0010).
 * shape의 recommendArchitecture가 입력으로 받는다(ADR 0032).
 *
 * @typedef {object} SelectedBlocks
 * @property {string[]} selected - 사용자가 명시적으로 고른 블럭 ID
 * @property {string[]} auto_added - requires 의존성으로 자동 추가된 블럭 ID
 * @property {string[]} affected - affects 의존성으로 영향받는 블럭 ID
 * @property {Array<{name: string, enables: string[]}>} prerequisites - 외부 준비물
 */

/**
 * Shape 단계의 4개 핵심 결정. ADR 0012 결정 1의 표준 옵션 식별자(소문자).
 *
 * @typedef {object} ArchitectureChoices
 * @property {'node'|'java'|'python'} language
 * @property {'postgresql'|'mysql'|'sqlite'|'mongodb'} database
 * @property {'rest'|'graphql'|'rpc'} api_style
 * @property {'monolith'|'modular-monolith'|'microservices'} architecture_pattern
 */

/**
 * Shape 단계의 아키텍처 추천 결과(ADR 0032 + docs/specs/architecture-recommendation.md).
 *
 * @typedef {object} ArchitectureRecommendation
 * @property {Partial<ArchitectureChoices>} recommended - 4개 결정 키별 추천 값(부분 가능)
 *   - 추천 값은 ADR 0012의 표준 옵션 식별자만. 비표준 값은 어댑터 본체에서 안전망으로 비움
 *   - 어떤 결정에 추천 못 할 자리가 있으면 그 키는 비워둠(전부 비어있어도 됨)
 * @property {Partial<{[K in keyof ArchitectureChoices]: RecommendationReason}>} reasons
 *   - 결정 키별 두 시점 이유({user, dev})
 *   - reasons의 키는 recommended의 키 부분집합. 모든 추천에 이유가 있어야 하지는 않음
 *   - picker는 reasons[key].user만 보여줌(ADR 0032 결정 2). dev는 후속 부산물 자리에서만
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
 * @property {(args: { answers: ProspectAnswers, catalog: Catalog, selectedBlocks: SelectedBlocks }) => Promise<ArchitectureRecommendation>} [recommendArchitecture]
 *   - 사용자 답변과 카탈로그, 사용자가 고른 블럭을 받아 4개 아키텍처 결정에 추천을 돌려준다(ADR 0032).
 *     선택 메서드. 어댑터가 구현 안 하면 shape가 빈 추천으로 진행(graceful degradation)
 * @property {({ block: object, operation: string }) => Promise<ExtractedSchema>} extractSchema
 * @property {(args: { block: object, endpoint: object, scenario: object, architecture: ArchitectureChoices }) => Promise<string>} [fillTestCode]
 *   - temper 시나리오의 test_code 자리를 채운다(ADR 0036).
 *     선택 메서드. 어댑터가 구현 안 하면 runTemper가 TODO로 폴백(graceful degradation).
 *     출력은 한 시나리오의 test_code 문자열. 빈 문자열도 허용(못 채울 자리)
 * @property {(args: InspectInput) => Promise<InspectFinding[]>} [inspectCode]
 *   - inspect 단계의 AI 검수(ADR 0050). generated 코드와 메타데이터를 받아 6영역 finding 배열을 반환.
 *     선택 메서드. 어댑터가 구현 안 하면 inspect가 정적 finding만 보고(graceful degradation).
 *     출력은 finding 배열. 각 finding의 source는 'ai'로 박힘.
 */

/**
 * inspectCode 입력. ADR 0050 결정 2의 균형 파일 범위.
 *
 * @typedef {object} InspectInput
 * @property {('node'|'java'|'python')} language
 * @property {Record<string, string>} files - { 상대경로: 파일 본문 }. backend 엔트리 + features 첫 sample + frontend 엔트리
 * @property {object} intent - intent.yml의 객체
 * @property {object} architecture - architecture.yml의 객체
 * @property {object} contracts - contracts.yml의 객체
 * @property {object} scenarios - test-scenarios.yml의 객체
 */

/**
 * inspect finding. ADR 0049 결정 3의 severity 셋, 결정 8의 source.
 *
 * @typedef {object} InspectFinding
 * @property {('보안'|'성능'|'운영'|'확장성'|'법적 리스크'|'시장 재검')} area
 * @property {('pass'|'warning'|'concern')} severity
 * @property {string} title - 한국어 제목 한 줄
 * @property {string} detail - 한국어 본문(줄바꿈 가능)
 * @property {string} [file] - 관련 파일의 상대 경로
 * @property {('static'|'ai')} source - finding 출처. inspect-rules.js는 'static', AI 어댑터는 'ai'
 */

// 이 파일은 타입 계약만 담는다. 구현은 mock.js, claude.js 등 어댑터별 파일에 둔다
// (CLAUDE.md 섹션 8 파일당 책임).
