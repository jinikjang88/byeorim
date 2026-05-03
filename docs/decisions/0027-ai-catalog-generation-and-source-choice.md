# ADR 0027. AI 카탈로그 생성과 출처 선택

- 상태: 채택
- 날짜: 2026-05-03
- 결정자: DevSmith
- 관계: ADR 0008의 결정 3에 예약된 `ai:<adapter>` source를 구현. ADR 0009의 AiAdapter 인터페이스에 generateCatalog 추가

## 맥락

지금 prospect는 빌트인 템플릿 3개(commerce, job-aggregator, reservation) 중 하나로만 시작할 수 있다. 매칭 안 되면 한국어 에러로 거부한다. 1순위 사용자(카페 사장님, 학원 원장님, 도메인 전문가, CLAUDE.md 섹션 0)의 실제 도메인 폭에 비하면 좁다. 헬스장 회원 관리, 동네 모임 게시판, 농장 직거래, 학원 평가표 같은 자리가 다 막힌다.

ADR 0008의 결정 3은 source 형식을 `template:<name>` 또는 `ai:<adapter>` 두 종류로 박았다. 이번 출시에 `ai:<adapter>` 자리를 구현한다. ADR 0009의 AiAdapter는 extractIntent와 extractSchema 둘만 갖는다. generateCatalog가 추가된다.

답을 강요하지 않는 톤(ADR 0003 결정 2)을 카탈로그 출처에도 적용한다. 빌트인이 잘 맞는 사람은 빌트인을 고르고, 안 맞는 사람은 AI를 고르고, 미리 정해진 답이 없다.

## 검토한 옵션

### 결정 1. 카탈로그 출처 선택 흐름

#### 옵션 A. template만 강제, 매칭 안 되면 에러 (현행)
- 장점: 단순. 카탈로그 품질 보장(빌트인은 손으로 다듬은 결과)
- 단점: 1순위 사용자 도메인을 다 못 담는다

#### 옵션 B. template 우선, 없으면 자동 AI 생성
- 장점: 사용자가 결정 부담 없이 흘러간다
- 단점: 사용자가 무엇을 받았는지 모르는 채 다음 단계로 간다. 답을 강요하지 않는 톤과 미세하게 어긋남(자동 결정도 결정)

#### 옵션 C. 사용자가 명시적으로 4지선다 선택
- 장점: 사용자가 출처 결정의 주체. 빌트인 추천이 있으면 (추천) 표시로 가벼운 안내. 동행 톤 유지
- 단점: 한 번의 인터랙션 추가

### 결정 2. AI 카탈로그 생성 시드

#### 옵션 A. seedTemplate 없이 처음부터 생성
- 장점: 진정한 도메인 자유. 빌트인 가정을 안 끌어들임
- 단점: 카탈로그 품질이 AI에 크게 의존

#### 옵션 B. suggested_template이 있으면 시드로 사용
- 장점: 사용자 도메인이 빌트인 근처일 때 검증된 worlds/blocks 구조를 영감으로 활용. 품질 상한이 빌트인 수준 가까이
- 단점: AI가 시드에 너무 매여 사용자 도메인을 벗어날 위험

#### 옵션 C. 항상 비슷한 도메인 시드 사용
- 장점: 항상 영감이 있음
- 단점: 시드 매칭 자체가 별도 ML 문제. 복잡도 증가

### 결정 3. AI 출력 검증

#### 옵션 A. 검증 없이 사용
- 장점: 단순
- 단점: 깨진 카탈로그가 다음 단계로 흘러감. catalog.yml을 읽는 코드(loadCatalog)가 다양한 자리에서 깨질 수 있음

#### 옵션 B. catalog.schema.json 검증 필수, 실패 시 한국어 안내로 거부
- 장점: 다음 단계가 형식을 신뢰할 수 있다. 한 자리(prospect.js)에서만 검증해 책임이 명확
- 단점: 검증 실패 시 사용자가 다른 옵션을 다시 골라야 함(흐름 마찰)

#### 옵션 C. 검증 + 사용자 검토 흐름(생성 후 보여주고 OK 받기)
- 장점: 사용자가 카탈로그 내용을 prospect 시점에 한 번 본다
- 단점: prospect가 길어진다. smelt에서 블럭이 모두 보이므로 자연스러운 검토 자리가 이미 있다

### 결정 4. AiAdapter 인터페이스 변경

ADR 0009의 AiAdapter에 generateCatalog 메서드 추가. 시그니처는 `({ answers, seedTemplate }): Promise<Catalog>`. 출력은 catalog.schema.json 검증을 통과해야 함.

mock 어댑터도 같은 인터페이스를 구현. 단위 테스트용 최소 검증 통과 카탈로그를 결정적으로 돌려준다.

## 결정

### 결정 1: 4지선다 출처 선택 (옵션 C)

체크리스트 출력 직후 `@inquirer/prompts`의 `select`로 다음 4지선다.

- commerce (쇼핑/마켓/결제)
- job-aggregator (채용/구인/일자리)
- reservation (예약/대관/클래스/강좌/시간표)
- AI가 내 도메인에 맞춰 새로 만들기

suggested_template이 있으면 그 자리에 ` (추천)` 표시 + 기본 선택. 추천이 null이면 4번이 기본 선택. 사용자가 그대로 엔터로 추천을 받아들일 수도, 다른 선택을 할 수도 있다.

`runProspect`는 `source` 인자(객체)를 받는다. `{ kind: 'template', name }` 또는 `{ kind: 'ai' }`. 인자가 생략되면 PR-A 동작 보존(suggested_template으로 자동, 매칭 안 되면 에러). interactiveProspect가 askCatalogSource를 부르고 그 결과를 source로 전달.

### 결정 2: suggested_template을 시드로 사용 (옵션 B)

`adapter.generateCatalog({ answers, seedTemplate })`. seedTemplate은 nullable. 시드가 있으면 어댑터 프롬프트에 그 자리도 함께 전달해 영감으로 쓰게 한다. 시드 강제 채택은 아니고, AI가 사용자 도메인이 시드와 다르면 자유롭게 변형.

### 결정 3: catalog.schema.json 검증 필수 (옵션 B)

prospect.js의 `resolveCatalogSource`에서 AI 출력을 받자마자 `validateCatalog`로 검사. 검증 실패 시 한국어 메시지로 안내한다.

```
AI가 만든 카탈로그가 형식 검증에 걸렸어요. 빌트인 템플릿(commerce, job-aggregator, reservation) 중 하나를 골라보시겠어요?
검증 오류: [상세 3개]
```

상세 검증 오류는 첫 3개만 보여 노이즈를 줄인다. --verbose 자리는 후속 출시.

검증 자리는 한 곳(prospect.js)으로만 둔다. AI 어댑터(claude.js, mock.js)는 검증 안 함. 한 자리에서만 책임지는 결로 catalog.schema.json이 진실의 자리(섹션 8 패턴 일관성).

### 결정 4: AiAdapter에 generateCatalog 추가

```ts
generateCatalog({ answers: ProspectAnswers, seedTemplate?: string|null }): Promise<Catalog>
```

ADR 0009 본문에는 머리에 "generateCatalog 메서드가 ADR 0027로 추가됨" 한 줄 추가. ADR 0027이 이 메서드의 약속을 모두 담는다.

### Catalog 타입

`packages/ai/src/adapter.js`의 typedef. `packages/catalog/schemas/catalog.schema.json`의 모양.

```js
/**
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
```

### claude 어댑터의 generateCatalog 구현

별도 시스템 프롬프트(CATALOG_SYSTEM_PROMPT)를 두고 max_tokens를 8192로 늘린다. 카탈로그가 길어 평면 응답(intent/schema의 1024)으로는 부족.

structured output schema는 catalog.schema.json의 부분집합을 직접 작성. SDK가 받을 수 있는 JSON Schema 부분집합으로 옮긴 것. catalog.schema.json이 진실의 자리이고 SDK 호환을 위한 미러로 둔다. 두 자리가 어긋나면 prospect.js 검증에서 잡힌다.

## 결과

### 긍정적
- 1순위 사용자가 빌트인 3개 박스에 안 들어가는 도메인이어도 prospect를 통과한다. 헬스장, 농장 직거래, 학원 평가표 등이 모두 가능
- 사용자가 출처 결정의 주체다. 답을 강요하지 않는 톤(ADR 0003 결정 2) 정합
- ADR 0008 결정 3의 `ai:<adapter>` 자리가 드디어 구현됨. 미래 묶임이 풀림
- AiAdapter가 세 메서드(extractIntent, extractSchema, generateCatalog)를 갖는다. 역할 분화가 명확

### 부정적 / 트레이드오프
- 카탈로그 품질이 AI에 의존. 빌트인 commerce는 ADR 0005~0024에 걸쳐 다듬은 결과물이라 AI 출력이 같은 깊이를 한 번에 내기 어렵다
- max_tokens 8192는 호출당 비용이 적지 않다. 사용자가 의도적으로 AI 옵션을 골랐을 때만 호출되므로 통제는 됨
- AI 카탈로그가 cascades나 dependencies가 빈 채로 나오면 다음 단계(smelt)에서 사용자가 답을 적을 자리가 줄어든다. 후속 출시에서 AI에게 cascades 채우기를 더 강하게 안내할 자리

### 미래 묶임
- generateCatalog 시그니처(`{ answers, seedTemplate }`) 표준. 변경하려면 ADR이 필요
- catalog.schema.json이 진실의 자리. structured output schema는 그 미러일 뿐. 변경 시 두 자리 동기화
- AI 출력 검증은 한 자리(prospect.js의 resolveCatalogSource)에서만. 다른 자리에서 검증 추가 시 책임 분산이 일어나므로 새 ADR로 명시화
- 4지선다 옵션 4개는 표준. 빌트인 템플릿이 추가되거나 AI 어댑터가 여러 개 동시에 등장하면 옵션 구성이 변함(향후 ADR)

## 링크
- 이전 결정: ADR 0008 (intent.yml 형식, 결정 3의 ai:<adapter> 예약 자리)
- 갱신 대상: ADR 0009 (AI 어댑터 인터페이스, generateCatalog 추가)
- 짝 결정: ADR 0026 (Prospect 7항목, generateCatalog의 입력 모양)
- 동행 톤: ADR 0003 결정 2
- 인터랙티브 패턴: ADR 0011 결정 5 (askInput, askAnswers의 정신을 askCatalogSource로 잇는다)
- 관련 정책: CLAUDE.md 섹션 2(절대 금지선 6번 벤더 무관), 섹션 8(데이터 무관성, 패턴 일관성)
