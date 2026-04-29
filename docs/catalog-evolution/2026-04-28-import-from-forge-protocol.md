# 2026-04-28. forge-protocol v0.5.0에서 카탈로그 데이터 이전

## 무엇을 가져왔는가

ADR 0004에서 데이터만은 직접 복사를 허용한 자리다. forge-protocol v0.5.0의 두 도메인 카탈로그를 packages/templates 아래로 그대로 옮겼다.

- `templates/commerce/catalog.yml` → `packages/templates/commerce/catalog.yml`
- `templates/job-aggregator/catalog.yml` → `packages/templates/job-aggregator/catalog.yml`

원본은 `C:\Users\jinik\IdeaProjects\forge-protocol`에 있다. v0.5.0 시점의 catalog는 다음 구성을 가진다.

| 도메인 | worlds | bundles | blocks | dependencies | cascades | prerequisites |
|--------|--------|---------|--------|--------------|----------|---------------|
| commerce | 6 | 13 | 21 | 19 | 3 | 5 |
| job-aggregator | 4 | 7 | 17 | 19 | 0 | 0 |

ADR 0004가 언급한 "22 블럭, 19 의존성" 수치는 v0.1.0 시점이거나 작성 당시 메모 차이로 보인다. 현재 v0.5.0 commerce 블럭은 21개다.

## 두 도메인 사이의 형식 차이

이전 과정에서 실제 데이터를 들여다보고 정리했다. 두 도메인 카탈로그가 서로 다른 시점에 자라서 필드 구성이 일관되지 않다.

### World

| 필드 | commerce | job-aggregator |
|------|----------|----------------|
| id | 있음 | 있음 |
| title | 있음 | 있음 |
| description | 있음 | 있음 |
| order | 있음 | 없음 |
| slug | 있음 | 있음 |
| icon | 없음 | 있음 |

### Bundle

| 필드 | commerce | job-aggregator |
|------|----------|----------------|
| id | 있음 | 있음 |
| world_id | 있음 | 있음 |
| title | 있음 | 있음 |
| description | 있음 | 없음 |

### Block

| 필드 | commerce | job-aggregator |
|------|----------|----------------|
| analogy | 있음 | 없음 |
| api_style | 있음 | 없음 |
| icon | 없음 | 있음 |

### Dependency

이름이 다르고 의미가 같은 자리가 한 곳 있다.

| 필드 | commerce | job-aggregator |
|------|----------|----------------|
| condition | 있음 | 없음 |
| reason | 없음 | 있음 |

### 카탈로그 최상위 메타데이터

job-aggregator만 최상위에 두 필드를 더 가진다.

| 필드 | commerce | job-aggregator |
|------|----------|----------------|
| name | 없음 | 있음 (예: "채용공고 통합 검색") |
| domain | 없음 | 있음 (예: "job-aggregator") |

스키마는 두 필드를 옵션으로 받는다. 카탈로그 표시명과 도메인 식별자로 쓰면 좋다는 의도가 담긴 자리지만 표준화는 미뤘다.

ADR 0005는 두 이름을 둘 다 옵션으로 받기로 했다. 어느 쪽으로 통합할지는 후속 ADR로 결정한다.

## 스키마 정책

ADR 0005에 따라 관대한 스키마를 채택했다. 필수는 worlds, blocks, 그리고 각 항목 안 핵심 필드(id, title, name, user_desc)뿐이다. 차이 필드는 모두 옵션이다. 두 도메인 데이터가 PR을 막지 않도록 했다.

검증은 `packages/catalog/schemas/catalog.schema.json`이 형식을 보고, `packages/catalog/src/validate.js`가 ID 참조 무결성을 본다. 둘 다 통과해야 한다.

## 통과 확인

`tests/integration/templates-validation.test.js`가 두 도메인을 매번 검증한다. 형식 오류든 참조 오류든 PR 단계에서 잡힌다.

## 다음에 할 일

- condition과 reason 통합 결정 (별도 ADR)
- icon, slug, order 같은 옵션 필드의 표준화 시점 결정
- 한국어 에러 메시지 매핑 레이어 추가
