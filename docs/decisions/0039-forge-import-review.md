# ADR 0039. Forge 외부 검토 응답 import

- 상태: 채택
- 날짜: 2026-05-06
- 결정자: DevSmith
- 관계: ADR 0035의 외부 검토 프롬프트 부산물(contracts-review-prompt.md)에서 짝이 비어있던 자리. ADR 0028의 import-catalog 결을 따른다. ADR 0034의 인터랙티브 검토 흐름과 결이 평행

## 맥락

ADR 0035가 forge에 외부 검토 프롬프트 부산물(`.byeorim/project/prompts/contracts-review-prompt.md`)을 박았다. 사용자는 이 마크다운을 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 endpoint 누락/과다, schema 도메인 적합성, 시작 무게를 자세히 검토받는다. 그러나 받은 응답을 다시 contracts.yml에 반영하는 자리가 비어있다. 사용자가 응답을 읽고 yml을 직접 다듬는 결로만 풀린다.

비기술 창업자(1순위 사용자) 시점에서 두 자리가 비어있다.

첫째, yml 직접 편집 자리. 절대 금지선 5번(YAML을 사용자에게 들이밀지 않는다) 정신상 사용자에게 yml을 다듬으라고 들이미는 결은 어긋난다. 외부 AI 응답에서 받은 제안을 코드가 읽고 contracts.yml에 반영해야 한다.

둘째, 응답 형식 신뢰 자리. 외부 AI는 자유 형식으로 답한다. 사용자가 응답을 한 줄씩 읽고 어떤 자리가 endpoint 추가인지, schema 수정인지를 판단하는 결은 비기술 창업자에게 부담이다. 동행 톤(ADR 0003 결정 2) 정신상 코드가 응답을 읽고 사용자가 자리마다 적용/건너뛰기 결정만 하는 결이 옳다.

이 두 자리를 한 묶음으로 푼다. 외부 AI에게 자유 형식 검토 끝에 구조화된 "제안된 변경 사항" 섹션을 한 번 더 추가하라고 안내한다(검토 프롬프트에 형식 가이드 박음). 사용자는 받은 응답을 `byeorim forge import-review <file>`로 가져온다. 코드는 구조화 섹션을 파싱하고 각 제안마다 사용자에게 picker로 묻는다.

## 검토한 옵션

### 결정 1. 외부 AI 응답 형식

#### 옵션 A. 자유 형식 그대로(로컬 어댑터가 응답을 구조화로 옮김)
- 장점: 외부 AI가 가장 자연스러운 결로 답함. 사용자가 응답을 그대로 받아 다른 자리에서 보기도 좋음
- 단점: 로컬 어댑터(claude/mock)가 필수. mock은 도메인 추론을 못 함(ADR 0036 결정 3)이라 import 자리에서 mock이 무력. 어댑터 옵셔널 결(ADR 0023, 0036)이 깨짐. 절대 금지선 6번(벤더 종속) 정신과 어긋남

#### 옵션 B. 구조화 형식 강제(검토 프롬프트에 형식 안내, 정규식+yaml 파서)
- 장점: 로컬 어댑터 없이 동작. 무료 흐름 보존. 외부 AI가 어떤 벤더든 같은 형식으로 답함. 자유 형식 검토와 구조화 섹션을 분리해 사용자가 자유 형식으로 한 번 읽고 코드가 구조화로 한 번 더 읽는 결
- 단점: 외부 AI가 형식을 안 따를 수 있음. 다만 graceful degrade(형식 못 읽으면 안내하고 종료, 사용자가 응답을 직접 보고 다음 결정)로 풀어줄 수 있음

#### 옵션 C. 하이브리드(B 형식 권장 + A의 자유 형식도 어댑터가 보강)
- 장점: 두 결을 다 살림. 외부 AI가 형식 안 따라도 어댑터가 옮김
- 단점: 코드 자리 두 갈래(파서 + 어댑터). 복잡도 증가. mock이 보강 자리에 무력해 두 결이 부분적으로만 살아남음

### 결정 2. 변경 적용 방법

#### 옵션 A. 인터랙티브 picker(각 제안마다 적용/건너뛰기/멈추기)
- 장점: 동행 톤(절대 금지선 2번, 답을 강요하지 않는다) 정신. 외부 AI 추천이 도메인에 안 맞을 수 있어 사용자가 자리마다 결정. forge/shape/smelt의 picker 결과 일관
- 단점: 변경 수가 많을 때 사용자가 N번 결정. 다만 "남은 N개 모두 적용"/"여기서 멈추기" 한 자리로 풀 수 있음

#### 옵션 B. 자동 적용 + 검토 화면(redo 자리)
- 장점: 한 번 결정만 함. 빠른 흐름
- 단점: 자동 적용된 변경이 일부 잘못이면 사용자가 redo 시 모든 변경을 다시 봄. 부분 채택이 안 됨

#### 옵션 C. 미리보기 + 한 번 confirm/cancel
- 장점: 한 번 결정. preview 결로 사용자가 미리 봄
- 단점: 부분 채택이 안 됨. 응답에 좋은 변경과 어색한 변경이 섞여있을 때 모두/없음만 가능

### 결정 3. 변경 가능한 자리(scope)

#### 옵션 A. endpoint 추가/삭제 + schema 수정 + description 수정 (4종)
- 장점: forge의 산출물(contracts.yml) 자리에 정확히 맞춤. 외부 AI의 검토 셋(endpoint 누락/과다, schema 도메인 적합성, 시작 무게)이 곧 이 4종을 통해 풀림
- 단점: block.api_style 같은 forge 이전 단계 산출물은 못 바꿈. 사용자가 그걸 바꾸려면 shape를 다시 돌려야 함(절대 금지선 1번 정신)

#### 옵션 B. schema 수정만(가벼운 자리)
- 장점: 변경 결이 단순. schema는 forge가 AI 어댑터로 채운 자리(ADR 0023)라 같은 자리 옮김
- 단점: endpoint 추가/삭제는 검토 프롬프트의 1번 항목(누락/과다)에 직접 응답 못 함. 외부 AI 추천이 yml에 안 닿음

#### 옵션 C. 4종 + block 추가/삭제(이전 단계 산출물도 건드림)
- 장점: 외부 AI가 더 자유롭게 추천
- 단점: 절대 금지선 1번(설계 없이 코드 안 짠다) 정신과 어긋남. block 추가/삭제는 smelt 자리. forge import에서 건드리면 단계 경계가 흐려짐

### 결정 4. 명령어 자리

#### 옵션 A. 서브커맨드 `byeorim forge import-review <file>`
- 장점: prospect의 `byeorim prospect import-catalog`(ADR 0028) 결과 평행. 단계마다 다른 yml을 다른 결로 파싱하므로 명령어를 갈라두는 게 코드 자리도 깨끗
- 단점: 명령어 자리가 둘(forge, temper) 자라남

#### 옵션 B. 독립 명령 `byeorim import-review <file>`(단계 자동 감지)
- 장점: 명령어 한 자리
- 단점: 단계 자동 감지 결이 어긋날 자리(예: 사용자가 temper 응답을 forge 단계에서 import하려고 할 때). 명령어와 단계 짝이 흐려짐

### 결정 5. 입력 자리

#### 옵션 A. 파일 경로
- 장점: prospect import-catalog와 같은 결. 사용자가 한 번 익힌 패턴
- 단점: 파일 저장 자리가 한 번 더 필요

#### 옵션 B. stdin
- 장점: 파이프 흐름 자연스러움
- 단점: 비기술 창업자에게 stdin이 어색. CLI 학습 비용

#### 옵션 C. 인터랙티브 다중 줄 입력
- 장점: 파일 저장 안 해도 됨
- 단점: 다중 줄 입력 종료 자리가 어색. 응답 길이가 크면 터미널 부담

### 결정 6. 형식 못 읽었을 때 동작

#### 옵션 A. graceful degrade(안내 한 줄 + 종료, contracts.yml 그대로)
- 장점: 사용자에게 안전. yml 안 깨짐. 사용자가 응답을 직접 읽고 다음 결정
- 단점: 사용자가 import 자리를 못 씀. 다만 자유 형식 응답 자체는 사용자에게 가치 있음

#### 옵션 B. 에러로 종료
- 장점: 명확한 신호
- 단점: 절대 금지선 2번(답을 강요하지 않는다) 정신과 어긋남. 사용자가 다음 결정을 할 자리가 막힘

### 결정 7. 후속 단계 영향

#### 옵션 A. state 안 건드림(import 후 같은 단계에 머무름) + 후속 산출물(test-scenarios.yml) 있으면 안내
- 장점: state는 단계 진행 자리. import는 산출물 다듬는 자리라 결이 다름. 사용자가 한 번 이상 import 가능. test-scenarios.yml이 있으면 contracts 변경에 맞춰 temper 다시 돌리기를 안내
- 단점: 사용자가 안내를 안 보면 stale 자리(test-scenarios가 새 contracts와 안 맞음)가 살아남음. 다만 안내 한 줄로 풀어줌

#### 옵션 B. state를 forge로 되돌림
- 장점: 사용자가 자연스럽게 forge → temper 다시 흐름
- 단점: 단계 후퇴는 사용자에게 혼란. 이미 끝낸 단계 자리가 사라짐. state는 단순한 진행 자리라 import 자리에서 후퇴는 결이 어긋남

#### 옵션 C. test-scenarios.yml 자동 삭제
- 장점: stale 자리 차단
- 단점: 사용자 산출물 자동 삭제는 위험. 사용자 의지로 결정해야 할 자리

## 결정

### 결정 1: 구조화 형식 강제 (옵션 B)

검토 프롬프트(contracts-review-prompt.md)의 부탁드릴 검토 섹션 뒤에 "## 응답 형식 안내" 섹션을 박는다. 외부 AI에게 자유 형식 검토 끝에 다음 형식의 "## 제안된 변경 사항" 섹션을 한 번 더 추가하라고 안내.

````markdown
## 제안된 변경 사항

```yaml
changes:
  - kind: endpoint_add
    block_id: order
    new_endpoint:
      method: GET
      path: /orders/by-customer/{customerId}
      operation: list_by_customer
      description: 고객별 주문 조회
    reason: 고객 도메인에서 자주 필요한 자리예요

  - kind: endpoint_remove
    block_id: order
    target_endpoint:
      method: DELETE
      path: /orders/{id}
    reason: 주문은 보통 취소만 하고 영구 삭제는 안 해요

  - kind: schema_modify
    block_id: order
    target_endpoint:
      method: POST
      path: /orders
    target_field: request_schema
    new_value:
      type: object
      properties: { items: { type: array }, customer_id: { type: string } }
      required: [items, customer_id]
    reason: 주문에는 items와 customer_id가 핵심이에요

  - kind: description_modify
    block_id: order
    target_endpoint:
      method: GET
      path: /orders
    new_value: 고객 본인의 주문 목록 조회
    reason: 권한 자리가 description에 빠져있어요
```
````

자유 형식 검토는 위에 따로 적도록 안내. 코드는 마지막 "## 제안된 변경 사항" 섹션의 첫 ```yaml 블록만 파싱.

이 결로 가는 이유. 로컬 어댑터 없이 동작해 mock 흐름과 무료 흐름이 살아남음. 외부 AI 벤더 무관(절대 금지선 6번). 형식 안 따를 때 graceful degrade로 풀어줌(결정 6).

### 결정 2: 인터랙티브 picker (옵션 A)

각 제안마다 사용자에게 묻는다.

```
[1/5] order의 endpoint 추가
  - GET /orders/by-customer/{customerId} (list_by_customer)
  - 이유: 고객 도메인에서 자주 필요한 자리예요

  ❯ 적용하기
    건너뛰기
    여기서 멈추기(나머지 변경 안 보고 끝내기)
```

select 결로 forge/shape/smelt와 같은 picker 결. 동행 톤(절대 금지선 2번) 정신.

### 결정 3: 4종 변경 (옵션 A)

`endpoint_add` / `endpoint_remove` / `schema_modify` / `description_modify`. block.api_style 같은 forge 이전 단계 산출물은 자리 아님(절대 금지선 1번 정신).

각 변경의 필드.

- `endpoint_add`: `block_id`, `new_endpoint`(method/path/operation/description, schema 자리는 후속 추가 안 함 — TODO로 박힘. 사용자가 같은 import에서 schema_modify로 채울 수 있음), `reason`
- `endpoint_remove`: `block_id`, `target_endpoint`(method/path), `reason`
- `schema_modify`: `block_id`, `target_endpoint`(method/path), `target_field`(request_schema | response_schema), `new_value`, `reason`
- `description_modify`: `block_id`, `target_endpoint`(method/path), `new_value`(문자열), `reason`

검증.
- `block_id`가 contracts.yml에 없으면 변경 건너뜀(파싱 단계에서 invalid로 표시, picker 안 보여줌)
- `target_endpoint`가 해당 블럭에 없으면 변경 건너뜀
- `endpoint_add`에서 (method, path) 중복이면 변경 건너뜀
- `target_field`가 두 자리 외면 변경 건너뜀

invalid 자리는 picker 시작 전에 한 번에 안내(예: "변경 7개 중 2개는 형식이 맞지 않아 건너뜁니다").

### 결정 4: 서브커맨드 (옵션 A)

`byeorim forge import-review <file>`. prospect의 import-catalog 결과 평행. temper는 후속 PR(ADR 0040 자리)에서 같은 결로 박힘.

### 결정 5: 파일 경로 (옵션 A)

`byeorim forge import-review ./response.md`. 사용자가 외부 AI에서 받은 응답을 텍스트 파일로 저장한 뒤 경로를 적는 결.

### 결정 6: graceful degrade (옵션 A)

응답에서 "## 제안된 변경 사항" 섹션을 못 찾거나 ```yaml 파싱이 실패하거나 changes 배열이 비어있으면 사용자에게 안내하고 종료. contracts.yml은 그대로.

```
응답에서 "## 제안된 변경 사항" 섹션을 못 알아봤어요.
외부 AI가 자유 형식으로만 답했거나 형식이 어긋났을 수 있어요.
응답을 직접 보시고 contracts.yml을 손으로 다듬으시거나, 외부 AI에 형식대로 다시 답해달라고 부탁해주세요.
```

### 결정 7: state 안 건드림 + 후속 안내 (옵션 A)

import는 contracts.yml만 다듬는 자리라 state.current_stage를 안 건드린다. test-scenarios.yml이 이미 있으면 안내.

```
contracts.yml을 갱신했어요(N개 적용, M개 건너뜀).
test-scenarios.yml이 이미 있어요. contracts가 바뀌었으니 byeorim temper를 다시 돌리는 결을 검토해주세요.
```

stage가 forge가 아닐 때(예: temper, set, inspect로 진행했을 때)도 import 가능. contracts.yml만 있으면 동작. ensure는 contracts.yml 존재만.

## 결과

### 긍정적
- ADR 0035의 검토 프롬프트와 짝이 맞음. 외부 AI 응답이 자연스럽게 contracts.yml에 반영
- 비기술 창업자가 yml을 직접 편집 안 해도 외부 AI 추천을 자기 결로 받음. 절대 금지선 5번 정신
- 인터랙티브 picker로 사용자가 자리마다 결정. 동행 톤 정신
- 로컬 어댑터 없이 동작. mock 흐름과 무료 흐름 보존. 절대 금지선 6번(벤더 종속) 정신
- prospect import-catalog 결과 평행이라 사용자가 두 단계에서 같은 사용 패턴
- temper에 같은 결을 옮길 자리가 비어있음(후속 PR, ADR 0040 자리)

### 부정적 / 트레이드오프
- 외부 AI가 형식을 안 따를 수 있음. graceful degrade로 풀지만 사용자가 import 자리를 못 씀. 외부 AI 신뢰도에 의존
- 변경 수가 많을 때 사용자가 N번 결정. "남은 N개 모두 적용"/"여기서 멈추기" 자리로 풀지만 인지 비용은 있음
- block.api_style 같은 이전 단계 산출물은 못 바꿈. 외부 AI 추천 중 일부는 import 자리에 안 닿음. 다만 단계 경계 보호
- test-scenarios.yml stale 자리는 사용자 의지로 풀어야 함. 자동 삭제는 위험이라 안내 한 줄로만

### 미래 묶임
- 응답 형식("## 제안된 변경 사항" + ```yaml + changes 배열)은 표준. 변경하려면 새 ADR
- 4종 변경(endpoint_add/remove, schema_modify, description_modify)은 표준. 새 종류 추가는 ADR
- picker 결("적용/건너뛰기/멈추기")은 표준. 변경하려면 ADR
- 서브커맨드 `forge import-review`는 표준. 명령어 결 변경은 ADR
- graceful degrade 결(섹션 못 찾거나 파싱 실패 → 안내 후 종료)은 표준
- temper에 같은 결을 옮길 자리가 비어있음(ADR 0040 후속 자리)
- 큰 응답에서 "남은 N개 모두 적용" 단축 자리는 미래 ADR(이번 출시는 자리마다 묻기)

## 링크
- 짝 결정: ADR 0028 (prospect import-catalog, 같은 결)
- 입력 의존: ADR 0013 (contracts.yml 형식), ADR 0023 (extractSchema), ADR 0034 (인터랙티브 검토), ADR 0035 (외부 검토 프롬프트)
- 동행 톤: ADR 0003 결정 2
- 후속 작업 후보: ADR 0040 (temper import-review, 같은 결을 옮김), 큰 응답의 일괄 적용 단축 자리
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(파일당 책임, 데이터 무관성), 섹션 10(글쓰기 원칙)
