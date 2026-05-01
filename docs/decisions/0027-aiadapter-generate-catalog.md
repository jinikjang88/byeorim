# ADR 0027. AiAdapter.generateCatalog와 generateTradeOffDoc 인터페이스

- 상태: 채택
- 날짜: 2026-05-01
- 결정자: DevSmith

## 맥락

ADR 0026이 탐광의 출력 결정점을 picker에서 generator로 바꾸기로 했다. 그 결정이 코드로 굳으려면 어댑터 인터페이스가 두 일을 더 약속해야 한다.

첫째, 카탈로그 생성. `generateCatalog({ userInput, intent, seedCatalog })`가 카탈로그 객체를 돌려준다. mock은 시드 그대로(name과 domain만 갈아끼움), claude는 시드를 few-shot으로 받아 변형(다음 PR).

둘째, 트레이드오프 문서 생성. `generateTradeOffDoc({ catalog, intent })`가 사람용 거울 마크다운을 돌려준다. ADR 0028이 이 산출물의 자리(`.beoreum/project/design.md`)와 책임을 박는다. 이 ADR은 메서드 시그니처만 정한다.

ADR 0009가 박은 AiAdapter 인터페이스(name, extractIntent)에 ADR 0023이 extractSchema를 추가했다. 이 ADR은 그 위에 두 메서드를 더한다. 인터페이스 확장이지 변경이 아니라 호환성 깨짐이 작다(ADR 0009 결정 2 마지막 문단의 약속).

## 검토한 옵션

### 결정 1. generateCatalog의 인자 형식

#### 옵션 A. 위치 인자 `generateCatalog(userInput, intent, seedCatalog)`
- 장점: 짧음
- 단점: 미래에 인자가 늘어나면 호출 자리 호환성 깨짐. ADR 0023의 `extractSchema({ block, operation })` 결과 결이 다름

#### 옵션 B. 객체 인자 `generateCatalog({ userInput, intent, seedCatalog })`
- 장점: ADR 0023의 결과 같음. 미래에 `style: 'minimal'` 같은 옵션이 들어와도 호환성 보존
- 단점: 호출 자리에 객체 한 자리 더 만드는 비용. 작음

### 결정 2. generateCatalog의 반환 형식

#### 옵션 A. 카탈로그 객체 자체 `Promise<Catalog>`
- 장점: 짧음
- 단점: 미래에 `rationale`, `confidence`, `token_usage` 같은 메타가 들어올 자리가 없음. 인터페이스 확장 시 호환성 깨짐

#### 옵션 B. 한 자리 감싼 객체 `Promise<{ catalog: Catalog }>`
- 장점: 미래 메타 필드 자리 열림. ADR 0023의 `{ request, response }` 결과 같은 결
- 단점: 호출 자리에서 한 단계 더 풀어야 함

### 결정 3. generateTradeOffDoc의 시그니처

#### 옵션 A. 카탈로그만 받음 `generateTradeOffDoc({ catalog })`
- 장점: 단순
- 단점: intent의 user_input과 extracted.what을 본문에 살리기 어려움

#### 옵션 B. 카탈로그 + intent `generateTradeOffDoc({ catalog, intent })`
- 장점: 본문이 사용자 입력과 닿아 있어 더 사람 친화적. 미래에 reality_check_status를 본문에서 참조할 자리도 열림
- 단점: 두 인자가 같이 옮겨져야 함. 작음

### 결정 4. 어댑터 책임 분담 (mock vs claude)

#### 옵션 A. mock도 claude와 같은 결로 동작 시도
- 장점: 어댑터 동작이 같음
- 단점: mock이 결정적이려면 LLM 호출 흉내가 어려움. 5초 약속 위반 가능

#### 옵션 B. mock은 결정적 휴리스틱(시드 그대로 + name/domain 갈아끼움), claude는 LLM 호출
- 장점: 두 어댑터의 책임이 분명. mock은 인터페이스 검증과 결정성, claude는 도메인 빚기. CLAUDE.md 섹션 4 5초 약속 보존
- 단점: 두 어댑터 동작이 다름. 다만 인터페이스가 같으므로 호출자(prospect)는 차이를 모름

### 결정 5. claude 어댑터의 두 메서드 구현 시점

#### 옵션 A. 이번 PR에 mock과 claude 둘 다 실제 구현
- 장점: 한 PR로 끝남
- 단점: PR이 무거워짐. claude 구현은 structured output schema, prompt caching, 토큰 예산까지 별도 ADR-worthy 결정. 리뷰 부담 큼

#### 옵션 B. 이번 PR에 mock만 실제 구현, claude는 한국어 안내 에러로 스텁
- 장점: PR이 작음. 인터페이스가 박히고 mock이 흐름을 검증. claude 실제 구현은 다음 PR + 전용 ADR
- 단점: claude 어댑터 사용자가 다음 PR까지 기다려야 함. 다만 mock으로 흐름 전체를 검증할 수 있어 차단되지 않음

## 결정

### 결정 1: 객체 인자 (옵션 B)

```js
async function generateCatalog({ userInput, intent, seedCatalog }): Promise<{ catalog: Catalog }>
async function generateTradeOffDoc({ catalog, intent }): Promise<{ doc: string }>
```

ADR 0023의 결과 같은 결을 따른다. 미래 인자 추가 시 호환성 깨짐 없음.

### 결정 2: 한 자리 감싼 객체 (옵션 B)

`generateCatalog`의 반환은 `{ catalog }`, `generateTradeOffDoc`의 반환은 `{ doc }`로 한 자리 더 감싼다. 미래에 `{ catalog, rationale, token_usage }` 또는 `{ doc, sections, banner }` 같은 메타가 들어와도 호환성 보존.

### 결정 3: 카탈로그 + intent (옵션 B)

`generateTradeOffDoc({ catalog, intent })`로 두 인자를 같이 받는다. 본문이 사용자 입력과 닿아 있게 한다.

### 결정 4: mock은 결정적 휴리스틱, claude는 LLM 호출 (옵션 B)

mock 어댑터는 시드 카탈로그를 그대로 돌려주면서 `name`과 `domain` 두 필드만 사용자 입력에서 뽑은 값으로 갈아끼운다. 시드의 worlds, bundles, blocks, dependencies, cascades, prerequisites는 보존. `generateTradeOffDoc`은 worlds → bundles → blocks 트리를 결정적 한국어 마크다운으로 펼친다. 블럭당 한 자리에 user_desc, analogy, concerns, requires/affects 엣지, prerequisites, 트리거된 cascades 한 줄 요약과 트레이드오프 한두 문장.

CLAUDE.md 섹션 8 데이터 무관성을 위해 mock은 시드의 특정 ID(coupon, payment 등)를 본문에 박지 않고 구조만 본다.

claude 어댑터는 다음 PR에서 structured output(catalog.schema.json)으로 generateCatalog를 구현한다. prompt caching breakpoint를 시드와 system prompt 자리에 박아 비용을 절감한다(ADR 0024 결).

### 결정 5: 이번 PR은 mock만 실제, claude는 한국어 스텁 (옵션 B)

claude 어댑터의 두 메서드는 이번 PR에서 다음과 같이 스텁한다.

```js
async generateCatalog() {
  throw new Error(
    'claude.generateCatalog는 다음 출시 자리입니다. ' +
    'BEOREUM_AI_ADAPTER=mock으로 흐름을 먼저 검증하거나 다음 PR을 기다려주세요',
  );
}
```

CLAUDE.md 섹션 8 사용자 출력 정책(한국어, 구체적 안내). 이 결로 인터페이스가 박히고 mock이 흐름을 검증하면, 다음 PR이 claude 실제 구현에만 집중할 수 있다.

### 인터페이스 정리

```js
/**
 * 카탈로그 객체. packages/catalog/schemas/catalog.schema.json을 따른다.
 *
 * @typedef {object} Catalog
 * @property {string} [name]
 * @property {string} [domain]
 * @property {Array<World>} worlds
 * @property {Array<Bundle>} [bundles]
 * @property {Array<Block>} blocks
 * @property {Array<Dependency>} [dependencies]
 * @property {Array<Cascade>} [cascades]
 * @property {Array<Prerequisite>} [prerequisites]
 */

/**
 * @typedef {object} GenerateCatalogInput
 * @property {string} userInput - 사용자가 적은 자연어 한 마디
 * @property {ExtractedIntent} intent - extractIntent의 결과
 * @property {Catalog | null} seedCatalog - 가장 가까운 시드 카탈로그 또는 null
 */

/**
 * @typedef {object} GenerateCatalogResult
 * @property {Catalog} catalog
 */

/**
 * @typedef {object} GenerateTradeOffDocInput
 * @property {Catalog} catalog
 * @property {object} intent - intent.yml 객체(extracted, user_input, source 등 포함)
 */

/**
 * @typedef {object} GenerateTradeOffDocResult
 * @property {string} doc - markdown 본문
 */

/**
 * @typedef {object} AiAdapter
 * @property {string} name
 * @property {(userInput: string) => Promise<ExtractedIntent>} extractIntent
 * @property {({ block, operation }) => Promise<ExtractedSchema>} extractSchema
 * @property {(input: GenerateCatalogInput) => Promise<GenerateCatalogResult>} generateCatalog
 * @property {(input: GenerateTradeOffDocInput) => Promise<GenerateTradeOffDocResult>} generateTradeOffDoc
 */
```

이 인터페이스는 ADR 0009를 amend한다. 0009의 typedef는 두 메서드(generateCatalog, generateTradeOffDoc)를 더 가지는 자리로 갱신한다.

## 결과

### 긍정적
- ADR 0023과 결이 같다(객체 인자, 객체 반환, mock vs 실제의 책임 분담). 어댑터 인터페이스의 일관성이 늘었다
- mock의 결정성이 보존된다. 단위 테스트 5초 약속(섹션 4)이 흔들리지 않음
- claude 스텁이 한국어 안내라 사용자가 다음 PR을 기다려야 한다는 사실을 명확히 안다(섹션 8)
- 인터페이스 확장이지 변경이 아니라 기존 어댑터 호출자(prospect, forge)가 안 깨진다

### 부정적 / 트레이드오프
- claude 어댑터를 쓰는 사용자가 generateCatalog를 다음 PR까지 못 씀. mock으로 흐름은 검증 가능
- mock의 시드 그대로 결이 새 도메인을 진짜로 빚지 않음. ADR 0026 결정 2의 한계와 짝
- 반환 객체를 한 자리 감싼 비용. 호출 자리에서 한 단계 더 풀어야 함

### 미래 묶임
- generateCatalog와 generateTradeOffDoc 시그니처는 표준이다. 변경하려면 ADR이 필요
- 반환 객체에 `rationale`, `token_usage` 같은 메타 필드를 추가하는 자리는 ADR 없이도 확장 가능(인터페이스 확장의 자리). 다만 의미가 박힌 필드는 ADR로 박는 게 안전
- claude 어댑터의 generateCatalog 실제 구현은 후속 PR + 전용 ADR. structured output schema(catalog.schema.json), prompt caching, max_tokens 예산을 거기서 결정

## 링크
- 이전 결정: ADR 0009(AiAdapter 인터페이스, 이 ADR이 amend), ADR 0023(extractSchema 패턴, 같은 결), ADR 0024(claude 어댑터의 prompt caching)
- 짝 결정: ADR 0026(prospect 카탈로그 생성), ADR 0028(design.md 산출물)
- 후속 작업: claude 어댑터의 generateCatalog 실제 구현
- 관련 정책: CLAUDE.md 섹션 4(5초 약속), 섹션 8(사용자 출력 정책, 데이터 무관성)
