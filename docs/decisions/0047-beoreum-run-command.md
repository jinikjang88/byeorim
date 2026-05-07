# ADR 0047. `beoreum run` 명령 (backend + frontend 동시 기동)

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0046이 생성 코드의 로컬 실행 가능성 baseline을 박았다. /health 표준 endpoint, .env / .env.production 분리, prod 가드, in-memory dev DB가 4 generator(node/java/python/frontend)에 공통으로 들어왔다. 사용자(특히 1순위 비기술 창업자)가 generated/backend로 들어가 `npm install && npm run dev`를 치면 즉시 뜨는 결까지 왔다.

다음 단계는 한 명령으로 두 서버(backend + frontend)를 동시에 띄우는 결이다. 비기술 창업자가 두 터미널에서 두 명령을 치는 부담을 덜고, 두 서버가 한 쌍으로 동작한다는 사실을 명령으로 표현한다.

이번 ADR이 답하는 질문은 일곱이다. 첫째, 명령 이름. 둘째, 두 프로세스의 lifecycle 관리 방식. 셋째, healthcheck readiness 안내. 넷째, 한쪽 프로세스가 죽었을 때의 결. 다섯째, Ctrl-C signal 처리. 여섯째, 부분 실행 플래그. 일곱째, 테스트 가능성.

ADR 0048(verify 스모크 테스트)이 이 ADR의 readiness 결을 그대로 받아 쓴다. 셋이 한 묶음의 후속 작업.

## 검토한 옵션

### 결정 1. 명령 이름

#### 옵션 A. `beoreum run` (이번 출시)

- 장점: 가장 직관적. 모든 사용자가 "내 서비스를 돌린다"는 의미로 받아들임. 메타포(prospect/smelt/shape/forge/temper/set/inspect) 외 보조 명령(answer/status/verify/init)과 결이 같음
- 단점: 다른 도구(예: `npm run`)와 단어 충돌 가능. 다만 맥락이 분명해 혼란 없음

#### 옵션 B. `beoreum dev`

- 장점: 개발 모드 명시
- 단점: prod 모드도 지원할지 묻는 결로 풀려 헷갈림. ADR 0046이 prod 가드를 박았는데 명령 이름이 dev면 prod 실행 자리가 없는 것처럼 보임

#### 옵션 C. `beoreum start`

- 장점: npm 관례
- 단점: 메타포에서 멀어짐. set/forge 같은 야금술 결이 있는데 start만 갑자기 일반 단어

### 결정 2. 두 프로세스 lifecycle 관리

#### 옵션 A. child_process.spawn으로 둘 다 띄우고 한 콘솔에 prefix 결합 (이번 출시)

- 장점: verify(ADR 0022)의 runCommand 결과 결이 같음. 외부 의존성 추가 없음. `[backend] ...` / `[frontend] ...` prefix가 사용자에게 어느 쪽 출력인지 분명
- 단점: stdio merging 결을 직접 짜야 함. 다만 한 곳에 모이는 결이라 복잡도 작음

#### 옵션 B. concurrently 같은 라이브러리

- 장점: 검증된 결
- 단점: 외부 의존성 추가. ADR 0022가 spawn으로 풀어낸 결과 일관성 깨짐

### 결정 3. healthcheck readiness 안내

#### 옵션 A. backend의 /health가 200 응답할 때까지 폴링한 뒤 "✓ backend ready: http://localhost:3000" 출력 (이번 출시)

- 장점: 사용자가 언제 띄워졌는지 분명. ADR 0046이 박은 /health endpoint가 의지 자리. polling timeout 후에도 "그래도 실행을 계속합니다" 한국어 안내로 동행 톤(ADR 0003 결정 2) 유지
- 단점: polling 로직을 박아야 함. 다만 fetch + setTimeout 결로 단순

#### 옵션 B. 프로세스 시작 후 URL만 안내, ready 여부는 사용자 판단

- 장점: 단순
- 단점: backend 실행이 분 단위로 길 수 있음(특히 Java gradle bootRun 첫 실행). 사용자가 "왜 안 떠?" 같은 혼란 가능

### 결정 4. 한쪽 프로세스가 죽었을 때

#### 옵션 A. 다른 쪽도 정리하고 종료 (fail-fast, 이번 출시)

- 장점: 두 서버가 한 쌍이라는 결이 살아남음. 한쪽 에러를 사용자가 분명히 본다. 좀비 프로세스 위험 0
- 단점: 한쪽 일시적 에러로 다른 쪽도 죽음. 다만 사용자가 다시 `beoreum run`으로 살리는 결이 자연스러움

#### 옵션 B. 다른 쪽은 그대로

- 장점: 부분 동작 가능
- 단점: frontend가 backend 없이 살아있어도 의미가 약함. UI는 fetch 에러로 깨짐. 사용자 혼란 더 큼

### 결정 5. Ctrl-C signal 처리

#### 옵션 A. SIGINT → 두 child에 SIGTERM, graceful shutdown 기다린 뒤 종료 (이번 출시)

- 장점: 표준 결. fastify/spring-boot/uvicorn 모두 SIGTERM에 graceful shutdown 지원
- 단점: 무거운 cleanup이 있는 프로세스가 오래 걸리면 사용자가 답답할 수 있음. timeout 설정으로 보강

#### 옵션 B. process.exit으로 즉시 종료

- 장점: 빠름
- 단점: child 프로세스가 좀비로 남을 수 있음. unsafe

### 결정 6. 부분 실행 플래그

#### 옵션 A. `--backend-only` / `--frontend-only` 플래그 둘 다 제공 (이번 출시)

- 장점: 사용자가 frontend는 외부에서 돌리거나 backend만 디버깅하고 싶을 때. 자유도. MVP에 같이 들어와도 인지 비용 작음(둘 다 안 쓰면 default = both)
- 단점: 테스트 시나리오 늘어남. 다만 한 함수의 한 인자라 작은 비용

#### 옵션 B. 인자 없는 한 동작 모드만

- 장점: 단순
- 단점: 부분 실행 자유 없음. 미래에 추가하면 ADR 두 번

### 결정 7. 테스트 가능성

#### 옵션 A. spawnProcess + fetchHealth 의존성 주입 (이번 출시)

- 장점: ADR 0022의 verify와 같은 결. 단위 테스트가 mock으로 결정적. long-running spawn 없이 흐름을 끝까지 검증
- 단점: API에 인자 두 개 더 들어감. 테스트가 spawnProcess의 mock을 만들어야 함. 다만 한 자리에서 만들면 재사용 가능

#### 옵션 B. child_process 직접 호출, 통합 테스트로만

- 장점: API 단순
- 단점: CLAUDE.md 섹션 4의 5초 미만 단위 테스트 정책 깨짐. 실제 서버 띄우기는 무겁고 비결정적

## 결정

### 결정 1: `beoreum run` (옵션 A)

명령 이름은 `beoreum run`. 약어 alias도 추가하지 않음(다른 명령이 3글자 약어를 쓰는 결과 다른데, run은 이미 3글자라 약어가 의미 없음).

### 결정 2: child_process.spawn + prefix 결합 (옵션 A)

두 프로세스를 child_process.spawn으로 띄우고 한 콘솔에 prefix를 붙여 출력한다.

```
[backend] 서버가 시작되었습니다 port=3000
[frontend] vite v5.4.0 dev server running at http://localhost:5173/
[backend] ✓ ready: http://localhost:3000
```

prefix는 줄 단위로 붙는다. 한 줄이 길어도 한 prefix만 박힌다.

stdout과 stderr를 같은 결로 한 콘솔에 합친다(stderr만 다른 색이나 마커는 안 박음. 한 결을 유지).

### 결정 3: /health 폴링 + ready 안내 (옵션 A)

backend의 /health endpoint를 1초 간격으로 폴링한다. 200 응답이 오면 한국어 안내. 60초 타임아웃이면 "readiness 확인 시간 초과. 그래도 실행을 계속합니다" 안내 후 진행.

```
[backend] readiness 확인 중: http://localhost:3000/health
[backend] ✓ ready: http://localhost:3000
```

frontend는 readiness 확인 안 함. vite dev 서버는 시작이 거의 즉시이고 healthcheck endpoint가 없음. ADR 0046 결정 6의 "frontend는 backend 아니라 healthcheck 없음" 결과 정합.

타임아웃 기본값은 60초. 옵션 인자(`readinessTimeoutMs`)로 테스트가 줄여 결정적.

### 결정 4: 한쪽 죽으면 다른 쪽 정리 (옵션 A, fail-fast)

handle.exited Promise를 Promise.race로 감시. 어느 한쪽이 먼저 종료되면 다른 쪽에 SIGTERM 전송, 두 쪽 모두 종료될 때까지 기다린 뒤 runRun이 반환.

종료 신호:
```
[backend] 종료. 다른 프로세스도 정리합니다.
```

### 결정 5: SIGINT → SIGTERM graceful shutdown (옵션 A)

bin/beoreum.js의 run 핸들러가 process.on('SIGINT')을 잡아 AbortController.abort() 호출. runRun이 signal.aborted를 감지하면 두 child에 SIGTERM 보내고 양쪽 종료까지 기다린 후 반환.

cleanup timeout 5초. 그 안에 끝나지 않으면 SIGKILL. 다만 표준 dev 서버(fastify/spring-boot/vite)는 1초 안에 정리되는 결이라 거의 도달 안 함.

### 결정 6: `--backend-only` / `--frontend-only` 플래그 (옵션 A)

```
beoreum run                    # backend + frontend 둘 다 (default)
beoreum run --backend-only     # backend만
beoreum run --frontend-only    # frontend만
```

두 플래그를 동시에 주면 에러로 안내(둘이 상호 배타).

런타임 시그니처: `runRun({ cwd, target = 'both', ... })`. target은 'both' | 'backend' | 'frontend' 중 하나.

### 결정 7: spawnProcess + fetchHealth 의존성 주입 (옵션 A)

```js
runRun({
  cwd,                       // 프로젝트 루트
  target = 'both',           // 'both' | 'backend' | 'frontend'
  spawnProcess = defaultSpawn,  // ({ cmd, args, cwd, onStdout, onStderr }) => handle
  fetchHealth = defaultFetch,   // (url, { timeoutMs }) => Promise<boolean>
  log = (line) => process.stdout.write(line + '\n'),
  signal,                    // AbortSignal (Ctrl-C로 abort)
  readinessTimeoutMs = 60000,
})
```

handle의 결: `{ pid, kill(sig?), exited: Promise<{ code, signal }> }`.

mock spawnProcess는 동기적으로 onStdout 호출 + 결정적 exited Promise 반환. mock fetchHealth는 첫 두 번 false, 세 번째 true 같은 단순 결.

언어별 backend 명령 표(architecture.language 따름):

| 언어 | cmd | args | readyUrl |
|---|---|---|---|
| node | npm | run dev | http://localhost:3000/health |
| java | ./gradlew (gradlew.bat) | :app:bootRun | http://localhost:8080/health |
| python | poetry | run uvicorn `{pkg}.main:app` --reload --port 8000 --host 0.0.0.0 | http://localhost:8000/health |

frontend 명령 고정.

| 대상 | cmd | args | readyUrl |
|---|---|---|---|
| frontend | npm | run dev | (없음) |

python의 `{pkg}`는 intent.yml에서 buildPythonPackage 로직으로 추출(python.js generator와 같은 결).

## 결과

### 긍정적

- 사용자가 한 명령으로 두 서버를 띄운다. 한 콘솔에서 두 서버의 출력을 prefix로 구분
- backend의 /health 폴링이 ADR 0046의 baseline을 활용. 두 ADR이 한 결로 살아남음
- fail-fast 결로 한 쪽 에러를 사용자가 즉시 본다. 좀비 프로세스 위험 0
- SIGINT graceful shutdown으로 표준 dev 서버 정리 결이 자연스러움
- spawnProcess + fetchHealth 의존성 주입이 단위 테스트의 결정성을 살림. CLAUDE.md 섹션 4의 5초 미만 정책
- `--backend-only` / `--frontend-only` 플래그가 부분 실행 자유를 살림. frontend를 외부에서 띄우거나 backend만 디버깅하고 싶을 때

### 부정적 / 트레이드오프

- 두 프로세스를 spawn으로 직접 관리하니 stdio merging, signal 전달, lifecycle 관리를 모두 박아야 함. 다만 ADR 0022 verify의 결을 그대로 확장한 자리라 학습 비용 작음
- python의 backend 명령이 intent.yml을 읽어 package 이름을 추출. 결합도 한 줄. 미래에 generators/python.js의 buildProjectPackage 결이 바뀌면 run.js도 따라가야 함
- readiness 폴링 60초 timeout이 Java gradle bootRun 첫 실행에는 짧을 수 있음. 사용자 피드백 쌓이면 timeout 늘리는 결로 amendment
- prefix 출력이 한 줄이 길거나 컬러 출력이 들어오면 결이 어색할 수 있음. 다만 표준 dev 서버 출력이 보통 한 줄 단위라 큰 문제 없음
- frontend의 readiness 확인이 없음. 사용자가 vite의 자체 출력("ready in Nms")으로 판단. 미래에 frontend healthcheck가 들어오면 보강

### 미래 묶임

- 7개 결정 모두 표준
- 다른 프로세스 lifecycle 결(예: docker-compose up)은 별도 ADR
- frontend healthcheck endpoint 추가는 별도 ADR
- backend 명령 표는 새 언어 추가 시 amendment
- readinessTimeoutMs 기본값 변경은 amendment
- ADR 0048(verify 스모크 테스트)이 spawnProcess + fetchHealth 결을 재사용

## 링크

- 이전 결정: ADR 0006(set 단계 정의), ADR 0017(생성 코드 7원칙), ADR 0018/0019/0020/0021(4 generator 정책), ADR 0022(verify 실행 정책), ADR 0046(생성 코드의 로컬 실행 가능성 baseline)
- 후속 작업: ADR 0048(verify 스모크 테스트 추가, run의 readiness 결 재사용)
- 동행 톤: ADR 0003 결정 2(readiness 시간 초과 시 동행 결로 안내)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 4(테스트 결정성), 섹션 8(파일당 책임), 섹션 10(글쓰기 원칙)
