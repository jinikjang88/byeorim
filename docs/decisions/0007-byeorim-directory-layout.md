# ADR 0007. .byeorim/ 디렉토리 레이아웃

- 상태: 채택 (결정 2의 파일명은 ADR 0058로 보강됨 — 단계 프리픽스 박음)
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

CLAUDE.md 섹션 6이 ".byeorim/ 디렉토리 레이아웃 변경"을 ADR 필수 사안으로 박았다. 첫 레이아웃을 정하는 자리가 이 ADR이다.

벼림의 7단계는 각각 산출물을 만든다. 탐광은 의도와 카탈로그와 시장 리포트를, 제련은 선택된 블럭과 cascade 답을, 빚다는 아키텍처 결정을, 단조는 계약을, 다듬은 테스트 의도를, 세움은 생성 코드와 검증 결과를, 비춤은 다관점 리뷰를 만든다. 이 산출물들이 디스크 어디에 어떻게 자리잡는지가 정해지지 않으면 다음 단계가 그 위에 못 올라간다.

CLAUDE.md 섹션 2의 절대 금지선 1번이 ".byeorim/project/ 안에 intent.yml, selected-blocks.yml, contracts.yml 중 하나라도 없으면 애플리케이션 코드를 생성하지 않는다"고 명시했다. 즉 .byeorim/project/는 이미 한 자리 정해진 약속이다. 이 ADR은 그 자리를 더 자세히 그린다.

또한 절대 금지선 6번은 .byeorim/가 어떤 AI 모델로도 읽힐 수 있어야 한다고 했다. 즉 디렉토리 형식은 표준 YAML과 markdown으로만 짠다. JSON은 state.yml처럼 사람이 거의 안 만지는 자리에서도 가능하지만, 이 ADR은 일관성을 위해 .yml로 통일한다.

byeorim init이 첫 단계로 들어오면서 이 디렉토리 형식을 만드는 주체가 코드로 굳는다. 그래서 이 ADR이 init 코드보다 먼저다.

## 검토한 옵션

### 결정 1. 루트 위치

#### 옵션 A. 프로젝트 루트의 .byeorim/
- 장점: 한 프로젝트 한 .byeorim/. 위치가 직관적이다. .git, .vscode 같은 도구 디렉토리와 같은 결
- 단점: 없음. 다른 위치는 모두 부자연스럽다

#### 옵션 B. ~/.byeorim/ (홈 디렉토리)
- 장점: 사용자 단위 설정 공유 가능
- 단점: 프로젝트 단위 산출물을 사용자 단위로 두면 두 프로젝트의 데이터가 섞인다. 벼림의 1순위 사용자(비기술 창업자)는 한 사람이 여러 프로젝트를 동시에 만질 수 있다. 위험

### 결정 2. 단계 산출물의 자리

#### 옵션 A. .byeorim/project/<산출물>
- 장점: project/ 라는 이름이 사용자 프로젝트 영역을 명확히 분리한다. 미래에 .byeorim/system/이나 .byeorim/cache/ 같은 자리가 들어와도 구분된다. CLAUDE.md 섹션 2가 이미 이 이름을 박아뒀다
- 단점: 한 단계 더 깊어진다

#### 옵션 B. .byeorim/<산출물> 평면
- 장점: 경로가 짧다
- 단점: state.yml 같은 메타와 사용자 산출물이 한 자리에 섞인다. 구분이 어려워진다

### 결정 3. 단계 진행 메타 형식

#### 옵션 A. .byeorim/state.yml (한 파일에 묶음)
- 장점: 한 자리만 보면 현재 단계, 완료된 단계, 메타 정보가 다 보인다. CLI가 다음 단계를 추천할 때 한 파일만 읽으면 된다
- 단점: 단계 진행과 카탈로그 출처 같은 다른 결의 정보가 한 파일에 섞인다

#### 옵션 B. 단계별 빈 파일/디렉토리로 진행 표시
- 장점: 빈 파일 존재만으로 진행을 표시. 가볍다
- 단점: 메타 정보(생성 시간, 스키마 버전, 카탈로그 출처)를 둘 자리가 사라진다. 미래에 마이그레이션이 필요해질 때 schema_version 필드가 없으면 곤란하다

### 결정 4. 파일 확장자

#### 옵션 A. 전부 .yml과 .md
- 장점: 사람이 읽고 git diff가 깨끗하다. JSON 같은 추가 확장자가 없어 일관성이 높다. 절대 금지선 6번(모델 무관)에 부합
- 단점: 없음. 약간의 파싱 비용이 있지만 카탈로그가 작아 문제 없음

#### 옵션 B. JSON 혼용
- 장점: 파싱이 빠르다
- 단점: 사람이 만지기 어렵다. 카탈로그와 결이 갈라진다

### 결정 5. gitignore 정책

#### 옵션 A. .byeorim/는 전부 커밋, 단 generated/만 무시
- 장점: 디자인 산출물(intent, selected-blocks, contracts, decisions, ADR)은 git 히스토리에 남는다. 재생성 가능한 코드(generated/)만 빠진다. 팀 협업 시 디자인을 공유할 길이 열린다
- 단점: 큰 카탈로그를 가진 프로젝트는 git이 살짝 무거워진다. 다만 텍스트 파일이라 압축되면 작다

#### 옵션 B. .byeorim/ 전체 무시
- 장점: 저장소가 가볍다
- 단점: 디자인이 사라진다. 다른 기여자가 같은 .byeorim/를 보지 못해 협업이 어렵다. 벼림의 가치 자체가 .byeorim/ 안에 들어있는데 그걸 안 공유하면 무슨 의미가 있나

#### 옵션 C. 사용자가 알아서 .gitignore 관리
- 장점: 자유도
- 단점: 비기술 창업자가 .gitignore를 만들 줄 모를 수 있다. 첫 사용 시 친절하지 않다. CLAUDE.md 섹션 0 사용자 우선순위 1번을 못 지킨다

## 결정

### 결정 1: 루트는 프로젝트 루트의 .byeorim/ (옵션 A)

`{프로젝트 루트}/.byeorim/`이 벼림의 작업 공간 루트다. .git과 같은 위치, 같은 결.

### 결정 2: 단계 산출물은 .byeorim/project/ 하위 (옵션 A)

`.byeorim/project/`가 사용자 프로젝트 산출물의 자리다. CLAUDE.md 섹션 2의 약속을 그대로 따른다. 미래에 .byeorim/system/이나 캐시 자리가 필요해지면 분리할 여지를 남긴다.

### 결정 3: 단계 진행은 .byeorim/state.yml에 묶음 (옵션 A)

`.byeorim/state.yml`이 진행 메타의 단일 파일이다. 형식은 다음과 같다.

```yaml
schema_version: 1
created_at: 2026-04-28T00:00:00.000Z
current_stage: prospect
completed_stages: []
```

필드 의미:
- `schema_version`: 정수. 미래에 레이아웃이 바뀌면 마이그레이션 분기점이 된다. 첫 출시는 1
- `created_at`: ISO 8601 타임스탬프. byeorim init 시점
- `current_stage`: 다음에 사용자가 들어갈 단계. prospect, smelt, shape, forge, temper, set, inspect 일곱 중 하나, 또는 done
- `completed_stages`: 완료된 단계 이름 배열. 단계가 끝날 때마다 추가

각 단계 명령어는 자기 일이 끝나면 state.yml의 current_stage와 completed_stages를 갱신한다. 갱신 자체는 단계별 코드의 책임이고, init은 처음 값만 적는다.

### 결정 4: 모든 텍스트 파일은 .yml과 .md (옵션 A)

JSON 혼용은 하지 않는다. state.yml처럼 사람이 거의 안 만지는 자리도 .yml로 통일한다. 일관성과 사람 친화성이 우선이다.

### 결정 5: .byeorim/는 커밋, .byeorim/project/generated/만 무시 (옵션 A)

byeorim init이 `.byeorim/.gitignore`를 함께 만들고 다음 한 줄을 적는다.

```
project/generated/
```

이 파일이 .byeorim/ 안에 있으므로 적용 범위가 .byeorim/ 하위에 한정된다. 사용자의 루트 .gitignore를 손대지 않는다.

### 디렉토리 레이아웃 전체

```
.byeorim/
├── .gitignore                    # project/generated/만 무시
├── state.yml                     # 단계 진행 메타
└── project/
    ├── diary.md                  # 사용자 다이어리, init이 빈 헤더로 만든다
    ├── intent.yml                # Prospect 산출
    ├── catalog/                  # Prospect 산출. 발견된 도메인 카탈로그
    │   └── catalog.yml
    ├── reality-check.md          # Prospect 산출. 시장 직시 리포트
    ├── selected-blocks.yml       # Smelt 산출. 선택된 블럭 + 자동 추가
    ├── decisions.yml             # Smelt 산출. cascade 답변
    ├── architecture.yml          # Shape 산출. 아키텍처 결정 메타
    ├── contracts.yml             # Forge 산출. API 계약
    ├── test-scenarios.yml        # Temper 산출. Given-When-Then 테스트 의도
    ├── generated/                # Set 산출. 코드 (gitignore)
    ├── verify-report.md          # Set 산출. 검증 결과
    └── inspect-report.md         # Inspect 산출. 다관점 리뷰
```

### 파일별 단계 소유권 표

| 파일 또는 디렉토리                       | 만드는 단계 | 갱신하는 단계        |
| ---------------------------------------- | ----------- | -------------------- |
| .byeorim/state.yml                       | init        | 모든 단계가 갱신     |
| .byeorim/.gitignore                      | init        | 갱신 없음(고정 내용) |
| .byeorim/project/diary.md                | init        | 사용자가 갱신        |
| .byeorim/project/intent.yml              | prospect    | prospect 재실행 시   |
| .byeorim/project/catalog/                | prospect    | prospect 재실행 시   |
| .byeorim/project/reality-check.md        | prospect    | prospect 재실행 시   |
| .byeorim/project/selected-blocks.yml     | smelt       | smelt 재실행 시      |
| .byeorim/project/decisions.yml           | smelt       | smelt 재실행 시      |
| .byeorim/project/architecture.yml        | shape       | shape 재실행 시      |
| .byeorim/project/contracts.yml           | forge       | forge 재실행 시      |
| .byeorim/project/test-scenarios.yml      | temper      | temper 재실행 시     |
| .byeorim/project/generated/              | set         | set 재실행 시        |
| .byeorim/project/verify-report.md        | set         | set 재실행 시        |
| .byeorim/project/inspect-report.md       | inspect     | inspect 재실행 시    |

## 결과

### 긍정적
- 첫 .byeorim/ 디렉토리 형식이 한 자리에 박혔다. 다음 단계 코드(prospect, smelt 등)가 어디에 무엇을 쓸지 헷갈리지 않는다
- state.yml의 schema_version 덕분에 미래 마이그레이션 자리가 열려있다
- gitignore 정책이 친절하다. 비기술 창업자가 첫 init 후 별도 작업 없이도 .byeorim/를 git에 올릴 수 있다
- .byeorim/는 텍스트 파일만 가지므로 절대 금지선 6번(모델 무관)을 그대로 지킨다. Claude, GPT, Gemini 어느 도구도 읽을 수 있다

### 부정적 / 트레이드오프
- 단계별 파일 형식(intent.yml, selected-blocks.yml 등)은 이 ADR이 정하지 않는다. 각 단계 ADR에서 따로 정한다. 그래서 이 ADR만 보고는 파일 안이 어떻게 생겼는지 알 수 없다. 다만 자리는 정해져 있어 다음 결정의 발판이 된다
- state.yml 한 파일에 진행 메타를 묶어 두면 동시 실행 시 race condition이 이론적으로 가능하다. 다만 벼림은 사용자가 명령어를 순차로 치는 도구라 동시 실행 가능성이 낮다. 필요해지면 파일 락 같은 방어를 후속 ADR로 추가한다

### 미래 묶임
- .byeorim/ 위치, .byeorim/project/ 자리, state.yml 파일명과 형식은 표준이다. 변경하려면 ADR이 필요하다
- schema_version 1은 첫 출시. 레이아웃이 바뀌면 schema_version 2로 올리고 마이그레이션 결정을 별도 ADR로 한다
- 단계별 파일의 형식은 각 단계 ADR이 정한다. 이 ADR이 정한 자리에서 벗어나려면 둘 다 갱신이 필요하다
- gitignore 정책은 generated/만 무시한다는 결정을 박았다. 추가로 무시할 자리가 생기면 ADR로 결정한다

## 링크
- 이전 결정: ADR 0002 (6단계, 7단계로 ADR 0006이 확장), ADR 0006 (세움 단계 추가)
- 후속 작업: 단계별 파일 형식 ADR (intent.yml, selected-blocks.yml 등)
- 관련 정책: CLAUDE.md 섹션 2(절대 금지선 1번 .byeorim/project/ 자리), 섹션 6(레이아웃 변경 ADR 필수)
