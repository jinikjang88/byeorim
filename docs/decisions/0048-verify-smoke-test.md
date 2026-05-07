# ADR 0048. verify에 스모크 테스트 추가 (server up → /health → kill)

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0022가 `beoreum verify`의 install + test 결을 박았다. ADR 0046이 4 generator에 `/health` endpoint를 표준으로 emit하는 baseline을 박았다. ADR 0047이 `beoreum run`으로 backend + frontend 동시 기동과 readiness 폴링 결을 박았다.

이 셋이 합쳐지면 verify가 한 결을 더 갖출 수 있다. install + test로 빌드/단위 테스트가 통과한 뒤, server를 잠깐 띄워 `/health`가 응답하는지 확인하고 종료. CI에서 "내 서비스가 진짜 뜨는가?"를 한 번에 검증한다. 스모크 테스트 결.

이번 ADR이 답하는 질문은 여섯이다. 첫째, smoke trigger(자동 vs opt-in). 둘째, run.js와의 코드 공유. 셋째, smoke 대상(backend만 vs backend + frontend). 넷째, smoke 실패의 verify 결과 처리. 다섯째, smoke timeout. 여섯째, 테스트 가능성.

ADR 0046, 0047, 0048이 한 묶음의 후속 작업으로 마무리된다. set이 만든 코드가 install + test + 실제 기동까지 한 결로 검증되는 흐름.

## 검토한 옵션

### 결정 1. smoke trigger

#### 옵션 A. `--smoke` 플래그로 opt-in (이번 출시)

- 장점: verify는 install + test로 이미 분 단위라 default에 더 무겁게 안 함. 사용자가 명시적으로 `beoreum verify --smoke`. 옵션 결이 분명
- 단점: 사용자가 플래그 존재를 모르면 안 씀. README와 CLI help 안내로 푸는 결

#### 옵션 B. verify에 항상 포함

- 장점: 단순. 모든 verify가 같은 검증 깊이
- 단점: CI에서 매번 분 단위 추가. 사용자가 install/test만 빠르게 돌리고 싶을 때 부담

#### 옵션 C. 새 명령 `beoreum smoke`

- 장점: 검증 단계 분리
- 단점: 명령 추가 부담. answer/status/verify/run에 smoke까지 늘면 결이 흐려짐

### 결정 2. 코드 공유

#### 옵션 A. run.js의 spawnProcess + fetchHealth + buildRunTargets를 verify가 import (이번 출시)

- 장점: ADR 0047이 export 결을 박았으니 그대로 재사용. 책임 분리 깨끗(run.js가 lifecycle/poll 결 한 곳에 모음)
- 단점: verify가 run.js에 의존. 다만 둘 다 cli 패키지라 의존성 규칙 위배 아님

#### 옵션 B. 공통 헬퍼 분리(packages/cli/src/process-helpers.js)

- 장점: run과 verify 둘 다 같은 헬퍼를 import
- 단점: 미래 N번째 사용처가 생기면 검토. MVP는 A로 충분

### 결정 3. smoke 대상

#### 옵션 A. backend만 (이번 출시)

- 장점: ADR 0046/0047 결과 일관(frontend는 healthcheck endpoint 없음). vite dev 서버는 set의 build 검증으로 충분
- 단점: frontend가 안 살아있어도 verify가 통과. 다만 verify의 install + test에 frontend의 build가 들어있어 망가진 frontend는 잡힘

#### 옵션 B. backend + frontend 둘 다

- 장점: frontend도 spawn해서 살아있음 확인
- 단점: healthcheck endpoint가 없어 신호가 약함. vite는 시작이 즉시라 spawn 자체가 의미 약함

### 결정 4. smoke 실패 시 verify 결과

#### 옵션 A. 다른 target과 같은 결로 passed=false 처리, exit code 반영 (이번 출시)

- 장점: verify-report.md에 smoke 섹션이 install/test 섹션과 같은 형식. CI 친화. 사용자가 한 결로 본다
- 단점: smoke가 다른 target과 다른 의미(빌드 vs 런타임)이지만 한 형식이라 결이 단순

#### 옵션 B. smoke만 별도 섹션, warning 처리

- 장점: smoke의 결이 분리되어 보임
- 단점: 일관성 깨짐. CI에서 두 결을 따로 처리해야 함

### 결정 5. smoke timeout

#### 옵션 A. 60초 default + 환경 변수 override (이번 출시)

- 장점: ADR 0047과 같은 결. `BEOREUM_VERIFY_SMOKE_TIMEOUT_MS` 환경 변수로 override 가능
- 단점: Java gradle bootRun 첫 실행은 분 단위라 60초가 짧을 수 있음. 환경 변수로 풀어줌

#### 옵션 B. 30초

- 장점: 빠름
- 단점: Java/Spring Boot에 짧음

### 결정 6. 테스트 가능성

#### 옵션 A. spawnProcess + fetchHealth 의존성 주입 (이번 출시)

- 장점: ADR 0022 verify와 ADR 0047 run의 결을 그대로 따름. mock으로 결정성
- 단점: API에 인자가 늘어남. 다만 default가 있어 사용자 부담 없음

## 결정

### 결정 1: `--smoke` 플래그로 opt-in (옵션 A)

`beoreum verify`는 default로 install + test만 실행. `--smoke`를 주면 추가로 server up → /health → kill 결을 실행.

```
beoreum verify              # install + test (기존 동작 유지)
beoreum verify --smoke      # install + test + smoke
```

verify-report.md의 형식은 smoke 결과가 추가된 결로 자라난다. 다른 target(Backend, Frontend)과 같은 섹션 결.

### 결정 2: run.js의 헬퍼 import (옵션 A)

verify.js가 packages/cli/src/run.js에서 `spawnProcess`, `fetchHealth`, 그리고 backend 명령 결을 재사용. 다만 run.js의 default 함수가 internal이라 export하지 않은 결이라 두 가지 결을 풀 수 있다.

#### 옵션 2a. run.js에서 추가 export

`defaultSpawnProcess`, `defaultFetchHealth`, `pollUntilReady`를 export하고 verify.js가 그대로 import.

#### 옵션 2b. 공통 함수만 export하는 새 모듈

`packages/cli/src/process-helpers.js`에 spawn/fetchHealth/poll 함수를 모으고 run.js와 verify.js가 둘 다 import.

이번 출시는 2b. run.js와 verify.js가 같은 결을 import하니 책임 분리가 깨끗. process-helpers.js 한 파일에 lifecycle/poll 결이 모인다.

### 결정 3: backend만 smoke (옵션 A)

smoke 대상은 backend만. architecture.language별 backend 명령을 띄우고, ADR 0046이 박은 `/health`로 readiness 폴링.

frontend는 install + build + test로 충분히 검증됨. dev 서버 spawn은 의미가 약해서 미래 ADR로 미룬다.

### 결정 4: smoke 실패는 다른 target과 같은 결 (옵션 A)

verify-report.md에 새 target 섹션이 박힌다.

```markdown
## Backend Smoke (node)

- 상태: 성공
- 마지막 명령: `npm run dev → /health`
- ready url: `http://localhost:3000/health`
- cwd: `.beoreum/project/generated/backend`
```

`allPassed`는 install/test/smoke 모든 결과를 합산. exit code도 합산 결과 따름.

### 결정 5: 60초 default + 환경 변수 override (옵션 A)

- default: 60000ms (60초)
- override: `BEOREUM_VERIFY_SMOKE_TIMEOUT_MS` 환경 변수
- 코드 인자: `runVerify({ smokeTimeoutMs })` (테스트가 줄여 결정적)

```bash
BEOREUM_VERIFY_SMOKE_TIMEOUT_MS=120000 beoreum verify --smoke
```

### 결정 6: spawnProcess + fetchHealth 의존성 주입 (옵션 A)

```js
runVerify({
  cwd,
  smoke = false,                    // --smoke 플래그
  runCommand = defaultRunCommand,   // 기존
  spawnProcess = defaultSpawnProcess,  // smoke 전용
  fetchHealth = defaultFetchHealth,    // smoke 전용
  smokeTimeoutMs = 60000,
  now,
})
```

smoke=false면 spawnProcess/fetchHealth는 사용하지 않음(기존 동작 유지).

## 결과

### 긍정적

- verify가 install/test 다음에 실제 기동까지 검증하는 결로 자란다. CI에서 "내 서비스가 진짜 뜨는가?"를 한 번에 본다
- ADR 0046이 박은 `/health`와 ADR 0047이 박은 spawnProcess/fetchHealth 결이 verify에서 재사용. 셋이 한 묶음으로 살아남음
- `--smoke` 플래그로 opt-in이라 기존 verify 사용자에게 영향 없음. CI에서 빠른 검증과 깊은 검증을 골라 쓸 수 있음
- process-helpers.js 한 파일에 lifecycle/poll 결이 모여 미래 N번째 사용처(예: dev 명령, 통합 테스트 러너)에서도 같은 결로 재사용

### 부정적 / 트레이드오프

- run.js와 verify.js가 같은 헬퍼를 의존하지만 두 명령의 결이 다름(long-running vs single-shot). process-helpers.js의 함수가 두 결 모두 만족해야 함. 다만 spawn/poll 결은 양쪽에 같은 의미라 큰 부담 없음
- smoke timeout 60초가 Java gradle bootRun 첫 실행에 짧을 수 있음. 환경 변수로 풀었으니 사용자가 늘릴 수 있는 결. 미래 amendment ADR로 default 변경 가능
- frontend smoke가 빠진 결이 의식적이지만 사용자가 "프론트도 안 죽는지 보고 싶어요" 피드백 줄 수 있음. 미래 ADR로 추가 가능

### 미래 묶임

- 6개 결정 모두 표준
- frontend smoke 추가는 별도 ADR
- smoke target 확장(예: 외부 서비스 healthcheck)도 별도 ADR
- process-helpers.js 결은 표준. 새 함수 추가는 amendment

## 링크

- 이전 결정: ADR 0006(set 단계 정의), ADR 0022(verify 실행 정책), ADR 0046(생성 코드의 로컬 실행 가능성), ADR 0047(beoreum run 명령)
- 후속 작업 후보: frontend smoke 추가 ADR, process-helpers.js의 함수 확장
- 동행 톤: ADR 0003 결정 2(smoke 실패는 동행 결로 안내, 막지 않음)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 4(테스트 결정성), 섹션 8(파일당 책임), 섹션 10(글쓰기 원칙)
