# ADR 0057. CI 게이트와 기여 동선 정의

- 상태: 채택
- 날짜: 2026-05-08
- 결정자: DevSmith

## 맥락

지금까지 검증 게이트(lint, format:check, test)는 메인테이너가 로컬에서 직접 실행해야 작동했다. CLAUDE.md 섹션 4가 이 게이트를 약속하고 섹션 9 완료 정의가 체크리스트로 박았지만, 강제는 사람의 기억과 규율에 의존했다.

오픈소스 공개 직전(2단계 작업, 2026-05-08)에 이 결을 자동화한다. 외부 PR이 들어왔을 때 메인테이너가 일일이 checkout 받아 테스트를 돌리는 결은 1인 메인테이너 결로 부담이 크다. 또한 외부 기여자가 PR/이슈를 열 때 어디서 시작할지 안내가 없으면 진입 결이 흐려진다.

이 ADR이 답하는 질문은 셋이다.

1. 어떤 CI 시스템으로 게이트를 박을까
2. 어떤 검증을 어떤 매트릭스로 돌릴까
3. PR/이슈 양식을 어떻게 박을까

## 검토한 옵션

### 결정 1. CI 시스템

#### 옵션 A. GitHub Actions (이번 채택)

장점:
- 저장소가 GitHub에 있어 추가 계정/통합 부담 0
- 공개 저장소는 워크플로 분(minute) 무료
- 마켓플레이스의 actions/checkout, actions/setup-node가 표준 결로 박혀있음
- PR 화면에 게이트 결과가 그대로 표시되어 메인테이너와 기여자가 한눈에 봄

단점:
- GitHub 종속. 차후 다른 호스팅으로 옮기면 워크플로를 다시 짜야 함. 다만 1인 프로토타입 단계라 종속 비용보다 진입 비용이 큼

#### 옵션 B. CircleCI / Travis / 그 외

- 단점: 추가 계정과 별도 설정 결. 1인 메인테이너 운영 부담 큼
- 장점 부족. GitHub Actions가 이 결로는 충분

#### 옵션 C. self-hosted runner

- 단점: 머신 한 대를 항상 띄워야 함. 1인 결과 안 맞음

### 결정 2. 검증 매트릭스와 트리거

#### 옵션 A. PR + main push 트리거, Node 18/20/22 매트릭스 (이번 채택)

검증 단계.
- `npm ci` (락파일 정합)
- `npm run lint` (eslint)
- `npm run format:check` (prettier)
- `npm test` (단위 + 통합)

매트릭스.
- ubuntu-latest × Node 18.x / 20.x / 22.x (3개 조합)

트리거.
- pull_request: branches [main]
- push: branches [main] (머지 후 main의 결을 그대로 봄)

장점:
- package.json `engines: ">=18.0.0"` 결과 정합. CLAUDE.md 섹션 8도 같은 결
- 세 LTS 라인을 한꺼번에 봐 호환성 결을 이른 시점에 잡음
- ubuntu-latest 한 OS만 — 1인 프로토타입 결로 충분
- E2E는 빼서 PR 사이클을 빠르게 유지

단점:
- E2E가 빠져 있어 실제 CLI 흐름이 깨질 결을 PR 직전 못 잡음. 차후 nightly 워크플로로 별도 박는 결이 자연스러움
- ubuntu만이라 macOS/Windows 결의 차이를 못 봄. 차후 외부 사용자 신호가 보이면 추가

#### 옵션 B. PR만 트리거

- 단점: main에 머지된 뒤 어떤 결로 박혔는지 검증 안 함. 머지 직전 PR이 그린이어도 충돌 머지로 깨질 수 있음. push 트리거가 필요

#### 옵션 C. 매 매트릭스 OS×Node×워크스페이스 곱셈

- 단점: 1인 프로토타입 결로 과한 비용. 외부 신호가 보일 때 점진 확장

### 결정 3. PR/이슈 양식

#### 옵션 A. 한국어 정본, 영어 허용 (이번 채택)

- PR 템플릿 1종, 이슈 템플릿 3종(버그/기능/질문) + config.yml
- 본문은 한국어로 작성. 영문 기여자는 영어로 채워도 좋다는 안내 한 줄
- ADR 0056의 "한국어 정본" 결과 정합

장점:
- 1인 메인테이너 결로 운영 부담 낮음
- 영어 기여자가 한국어 양식 그대로 영어로 채우면 메인테이너가 두 결을 함께 본다
- PR 템플릿이 CLAUDE.md 섹션 9 완료 정의를 그대로 반영해 머지 게이트와 한 결

단점:
- 영문 기여자가 한국어 양식 자체에서 멈출 가능성. 다만 양식 안에 영어 허용 안내가 있어 진입 막힘 작음

#### 옵션 B. 한/영 양식 둘 다

- 단점: 양식 갱신 시 두 판본 sync 부담. ADR 0056의 외부 진입점 의무 범위(README/CONTRIBUTING/CoC/Security) 안에 포함되지 않음. 차후 결

## 결정

### 결정 1: GitHub Actions 채택 (옵션 A)

저장소가 GitHub에 있고 1인 운영 결이라 추가 통합 비용을 만들지 않는다. `.github/workflows/ci.yml` 한 파일로 박는다.

### 결정 2: PR + main push, Node 18/20/22, ubuntu-latest, lint/format/test (E2E 제외) (옵션 A)

세 명령(lint, format:check, test)을 세 Node LTS 라인 위에서 ubuntu-latest로 돌린다. E2E는 차후 nightly 결로 별도 박는다.

### 결정 3: 한국어 정본 PR/이슈 양식, 영어 허용 (옵션 A)

`.github/PULL_REQUEST_TEMPLATE.md` 1종, `.github/ISSUE_TEMPLATE/` 아래 bug_report/feature_request/question 3종 + config.yml. 본문은 한국어, 영어 채움 허용. PR 템플릿이 CLAUDE.md 섹션 9 체크리스트를 그대로 반영.

## 결과

### 긍정적

- 메인테이너가 잊어도 GitHub가 검증한다. 자정에 머지해도 깨진 채로 main에 들어가지 않음
- 외부 PR이 들어왔을 때 메인테이너가 checkout 안 해도 안전성 결을 한눈에 본다
- PR 템플릿이 CLAUDE.md 섹션 9와 한 결로 묶여 외부 기여자가 무엇을 갖춰야 하는지 안다
- 이슈 양식 셋이 진입점을 갈라줘 메인테이너가 어떤 결의 이슈인지 즉시 파악
- README 배지가 저장소 첫 페이지에서 살아있는 결을 보여줌

### 부정적 / 트레이드오프

- E2E 미포함. 실제 CLI 흐름이 깨질 결을 PR 사이클 안에서 못 잡음. 차후 nightly로 박는 결이 자연스러움
- ubuntu만이라 macOS/Windows 결의 차이를 못 봄. 외부 사용자 신호가 보이면 매트릭스 확장
- 양식이 한국어 정본이라 영문 기여자에게 진입 마찰이 살짝. ADR 0056의 외부 진입점 4종 외 양식이 추가 영문화 후보가 됨

### 미래 묶임

- Branch protection 규칙은 GitHub UI에서 사용자가 직접 박는다. 권장 결: "Require status checks: test (18.x), test (20.x), test (22.x)" + "Require pull request" + "Block force push" + admin bypass
- nightly E2E 워크플로는 차후 별도 워크플로 파일로 박는 결. ADR 없이 가능
- 매트릭스 확장(macOS/Windows 추가)은 외부 신호가 보일 때 ADR 없이 가능
- 1.0 출시 시점에 CI 결을 다시 본다. 그때 매트릭스/E2E/타임아웃을 재조정

## 링크

- 워크플로: .github/workflows/ci.yml
- PR 템플릿: .github/PULL_REQUEST_TEMPLATE.md
- 이슈 템플릿: .github/ISSUE_TEMPLATE/{bug_report,feature_request,question}.md, config.yml
- 관련 정책: CLAUDE.md 섹션 4(테스트와 검증), 섹션 9(완료 정의), ADR 0056(한/영 듀얼 정책)
- 다음 결: 공개 가시성 켜기 + branch protection (사용자 직접)
