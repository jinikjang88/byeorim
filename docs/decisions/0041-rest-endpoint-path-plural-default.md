# ADR 0041. REST endpoint path 복수형 default

- 상태: 채택
- 날짜: 2026-05-06
- 결정자: DevSmith
- 관계: ADR 0013(forge 책임과 contracts.yml 형식)의 path 매핑 결을 갱신. ADR 0034/0035/0039의 forge 흐름은 그대로

## 맥락

forge가 contracts.yml을 만들 때 endpoint path를 `pathFromBlockId(block.id)`로 박는다(ADR 0013 결정 3). 현재 구현은 block.id를 그대로 path로 둔다(`order` → `/order`). 단수형 default다.

업계 관례를 보면 REST API path는 압도적으로 복수형이다. Microsoft REST API Guidelines, Google API Design Guide, Stripe, GitHub, PayPal, Twilio, Heroku 등 주요 스타일 가이드 모두 컬렉션에 복수형 명사를 쓴다("Resource names should be plural"). 의미상 `GET /orders`는 컬렉션 목록, `GET /orders/{id}`는 한 건이라는 결이 자연스럽다. OpenAPI 스펙 자체는 단수/복수에 중립이지만 OpenAPI 도구 예시(`/pets`, `/users`)도 복수형을 쓴다.

Byeorim의 1순위 사용자(비기술 창업자)는 path 결을 직접 못 본다. 다만 만든 API를 받아 쓸 엔지니어들이 단수형을 어색하게 여길 자리. CLAUDE.md 섹션 1(프로토타입이지만 프로덕션급 코드 품질)과 섹션 0(글로벌 오픈소스 표준 비전) 정신상 관례에 맞추는 결이 옳다.

이 ADR로 forge의 path 매핑을 복수형으로 갱신한다. 이전 단수형 결은 미래 ADR로 대체된다.

## 검토한 옵션

### 결정 1. 복수화 자리

#### 옵션 A. pluralize 라이브러리 (npm `pluralize`)
- 장점: 200+ 불규칙 명사 처리(history → histories, search → searches, category → categories). well-tested, ~2KB. 미래에 새 단어가 들어와도 라이브러리가 알아서 처리
- 단점: 의존성 한 자리 추가. ESM 호환은 검증됨

#### 옵션 B. 직접 구현(불규칙 표 + 정규식 규칙)
- 장점: 의존성 안 늘림. 코드가 한 자리에서 다 보임
- 단점: 불규칙 자리(`history` → `histories`, `search` → `searches`)를 다 박아야 함. 미세한 자리에서 빈틈. 미래에 새 단어가 들어오면 표 갱신

#### 옵션 C. 복수화 없이 사용자가 카탈로그에 path 필드 직접 적기
- 장점: 자동화 부담 없음
- 단점: 카탈로그 작성자에게 부담 더함. 비기술 창업자가 자주 쓰는 commerce 카탈로그도 path 필드를 다 적어야 함

### 결정 2. 복합어(하이픈 분리) 처리

#### 옵션 A. 마지막 단어만 복수화
- 장점: `cancel-return` → `cancel-returns`, `product-search` → `product-searches`. 의미상 자연스러움. 영어 명사 결이 보통 마지막에 복수화 자리(예: "cancel returns", "product searches")
- 단점: 한 자리 분기 자리

#### 옵션 B. 전체를 한 토큰으로 pluralize
- 장점: 코드 단순
- 단점: pluralize 라이브러리는 보통 한 단어 단위로 동작. 하이픈 복합어를 그대로 넣으면 결과가 어긋날 수 있음(라이브러리 동작 의존)

#### 옵션 C. 첫 단어만 복수화
- 장점: 결이 다름
- 단점: 영어 결과 어긋남. "cancels-return"은 부자연스러움

### 결정 3. 비ASCII / 비영문 block id

#### 옵션 A. 복수화 없이 단수형 그대로
- 장점: 한국어 block id가 들어와도 path가 안 깨짐. graceful 폴백
- 단점: path에 한국어 char가 박히면 URL 인코딩 자리. 다만 이 자리는 카탈로그 작성자가 풀 자리이지 forge 자리 아님

#### 옵션 B. 에러로 거부
- 장점: 명확한 신호
- 단점: 사용자 흐름이 막힘. 동행 톤(ADR 0003) 정신과 어긋남

#### 옵션 C. 카탈로그에 path 필드 강제(영문 아니면 path 필수)
- 장점: 사용자에게 결정 자리 줌
- 단점: 카탈로그 검증 자리 한 곳 더 추가. 이번 출시는 over-design

### 결정 4. 기존 사용자 마이그레이션

#### 옵션 A. 자동 마이그레이션 없음(사용자가 forge 다시 돌리거나 import-review로 다듬음)
- 장점: 자동 마이그레이션은 위험. 기존 contracts.yml에 사용자가 직접 다듬은 자리도 있을 수 있어 자동 변환은 사용자 의지 무시. 사용자가 forge를 다시 돌리면 새 path로 갱신. import-review(ADR 0039)로 자리마다 path를 바꾸는 결도 가능. Byeorim이 아직 production 사용자 없는 결이라 부담 작음
- 단점: 사용자가 마이그레이션 자리를 자기 결로 풀어야 함. 다만 안내 한 줄로 풀어줌

#### 옵션 B. 자동 마이그레이션 도구(`byeorim forge migrate-paths`)
- 장점: 사용자 부담 적음
- 단점: 사용자가 직접 다듬은 path를 덮어쓸 위험. 이번 출시는 over-design. 미래에 사용자 피드백이 쌓이면 후속 ADR

#### 옵션 C. 단수형/복수형 양쪽 호환 모드
- 장점: 호환 유지
- 단점: 코드 자리 두 갈래. 결이 흐려짐. 새 default가 약해짐

## 결정

### 결정 1: pluralize 라이브러리 (옵션 A)

`pluralize` npm 패키지를 packages/cli에 의존성 추가. forge.js의 `pathFromBlockId`가 사용한다. 200+ 불규칙 명사를 라이브러리가 처리하니 코드 자리는 깨끗하고 미래 새 단어도 자동.

### 결정 2: 마지막 단어만 복수화 (옵션 A)

```js
function pluralizeSegment(segment) {
  const parts = segment.split('-');
  parts[parts.length - 1] = pluralize(parts[parts.length - 1]);
  return parts.join('-');
}
```

`order` → `orders`, `cancel-return` → `cancel-returns`, `product-search` → `product-searches`, `order-history` → `order-histories`(history → histories). 영어 명사의 결을 자연스럽게 따른다.

### 결정 3: 비ASCII는 단수형 폴백 (옵션 A)

pathFromBlockId는 block.id가 ASCII 영문(소문자 + 숫자 + 하이픈)일 때만 복수화. 그 외(한국어, 대문자 시작 등)는 단수형 그대로.

```js
function pathFromBlockId(blockId) {
  const segment = blockId.replace(/_/g, '-');
  if (!/^[a-z][a-z0-9-]*$/.test(segment)) {
    return `/${segment}`;
  }
  return `/${pluralizeSegment(segment)}`;
}
```

### 결정 4: 자동 마이그레이션 없음 (옵션 A)

기존 사용자(.byeorim/contracts.yml에 단수형 path가 있음)는 다음 자리에서 갱신.

- forge를 다시 돌리면 새 복수형 path로 갱신(state가 forge 단계여야 함. 이미 진행한 사용자는 state 자리를 손으로 되돌리는 결)
- 또는 `byeorim forge import-review`(ADR 0039)로 외부 AI 응답을 받아 path를 자리마다 다듬는 결
- 또는 contracts.yml을 직접 수정(절대 금지선 5번 정신상 권장 안 함)

CLI 출력에 안내. forge가 처음 돌 때 또는 사용자가 status로 볼 때 한 번 안내.

## 결과

### 긍정적
- 업계 관례(Microsoft/Google/Stripe/GitHub 등)에 맞춰 portfolio-grade 자리(CLAUDE.md 섹션 1) 정신 살아남
- OpenAPI 도구 예시 결과 일관(`/pets`, `/users`, `/orders`)
- 사용자가 만든 API를 받아 쓸 엔지니어가 어색하지 않은 결
- pluralize 라이브러리가 불규칙 자리 자동 처리(history → histories, search → searches, category → categories)
- 비ASCII block id가 들어와도 graceful 폴백

### 부정적 / 트레이드오프
- pluralize 의존성 한 자리 추가. ~2KB라 무게 작지만 의존성 자리는 한 번 더 자라남
- 기존 사용자(.byeorim/contracts.yml)는 자동 마이그레이션 안 됨. 사용자가 forge를 다시 돌리거나 import-review로 다듬어야 함. Byeorim이 아직 production 사용자 없는 결이라 부담 작지만 미래 사용자에는 안내 자리 필요
- 하이픈 복합어의 마지막 단어가 동사형(예: `inventory-manage`, `product-register`)이면 결과가 어색(`inventory-manages`, `product-registers`). 카탈로그 작성자가 명사형 id를 박는 결이 자연스러움. 미래에 카탈로그 path override 자리(별도 ADR)가 풀어줄 자리
- 한국어 block id는 단수형 폴백이라 path가 한국어 char 그대로(URL 인코딩 자리). 카탈로그 작성자가 영문 id를 쓰는 결이 권장. 미래 ADR로 path 필드 옵셔널을 추가할 자리

### 미래 묶임
- pathFromBlockId 결과 결(복수형 default + ASCII 영문 가드 + 마지막 단어 복수화)은 표준. 변경하려면 새 ADR
- pluralize 라이브러리 의존성 자리는 표준. 다른 라이브러리로 교체는 ADR
- 카탈로그에 path override 옵셔널 필드 추가는 미래 ADR 자리(이번 출시는 자동만)
- 자동 마이그레이션 도구는 미래 ADR 자리(사용자 피드백 쌓이면)
- 단수형이 의미적으로 옳은 자리(예: `/me`, `/account` 같은 싱글톤)는 미래 ADR 자리(이번 출시는 모든 블럭이 컬렉션이라는 가정)

## 링크
- 갱신 대상: ADR 0013 결정 3 (path 매핑 자리, 단수형 → 복수형)
- 짝 결정: ADR 0039 (forge import-review로 사용자가 path를 다듬는 자리)
- 입력 의존: 없음(forge 본체의 한 자리만 변경)
- 후속 작업 후보: 자동 마이그레이션 도구, 카탈로그 path override 옵셔널 필드, 싱글톤 자원 결(예: `/me`)
- 관련 정책: CLAUDE.md 섹션 0(글로벌 표준 비전), 섹션 1(프로덕션급 코드 품질), 섹션 8(파일당 책임)
- 외부 참고: Microsoft REST API Guidelines (Resource names plural), Google API Design Guide, OpenAPI 도구 예시
