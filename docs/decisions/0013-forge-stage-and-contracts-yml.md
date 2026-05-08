# ADR 0013. Forge 단계 책임과 contracts.yml 형식

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0007이 `.byeorim/project/contracts.yml`을 Forge 단계 산출물 자리로 박았다. ADR 0012가 architecture.yml에 4개 핵심 결정(언어, 저장소, API 형식, 구조 패턴)을 박았다. 이제 그 두 입력으로 contracts.yml을 만드는 단계의 책임과 형식을 정한다.

Forge는 "두드려 단련하는 일"이다(MANIFESTO III장). 계약 우선이라는 원칙이 여기서 살아난다. contracts.yml이 다음 단계(Set)의 코드 생성 입력이 되고, Temper의 테스트 의도가 이 계약 위에 올라간다.

답해야 할 질문은 다섯이다.

첫째, 어떤 architecture.api_style 조합을 첫 출시에서 지원하나. ADR 0012는 rest, graphql, rpc 셋을 옵션으로 박았다. 그러나 셋 모두를 forge 첫 출시에서 지원하는 일은 큰 자리다. 각 스타일이 contracts.yml의 형태를 다르게 만든다.

둘째, contracts.yml의 형식이 어떻게 생겼나. 평면 키-값으로 충분했던 architecture.yml과 달리 contracts는 블럭마다 여러 endpoint를 가져 자연스럽게 구조화된 형식이 필요하다.

셋째, block.api_style(catalog 데이터)을 어떻게 처리하나. 카탈로그 스키마(ADR 0005)가 block.api_style에 resource/query/internal 셋을 박았다. 이 값이 어떤 endpoint 모양으로 매핑될지 정해야 한다.

넷째, 자동 생성의 깊이가 어디까지인가. CRUD 5개 endpoint를 자동으로 만들지, 한 placeholder만 만들지, request/response 스키마까지 만들지.

다섯째, 어떤 블럭이 contracts에 들어가나. selected-blocks.yml의 selected만? auto_added도? affected는? prerequisites는?

## 검토한 옵션

### 결정 1. 지원하는 architecture.api_style

#### 옵션 A. REST만 (이번 출시)
- 장점: 한 형식만 다룬다. contracts.yml이 REST 모양으로 박힌다. 미래에 GraphQL/RPC가 들어올 때 별도 ADR로 형식을 정한다
- 단점: shape에서 graphql/rpc를 고른 사용자는 forge에서 막힌다. 다만 명확한 한국어 메시지로 "지금 출시는 REST만 지원합니다" 안내

#### 옵션 B. REST + GraphQL
- 장점: 두 형식이 자주 쓰인다
- 단점: 두 형식이 contracts.yml의 모양을 다르게 만든다. 한 ADR에서 두 형식 모두 박으면 의사결정 부담이 크다. 하나에 집중해 잘 만든 뒤 다른 형식을 별도 ADR로 추가하는 게 안전

#### 옵션 C. 셋 다 (REST + GraphQL + RPC)
- 장점: 사용자 자유도
- 단점: 첫 출시에서 셋의 모양을 다 정하는 일은 너무 큰 자리. 잘못 박으면 미래 마이그레이션 부담이 셋 다에 걸린다

### 결정 2. contracts.yml 형식

#### 옵션 A. 블럭 단위 객체 배열 + 블럭마다 endpoints 배열
- 장점: 블럭별로 그룹핑이 자연스럽다. 사용자가 한 블럭의 계약을 한 자리에서 본다. 다음 단계(Set)도 블럭 단위로 코드 생성
- 단점: 같은 path를 두 블럭이 가지면 충돌이 분산되어 보이지만, MVP에서는 그런 충돌이 없다

#### 옵션 B. 평면 endpoint 배열(블럭 ID는 각 endpoint의 필드)
- 장점: 단순한 리스트
- 단점: 블럭 정보가 endpoint마다 반복됨. 사용자가 블럭 단위로 보기 어려움

#### 옵션 C. OpenAPI 직접 생성
- 장점: 표준 형식
- 단점: 우리는 *벼림의* 계약 자리지 OpenAPI 자리가 아니다. 사용자 의도를 우리 형식으로 보존한 뒤 미래 단계(Set)에서 OpenAPI로 변환하는 게 단계 분리에 맞다

### 결정 3. block.api_style 매핑

block.api_style이 resource/query/internal 셋이고 architecture.api_style이 rest일 때.

#### 옵션 A. resource → CRUD 5(POST/GET 목록/GET 한 건/PUT/DELETE), query → 검색 1, internal → endpoint 없음
- 장점: 가장 보편적인 매핑. 사용자가 평균적으로 기대하는 모양
- 단점: 모든 resource 블럭이 5개 endpoint를 갖지는 않는다(예: 읽기 전용 자원). 첫 출시는 평균에 맞추고, 미래에 사용자가 endpoint를 직접 가감하는 자리(별도 명령어)를 둔다

#### 옵션 B. resource → CRUD 1(create만), 나머지는 사용자가 추가
- 장점: 자동 생성 깊이가 얕아 안전
- 단점: 사용자가 4개 endpoint를 매번 손으로 추가해야 함. 1순위 사용자에게 부담

#### 옵션 C. block.api_style을 무시하고 모든 블럭에 동일 매핑
- 장점: 단순
- 단점: 카탈로그가 박은 의도(internal은 공개 API 없음)를 코드가 무시하게 됨

### 결정 4. 자동 생성 깊이

#### 옵션 A. method/path/operation/description만, request/response는 TODO
- 장점: 사용자가 채워야 할 자리가 명시적으로 보인다. 잘못된 자동 생성으로 잘못된 스키마가 박히는 위험 없음. AI 기반 스키마 생성은 미래 ADR로
- 단점: TODO가 많아 사용자가 다음 단계로 가기 전에 손을 봐야 한다. 다만 ADR 0003 동행 톤 정신상 빈 자리는 부끄러운 게 아니다

#### 옵션 B. block.user_desc/tech_desc에서 키워드를 뽑아 스키마를 추론
- 장점: 자동화 깊이가 깊다
- 단점: 추론이 잘못되면 사용자가 발견까지 시간이 걸린다. AI 없이 휴리스틱으로는 품질이 안정적이지 않음

#### 옵션 C. mock AI 어댑터로 스키마 생성
- 장점: 자동 생성 자리를 인터페이스로 박아둠
- 단점: mock의 스키마 품질이 낮아 결국 사용자가 다 고쳐야 함. 헛수고. 실제 LLM 어댑터가 들어왔을 때 ADR로 도입

### 결정 5. 어떤 블럭이 contracts에 들어가나

#### 옵션 A. selected + auto_added (실제 빌드되는 블럭들)
- 장점: 실제로 만들어지는 블럭만 계약을 가진다. affected는 영향만 받지 빌드되지 않으므로 제외. prerequisites는 코드가 아니라 외부 준비물이라 제외
- 단점: 없음. 자연스러운 경계

#### 옵션 B. selected만 (사용자가 명시적으로 고른 것)
- 장점: 입력에 충실
- 단점: requires로 따라온 블럭들은 자동으로 들어와야 동작한다. 그 블럭들이 빌드되지만 계약이 없는 모순이 생김

#### 옵션 C. 모든 블럭 + affected
- 장점: 정보가 풍부
- 단점: affected는 빌드되지 않는데 계약을 만드는 일은 의미가 없음. 빌드되는 것과 영향받는 것의 경계가 흐려짐

## 결정

### 결정 1: REST만 지원 (옵션 A)

이번 출시의 forge는 architecture.api_style이 `rest`일 때만 동작한다. `graphql`이나 `rpc`이면 한국어 메시지로 거부한다.

```
architecture.yml의 api_style이 "graphql"입니다. 지금 출시의 forge는 REST만 지원합니다.
shape를 다시 돌려 api_style을 rest로 바꾸거나, 다음 출시를 기다려주세요.
```

GraphQL과 RPC 형식은 별도 ADR로 추가한다. 이번 ADR에서 셋 다 박으면 셋 모두에 대한 미래 마이그레이션 부담이 동시에 생긴다. 한 형식을 잘 만든 뒤 추가하는 게 안전.

### 결정 2: 블럭 단위 객체 배열 (옵션 A)

contracts.yml은 다음 형식이다.

```yaml
schema_version: 1
created_at: 2026-04-28T...
architecture_api_style: rest
contracts:
  - block_id: order
    name: 주문
    api_style: resource
    endpoints:
      - operation: create
        method: POST
        path: /orders
        description: 주문 생성
        request_schema: TODO
        response_schema: TODO
      - operation: list
        method: GET
        path: /orders
        description: 주문 목록 조회
        request_schema: TODO
        response_schema: TODO
      ...
  - block_id: pg-integration
    name: PG 연동
    api_style: internal
    endpoints: []
    internal: true
```

블럭 단위 그룹핑이 사용자에게 자연스럽고 다음 단계(Set)도 블럭 단위로 코드 생성을 한다. 표준 OpenAPI는 이 자리가 아닌 Set 단계가 contracts.yml에서 변환해 낸다.

### 결정 3: resource → CRUD 5, query → 검색 1, internal → 없음 (옵션 A)

block.api_style이 catalog에 적혀있지 않으면 `resource`로 본다. ADR 0005 결정 3(관대한 스키마)이 api_style을 옵션으로 두었으니 default가 필요하다. 가장 보편적인 자리(`resource`)를 default로 둔다.

매핑 표:

| block.api_style | endpoints                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| resource        | POST /{path} (create), GET /{path} (list), GET /{path}/{id} (get), PUT /{path}/{id} (update), DELETE /{path}/{id} (delete) — 5개                                       |
| query           | GET /{path} (search) — 1개                                                                                                                                             |
| internal        | endpoints: []                                                                                                                                                          |

`{path}`는 block.id에서 언더스코어를 하이픈으로 바꾼 값이다(`order-history` 그대로, `pg_integration`은 `pg-integration`). REST 관례를 따른다.

미래에 사용자가 endpoint를 가감하는 자리(예: `byeorim forge --add-endpoint`)는 별도 ADR로 도입한다.

### 결정 4: skeleton 깊이, request/response는 TODO (옵션 A)

각 endpoint는 다음 필드를 가진다.

- `operation` (필수): create/list/get/update/delete/search 같은 표준 식별자
- `method` (필수): HTTP 메서드
- `path` (필수): URL 경로
- `description` (필수): 한국어 한 줄 설명. 자동 생성은 `${block.name} ${operation}` 형태(예: "주문 생성")
- `request_schema` (필수): 자동 생성 시 `TODO`
- `response_schema` (필수): 자동 생성 시 `TODO`

스키마 자리에 `TODO`라는 문자열이 들어간다. 다음 단계(Temper, Set)는 `TODO`를 발견하면 사용자에게 채워달라고 안내하거나(별도 ADR), 미래의 LLM 어댑터가 채운다(별도 ADR).

### 결정 5: selected + auto_added (옵션 A)

contracts에 들어가는 블럭은 selected-blocks.yml의 `selected`와 `auto_added`를 합친 집합이다. affected와 prerequisites는 들어가지 않는다.

이유: affected는 영향을 받지만 빌드되지 않는다. prerequisites는 World 0에 속하고 코드 자리가 아니다.

블럭 순서는 selected를 먼저, 그 다음 auto_added 순서로 둔다. 사용자가 명시적으로 고른 자리가 위에 보인다.

## 결과

### 긍정적
- forge 첫 출시가 한 형식(REST)에 집중해 contracts.yml 모양이 분명하다. 미래에 GraphQL/RPC가 추가되어도 REST 모양은 안 흔들린다
- 블럭 단위 그룹핑이 사용자에게 한 자리 한 시야를 만든다. 한 블럭의 계약 전체가 한 곳에 보인다
- block.api_style 매핑 표가 카탈로그의 의도(internal=공개 안 함)를 코드 차원에서 존중한다. 카탈로그 작성자의 의도가 forge 출력에 살아남는다
- request_schema/response_schema의 `TODO`가 사용자에게 "여기 채워야 한다"는 명시적 신호. ADR 0003 동행 톤(빈 자리는 부끄러운 게 아니다)과 같은 결
- selected + auto_added로 빌드 경계가 분명하다. affected를 자동으로 빌드 자리에 넣어 사용자를 잘못된 자리로 이끄는 일이 없다

### 부정적 / 트레이드오프
- shape에서 graphql/rpc를 고른 사용자는 forge에서 멈춘다. 명확한 안내는 있지만 다시 shape를 돌려야 한다는 부담. 미래 ADR이 들어오기 전까지의 임시 비용
- block.api_style → endpoint 매핑이 평균에 맞춰져 있어 평균에서 벗어난 블럭(예: 읽기 전용 자원)은 endpoint를 손으로 가감해야 한다. 미래의 가감 명령어가 이 자리를 보강
- request_schema/response_schema가 TODO로 시작해서 다음 단계가 그 자리를 어떻게 다룰지 결정이 필요하다. 별도 ADR로
- forge가 비인터랙티브라 사용자가 결과를 보기 전까지는 어떤 endpoint가 자동 생성될지 알 수 없다. 다만 contracts.yml을 출력 후 보여주면 즉시 확인 가능

### 미래 묶임
- 5개 결정 모두 표준이다. 변경하려면 ADR이 필요하다
- contracts.yml의 schema_version 1은 첫 출시. 형식 변경(예: GraphQL 자리 추가)은 schema_version 2로 올리고 마이그레이션 ADR로 결정
- block.api_style → endpoint 매핑 표(resource→5, query→1, internal→0)는 표준이다. 매핑 변경은 ADR로 결정
- 자동 생성 깊이(skeleton + TODO)도 표준. 더 깊은 자동 생성(스키마 추론, AI 기반)은 미래 ADR로 도입
- selected + auto_added 경계는 빌드 정의의 일부. 변경하려면 빌드 정의 자체를 다시 보는 ADR이 필요하다

## 링크
- 이전 결정: ADR 0007 (.byeorim/ 자리), ADR 0010 (selected-blocks.yml 형식), ADR 0012 (architecture.yml 형식)
- 후속 작업 후보: GraphQL/RPC contracts 형식 ADR, request/response 스키마 채우기 ADR, AI 기반 스키마 생성 ADR, endpoint 가감 명령어 ADR
- 관련 정책: CLAUDE.md 섹션 0(사용자 우선순위), 섹션 6(아키텍처 결정 ADR), 섹션 8(파일당 책임, 한국어 메시지)
