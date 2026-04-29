# ADR 0009. AI 어댑터 인터페이스

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

CLAUDE.md 섹션 2의 절대 금지선 6번이 "특정 AI 벤더에 종속시키지 않는다"고 박았다. .beoreum/ 디렉토리는 Claude로도, GPT로도, Gemini로도, 미래의 어떤 모델로도 읽을 수 있어야 한다. 모델 어댑터는 packages/ai/ 안에서만 산다.

이번 출시는 prospect 단계가 사용자의 자연어 한 마디에서 의도를 추출한다. 추출 작업은 AI 호출이 필요하다. 그러나 실제 LLM(Claude, GPT, Gemini)을 붙이기 전에 두 가지가 먼저다.

첫째, 어댑터의 인터페이스를 정해야 한다. prospect 코드가 어떤 메서드를 호출하면 어떤 형태의 응답을 받을지 정해야 다음 단계 코드가 그 위에 올라설 수 있다.

둘째, 결정적 mock 구현이 필요하다. 단위 테스트가 AI 호출에 의존하면 테스트가 비결정적이고 비용도 든다. CLAUDE.md 섹션 4가 단위 테스트는 5초 미만이라고 박아둔 자리에 LLM 호출이 들어갈 수 없다. mock 어댑터가 한국어 키워드 휴리스틱으로 결정적 응답을 돌려준다. 미래에 실제 어댑터가 들어올 때 같은 인터페이스를 구현하면 prospect 코드는 한 줄도 바뀌지 않는다.

## 검토한 옵션

### 결정 1. 인터페이스 정의 방식

#### 옵션 A. JSDoc + 타입 주석으로 계약 문서화
- 장점: TypeScript 도입 없이도 IDE 자동 완성과 타입 체크가 동작. ESM 환경에 자연스럽다. 한 파일에 인터페이스 약속을 적어두면 미래 어댑터가 그 자리를 따른다
- 단점: 런타임에 강제되지 않는다. 어댑터가 약속을 안 지켜도 호출 시점까지 모를 수 있다

#### 옵션 B. TypeScript 도입
- 장점: 컴파일 시점 타입 강제
- 단점: 빌드 단계가 추가됨. 지금은 src를 그대로 실행하는 ESM 환경이라 빌드 도구를 끌어들이는 비용이 크다. CLAUDE.md 섹션 8 "Node.js ESM, Node 18 이상"과 충돌

#### 옵션 C. 런타임 검증 (zod 등)
- 장점: 런타임에 응답 형식 강제
- 단점: 외부 라이브러리 의존. 어댑터마다 검증 코드 중복

### 결정 2. 첫 메서드 시그니처

#### 옵션 A. extractIntent(userInput) → { what, who, why, suggested_template }
- 장점: prospect의 두 일(의도 추출, 카탈로그 추천)을 한 호출로 끝냄. 지연 시간 단축
- 단점: 한 메서드에 두 책임이 묶임

#### 옵션 B. extractIntent(userInput) → { what, who, why } 와 suggestTemplate(intent) → templateName 분리
- 장점: 단일 책임 원칙. 미래에 추출 결과로 다른 일(예: 직접 카탈로그 생성)을 하기 좋음
- 단점: AI 호출이 두 번이 됨. mock에서는 비용이 0이지만 실제 어댑터에서는 두 배

#### 옵션 C. 한 호출로 묶되 응답을 자유 형식으로
- 장점: 유연
- 단점: 절대 금지선 6번과 충돌. 형식이 흩어짐

### 결정 3. 어댑터 인스턴스 생성 방식

#### 옵션 A. 팩토리 함수 (createMockAdapter, createClaudeAdapter)
- 장점: 어댑터별 설정(API 키, 모델 이름)을 인자로 받기 쉽다
- 단점: 사용처에서 import + 호출 두 단계

#### 옵션 B. 싱글턴 (mockAdapter, claudeAdapter)
- 장점: import만 하면 바로 사용
- 단점: 설정을 어떻게 주입할지 애매. 환경 변수 의존이 늘어남

### 결정 4. 어댑터 선택 방식

#### 옵션 A. 호출자가 어댑터 인스턴스를 직접 받음 (의존성 주입)
- 장점: 테스트가 mock을 쉽게 주입. 단일 책임. CLAUDE.md 섹션 4의 단위 테스트 5초 미만 보장이 자연스러움
- 단점: bin/beoreum.js 같은 엔트리에서 어댑터 선택 로직이 필요

#### 옵션 B. 환경 변수 또는 설정 파일로 자동 선택
- 장점: 사용자가 명시적으로 안 해도 동작
- 단점: 테스트에서 환경 변수 mocking이 까다로움. 의존성이 숨겨짐

## 결정

### 결정 1: JSDoc + 타입 주석으로 계약 문서화 (옵션 A)

`packages/ai/src/adapter.js`에 @typedef로 인터페이스를 적는다. 어댑터 구현체는 같은 시그니처의 함수를 export한다. TypeScript는 도입하지 않는다(섹션 8 정책 보존).

미래에 어댑터가 늘어나면서 검증이 필요해지면 그때 zod 같은 도구를 별도 ADR로 결정한다.

### 결정 2: 한 호출로 묶음 (옵션 A)

이번 출시의 첫 메서드는 다음 시그니처를 가진다.

```js
async function extractIntent(userInput: string): Promise<ExtractedIntent>

type ExtractedIntent = {
  what: string;
  who: string;
  why: string;
  suggested_template: string | null;
}
```

`suggested_template`는 어댑터가 사용자 입력을 보고 추천하는 빌트인 템플릿 이름(예: `commerce`, `job-aggregator`). 추천할 수 없으면 `null`이다. 호출자(prospect)가 이 값을 본 뒤 카탈로그를 어떻게 가져올지 결정한다.

추출과 추천을 분리하지 않은 이유는 mock 어댑터가 이미 한 휴리스틱으로 둘 다 처리하기 때문이다. 미래에 실제 LLM 어댑터에서 두 일을 분리하는 게 나으면 그때 ADR로 갱신한다(메서드 추가는 인터페이스 확장이지 변경이 아니라 ADR 부담이 작다).

### 결정 3: 팩토리 함수 (옵션 A)

`createMockAdapter()`처럼 팩토리 함수가 어댑터 객체를 만든다. 미래의 `createClaudeAdapter({ apiKey, model })` 같은 인자도 자연스럽게 받을 수 있다.

어댑터 객체는 위 결정 2의 메서드를 가진 평범한 객체다.

### 결정 4: 의존성 주입 (옵션 A)

prospect의 본체 함수(runProspect)는 어댑터를 인자로 받는다. bin/beoreum.js가 어댑터를 만들어 주입한다. 단위 테스트는 mock 어댑터를 직접 주입한다.

이번 출시는 환경 변수 기반 어댑터 선택을 하지 않는다. 어댑터가 mock 하나뿐이라 선택할 자리가 없다. 실제 LLM 어댑터가 들어올 때 어댑터 선택 로직(환경 변수 또는 플래그)을 별도 ADR로 결정한다.

### 인터페이스 정리

```js
/**
 * @typedef {object} ExtractedIntent
 * @property {string} what - 무엇을 만들고 싶은지
 * @property {string} who - 누구를 위해 만드는지 (비어있을 수 있음)
 * @property {string} why - 왜 만드는지 (비어있을 수 있음)
 * @property {string|null} suggested_template - 추천 빌트인 템플릿 이름 또는 null
 */

/**
 * @typedef {object} AiAdapter
 * @property {string} name - 어댑터 식별자 (mock, claude, gpt 등)
 * @property {(userInput: string) => Promise<ExtractedIntent>} extractIntent
 */
```

mock 어댑터의 동작은 다음과 같다.

- 입력이 commerce 키워드(쇼핑, 마켓, 주문, 결제 등)를 포함하면 suggested_template = 'commerce'
- 입력이 채용 키워드(채용, 구인, 일자리, 공고 등)를 포함하면 suggested_template = 'job-aggregator'
- 둘 다 아니면 suggested_template = null
- what은 입력 그대로 (또는 첫 명사구), who와 why는 빈 문자열

휴리스틱이 단순한 이유는 mock의 책임이 결정성과 인터페이스 검증이지 실제 의도 추출이 아니기 때문이다. 실제 추출은 미래의 LLM 어댑터가 한다.

## 결과

### 긍정적
- 절대 금지선 6번이 인터페이스에 박혔다. mock과 미래의 Claude/GPT/Gemini 어댑터가 모두 같은 시그니처를 따른다. prospect 코드는 어댑터 종류를 모른다
- 단위 테스트가 결정적이고 빠르다. mock을 주입하면 LLM 호출 없이 흐름 전체를 검증한다. CLAUDE.md 섹션 4의 5초 미만 약속이 지켜진다
- 의존성 주입이라 prospect의 단위 테스트가 단단하다. 어댑터 선택 로직과 prospect 본체가 분리된다
- 한 호출로 묶어서 mock에서도 실제 어댑터에서도 호출 횟수가 같다. 비용 추적이 단순하다

### 부정적 / 트레이드오프
- JSDoc 계약은 런타임에 강제되지 않는다. 어댑터 구현이 약속을 어기면 호출 시점까지 모른다. 다만 단위 테스트가 결과 형식을 단언하므로 신규 어댑터를 들일 때 테스트가 막아준다
- 추출과 추천을 한 호출에 묶으면 미래에 분리 필요해질 수 있다. 그때 메서드 추가로 대응(인터페이스 확장이라 호환성 깨짐 작음)
- 환경 변수 기반 어댑터 선택을 안 하므로 사용자가 어댑터를 명시적으로 골라야 한다. mock 하나뿐인 이번 출시는 그런 선택이 없지만, Claude 어댑터가 들어오면 자리를 만들어야 한다

### 미래 묶임
- AiAdapter 인터페이스(name, extractIntent 시그니처)는 표준이다. 변경하려면 ADR이 필요하다
- 어댑터는 packages/ai 안에 산다. 다른 패키지에서 직접 LLM API를 호출하지 않는다(섹션 3 의존성 방향)
- mock 어댑터의 휴리스틱은 단위 테스트의 단언과 묶여있다. 휴리스틱이 바뀌면 테스트도 함께 갱신
- 어댑터 선택 로직(환경 변수, 플래그)은 후속 ADR로 결정한다

## 링크
- 이전 결정: ADR 0008 (intent.yml 형식, ExtractedIntent와 짝)
- 후속 작업: 실제 LLM 어댑터(Claude, GPT, Gemini), 어댑터 선택 로직
- 관련 정책: CLAUDE.md 섹션 2(절대 금지선 6번 벤더 무관), 섹션 3(packages/ai만 LLM 호출), 섹션 4(단위 테스트 5초 미만)
