# ADR 0010. Smelt 산출물 형식 (selected-blocks.yml, decisions.yml)

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0007이 Smelt 단계 산출물의 자리를 박았다. `.byeorim/project/selected-blocks.yml`과 `.byeorim/project/decisions.yml`이 그 자리다. 그 파일 안이 어떻게 생겼는지는 정하지 않았다. 이 ADR이 그 자리를 채운다.

CLAUDE.md 섹션 2의 절대 금지선 1번이 selected-blocks.yml을 다음 단계 진입 조건으로 박았다. 즉 selected-blocks.yml의 형식이 Shape 단계의 입력 형식이기도 하다.

decisions.yml은 cascade 질문과 사용자 답변의 자리다. ADR 0003(Reality Check)이 정한 동행 톤을 그대로 따른다. 답하지 못한 질문은 막지 않는다. 다만 형식 안에 답안 자리는 만들어 둬서 미래 답이 자라는 자리가 보이게 한다.

resolveAll이 돌려주는 `decisions` 배열은 다음 모양이다.

```js
[
  { trigger, question, options, cascade_effects },
  ...
]
```

이 모양이 decisions.yml의 한 항목과 그대로 짝이 되어야 작성과 읽기가 단순해진다.

또한 인터랙티브 prompt(inquirer 등)을 어떻게 도입할지가 별도 결정이다. 이 ADR은 산출물 형식만 정한다. 인터랙티브 모드는 형식에 의존하지 않으므로 별도 ADR로 다룬다.

## 검토한 옵션

### 결정 1. selected-blocks.yml 필드 구성

#### 옵션 A. resolveAll 출력을 그대로 직렬화 (selected, auto_added, affected, prerequisites)
- 장점: 알고리즘 출력과 파일이 1:1. 다음 단계 코드가 resolveAll을 다시 돌리지 않고 파일만 읽어도 같은 정보를 본다. 변경 추적이 단순
- 단점: affected와 prerequisites는 알림 정보이지 빌드 입력이 아니다. 한 파일에 두 결의 정보가 섞임

#### 옵션 B. selected와 auto_added만 selected-blocks.yml에, affected/prerequisites는 별도 파일
- 장점: 단일 책임이 강함
- 단점: 파일이 더 많아짐. ADR 0007의 자리 표가 한 줄 더 늘어난다. 다음 단계 코드가 두세 파일을 읽어야 함

#### 옵션 C. 모든 필드를 한 파일에 묶고 사용처를 주석으로 표시
- 장점: 한 자리만 보면 됨
- 단점: 사용처 주석은 강제력이 없어 표류 위험

### 결정 2. decisions.yml의 답변 자리 형식

#### 옵션 A. 각 질문에 answer 필드와 answered_at 필드를 미리 만들어 둠 (빈 값으로)
- 장점: 답이 안 채워진 상태가 형식에 명시적으로 보인다. 사용자가 파일을 열었을 때 어디에 답을 적는지 즉시 안다
- 단점: 빈 필드가 처음에 많다

#### 옵션 B. 답변은 별도 파일(decisions-answered.yml)에 저장
- 장점: 질문과 답변 분리
- 단점: 두 파일이 짝으로 움직여야 함. 한 파일이 빠지면 부정합. 비기술 창업자에게 두 파일 관리 부담

#### 옵션 C. 질문만 decisions.yml에, 답변은 다이어리에 자유 텍스트
- 장점: 다이어리 구조 일관성
- 단점: 답변과 질문의 매핑이 사라진다. 자동화된 다음 단계가 답을 못 찾는다

### 결정 3. 답하지 못한 질문 처리

#### 옵션 A. 빈 answer로 두고 다음 단계 진행 허용
- 장점: ADR 0003의 동행 톤과 정합. 시작을 막지 않음
- 단점: 다음 단계가 답이 없는 질문을 어떻게 다룰지 결정 필요

#### 옵션 B. 모든 질문에 답해야 다음 단계로 갈 수 있음
- 장점: 형식이 단단함
- 단점: ADR 0003 결정 2(답을 강요하지 않는다)와 충돌. 1순위 사용자 이탈

#### 옵션 C. 질문을 다이어리로 자동 이동
- 장점: 다이어리가 빈 답의 집합소
- 단점: cascade 질문은 구조화된 답이 필요한 자리(설계 결정)이므로 자유 텍스트 다이어리에 두면 다음 단계가 못 읽는다

### 결정 4. selected-blocks.yml의 prerequisites 직렬화 깊이

#### 옵션 A. 객체 전체를 그대로 (id, name, phase, where, time, cost, enables, requires_prereq)
- 장점: 다음 단계 코드가 카탈로그를 다시 읽지 않아도 됨. 자기 완결적
- 단점: 카탈로그 변경 시 파일이 stale해진다. 다만 prospect 시점의 스냅샷이라는 의미가 있어 stale도 의도의 일부

#### 옵션 B. ID만 (`prerequisites: [prereq-pg-contract, prereq-biz-register]`)
- 장점: 작은 파일
- 단점: 다음 단계가 카탈로그를 다시 읽어 prereq를 풀어야 함. 카탈로그가 외부에서 바뀌면 의미가 흔들림

## 결정

### 결정 1: resolveAll 출력을 그대로 직렬화 (옵션 A)

selected-blocks.yml은 다음 다섯 필드를 가진다.

- `schema_version` (정수, 필수): 미래 마이그레이션 분기점. 첫 출시는 1
- `created_at` (ISO 8601 문자열, 필수): smelt 실행 시각
- `selected` (문자열 배열, 필수): 사용자가 명시적으로 고른 블럭 ID 목록(입력 그대로)
- `auto_added` (문자열 배열, 필수): requires 의존성으로 자동 추가된 블럭 ID 목록
- `affected` (문자열 배열, 필수): affects 관계로 영향받는 블럭 ID 목록(추가는 아님)
- `prerequisites` (객체 배열, 필수): World 0 준비물. 카탈로그의 prerequisite 객체를 그대로 직렬화

resolveAll의 출력과 1:1로 매핑된다. 다음 단계가 같은 파일을 읽고 알고리즘 결과를 그대로 본다. 한 파일에 다섯 필드를 묶는 단점은 사용자 인지 부담보다 형식 단순성의 이점이 크다.

### 결정 2: 각 질문에 answer/answered_at 자리 미리 만듦 (옵션 A)

decisions.yml은 다음 형식이다.

```yaml
schema_version: 1
created_at: 2026-04-28T...
decisions:
  - trigger: coupon
    question: "쿠폰 사용 후 환불하면 쿠폰을 돌려줄까요?"
    options:
      - "복원 (쿠폰 유효기간 내라면 돌려줌)"
      - "소멸 (사용한 쿠폰은 복원 안 함)"
      - "조건부 복원 (전액 환불일 때만 복원)"
    cascade_effects:
      - "환불 로직에 쿠폰 복원 분기 추가"
    answer: ""
    answered_at: null
```

`answer`와 `answered_at`은 빈 값으로 시작한다. 사용자가 답을 적으면 그 자리에 들어간다. 답하지 않은 자리가 명시적으로 보이는 게 다이어리 정신과 같은 결이다(ADR 0003).

`answered_at`은 ISO 8601 또는 null. null이면 답이 없다는 신호.

### 결정 3: 빈 answer로 두고 다음 단계 진행 허용 (옵션 A)

답하지 못한 질문이 있어도 Shape 단계로 넘어갈 수 있다. ADR 0003 결정 2(동행과 다이어리)를 그대로 따른다. Shape 코드는 `answer`가 비어있으면 그 결정을 보류된 결정으로 다루고 architecture.yml에 `pending_decisions` 같은 자리를 둔다(별도 ADR).

답이 비어있다는 사실 자체는 신호다. Inspect 단계 또는 출시 직전에 다시 보여 사용자가 잊지 않게 한다.

### 결정 4: prerequisites는 객체 전체를 직렬화 (옵션 A)

selected-blocks.yml의 prerequisites는 카탈로그의 prerequisite 객체를 그대로 직렬화한다. id, name, phase, where, time, cost, enables, requires_prereq 모두 포함.

다음 단계가 카탈로그를 다시 읽지 않아도 된다. 이 결정은 selected-blocks.yml을 자기 완결적인 스냅샷으로 만든다. 카탈로그가 미래에 바뀌어도 smelt 시점의 결정이 보존된다.

## 결과

### 긍정적
- selected-blocks.yml과 resolveAll 출력이 1:1이라 코드가 단순하다. 다음 단계 코드도 형식만 따르면 된다
- decisions.yml에 답안 자리가 미리 있어 사용자가 어디에 답하는지 즉시 안다. 동행 톤이 형식에 박혔다
- prerequisites가 자기 완결적이라 카탈로그 변경에도 smelt 시점의 결정이 안 흔들린다. 역사 요구사항(CLAUDE.md 섹션 5)과 같은 결
- schema_version으로 미래 마이그레이션 자리가 두 파일 모두에 미리 만들어져 있다

### 부정적 / 트레이드오프
- selected-blocks.yml 한 파일에 입력(selected)과 결과(auto_added, affected, prerequisites)가 섞인다. 단일 책임 관점에서는 흠집이지만, 다섯 필드가 짝이라 분리 실익이 적다는 판단
- decisions.yml의 빈 answer 자리는 처음에 비어있어 파일이 살짝 길어 보인다. 다만 사용자에게는 "답할 자리가 여기 있다"는 명시적 안내 역할
- prerequisites 객체 전체를 직렬화하면 selected-blocks.yml이 살짝 커진다. 한 카탈로그에 prereq가 많아도 텍스트라 git이 잘 다룬다

### 미래 묶임
- selected-blocks.yml 다섯 필드와 decisions.yml의 8개 키(트리거, 질문, 옵션, 효과, answer, answered_at)는 표준이다. 변경하려면 schema_version을 올리고 마이그레이션 ADR로 결정한다
- prerequisites 직렬화 깊이는 객체 전체로 고정. ID만 두는 형태로 줄이려면 ADR이 필요하다
- 답하지 못한 질문의 처리(보류된 결정으로 다음 단계 통과)는 ADR 0003 동행 톤의 코드 차원 구현이다. 이 결정을 바꾸려면 ADR 0003부터 갱신이 필요하다
- 인터랙티브 prompt(inquirer 등) 도입은 별도 ADR이다. 본 ADR이 정한 산출물 형식과는 독립이다

## 링크
- 이전 결정: ADR 0007 (.byeorim/ 자리), ADR 0008 (intent.yml 형식)
- 짝 결정: ADR 0003 (동행 톤)
- 후속 작업 후보: 인터랙티브 prompt 도입 ADR, Shape의 architecture.yml 형식 ADR(pending_decisions 자리 포함)
- 관련 정책: CLAUDE.md 섹션 2(절대 금지선 1번), 섹션 5(역사 요구사항)
