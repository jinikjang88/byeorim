# ADR 0014. Temper 단계 책임과 test-scenarios.yml 형식

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0007이 `.beoreum/project/test-scenarios.yml`을 Temper 단계 산출물 자리로 박았다. ADR 0006이 Temper의 정의를 다시 한 번 다듬었다. "다듬은 무엇이 통과해야 하는지를 짓는 자리. 실제로 통과하는지를 보는 자리는 다음 단계(Set)다."

즉 Temper는 테스트 의도를 짓는 단계이고, Set이 그 의도 위에 코드와 검증을 올린다. CLAUDE.md 섹션 4가 이미 Given-When-Then을 주력 패턴으로 박았으니, Temper의 산출물도 그 결을 따른다.

답해야 할 질문은 다섯이다.

첫째, 각 endpoint에 몇 개의 시나리오를 자동 생성할지. happy path만 만들 것인가, 에러/엣지/속성 기반까지 만들 것인가.

둘째, test-scenarios.yml의 형식이 어떻게 생겼나. contracts.yml과 결을 맞출지, 다른 모양으로 둘지.

셋째, Given-When-Then 텍스트의 깊이가 어디까지인가. 자유 텍스트 한 줄? 코드 스니펫? operation별로 다른 템플릿?

넷째, test_code(실제 테스트 구현 코드) 자리를 어떻게 둘지. TODO 자리만? AI 기반 생성?

다섯째, decisions.yml의 cascade 답안이 시나리오에 어떻게 반영될지.

## 검토한 옵션

### 결정 1. 시나리오 깊이

#### 옵션 A. endpoint당 happy_path 1개 (이번 출시)
- 장점: MVP의 단순함. 사용자가 받자마자 압도되지 않는다. test_code TODO 자리도 한 자리만 채우면 됨
- 단점: 에러 케이스가 자동으로 들어오지 않아 사용자가 손으로 추가해야 한다

#### 옵션 B. endpoint당 happy_path + 에러 케이스 (404, 401 등)
- 장점: 일반적인 에러 자리가 자동으로 잡힘
- 단점: 매핑 규칙이 깊어진다. operation마다 어떤 에러가 자연스러운지 결정해야 함. 잘못된 매핑이 가짜 시나리오를 양산

#### 옵션 C. happy_path + 에러 + 속성 기반 + 엣지 (full)
- 장점: 풍부한 자동 생성
- 단점: 자동 생성 깊이가 깊을수록 잘못된 시나리오가 사용자에게 부담을 준다. AI 어댑터 없이 휴리스틱으로는 품질이 안정적이지 않음

### 결정 2. test-scenarios.yml 형식

#### 옵션 A. contracts.yml과 같은 결: 블럭 단위 객체 배열, endpoint마다 scenarios 배열
- 장점: 사용자가 한 블럭의 계약과 시나리오를 같은 자리에서 본다. contracts.yml과 test-scenarios.yml의 모양이 거울처럼 짝
- 단점: 중첩이 깊어 가독성이 약간 떨어질 수 있음

#### 옵션 B. 평면 시나리오 배열(블럭 ID와 endpoint 정보가 각 시나리오의 필드)
- 장점: 시나리오 한 개에 모든 정보가 한 자리
- 단점: 같은 endpoint의 여러 시나리오를 묶어 보기 어려움

#### 옵션 C. OpenAPI 또는 Cucumber 표준 형식
- 장점: 외부 도구가 읽음
- 단점: 우리는 *벼름의* 시나리오 자리지 표준 자리가 아니다. Set이 변환할 때 맞춘다

### 결정 3. Given-When-Then 텍스트의 깊이

#### 옵션 A. operation별 한국어 템플릿(create/list/get/update/delete/search)
- 장점: 사용자가 받자마자 의미 있는 한 줄을 본다. operation의 일반적 의도가 텍스트에 박힘. 미래에 LLM 어댑터가 도메인 정보로 더 채울 자리도 보존
- 단점: REST 관례에 묶임. 다른 api_style이 들어오면 별도 템플릿 표가 필요

#### 옵션 B. 자유 텍스트(빈 자리만 만들고 사용자가 채움)
- 장점: 자유도
- 단점: 비기술 창업자가 첫 만남에 빈 자리를 보면 막막함. 1순위 사용자 우선순위 위배

#### 옵션 C. 영문 Given-When-Then(BDD 표준 어구)
- 장점: 표준
- 단점: CLAUDE.md 섹션 0의 한국어 우선 정책 위배

### 결정 4. test_code 자리

#### 옵션 A. TODO 문자열(이번 출시)
- 장점: 사용자가 채워야 할 자리가 명시적. forge의 request_schema/response_schema와 같은 결
- 단점: 사용자가 다음 단계로 가기 전에 손을 봐야 한다. 다만 ADR 0003 동행 톤상 빈 자리는 부끄러운 게 아니다

#### 옵션 B. operation별 코드 스니펫 자동 생성
- 장점: 자동화 깊이
- 단점: 언어/프레임워크에 묶인다. architecture.language가 java면 다른 코드, node면 다른 코드. 한 표를 만들면 미래에 새 언어가 들어올 때마다 표가 늘어남. AI 어댑터로 미루는 게 안전

#### 옵션 C. AI 어댑터로 채움
- 장점: 도메인 맥락 반영
- 단점: 실제 LLM 어댑터가 아직 없음. mock으로는 가짜 코드가 나옴

### 결정 5. cascade 답안 활용

#### 옵션 A. 맥락만 보여주고 직접 참조하지 않음 (이번 출시, ADR 0012와 같은 결)
- 장점: 잘못된 매핑이 잘못된 시나리오를 만드는 위험 없음
- 단점: 답안이 시나리오에 어떻게 반영됐는지 추적이 약함

#### 옵션 B. 답안을 시나리오에 자동 반영
- 장점: 추적이 명확
- 단점: 매핑 규칙이 도메인별로 다름. MVP에서 짜기 어려움

## 결정

### 결정 1: endpoint당 happy_path 1개 (옵션 A)

이번 출시는 endpoint마다 시나리오 한 개만 자동 생성한다. kind는 `happy_path`. 에러/엣지/속성 기반 시나리오는 미래 ADR로 추가한다.

이유: 자동 생성 깊이가 깊을수록 사용자가 받는 가짜 시나리오가 늘어난다. forge의 skeleton+TODO 정신과 같은 결로, 적게 생성하고 사용자가 의도를 가지고 채우는 자리를 둔다.

### 결정 2: contracts.yml과 같은 결 (옵션 A)

test-scenarios.yml은 다음 형식이다.

```yaml
schema_version: 1
created_at: 2026-04-28T...
architecture_api_style: rest
scenarios:
  - block_id: order
    name: 주문
    api_style: resource
    endpoints:
      - operation: create
        method: POST
        path: /orders
        scenarios:
          - kind: happy_path
            given: 유효한 주문 입력 데이터가 준비되어 있다
            when: POST /orders로 주문 생성을 요청한다
            then: 201 응답과 함께 새 식별자가 돌아온다
            test_code: TODO
      - operation: list
        method: GET
        path: /orders
        scenarios:
          - kind: happy_path
            given: 주문이 0개 이상 저장되어 있다
            when: GET /orders로 목록을 조회한다
            then: 200 응답과 함께 주문 목록이 돌아온다
            test_code: TODO
      ...
  - block_id: pg-integration
    name: PG 연동
    api_style: internal
    endpoints: []
```

contracts.yml과 거울 짝이다. 한 블럭의 계약을 contracts.yml에서 보고, 같은 블럭의 시나리오를 test-scenarios.yml에서 본다. 두 파일의 path/method/operation이 정확히 일치한다.

internal 블럭은 endpoints가 빈 배열인 채 그대로 둔다(시나리오 없음).

### 결정 3: operation별 한국어 템플릿 (옵션 A)

다음 표가 ADR 0013의 매핑 표(block.api_style → endpoints)와 짝을 이룬다.

| operation | given                                | when                              | then                                       |
| --------- | ------------------------------------ | --------------------------------- | ------------------------------------------ |
| create    | 유효한 {name} 입력 데이터가 준비되어 있다 | POST {path}로 {name} 생성을 요청한다 | 201 응답과 함께 새 식별자가 돌아온다       |
| list      | {name}이 0개 이상 저장되어 있다       | GET {path}로 목록을 조회한다       | 200 응답과 함께 {name} 목록이 돌아온다     |
| get       | 주어진 식별자의 {name}이 존재한다     | GET {path}로 한 건을 조회한다     | 200 응답과 함께 해당 {name}이 돌아온다     |
| update    | 수정할 {name}과 유효한 입력이 준비되어 있다 | PUT {path}로 수정을 요청한다     | 200 응답과 함께 수정된 {name}이 돌아온다   |
| delete    | 삭제할 {name}이 존재한다              | DELETE {path}로 삭제를 요청한다   | 204 응답                                   |
| search    | 검색 조건이 준비되어 있다             | GET {path}로 검색을 요청한다       | 200 응답과 함께 결과 목록이 돌아온다       |

`{name}`은 block.name(한국어), `{path}`는 endpoint.path. 템플릿이 정해진 자리에서 한국어 한 줄이 자동 채워진다. 사용자는 받자마자 의미 있는 시나리오를 본다.

이 매핑 표는 표준이다. 다른 api_style(GraphQL/RPC)이 들어오면 별도 템플릿 표가 필요하고, 별도 ADR로 결정한다.

### 결정 4: test_code는 TODO (옵션 A)

각 시나리오의 `test_code` 필드는 자동 생성 시 `TODO` 문자열이다. 사용자가 채우거나, 미래의 LLM 어댑터가 채운다(별도 ADR).

언어별 코드 스니펫 자동 생성을 안 하는 이유는 architecture.language(Java/Node/Python)별로 표가 늘어나는 부담을 피하려는 결정이다. 코드 자리는 도메인 맥락이 가장 무거운 자리라 AI 어댑터에 맡기는 게 자연스럽다.

### 결정 5: cascade 답안은 맥락만 (옵션 A)

ADR 0012의 결정 3과 같은 결. decisions.yml의 답한 결정 수와 빈 결정 수를 사용자에게 안내 메시지로 보여주되, 시나리오 본문에 자동 반영하지 않는다. 잘못된 매핑이 잘못된 시나리오를 만드는 위험을 회피.

## 결과

### 긍정적
- endpoint당 1개 시나리오라 사용자가 받자마자 받는 자료가 작다. 압도되지 않는다
- contracts.yml과 test-scenarios.yml이 거울 짝이라 사용자가 두 파일을 같은 머리 모형으로 다룬다. operation/path/method가 두 자리에서 정확히 일치
- operation별 한국어 템플릿이 1순위 사용자(비기술 창업자)에게 의미를 즉시 전달. 영문 BDD 표준어가 아닌 한국어로 의도를 적는 자리
- test_code TODO가 ADR 0013의 request_schema/response_schema TODO와 같은 결. 사용자가 채워야 할 자리가 형식에 박혀있다
- 자동 생성 깊이가 얕아 잘못된 시나리오로 사용자를 잘못된 자리로 이끄는 위험이 작다

### 부정적 / 트레이드오프
- 에러 케이스(404, 401)가 자동으로 들어오지 않아 사용자가 손으로 추가해야 한다. 일반적인 에러 자리가 빠져있다는 부담은 있지만, 잘못된 자동 생성보다 빈 자리가 낫다는 정신
- operation 템플릿이 REST 관례에 묶여있다. GraphQL/RPC가 들어오면 별도 템플릿 표가 필요하고, ADR도 따로
- test_code TODO가 모든 시나리오에 박혀있어 형식이 살짝 길어 보인다. 다만 사용자가 채울 자리가 명시적인 게 빈 줄보다 친절하다는 판단
- cascade 답안의 영향이 시나리오에 직접 반영되지 않으므로, 답한 내용이 어떻게 시나리오에 살아남는지 추적이 약함. 미래의 매핑 ADR이 들어와야 보강

### 미래 묶임
- endpoint당 시나리오 1개와 happy_path만 자동 생성하는 결정은 표준이다. 변경하려면 ADR이 필요하다
- test-scenarios.yml의 schema_version 1 형식은 표준. 변경 시 schema_version 2와 마이그레이션 ADR
- operation별 한국어 GWT 템플릿 표는 표준. 다른 api_style의 템플릿 표는 별도 ADR로 추가
- test_code TODO는 표준. 자동 생성으로 채우는 결정은 별도 ADR
- cascade 답안 매핑 규칙은 미래 ADR로 도입(ADR 0012와 동일한 자리에 놓아둠)

## 링크
- 이전 결정: ADR 0007 (자리), ADR 0010 (cascade 답안 형식), ADR 0012 (cascade 맥락 처리), ADR 0013 (contracts.yml 형식)
- 후속 작업 후보: 에러/엣지/속성 기반 시나리오 ADR, GraphQL/RPC 시나리오 템플릿 ADR, AI 기반 test_code 채우기 ADR, cascade 답안 매핑 규칙 ADR
- 관련 정책: CLAUDE.md 섹션 0(사용자 우선순위), 섹션 4(테스트 패턴 정책), 섹션 8(파일당 책임, 한국어 메시지)
