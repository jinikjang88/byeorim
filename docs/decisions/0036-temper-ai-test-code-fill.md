# ADR 0036. Temper AI test_code 채움 (fillTestCode 인터페이스)

- 상태: 채택
- 날짜: 2026-05-05
- 결정자: DevSmith
- 관계: ADR 0014 결정 4(test_code TODO)를 푸는 자리. ADR 0023(extractSchema)과 같은 결로 어댑터에 메서드 한 개 추가. ADR 0009의 AiAdapter 인터페이스 확장

## 맥락

ADR 0014가 temper의 산출물(test-scenarios.yml) 형식을 박았다. 결정 4에서 각 시나리오의 `test_code` 필드는 `TODO` 문자열로 두고 자동 생성 결정은 별도 ADR로 미뤘다. 이번 ADR이 그 자리.

forge가 같은 결을 ADR 0023에서 풀었다. extractSchema 메서드를 어댑터에 추가하고, runForge에 옵셔널 어댑터 인자를 두어 후행 호환을 살리고, mock은 결정적 placeholder, claude는 실제 LLM 호출. 같은 결을 temper에 옮긴다.

답해야 할 질문은 다섯이다.

첫째, fillTestCode의 입력과 출력 형식. 둘째, 호출 단위(시나리오/endpoint/블럭). 셋째, mock 어댑터의 출력 정책(언어 무관성). 넷째, claude 어댑터의 정책(architecture.language 활용). 다섯째, runTemper의 어댑터 받는 방식.

## 검토한 옵션

### 결정 1. fillTestCode 입력/출력

#### 옵션 A. ({ block, endpoint, scenario, architecture }) → string
- 장점: 한 시나리오에 한 번 호출. 입력에 4개 자리(block의 도메인 의미, endpoint의 method/path, scenario의 GWT 텍스트, architecture의 언어)를 모두 보내 LLM이 풍부한 코드 짤 수 있음
- 단점: 시나리오마다 한 번 호출이라 LLM 비용이 크다. happy_path 한 개 × 블럭 N개 × endpoint 5개 = N*5 호출

#### 옵션 B. ({ block, endpoint, scenarios, architecture }) → string[]
- 장점: 한 endpoint의 여러 시나리오를 한 번에 채움. 미래에 happy_path 외 시나리오(에러/엣지)가 들어와도 한 호출로 묶음
- 단점: 이번 출시는 시나리오 한 개라 묶을 자리 없음. 옵션 A와 호출 횟수 같음

#### 옵션 C. ({ contracts, scenarios, architecture }) → 모든 코드
- 장점: 한 번 호출
- 단점: 응답 토큰이 한 번에 큼. 부분 실패 시 처리 어려움. 카탈로그가 클 때 응답이 잘림

### 결정 2. 호출 단위

#### 옵션 A. 시나리오 단위(결정 1 옵션 A와 짝)
- 장점: 단순. 부분 실패 시 영향 한 시나리오. extractSchema(endpoint 단위)와 결이 같음
- 단점: 호출 횟수 많음

#### 옵션 B. endpoint 단위(결정 1 옵션 B와 짝)
- 장점: 호출 횟수 절반(endpoint 5개 × 시나리오 1개 vs 5*1)
- 단점: 이번 출시는 endpoint당 시나리오 1개라 절감 효과 없음. 미래에 시나리오가 늘어나면 전환 자리

#### 옵션 C. 블럭 단위
- 장점: 호출 횟수 더 적음
- 단점: 한 블럭에 endpoint 5개라 응답 토큰이 큰 자리. 부분 실패 영향 큼

### 결정 3. mock 정책

#### 옵션 A. 언어 무관 의도 한 줄(`// TODO: <given>을 준비하고 <when>을 호출해 <then>을 검증한다`)
- 장점: 언어가 들어와도 자동으로 어울림. 도메인 무관(CLAUDE.md 섹션 8). 시나리오의 GWT 텍스트를 그대로 인용해 사용자가 다음 채울 자리를 명확히 봄. mock의 책임은 인터페이스 검증과 결정성이지 도메인 추론이 아니다(실제 LLM의 자리)
- 단점: 실제 코드가 아니라 사용자가 결국 채워야 함. 다만 빈 TODO보다는 출발점이 명확

#### 옵션 B. 언어별 코드 골격(architecture.language로 분기)
- 장점: 사용자가 받자마자 자기 언어의 코드 모양을 봄
- 단점: 4개 언어 × operation별 표가 필요. mock에 도메인 추론 부담 들어감(블럭 이름을 코드에 넣어야 자연스러움). CLAUDE.md 섹션 8 데이터 무관성과 결이 어긋남. extractSchema의 mock과 결이 다름

#### 옵션 C. 빈 문자열(어댑터가 못 채움 신호)
- 장점: 가장 안전
- 단점: TODO 문자열보다 약하다. 사용자가 빈 자리를 보면 막막함. ADR 0023의 mock 결과 어긋남(mock은 빈 자리 안 둠)

### 결정 4. claude 정책

#### 옵션 A. architecture.language별 프레임워크 코드 생성(node→Vitest/Fastify, java→JUnit/Spring, python→pytest/FastAPI, frontend는 해당 없음)
- 장점: 사용자가 자기 스택의 실제 테스트 코드를 받음. 시나리오 GWT를 코드 단언으로 옮긴 자리
- 단점: 4개 언어 × 프레임워크 표가 system prompt에 박힘. 표가 길어짐. 미래에 프레임워크 변경 시 system prompt 변경

#### 옵션 B. 언어 무관 의사 코드(pseudocode)
- 장점: 한 시스템 프롬프트
- 단점: 사용자가 자기 언어로 옮겨야 함. 비기술 창업자에게 부담

#### 옵션 C. mock과 같은 의도 한 줄
- 장점: claude도 mock과 같은 결
- 단점: claude의 도메인 시각이 살아남지 않음. extractSchema에서 claude가 도메인 필드 추정한 결과 어긋남

### 결정 5. runTemper의 어댑터 받는 방식

#### 옵션 A. 옵셔널 인자(현재 동작 보존)
- 장점: 기존 호출자(테스트, 비대화 자리)가 그대로 통과. 점진적 도입. ADR 0023(forge)와 같은 결
- 단점: 두 동작 모드(adapter 있음/없음)가 코드에 공존. 다만 한 자리에 명확히 분기

#### 옵션 B. 필수 인자
- 장점: 한 동작 모드
- 단점: 후행 호환 깨짐. 모든 호출자가 어댑터를 알아야 함

## 결정

### 결정 1: ({ block, endpoint, scenario, architecture }) → string (옵션 A)

fillTestCode 시그니처.

```typescript
async fillTestCode({
  block: { id, name, user_desc?, tech_desc? },
  endpoint: { operation, method, path, description? },
  scenario: { kind, given, when, then },
  architecture: { language, database, api_style, architecture_pattern },
}): Promise<string>
```

출력은 test_code 문자열 한 자리. 빈 문자열도 허용(어댑터가 못 채울 자리). null이면 호출자가 TODO로 폴백.

### 결정 2: 시나리오 단위 (옵션 A)

시나리오마다 한 번 호출. extractSchema(endpoint 단위, ADR 0023)와 같은 결이라 이미 사용자가 익숙한 호출 패턴.

이번 출시는 endpoint당 시나리오 1개라 호출 수 = endpoint 수. claude 어댑터에서 LLM 호출이 N*5번 자리지만 prompt caching(시스템 프롬프트 재사용)이 절감. 미래에 시나리오가 늘면 호출 단위 변경 자리는 별도 ADR.

### 결정 3: mock은 언어 무관 의도 한 줄 (옵션 A)

mock의 출력 형식.

```
// TODO: <given>을 준비하고 <when>을 호출해 <then>을 검증한다
```

세 자리(given/when/then)는 시나리오 텍스트를 그대로 인용. 도메인 무관(CLAUDE.md 섹션 8). 한 줄 주석이라 언어가 무엇이든 문법적으로 어울림(JS/Java/Python/TS의 `//` 주석은 모두 `//`로 시작하지만 Python은 `#`이라 어색. 그래도 사용자가 한 글자만 바꾸면 됨. 또는 단순한 의도 텍스트로 두고 코드 주석 마커는 빼는 결도 가능).

깊이 고민하지 않고 `//`를 둔다. node와 java가 가장 빈번한 자리. python 사용자는 한 글자만 바꾸면 됨. 결정성이 더 중요하다.

mock은 결정적. 같은 (block, endpoint, scenario) 입력에 같은 출력. 단위 테스트 결정성 보존.

### 결정 4: claude는 architecture.language별 프레임워크 코드 (옵션 A)

claude의 system prompt는 architecture.language를 받아 그 언어의 빈번한 테스트 프레임워크로 코드를 짜준다. 표는 다음 결로 박는다.

| language  | 프레임워크          | 라이브러리 결                                |
| --------- | ------------------- | -------------------------------------------- |
| node      | Vitest 또는 node:test | 표준 node:test가 안전. supertest로 HTTP 호출 |
| java      | JUnit 5 + RestAssured | Spring Boot Test 호환                        |
| python    | pytest + httpx       | FastAPI TestClient 호환                      |

architecture.language가 위 셋이 아니거나 누락이면 의사 코드로 폴백.

system prompt는 도메인 무관. 블럭 이름과 path는 user 메시지로 들어감(CLAUDE.md 섹션 8 데이터 무관성).

응답 형식: structured output JSON Schema로 `{ test_code: string }`. extractSchema와 같은 결.

prompt caching breakpoint를 시스템 프롬프트 끝에 박아 반복 호출 비용 절감(ADR 0024).

### 결정 5: runTemper에 옵셔널 어댑터 (옵션 A)

runTemper 시그니처.

```js
runTemper({ cwd, adapter = null, now })
```

adapter가 없거나 fillTestCode 메서드가 없으면 모든 test_code가 TODO(현재 동작). adapter가 있으면 각 시나리오마다 fillTestCode를 호출해 채움.

bin/byeorim.js의 temper 핸들러는 항상 selectAdapter()의 결과를 주입. ADR 0023 forge와 같은 결.

기존 runTemper 호출자(테스트)는 adapter 없이 호출 → 기존 동작 보존. 새 테스트는 adapter 주입해 채움 검증.

architecture.yml은 runTemper가 직접 읽는다(forge가 같은 결로 architecture.yml 읽고 archApiStyle 검증함). architecture가 없으면 fillTestCode를 안 부르고 TODO 그대로(graceful).

## 결과

### 긍정적
- ADR 0014 결정 4(test_code TODO)의 미래 ADR 자리가 채워진다. test-scenarios.yml의 빈 자리가 의미 있는 코드로 채워질 수 있음
- AiAdapter 인터페이스가 fillTestCode 메서드로 자라남. 새 어댑터(GPT, Gemini)도 같은 결로 구현. ADR 0009의 결을 유지
- mock의 출력이 도메인 무관 한 줄이라 사용자가 채울 자리를 명확히 봄. 빈 TODO보다 친절
- claude의 출력이 architecture.language별 실제 프레임워크 코드라 사용자가 자기 스택의 시작점을 받음
- runTemper의 옵셔널 어댑터 결이 ADR 0023(forge)와 짝이라 두 단계가 같은 사용 패턴
- 후행 호환: 기존 runTemper({ cwd })는 그대로 동작(adapter 없으면 TODO)

### 부정적 / 트레이드오프
- claude 어댑터에서 LLM 호출이 시나리오마다 한 번이라 토큰 비용이 큼. prompt caching으로 절감하지만 N*5 호출 자체는 줄지 않음. 미래에 호출 단위 변경 자리(ADR)
- mock의 한 줄이 모든 언어에 어울리지 않음(python은 `#` 주석). 한 글자 차이라 무겁지 않지만 미세한 어색함
- claude의 프레임워크 표(node→node:test, java→JUnit, python→pytest)가 system prompt에 박혀 미래에 프레임워크 변경 시 prompt 변경. 다만 흔한 프레임워크라 안정적
- architecture.language가 표준 옵션 밖(예: kotlin, go)일 때는 의사 코드로 폴백. 사용자에게 미세한 실망. 다만 ADR 0012가 표준 옵션을 박은 결로 흐름이 일관

### 미래 묶임
- fillTestCode 시그니처는 표준이다. 변경하려면 ADR
- 호출 단위(시나리오 단위)는 표준. 호출 단위 변경(endpoint/블럭 단위)은 별도 ADR
- mock 출력 형식(`// TODO: ...`)은 표준. 변경은 ADR
- claude의 프레임워크 매핑 표(node→node:test, java→JUnit, python→pytest)는 표준. 새 언어 추가 시 표 amendment ADR
- runTemper의 옵셔널 어댑터 결은 표준 후행 호환 약속. 깨려면 ADR
- 이 ADR은 happy_path 시나리오 한 자리에 한정. 다른 종류(에러/엣지/속성)가 들어오면 시나리오 종류별 prompt가 필요할 수 있음(별도 ADR)

## 링크
- 짝 결정: ADR 0023 (forge의 extractSchema, 같은 결을 temper에 옮김)
- 갱신 대상: ADR 0009 (AI 어댑터 인터페이스, fillTestCode 추가), ADR 0014 결정 4(test_code TODO 자리를 푸는 ADR)
- 입력 의존: ADR 0012 (architecture.yml의 language 필드), ADR 0013 (contracts.yml의 endpoint), ADR 0014 (test-scenarios.yml 형식)
- 후속 작업 후보: 호출 단위 변경(endpoint/블럭 단위), 시나리오 종류별 prompt(에러/엣지/속성), 언어 추가 시 프레임워크 매핑 amendment, frontend 시나리오 자리(있을지 검토)
- 관련 정책: CLAUDE.md 섹션 0(사용자 우선순위), 섹션 4(테스트 결정성), 섹션 8(데이터 무관성), 섹션 10(글쓰기 원칙)
