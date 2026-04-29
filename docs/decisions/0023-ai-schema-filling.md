# ADR 0023. AI 어댑터로 schema 채움 (extractSchema 인터페이스)

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0009가 AI 어댑터의 첫 메서드 extractIntent를 박았다. ADR 0013 결정 4가 contracts.yml의 request_schema/response_schema를 TODO 문자열로 두고 미래 ADR로 채움을 미뤘다. ADR 0014의 test_code: TODO와 ADR 0018/0019/0020/0021의 generator placeholder도 같은 결로 비어있다.

이번 ADR은 그 빈 자리 중 첫 번째(schema 채움)를 채운다. 가장 작은 자리부터 시작하는 결정. 이유 셋.

첫째, schema 채움은 데이터 채움이지 비즈니스 로직 코드가 아니다. 잘못 채워져도 사용자가 형식을 보고 즉시 고치기 쉽다. test_code 채움이나 service 본문 채움보다 위험이 작다.

둘째, ADR 0009의 mock 어댑터 인터페이스가 이미 박혀있어 메서드 한 개 추가가 자연스럽다. extractIntent와 같은 패턴(문자열/객체 입력 → 구조화된 출력)으로 extractSchema를 더한다.

셋째, schema가 채워지면 generator 4개(Node/Java/Python/Frontend)가 자기 언어의 실제 필드로 변환할 수 있다. ADR 0017 결정 7(인터페이스 우선)의 "스키마로 경계 검증" 정신이 contracts.yml에서 시작해 generated 코드까지 한 흐름으로 살아난다.

답해야 할 질문은 다음 다섯이다.

첫째, extractSchema의 입력과 출력 형식. 둘째, schema 자체의 형식(JSON Schema 부분집합 vs 자체 형식). 셋째, forge가 adapter를 어떻게 받을지. 넷째, generator가 schema를 어떻게 언어별 코드로 변환할지. 다섯째, mock 어댑터의 출력 정책(도메인 무관성).

## 검토한 옵션

### 결정 1. extractSchema 입력/출력

#### 옵션 A. ({ block, operation }) → { request, response }
- 장점: 인자가 명시적. block과 operation이 따로 있어 미래에 다른 입력(예: tech_desc 같은 보강)을 추가하기 자연스럽다. 출력도 두 자리(request/response)가 분명
- 단점: 인자 객체가 살짝 깊어짐

#### 옵션 B. (block, operation) → { request, response }
- 장점: 위치 인자라 단순
- 단점: 나중에 인자 추가하기 어려움(순서 의존)

#### 옵션 C. (contractsObject) → contractsObject
- 장점: 한 번 호출
- 단점: AI 응답 비용이 한 번에 큼. 부분 실패 시 처리 어려움

### 결정 2. schema 형식

#### 옵션 A. JSON Schema 부분집합 (type/properties/items/required)
- 장점: 표준에 가깝고 도구 호환. Fastify는 JSON Schema를 그대로 받음. OpenAPI도 거울. 다른 자리(generator, validator)에서 같은 형식 재사용
- 단점: 풀 JSON Schema의 일부만 지원하므로 미래에 더 풍부한 검증(pattern, enum 등)이 필요해질 때 ADR로 확장

#### 옵션 B. 자체 형식
- 장점: 우리 필요에 맞춤
- 단점: 표준 부재. 외부 도구가 우리 형식을 모름

#### 옵션 C. TypeScript-like 형식
- 장점: TS 친화
- 단점: Fastify(JSON Schema)와 Pydantic(Python) 같은 다른 자리에서 변환 필요

### 결정 3. forge가 adapter를 받는 방식

#### 옵션 A. 옵셔널 인자 (현재 동작 보존)
- 장점: forge를 adapter 없이 호출하면 기존 TODO 동작 유지. 점진적 도입. 기존 테스트 그대로 통과
- 단점: 두 동작 모드가 코드에 공존

#### 옵션 B. 필수 인자
- 장점: 한 동작 모드
- 단점: 모든 forge 호출이 adapter를 알아야 함. 테스트와 일관성 부담

### 결정 4. generator의 schema 변환

#### 옵션 A. 각 generator가 자기 언어로 변환 (Node JSON Schema, Java record, Python Pydantic, Frontend TS interface)
- 장점: 각 generator가 자기 언어의 관용을 그대로 표현. 변환이 generator 안에 묶여 있어 변경 영향이 한 자리
- 단점: 변환 로직이 4개 자리에 흩어짐. 공통 자리는 util.js로 추출 가능

#### 옵션 B. util.js에 통합 변환기
- 장점: 한 자리에 모임
- 단점: 4개 언어를 한 자리에서 다루면 함수가 거대해짐

### 결정 5. mock 어댑터의 schema 정책

#### 옵션 A. operation별 generic placeholder 필드 (도메인 무관)
- 장점: CLAUDE.md 섹션 8의 데이터 무관성 규칙과 정합. 모든 카탈로그에서 같은 generic 필드를 받음. 사용자가 실제 도메인 필드로 갱신
- 단점: 도메인 맞춤이 약하다. 다만 mock의 책임은 인터페이스 검증과 결정성이지 도메인 추론이 아니다(실제 LLM의 자리)

#### 옵션 B. 도메인 키워드 기반 휴리스틱
- 장점: commerce 카탈로그에서 더 그럴듯한 필드
- 단점: CLAUDE.md 섹션 8 데이터 무관성 위배. 잘못된 추론이 다른 도메인에서 노이즈

## 결정

### 결정 1: ({ block, operation }) → { request, response } (옵션 A)

extractSchema의 시그니처.

```typescript
async extractSchema({ block, operation }): Promise<{
  request: Schema | null,  // operation이 body를 안 받으면 null
  response: Schema,        // 모든 operation이 응답을 가짐
}>
```

block은 카탈로그의 block 객체(id, name, user_desc, tech_desc 등 포함). operation은 카탈로그의 operation 식별자(create/list/get/update/delete/search). 미래에 추가 컨텍스트(예: 다른 블럭 정보, 사용자 결정)가 필요해지면 같은 객체에 키를 추가.

### 결정 2: JSON Schema 부분집합 (옵션 A)

schema 형식은 다음 JSON Schema 부분집합.

```typescript
type Schema =
  | { type: 'object', properties?: Record<string, Schema>, required?: string[] }
  | { type: 'string' }
  | { type: 'integer' }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'array', items?: Schema };
```

이 부분집합으로 시작. 미래에 pattern, enum, format, minLength 같은 풍부한 검증이 필요해지면 ADR로 확장. JSON Schema 표준의 자식이라 Fastify, Pydantic, OpenAPI 같은 도구가 그대로 받는다.

contracts.yml의 request_schema/response_schema는 이제 두 형식 중 하나.
- 문자열 `TODO`: 아직 채워지지 않음(forge가 adapter 없이 실행됐거나 adapter가 의도적으로 비웠을 때)
- 위 Schema 객체: 채워진 자리

generator는 두 자리 모두 처리. TODO면 기존 빈 placeholder, 객체면 실제 필드 emit.

### 결정 3: forge에 옵셔널 adapter (옵션 A)

forge.js의 시그니처.

```js
runForge({ cwd, adapter = null, now })
```

adapter가 없으면 모든 schema가 TODO(현재 동작). adapter가 있으면 각 endpoint마다 extractSchema 호출해서 schema를 채운다.

bin/beoreum.js의 forge 핸들러는 항상 createMockAdapter()를 주입. 미래의 실제 LLM 어댑터 도입 시 같은 자리만 갱신한다.

기존 forge 테스트는 adapter 없이 호출 → 기존 동작 보존. 새 테스트는 adapter를 주입해 schema 채움 검증.

### 결정 4: 각 generator가 자기 언어로 변환 (옵션 A)

각 generator가 schema → 언어별 코드 변환을 자체적으로 처리.

| generator | schema → 코드 형식 변환                                        |
| --------- | -------------------------------------------------------------- |
| Node      | JSON Schema 그대로 (Fastify가 직접 사용)                       |
| Java      | record 필드 (`String name`, `BigDecimal amount` 등)            |
| Python    | Pydantic 필드 (`name: str`, `amount: Decimal` 등)              |
| Frontend  | TypeScript interface 필드 (`name: string`, `amount: number;`)  |

타입 매핑 표.

| Schema type | Node       | Java          | Python   | TypeScript |
| ----------- | ---------- | ------------- | -------- | ---------- |
| string      | string     | String        | str      | string     |
| integer     | integer    | Long          | int      | number     |
| number      | number     | BigDecimal    | float    | number     |
| boolean     | boolean    | Boolean       | bool     | boolean    |
| array       | array      | List<T>       | list[T]  | T[]        |
| object      | object     | (별도 record) | BaseModel| (별도 interface) |

중첩 object는 생성기마다 다르게 처리.
- Node: JSON Schema는 자연스럽게 중첩 가능
- Java: 중첩 record를 같은 파일 안에 추가 정의 또는 단순화
- Python: 중첩 BaseModel을 같은 파일에 추가 정의
- Frontend: 중첩 interface를 같은 파일에 추가 정의

이번 출시는 평면 schema(중첩 1단계)에 집중. 깊은 중첩(2단계 이상)은 미래 ADR.

### 결정 5: mock의 generic placeholder 필드 (옵션 A)

mock의 extractSchema는 operation별 generic 필드를 돌려준다. 도메인 무관(CLAUDE.md 섹션 8).

operation별 mock 출력 표.

| operation | request                                                 | response                                  |
| --------- | ------------------------------------------------------- | ----------------------------------------- |
| create    | { name?: string, description?: string }                 | { id: string, created_at: string }        |
| list      | (없음)                                                  | { items: array, total: integer }          |
| get       | (없음, path param)                                      | { id: string, name: string }              |
| update    | { name?: string, description?: string }                 | { id: string, updated_at: string }        |
| delete    | (없음)                                                  | (없음, 빈 응답)                           |
| search    | (없음, query param 자리)                                | { items: array, total: integer }          |

이 필드들은 도메인을 짐작하는 자리가 아니라 operation의 일반적 형태를 placeholder로 두는 자리. 사용자가 실제 도메인 필드로 갱신하거나 미래의 실제 LLM 어댑터가 도메인 맞춤 필드를 채운다.

mock의 출력은 deterministic. 같은 (block, operation) 입력에 같은 출력. 단위 테스트에서 결정성 보존.

## 결과

### 긍정적
- ADR 0009의 어댑터 인터페이스가 두 번째 메서드(extractSchema)로 확장된다. 미래의 실제 LLM 어댑터가 같은 자리만 채우면 다른 자리는 안 바뀐다
- contracts.yml의 schema가 실제 객체로 채워질 수 있다. forge → set 흐름에서 generated 코드의 빈 placeholder가 실제 필드로 갱신
- 4개 generator가 schema를 자기 언어 관용으로 emit. ADR 0017 결정 7(인터페이스 우선)의 정신이 카탈로그→contracts→generated 코드까지 한 흐름으로 살아난다
- mock의 도메인 무관 정책이 CLAUDE.md 섹션 8을 지킨다. commerce에 매몰되지 않는다
- adapter 옵셔널이라 점진적 도입. 기존 forge 호출은 그대로 동작

### 부정적 / 트레이드오프
- mock 출력이 generic placeholder라 사용자가 실제 도메인에 맞춰 갱신 필요. 다만 빈 TODO보다는 출발점이 명확
- JSON Schema 부분집합으로 시작해 풍부한 검증(pattern/enum/format)은 미래 ADR. 일부 사용자는 더 깊은 검증을 곧장 원할 수 있음
- 4개 generator가 각자 변환 로직을 가져 중복이 살짝. 다만 언어 관용을 명확히 표현하려면 각 자리에 두는 게 옳다
- 깊은 중첩(2단계 이상)은 미래 자리. 이번 출시는 평면 schema에 집중

### 미래 묶임
- extractSchema 시그니처는 표준이다. 변경하려면 ADR
- JSON Schema 부분집합도 표준. 풍부한 검증 추가는 별도 ADR
- 타입 매핑 표는 표준. 새 backend 언어가 들어오면 표를 amendment
- mock 출력 표(operation별 generic 필드)도 표준. 변경은 ADR
- 깊은 중첩 schema 지원은 미래 ADR
- 실제 LLM 어댑터(Claude/GPT 등) 통합은 별도 ADR
- 다른 채움(test_code, service 본문 등)은 별도 ADR(이번 ADR과 같은 패턴 재사용 예상)

## 링크
- 이전 결정: ADR 0009 (AI 어댑터 인터페이스), ADR 0013 (contracts.yml schema TODO 자리), ADR 0017 결정 7 (인터페이스 우선), ADR 0018/0019/0020/0021 (각 generator)
- 후속 작업 후보: 실제 LLM 어댑터(Claude/GPT) ADR, 깊은 중첩 schema ADR, 풍부한 검증 ADR(pattern/enum/format), test_code 채움 ADR, service 본문 채움 ADR
- 관련 정책: CLAUDE.md 섹션 0(사용자 우선순위), 섹션 4(단위 테스트 결정성), 섹션 8(데이터 무관성)
