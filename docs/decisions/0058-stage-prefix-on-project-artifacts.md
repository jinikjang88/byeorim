# ADR 0058. .byeorim/project/ 직속 부산물에 단계 프리픽스 박기

- 상태: 채택
- 날짜: 2026-05-12
- 결정자: DevSmith

## 맥락

ADR 0007이 .byeorim/project/ 디렉토리 레이아웃을 처음 정했다. 그 결로 각 단계가 만드는 부산물(intent.yml, selected-blocks.yml, architecture.yml, contracts.yml, test-scenarios.yml, reality-check.md)이 단계 정보 없는 평탄한 이름으로 박혔다. 한편 inspect 단계 부산물(inspect-findings.yml, inspect-report.md)은 이미 단계 프리픽스를 가졌다.

오픈소스 공개 직전 사용자가 외부 AI에 검토받고 import-review로 다시 들어오는 결을 시연하면서 두 가지 결이 드러났다. 첫째, `.byeorim/project/` 안 파일 목록을 한 번에 봤을 때 어떤 파일이 어느 단계 산출물인지 즉시 구분되지 않는다. 둘째, inspect만 프리픽스를 가져 일관성이 흔들린다. 1순위 사용자(비기술 창업자)가 파일 목록을 직접 만질 일은 적지만, 디버깅과 외부 AI 응답 결의 헷갈림을 줄이는 데 단계 프리픽스가 도움이 된다.

ADR 0007이 답하지 못한 결을 ADR 0058이 잡는다. ADR 0007 자체는 결정 시점의 역사 기록으로 보존하고, 이 ADR이 그 위에 보강(supersedes의 약한 결)을 박는다.

이 ADR이 답하는 질문은 둘이다.

1. 어떤 파일에 프리픽스를 박을까
2. 단계와 상관없는 공통 파일은 어떻게 둘까

## 검토한 옵션

### 결정 1. 프리픽스 범위

#### 옵션 A. .byeorim/project/ 직속 파일에만 (이번 채택)

대상.
- `intent.yml` → `prospect-intent.yml`
- `reality-check.md` → `prospect-reality-check.md`
- `selected-blocks.yml` → `smelt-selected-blocks.yml`
- `architecture.yml` → `shape-architecture.yml`
- `contracts.yml` → `forge-contracts.yml`
- `test-scenarios.yml` → `temper-scenarios.yml`

이미 프리픽스 결.
- `inspect-findings.yml`, `inspect-report.md` (그대로)

장점:
- 한 번 ls만 해도 어느 단계 산출물인지 즉시 구분
- inspect 결과 일관성을 박는 결
- 외부 AI 응답을 import할 때 사용자가 "어느 단계 응답이었지" 헷갈리는 결이 줄어듦
- 평탄한 결이라 구현 비용이 낮음(파일 경로 문자열만 바꿈)

단점:
- 파일명이 길어짐(`intent.yml` 9자 → `prospect-intent.yml` 18자)
- 약 53개 코드 파일과 50여 개 문서가 영향. 일괄 치환 비용
- 이전 .byeorim/project/를 가진 사용자(있다면)는 마이그레이션 결이 필요. 다만 0.x 단계라 외부 사용자 거의 없음

#### 옵션 B. 서브디렉토리로 가르기 (.byeorim/project/prospect/intent.yml 등)

장점: 단계 단위 디렉토리로 한 결로 묶임
단점: 경로 깊이 증가. 단계 사이 공유되는 결(예: smelt와 shape가 같은 selected-blocks.yml을 보는 결)을 직관적으로 못 풀음. 디렉토리당 한 파일만 들어가는 결이 어색

#### 옵션 C. 그대로 두기

장점: 마이그레이션 비용 0
단점: 위 두 결이 미해결. inspect와 일관성도 안 맞음

### 결정 2. 공통 파일

#### 옵션 A. 공통 파일은 프리픽스 없이 그대로 (이번 채택)

대상.
- `state.yml` — 단계 진행 메타. 모든 단계가 갱신
- `decisions.yml` — 단계 전반의 결정 모음
- `diary.md` — 사용자 다이어리

장점:
- 단계 무관 결이라 단계 프리픽스가 어울리지 않음
- 사용자가 자주 보는 결이 짧게 박힘
- ADR 0007의 결을 그대로 보존

단점: 직속 파일 중 일부만 프리픽스인 결이 약간의 비일관성. 다만 단계와 공통의 결을 가르는 결이라 의미 있는 결.

#### 옵션 B. 모든 직속 파일에 프리픽스

- 단점: state.yml에 어떤 단계 프리픽스를 박을지 결정할 결이 없음. "common-state.yml" 같은 결은 어색

### 결정 3. 서브디렉토리 안 파일

#### 옵션 A. 서브디렉토리(prompts/, catalog/) 안은 그대로 (이번 채택)

대상.
- `prompts/catalog-prompt.md`, `prompts/block-review-prompt.md` 등 — 모두 프롬프트 디렉토리 안. 디렉토리 자체가 단계와 무관한 공통 결
- `catalog/catalog.yml` 등 — 카탈로그 서브디렉토리

장점:
- 부모 디렉토리가 결을 안내. prompts/ 안 파일이 어느 단계 프롬프트인지는 이미 파일명 안에 있음(block-review, architecture-review 등)
- 디렉토리 구조 변경을 최소화. ADR 0007과 결이 정합

## 결정

### 결정 1: 6개 직속 파일에 단계 프리픽스 박기 (옵션 A)

이름이 박힌 자리만 갱신. 평탄한 결로 구현. 다음 단계가 이전 단계 산출물을 읽을 때 새 이름을 사용.

### 결정 2: 공통 파일은 그대로 (옵션 A)

state.yml, decisions.yml, diary.md는 단계 무관 결이라 프리픽스 없음.

### 결정 3: 서브디렉토리 안 파일은 그대로 (옵션 A)

prompts/, catalog/ 안 파일은 부모 디렉토리가 결을 안내해 프리픽스 없이 충분.

## 결과

### 긍정적

- `ls .byeorim/project/` 한 번으로 어느 단계 산출물인지 즉시 구분
- inspect와 다른 단계 사이 일관성. 모든 단계 산출물이 같은 결의 이름
- 외부 AI 응답 import 시 사용자 헷갈림 자리 줄어듦
- ADR 0007의 결을 보존하면서 보강. 결정 시점의 역사 그대로

### 부정적 / 트레이드오프

- 파일명 길어짐. 다만 단계 정보를 담는 결이라 비용보다 가치
- 일괄 치환 비용. 53개 코드 파일과 일부 문서. 일회성
- 이전 .byeorim/project/ 가진 사용자는 마이그레이션 결이 필요. 0.x 결이라 외부 영향 거의 없음
- 직속 일부만 프리픽스인 결이 살짝 비일관. 단계와 공통을 가르는 결로 풀음

### 미래 묶임

- 차후 새 단계가 추가되면(예: ADR 0006으로 6단계가 7단계 됐듯) 새 단계의 산출물도 같은 결로 프리픽스 박는 결
- migration 도구를 박는 결이 차후 자연스러움. 다만 0.x 결이라 안 박아도 큰 문제 없음
- inspect 외 단계가 한 직속 파일을 두 개 이상 만들면 프리픽스 결이 점점 어색해질 자리. 그때 ADR로 서브디렉토리 결로 옮기는 결을 다시 봄

## 링크

- 보강되는 ADR: 0007(.byeorim/ 디렉토리 레이아웃 — 결정 2 부분이 이 ADR로 보강됨)
- 관련 ADR: 0006(7단계 메타포), 0030(smelt), 0033(shape), 0035(forge), 0038(temper), 0051(inspect)
- 관련 정책: CLAUDE.md 섹션 2 첫 번째 금지선(파일 이름 갱신됨), 섹션 6(.byeorim/ 디렉토리 레이아웃 변경 시 ADR 필수)
