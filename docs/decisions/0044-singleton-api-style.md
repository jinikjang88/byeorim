# ADR 0044. 싱글톤 자원 api_style

- 상태: 채택
- 날짜: 2026-05-06
- 결정자: DevSmith
- 관계: ADR 0013(forge 책임과 contracts.yml 형식)의 api_style 자리 확장. ADR 0014(test-scenarios.yml)와 ADR 0042(block.path 옵셔널)의 결을 따른다

## 맥락

forge가 block.api_style별로 endpoint를 매핑한다(ADR 0013 결정 3). 현재 셋.

- `resource` → 5개 CRUD endpoint(create/list/get/update/delete)
- `query` → 1개 search endpoint
- `internal` → 0개(공개 API 없음)

이 셋이 모든 자원을 다 풀지 못한다. **싱글톤 자원**이 비어있는 자리.

싱글톤 자원이란 한 자리에 하나만 있는 자원. REST 관례상 path가 단수형 고정(예: `/me`, `/account`, `/profile`, `/settings`). 식별자(`{id}`)가 path에 없음. 인증된 사용자 자리에서 본인의 한 자리를 가리키는 결.

특징.

- 컬렉션이 아니라 한 자원이므로 `create`(POST 컬렉션)와 `list`(GET 컬렉션) 자리가 없음
- HTTP 메서드는 보통 GET(읽기), PATCH(부분 수정) 또는 PUT(전체 교체), DELETE(삭제)
- path는 단수형(`/me`)이라 자동 복수화 결(ADR 0041)이 어긋남. block.path로 박는 결이 자연스럽지만 auto fallback도 단수형이어야 함

업계 자리.
- Stripe API의 `/me`(인증된 사용자)
- GitHub API의 `/user`(인증된 사용자, 컬렉션 `/users`와 평행 자리)
- 많은 SaaS API의 `/account`, `/profile`, `/settings`

이 자리를 풀어준다.

## 검토한 옵션

### 결정 1. 새 api_style 자리 결

#### 옵션 A. 새 enum 값 'singleton' 추가
- 장점: api_style 자리에 한 결로 박힘. 기존 셋과 평행. 사용자(카탈로그 작성자)가 명시적으로 박는 결이 명확
- 단점: enum 자리 한 줄 추가. 다만 작음

#### 옵션 B. block에 isSingleton 플래그 추가
- 장점: api_style은 'resource'로 두고 플래그로 분기
- 단점: 두 자리(api_style + isSingleton) 봐야 함. 결이 흩어짐. forge 분기 자리도 두 자리 봐야 함

#### 옵션 C. resource 그대로 두고 endpoint 자동 매핑이 다른 결
- 장점: enum 자리 안 늘림
- 단점: 같은 api_style이 다른 endpoint 매핑을 가짐. 결이 모호. 카탈로그 작성자가 의도를 못 표현

### 결정 2. HTTP 메서드 자리

#### 옵션 A. GET / PATCH / DELETE (3개 endpoint)
- 장점: 부분 수정(PATCH)이 RESTful 표준. 싱글톤 자원의 일부 필드만 수정하는 흔한 결. 커뮤니티(Stripe, GitHub)와 일관
- 단점: 사용자가 PATCH를 PUT보다 덜 친숙할 수 있음. 다만 표준 자리

#### 옵션 B. GET / PUT / DELETE (3개 endpoint)
- 장점: 직관적(전체 교체). PATCH보다 친숙
- 단점: 싱글톤 자원에 전체 교체는 부자연스러움(예: /me에 PUT으로 전체 교체하면 password 같은 필드도 다 보내야 함). 일부 필드만 수정하는 결과 어긋남

#### 옵션 C. GET / PUT / PATCH / DELETE (4개)
- 장점: 둘 다 지원
- 단점: 사용자가 두 자리를 구분해서 알아야 함. 단순한 자리에 부담

### 결정 3. operation 이름

#### 옵션 A. get / update / delete (resource의 같은 자리 결과 평행)
- 장점: 카탈로그/forge/temper에서 같은 operation 이름이 두 api_style에서 같은 의미. operation 템플릿(ADR 0014)을 그대로 재사용
- 단점: resource의 get은 `/{id}`로 한 건 조회, singleton의 get은 `/me` 한 자리 조회라 의미가 미세하게 다름. 다만 사용자에게는 한 결로 풀어 보여줄 수 있음

#### 옵션 B. read_self / update_self / delete_self (새 이름)
- 장점: 의미 명확
- 단점: temper의 OPERATION_TEMPLATES 자리 새로 박아야 함. set의 코드 생성 자리도 두 자리 분기

### 결정 4. block.path 결

#### 옵션 A. block.path가 있으면 그대로(ADR 0042 결정 1과 같은 결). 없으면 단수형(자동 복수화 안 함)
- 장점: 카탈로그 작성자가 권장(`/me`, `/profile`)을 명시적으로 박으면 그 결. 안 박은 자리는 단수형 default(`/account`)라 자연스러움
- 단점: pathForBlock에 api_style 분기 자리 한 줄 추가

#### 옵션 B. block.path 필수
- 장점: 결이 명확
- 단점: 카탈로그 작성자 부담. 다른 api_style은 옵셔널인데 singleton만 필수면 결이 어긋남

### 결정 5. set/code-gen 영향

#### 옵션 A. 이번 출시는 forge + temper만 처리. set/code-gen은 별도 PR
- 장점: 작은 묶음으로 출시. 사용자 피드백 받고 set 자리 보강
- 단점: singleton 블럭의 코드 생성 자리가 비어있음. 사용자가 경험 못 함

#### 옵션 B. set/code-gen까지 한 묶음
- 장점: 완성도
- 단점: 여러 코드 생성기(Node/Java/Python/Frontend) 변경. 큰 PR

## 결정

### 결정 1: 새 enum 'singleton' (옵션 A)

catalog.schema.json의 block.api_style enum에 'singleton' 추가. 네 갈래(resource/query/internal/singleton).

### 결정 2: GET / PATCH / DELETE (옵션 A)

3개 endpoint. 싱글톤 자원에 PATCH가 RESTful 표준. 사용자가 일부 필드만 수정하는 흔한 결.

| operation | method | path | description |
| --- | --- | --- | --- |
| get | GET | `{path}` | `{name}` 조회 |
| update | PATCH | `{path}` | `{name}` 수정 |
| delete | DELETE | `{path}` | `{name}` 삭제 |

### 결정 3: get / update / delete (옵션 A)

기존 operation 이름 재사용. ADR 0014의 OPERATION_TEMPLATES 자리도 그대로(get/update/delete가 이미 박혀있음).

다만 singleton의 get 자리에서 OPERATION_TEMPLATES.get은 "주어진 식별자의 {name}이 존재한다"라 식별자 자리가 어색. 사용자가 박은 카탈로그가 의도하는 결과 미세하게 어긋남.

이 자리는 두 갈래.

- 갈래 a: 기존 템플릿 그대로 두고 사용자가 시나리오 텍스트를 import-review로 다듬는 결로 풀어줌(ADR 0040 결과 짝)
- 갈래 b: singleton 자리 전용 템플릿(`get_self/update_self/delete_self` 또는 같은 이름의 다른 텍스트) 추가

이번 출시는 갈래 a. 단순함 + 사용자가 import-review로 다듬는 결이 살아있음. 미래 ADR이 갈래 b로 풀어줄 자리.

### 결정 4: block.path 옵셔널 (옵션 A)

block.path가 박히면 그대로. 안 박혀있으면 단수형(자동 복수화 없이 `/${block.id}`). 카탈로그 작성자에게 `/me`, `/profile` 같은 권장 path는 직접 박으라고 안내(ADR 0042의 같은 결).

forge의 pathForBlock 결.

```js
function pathForBlock(block) {
  if (typeof block.path === 'string' && block.path.length > 0) return block.path;
  if (block.api_style === 'singleton') {
    // 싱글톤은 자동 복수화 안 함. 단수형 default
    return `/${block.id.replace(/_/g, '-')}`;
  }
  return pathFromBlockId(block.id);
}
```

### 결정 5: 이번 출시는 forge + temper + 검토 화면 (옵션 A)

forge가 3개 endpoint 만들고, temper가 3개 시나리오 만들고, picker(검토 화면)가 'singleton' api_style을 표시. set/code-gen은 별도 PR.

set이 contracts.yml의 endpoints를 그대로 읽어 라우트 자리를 만드는 결이라면 singleton 블럭도 자동으로 동작할 가능성이 큼. 다만 검증 안 된 자리. 별도 PR에서 확인.

#### 후속 검증 (2026-05-06 보강)

set/code-gen 검증 결과 **자동 동작 안 함**(latent 버그 발견). 4 생성기(node/java/python/frontend) 모두 `OPERATION_HTTP_METHOD[ep.operation]`로 method를 다시 매핑하던 결이었다(예: `update → PUT`). singleton의 update는 forge가 PATCH로 박지만 생성기는 PUT을 emit하는 자리.

후속 PR로 **`ep.method`를 진실로 박아 4 생성기 모두 forge가 박은 method를 그대로 emit**하게 갱신. 부산물.

- packages/cli/src/generators/util.js에 `methodSpec(ep)` 헬퍼와 `springAnnotation(method)` 추가
- node.js: `fastify.${ep.method.toLowerCase()}()` 그대로 emit
- java.js: `springAnnotation(spec.method)`로 PostMapping/PatchMapping/PutMapping 등 매핑
- python.js: `@router.${ep.method.toLowerCase()}()` 그대로 emit
- frontend.js: `method: '${spec.method}'` fetch에 그대로 emit
- 4 생성기 모두 path prefix를 `/${blockId}` 하드코딩에서 `endpoints[0].path`로 갱신(ADR 0041/0042/0044가 박은 path 결을 그대로 emit). path param 이름도 `id` 하드코딩에서 `pathParamName(ep.path)`로 추출
- 4 set 테스트에 singleton 케이스 추가(@PatchMapping, fastify.patch, @router.patch, fetch method PATCH 검증)

이 자리로 ADR 0041(복수형 default), ADR 0042(block.path), ADR 0043(i18n path), ADR 0044(singleton)이 모두 set 단계에서 살아남음.

## 결과

### 긍정적
- 싱글톤 자원(`/me`, `/account`, `/profile`)을 카탈로그 작성자가 명시적으로 박을 수 있는 자리
- REST 관례(컬렉션이 아닌 한 자원의 path 결)가 살아남음
- ADR 0042의 block.path 옵셔널과 짝이 맞음. 사용자가 `/me` 같은 권장 path를 박는 자리가 자연스러움
- forge/temper/picker 한 묶음이라 사용자가 한 단계에서 전체 흐름을 봄

### 부정적 / 트레이드오프
- 같은 operation 이름(get/update/delete)을 다른 결로 쓰는 자리(resource는 컬렉션 안의 한 건, singleton은 한 자원). 사용자가 의미 차이를 안 보면 살짝 헷갈릴 수 있음. 다만 path가 다르니(`/orders/{id}` vs `/me`) 결을 추론할 수 있음
- temper의 OPERATION_TEMPLATES 텍스트가 singleton에 미세하게 어긋남("주어진 식별자의 X이 존재한다"). 사용자가 import-review로 다듬는 결로 풀어줌. 미래 ADR이 전용 템플릿 추가
- set/code-gen 자리가 검증 안 됨. 다음 PR에서 확인
- catalog.schema.json의 enum 자리 한 줄 추가. 작은 자리

### 미래 묶임
- 4개 api_style enum(resource/query/internal/singleton)은 표준
- singleton의 3개 메서드(GET/PATCH/DELETE)는 표준
- operation 이름 재사용(get/update/delete)은 표준
- singleton 전용 GWT 템플릿은 미래 ADR 자리
- set/code-gen의 singleton 처리는 후속 PR(검증 후 ADR 갱신 자리)

## 링크
- 갱신 대상: ADR 0013 결정 3(api_style → endpoint 매핑 표)
- 짝 결정: ADR 0042 (block.path 옵셔널, 싱글톤 path를 명시적으로 박는 자리)
- 입력 의존: ADR 0014 (test-scenarios.yml의 OPERATION_TEMPLATES)
- 후속 작업 후보: singleton 전용 GWT 템플릿, set/code-gen의 singleton 처리, /me 같은 인증 컨텍스트 자리(권한 검증 시나리오)
- 관련 정책: CLAUDE.md 섹션 1(프로덕션급 코드 품질), 섹션 8(파일당 책임)
