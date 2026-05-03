# ADR 0008. intent.yml 형식

- 상태: 채택 (결정 2가 ADR 0026으로 부분 갱신됨)
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0007이 `.beoreum/project/intent.yml`을 Prospect 단계의 산출물 자리로 박았다. 그러나 그 파일 안이 어떻게 생겼는지는 정하지 않았다. 이 ADR이 그 자리를 채운다.

CLAUDE.md 섹션 2의 절대 금지선 1번이 "intent.yml, selected-blocks.yml, contracts.yml 중 하나라도 없으면 애플리케이션 코드를 생성하지 않는다"고 박았다. 즉 intent.yml의 존재가 다음 단계(Smelt)의 진입 조건이다. 무엇이 intent.yml에 들어있어야 다음 단계가 그 위에 올라설 수 있는지 정해야 한다.

또한 intent.yml은 사용자가 만든 자연어 한 마디와 그 안에서 추출된 구조화된 의도가 모두 들어가는 자리다. AI 어댑터(ADR 0009)가 추출하는 결과의 형식이 곧 intent.yml의 형식이다. 두 ADR이 짝이다.

Reality Check는 ADR 0003에서 이미 6영역으로 결정됐다. 다만 이번 출시 범위는 reality-check.md placeholder까지만이다. intent.yml은 Reality Check가 진행되었는지 표시하는 필드(reality_check_status)를 가진다.

## 검토한 옵션

### 결정 1. 추출 결과를 어디에 둘지

#### 옵션 A. intent.yml 한 파일에 모든 추출 결과
- 장점: 한 자리만 보면 사용자 의도가 다 보인다. CLI가 Smelt를 시작할 때 한 파일만 읽으면 된다
- 단점: 사용자 입력과 AI 추출 결과가 한 파일에 섞인다. 다만 두 정보는 자연스럽게 짝이라 분리 실익이 적다

#### 옵션 B. user-input.txt와 extracted.yml 분리
- 장점: 원본 사용자 입력과 AI 해석이 명확히 분리됨. 사용자가 원본을 다시 보기 쉽다
- 단점: 두 파일을 함께 갱신해야 함. 한쪽만 바뀌면 부정합 위험

### 결정 2. AI 어댑터의 출력 형식

#### 옵션 A. 자유 형식 (AI가 알아서 채움)
- 장점: AI 표현력 최대 활용
- 단점: 다음 단계가 이 파일을 못 읽는다. 모델이 바뀌면 형식이 무너진다. 절대 금지선 6번(벤더 무관)과 충돌

#### 옵션 B. 고정 키 (what, who, why)와 자유 텍스트 값
- 장점: 다음 단계가 키를 안다. 값은 자유 문장이므로 표현력 손실 적음
- 단점: 키 자체가 모든 도메인에 잘 맞는지 검증이 필요

#### 옵션 C. 깊은 구조화 (섹터, 비즈니스 모델, 타겟 페르소나 등 세분화)
- 장점: 풍부한 정보
- 단점: 비기술 창업자가 첫 단계에서 압도. 1순위 사용자 이탈

### 결정 3. 카탈로그 출처 추적

#### 옵션 A. source 필드로 출처 표기 (template|ai|custom)
- 장점: 다음 단계가 카탈로그를 어떻게 다룰지 결정할 수 있다(템플릿이면 수정 보수적, AI 생성이면 사용자 검토 권장)
- 단점: 필드 하나 추가됨

#### 옵션 B. 출처 추적 안 함
- 장점: 단순
- 단점: 카탈로그 진화 노트(CLAUDE.md 섹션 5)와 연결되지 않음. 6개월 뒤 이 카탈로그가 어디서 왔는지 모른다

### 결정 4. Reality Check 진행 표시

#### 옵션 A. reality_check_status 필드로 상태 추적 (pending|completed|skipped)
- 장점: Smelt가 시작되기 전 Reality Check가 끝났는지 한 자리에서 확인. 미래에 Reality Check 출시되면 자연스럽게 채워짐
- 단점: 이번 출시는 항상 'pending'으로만 적힘. 잠시 의미 없는 필드

#### 옵션 B. 필드 없음, reality-check.md 존재 여부로 판단
- 장점: 필드 없음. 단순
- 단점: 파일 시스템 상태가 의미 표현이 됨. 명시적 필드보다 추적이 어렵다

## 결정

### 결정 1: 한 파일에 모든 추출 결과 (옵션 A)

intent.yml 한 파일에 사용자 입력과 추출 결과를 둔다. 두 정보는 짝이라 분리 실익이 적다.

### 결정 2: 고정 키(what, who, why) + 자유 텍스트 (옵션 B)

추출 결과는 다음 세 키를 가진다.

- `what`: 무엇을 만들고 싶은가 (예: "온라인 쇼핑몰", "예약 플랫폼")
- `who`: 누구를 위해 만드는가 (예: "동네 카페 사장님과 단골 손님", 비어있을 수 있음)
- `why`: 왜 만드는가, 어떤 가치인가 (예: "단골 손님에게 온라인 주문을 받기 위해", 비어있을 수 있음)

세 키는 1순위 사용자(비기술 창업자)가 첫 만남에서 답할 수 있는 자리만 골랐다. who와 why가 비어도 다음 단계로 갈 수 있다(동행 톤, ADR 0003 결정 2).

### 결정 3: source 필드로 카탈로그 출처 표기 (옵션 A)

`source`는 다음 둘 중 하나로 시작한다.

- `template:<name>`: 빌트인 템플릿 사용 (예: `template:commerce`, `template:job-aggregator`)
- `ai:<adapter>`: AI 어댑터 생성 (예: `ai:mock`, 미래에 `ai:claude` 등)

`custom`은 미래에 사용자가 직접 작성한 카탈로그를 가리키는 자리로 예약. 이번 출시는 처리하지 않는다.

### 결정 4: reality_check_status 필드로 상태 추적 (옵션 A)

`reality_check_status`는 다음 셋 중 하나다.

- `pending`: Reality Check 미진행 (이번 출시 기본값)
- `completed`: 6영역 모두 진행됨
- `skipped`: 사용자가 의도적으로 건너뜀

이번 출시는 항상 `pending`으로 적힌다. Reality Check 출시 시점에 prospect 코드가 이 값을 갱신한다.

### intent.yml 전체 형식

```yaml
schema_version: 1
created_at: 2026-04-28T00:00:00.000Z
user_input: "쇼핑몰 만들어줘"
source: template:commerce
extracted:
  what: "온라인 쇼핑몰"
  who: ""
  why: ""
reality_check_status: pending
```

필드 정리:

- `schema_version` (정수, 필수): 미래 마이그레이션 분기점. 첫 출시는 1
- `created_at` (ISO 8601 문자열, 필수): prospect 실행 시각
- `user_input` (문자열, 필수): 사용자가 입력한 자연어 한 마디 그대로
- `source` (문자열, 필수): `template:<name>` 또는 `ai:<adapter>` 형식
- `extracted` (객체, 필수): what, who, why 세 키. 모두 문자열, who와 why는 빈 문자열 허용
- `reality_check_status` (열거형, 필수): pending|completed|skipped

## 결과

### 긍정적
- 다음 단계(Smelt)가 intent.yml만 읽으면 사용자가 무엇을 어디로 가지고 가려는지 안다
- source 필드로 카탈로그 출처가 추적된다. 진화 노트(CLAUDE.md 섹션 5)와 연결할 길이 열려있다
- schema_version으로 미래 형식 변경의 마이그레이션 자리가 미리 만들어져 있다
- 절대 금지선 6번(벤더 무관)을 키 자체에 박았다. AI가 자유 형식으로 답하지 않고 정해진 키에 답한다. 모델이 바뀌어도 형식이 그대로다

### 부정적 / 트레이드오프
- 깊은 구조화를 선택하지 않아서 비즈니스 모델, 페르소나, 섹터 같은 정보는 이 자리에 없다. 그건 다음 단계(Smelt의 cascade 결정 또는 Shape의 architecture.yml)가 채운다. 이번 출시는 가벼운 첫 만남에 집중
- reality_check_status는 이번 출시에서 항상 `pending`이라 잠시 의미가 약하다. 다만 자리를 미리 만들어두면 Reality Check 출시 시점에 추가 ADR 없이 반영된다
- who와 why가 비어있을 수 있어서 다음 단계가 두 필드의 부재를 처리해야 한다. 다만 동행 톤(ADR 0003)이 이 부재를 막지 않는다는 결정과 정합

### 미래 묶임
- intent.yml의 키 이름(what, who, why, source, extracted, reality_check_status)은 표준이다. 변경하려면 schema_version을 올리고 마이그레이션 결정을 ADR로 한다
- source 형식(`template:<name>` 또는 `ai:<adapter>`)은 표준이다. 새 형식(예: `custom`)을 추가하려면 ADR이 필요하다
- reality_check_status 값(pending|completed|skipped)도 표준. 다른 값을 추가하려면 ADR이 필요하다
- AI 어댑터의 extractIntent 출력은 이 형식의 extracted 부분과 같은 모양이어야 한다. ADR 0009가 그 약속을 박는다

## 링크
- 이전 결정: ADR 0007 (.beoreum/ 디렉토리 레이아웃)
- 짝 결정: ADR 0009 (AI 어댑터 인터페이스)
- 후속 출시: Reality Check 6영역 리포트 (별도 ADR 또는 명세 문서)
- 관련 정책: CLAUDE.md 섹션 2(절대 금지선 1번 intent.yml 필수), 섹션 5(역사 요구사항)
