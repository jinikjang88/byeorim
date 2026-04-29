# ADR 0005. 카탈로그 스키마와 검증 라이브러리 선택

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0004에서 forge-protocol v0.1.0의 코드를 새 구조에 그대로 옮기지 않고 알고리즘만 이해해서 다시 짜기로 했다. 다만 데이터 한 가지는 예외였다. `templates/commerce/catalog.yml`과 `templates/job-aggregator/catalog.yml`은 직접 가져온다고 명시했다.

데이터를 가져오는 첫 단계에서 카탈로그 스키마가 필요하다. 이유는 세 가지다.

첫째, CLAUDE.md 섹션 4의 CI 게이트가 "생성된 .beoreum/ 디렉토리가 packages/catalog/schemas/의 JSON 스키마를 통과한다"고 못 박았다. 스키마 자체가 아직 없다. 만들어야 한다.

둘째, 절대 금지선 6번(특정 AI 벤더에 종속시키지 않는다)이 카탈로그 형식의 표준화를 요구한다. Claude로 만든 카탈로그를 GPT나 Gemini도 그대로 읽을 수 있어야 한다. 사람이 읽을 수 있고 검증 가능한 형식이 핵심이다.

셋째, 두 도메인 데이터를 직접 살펴보니 현재 스키마가 일관되지 않다. commerce에는 `analogy`, `api_style`, World의 `order`가 있는데 job-aggregator에는 없다. 반대로 job-aggregator의 `icon`은 commerce에 없다. dependency의 부연 텍스트는 commerce에선 `condition`, job-aggregator에선 `reason`으로 같은 의미가 두 이름으로 흩어져 있다. 이대로 두면 미래 카탈로그가 더 흩어진다.

검증 라이브러리는 별도 결정이다. JSON Schema 표준을 쓰는 ajv, 코드로 스키마를 짜는 Zod, 직접 작성한 커스텀 검증 셋이 후보다. 라이브러리 선택은 카탈로그가 어떤 형태로 외부에 노출되느냐에 따라 다르다.

## 검토한 옵션

### 결정 1. 스키마 정의 형식

#### 옵션 A. JSON Schema 파일 (.json)
- 장점: W3C 표준 비슷한 위상으로 도메인 외부에서도 통한다. 다른 언어와 도구에서 그대로 읽을 수 있다(Python, Go, Java IDE 자동 완성 등). 절대 금지선 6번 정신과 부합한다. JSON Schema Reference로 카탈로그 스키마를 한 자리에 모을 수 있다
- 단점: 동적 검증 로직(ID 참조 무결성 등)을 표준 안에 못 담는다. 별도 함수로 보강해야 한다

#### 옵션 B. Zod 코드 스키마 (.js/.ts)
- 장점: TypeScript와 결이 잘 맞고 런타임 타입 추론이 강하다. 한 파일에서 검증과 타입을 같이 정의할 수 있다
- 단점: Zod에 종속된다. 다른 언어 도구가 카탈로그 스키마를 읽으려면 Zod 표현을 알아야 한다. JavaScript 외 도구에서는 무용지물이다

#### 옵션 C. 커스텀 검증 함수
- 장점: 의존성이 없다. 정확히 원하는 메시지를 만들 수 있다
- 단점: 표준 부재로 외부 도구가 활용하지 못한다. 검증 코드가 늘어날수록 유지보수 부담이 빠르게 증가한다

### 결정 2. 검증 라이브러리

JSON Schema 형식을 채택한 뒤 그것을 실행할 라이브러리.

#### 옵션 A. ajv
- 장점: Node.js 진영의 사실상 표준 JSON Schema 검증기다. Draft 2020-12까지 지원한다. 빠르고 가볍다. CLI에서도 쓸 수 있다
- 단점: 메시지가 기본적으론 영문이다. 한국어 메시지로 바꾸려면 매핑 레이어가 필요하다

#### 옵션 B. 기타 JSON Schema 검증기
- 장점: 라이선스나 성능 차이가 미세하게 있을 수 있다
- 단점: ajv가 가장 많이 쓰여서 대안을 고를 결정적 이유가 없다

### 결정 3. 두 도메인의 필드 차이 처리

#### 옵션 A. 관대한 스키마 (필수 필드 최소, 차이 필드 모두 옵션)
- 장점: 두 도메인 데이터를 그대로 받아들일 수 있다. 이전 작업이 막히지 않는다. 카탈로그가 자라면서 어떤 필드가 진짜 표준인지 자연스럽게 드러난다
- 단점: 스키마가 약하다. 잘못된 데이터를 늦게 발견할 위험이 있다

#### 옵션 B. 엄격한 스키마 (모든 필드 표준화)
- 장점: 데이터 일관성이 처음부터 강하다
- 단점: 이전 작업과 정규화 작업이 한 PR에 섞인다. 두 일을 한 번에 하면 어느 쪽도 잘 안 된다. 어떤 필드가 표준인지 충분한 데이터 없이 결정해야 한다

#### 옵션 C. 두 도메인을 별도 스키마 버전으로 둔다
- 장점: 각 도메인의 특성을 보존
- 단점: 도메인 추가할 때마다 스키마가 늘어난다. 카탈로그가 보편 형식이라는 정신과 어긋난다

### 결정 4. ID 참조 무결성 검증 위치

dependency의 source/target이 blocks에 존재하는지 같은 검증을 어디서 할지.

#### 옵션 A. JSON Schema 안에 넣기 (uniqueItems, $data 등)
- 장점: 한 자리에 검증 모음
- 단점: JSON Schema의 $data 확장은 비표준이다. 다른 도구 호환성을 깨뜨린다. 결정 1의 의도와 반대로 간다

#### 옵션 B. 별도 검증 함수 (validateReferences)
- 장점: 표준 JSON Schema는 그대로 두고, 의미 검증을 명시적인 코드로 분리한다. 외부 도구는 표준 부분만 쓰면 된다
- 단점: 두 단계 검증이 된다(스키마 검증과 참조 무결성 검증)

## 결정

### 결정 1: JSON Schema 파일 (옵션 A)

`packages/catalog/schemas/catalog.schema.json`에 JSON Schema 2020-12로 카탈로그 형식을 정의한다. 다른 언어 도구가 카탈로그를 읽고 검증할 수 있어야 한다는 절대 금지선 6번 정신을 따른다.

스키마는 catalog 최상위 수준에서 worlds, bundles, blocks, dependencies, cascades, prerequisites 6개 섹션을 정의한다. blocks와 worlds는 필수이고 나머지는 선택이다.

### 결정 2: ajv 채택 (옵션 A)

Node 진영의 사실상 표준이다. Draft 2020-12 지원, 빠른 속도, 가벼운 의존성이라는 장점이 명확하다. 한국어 에러 메시지가 필요해지면 그때 ajv-i18n이나 자체 매핑 레이어를 추가한다. 초기 단계는 영문 메시지로 충분하다.

ajv의 strict 옵션은 켠다. 알려지지 않은 키워드를 만나면 빌드를 실패시킨다.

### 결정 3: 관대한 스키마 시작 (옵션 A)

worlds와 blocks만 필수이고, bundles, dependencies, cascades, prerequisites는 옵션이다. 각 항목 안의 필드도 핵심만 필수로 둔다. 차이 필드(`analogy`, `icon`, `api_style`, `order`, `condition`, `reason`)는 모두 옵션이다.

condition과 reason은 같은 의미가 두 이름으로 흩어진 자리다. 둘 다 옵션으로 받되, 미래에 표준 이름 한 개로 통합하는 결정은 별도 ADR로 한다. 데이터 이전이 먼저다.

스키마가 자랄 때 어떤 필드를 필수로 올릴지는 카탈로그 진화 노트(`docs/catalog-evolution/`)로 추적한다.

### 결정 4: 별도 함수로 참조 무결성 검증 (옵션 B)

JSON Schema는 형식만 본다. 다음 의미 규칙은 `packages/catalog/src/validate.js`의 `validateReferences()`가 본다.

- bundle.world_id가 worlds 배열의 어떤 id와 일치한다
- block.bundle_id가 bundles 배열의 어떤 id와 일치한다(있을 때)
- dependency.source와 target이 blocks 배열의 어떤 id와 일치한다
- cascade.trigger와 add_blocks의 각 항목이 blocks 배열의 어떤 id와 일치한다
- prerequisite.enables의 각 항목이 blocks 배열의 어떤 id와 일치한다
- prerequisite.requires_prereq의 각 항목이 prerequisites 배열의 어떤 id와 일치한다
- worlds, bundles, blocks, prerequisites 각각의 id 집합 안에 중복이 없다

`validateCatalog(catalog)`가 진입점이다. 형식 검증을 먼저 돌리고, 통과하면 참조 무결성을 돌린다. 둘 중 하나라도 실패하면 모든 위반 사항을 모아서 반환한다. 첫 위반에서 멈추지 않는다. 카탈로그를 만드는 사람이 한 번에 모든 문제를 보고 고칠 수 있어야 한다.

## 결과

### 긍정적
- 카탈로그 형식이 표준 JSON Schema 한 파일에 정의된다. Claude, GPT, Gemini, 미래의 어떤 모델이든 읽을 수 있다
- ajv 덕분에 검증이 빠르고 가볍다. CI 게이트의 비용이 낮다
- 두 도메인 데이터가 PR을 막지 않는다. 이전 작업이 굴러가면서 표준이 자연스럽게 드러난다
- 참조 무결성이 명시적인 코드로 분리되어 있어 메시지 품질을 직접 통제할 수 있다. 사용자에게 한국어 메시지를 줄 길이 열려있다

### 부정적 / 트레이드오프
- 검증이 두 단계라서 사용자에게 두 번의 출력을 보일 수 있다. validateCatalog는 두 결과를 합쳐서 한 번에 돌려준다는 약속으로 이 부담을 안에서 흡수한다
- 관대한 스키마는 데이터 일관성을 늦게 잡는다. 카탈로그 진화 노트로 표준화 진척을 추적해서 보완한다
- ajv 영문 메시지를 한국어로 바꾸는 일은 별도 작업이다. 우선순위가 떨어지면 미뤄질 수 있다

### 미래 묶임
- 카탈로그 스키마 위치는 `packages/catalog/schemas/catalog.schema.json`이다. 이동하려면 ADR이 필요하다
- 검증 라이브러리 ajv는 표준이다. 다른 라이브러리로 바꾸려면 ADR이 필요하다
- condition과 reason의 통합, slug와 icon의 표준화 같은 후속 결정은 별도 ADR로 한다
- 다른 도메인 카탈로그를 추가할 때 이 스키마를 통과하지 못하면 데이터를 고치지, 스키마를 느슨하게 만들지 않는다

## 링크
- 이전 결정: ADR 0004 (신규 구현 결정)
- 후속 작업 후보: condition/reason 통합 결정, 한국어 에러 메시지 매핑, 스키마 필드 표준화 진척
- 관련 정책: CLAUDE.md 섹션 4(CI 게이트), 절대 금지선 6번(벤더 무관)
