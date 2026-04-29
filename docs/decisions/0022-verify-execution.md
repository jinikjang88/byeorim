# ADR 0022. Verify 실행 정책

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0006이 set 단계의 두 책임을 박았다. "실제 코드를 짓고, 그 코드가 자기 발로 서는지 컴파일과 테스트로 확인한다." ADR 0015가 MVP set의 책임을 README 합성으로 좁히고 verify를 미래로 미뤘다. 그 사이 ADR 0018/0019/0020이 각각 Node/Java/Python backend 생성을, ADR 0021이 React frontend 생성을 박았다. 이제 backend와 frontend의 실제 코드가 generated/ 안에 들어간다. 다음 자리는 verify다.

verify는 외부 프로세스를 띄워야 한다(npm install, gradle test, poetry install 등). 외부 프로세스는 시간이 걸리고, 네트워크를 타고, 사용자 머신의 자원을 쓴다. 보안 자리도 함께 검토해야 한다. 그래서 결정 자리가 여럿이다.

답해야 할 질문은 다음 일곱이다.

첫째, verify를 set이 자동으로 호출할지 별도 명령어로 둘지. 둘째, 각 backend 언어와 frontend에 어떤 명령을 실행할지. 셋째, 외부 프로세스 호출에 어떤 보안 정책을 둘지. 넷째, verify-report.md 형식. 다섯째, 실패 시 동작(다음 단계 차단? 리포트만?). 여섯째, 대상 선택(전체 vs backend만 vs frontend만). 일곱째, 테스트 가능성(verify가 child_process를 띄우는 자리를 단위 테스트로 검증할 수 있게).

## 검토한 옵션

### 결정 1. verify의 트리거

#### 옵션 A. set이 자동 호출(코드 생성과 verify를 한 단계로)
- 장점: ADR 0006의 set 정의("코드를 짓고 자기 발로 서는지 확인")에 가장 충실. 한 단계가 한 번에 끝난다
- 단점: install + test가 시간이 걸림(분 단위). 사용자가 commit 전에 코드 변경하고 싶을 때 막힌다. 네트워크가 없으면 실패. 보안적으로 자동 install이 의외의 자리로 사용자를 끌어가는 위험

#### 옵션 B. 별도 `beoreum verify` 명령어 (이번 출시)
- 장점: 명시적 opt-in. 사용자가 명령어를 친 뒤 install/test가 일어난다는 흐름이 분명. 도구 명령어(answer/status와 같은 결)
- 단점: set이 두 책임을 다하지 않는 자리가 됨. 다만 ADR 0015가 이미 그 결을 박았으니 일관성

#### 옵션 C. set에 --verify 플래그
- 장점: 사용자 선택권
- 단점: 두 동작 모드라 학습 비용. 1순위 사용자에게 플래그는 부담

### 결정 2. 언어/대상별 verify 명령

#### 옵션 A. 각 언어/대상의 표준 도구 명령
- 장점: 사용자가 자기 환경에서 익숙한 도구를 그대로 사용
- 단점: 대상마다 다른 명령. 표가 길어짐

#### 옵션 B. 한 도구로 통합(Bazel 등)
- 장점: 일관성
- 단점: 학습 비용 큼. 현실의 프로젝트와 결이 다름

### 결정 3. 외부 프로세스 호출 보안

#### 옵션 A. 사용자 머신에서 그대로 실행(이번 출시)
- 장점: 단순. 사용자가 자기 머신을 신뢰하는 자리. CI 자체로도 사용 가능
- 단점: 생성된 package.json의 의존성이 install 시 lifecycle script를 실행할 수 있음. 우리 generator가 만든 의존성은 우리가 큐레이션한 자리(@fastify/*, react 등)라 위험 자리는 알려진 패키지에 한정. 다만 제로 위험은 아님

#### 옵션 B. 컨테이너/샌드박스에서 실행
- 장점: 보안 강함
- 단점: Docker 의존성. 1순위 사용자에게 추가 도구 설치 부담. MVP에는 과함

#### 옵션 C. 실행 안 함, 명령어만 출력
- 장점: 위험 0
- 단점: verify의 의미가 사라짐. 사용자가 직접 명령어 복사해서 실행

### 결정 4. verify-report.md 형식

#### 옵션 A. 대상별 섹션, 각 섹션에 (status, command, exit_code, output 마지막 N줄)
- 장점: 한 파일에 모든 결과. 사용자가 어디가 실패했는지 즉시 안다
- 단점: output을 자르면(N줄) 중요한 자리를 놓칠 수 있음. 다만 미래에 별도 verify-{target}.log로 풀 출력 둘 자리 비워둠

#### 옵션 B. 결과 yaml + 사람용 markdown 두 자리
- 장점: 자동화 친화 + 사람 친화
- 단점: 두 파일 동기화 부담

### 결정 5. 실패 처리

#### 옵션 A. 차단하지 않음(리포트만, 다음 단계 진행 가능)
- 장점: ADR 0003 동행 톤(시작을 막지 않는다)과 결이 맞음. 사용자가 실패를 보고 결정
- 단점: 사용자가 실패를 무시하고 진행할 수 있음

#### 옵션 B. 실패 시 다음 단계 차단
- 장점: 안전
- 단점: 동행 톤 위배. 사용자가 실패 자리를 의도적으로 둔 채 진행하고 싶은 자리(예: 알려진 자리, WIP)에서 막힘

#### 옵션 C. 옵션 A이지만 exit code로 실패 신호
- 장점: 사용자에게 막지 않으면서 CI에는 실패 신호. 두 결의 균형
- 단점: 없음. 옵션 A의 작은 보강

### 결정 6. 대상 선택

#### 옵션 A. 기본은 전체(backend + frontend), 대상별 플래그는 미래 ADR
- 장점: 단순한 시작. MVP에 한 동작 모드
- 단점: 큰 프로젝트에서 한쪽만 검증하고 싶을 때 부족

#### 옵션 B. 처음부터 --backend / --frontend 플래그 제공
- 장점: 자유도
- 단점: MVP 결정 자리 늘어남. 미래에 추가 가능

### 결정 7. 테스트 가능성

#### 옵션 A. runCommand 함수 의존성 주입
- 장점: ADR 0009/0011의 어댑터/picker 패턴과 같은 결. 단위 테스트가 mock runCommand로 결정적
- 단점: API에 인자가 하나 더 들어감

#### 옵션 B. child_process 직접 호출, 테스트는 통합 테스트로
- 장점: API 단순
- 단점: 단위 테스트가 어려워짐. CLAUDE.md 섹션 4의 5초 미만 단위 테스트가 깨짐(npm install이 분 단위)

## 결정

### 결정 1: 별도 `beoreum verify` 명령어 (옵션 B)

`beoreum verify`는 별도 명령어. 단계 독립(answer/status와 같은 결). set이 자동 호출하지 않는다.

이유: set의 코드 생성은 빠르고 결정적이지만 verify는 분 단위 + 네트워크 + 외부 프로세스라 결이 다르다. 사용자가 "지금 verify할 시점인지" 명시적으로 결정하는 자리.

### 결정 2: 언어/대상별 표준 도구 명령 (옵션 A)

verify가 실행하는 명령 표.

| 대상           | 명령                                    | 의도                       |
| -------------- | --------------------------------------- | -------------------------- |
| Node backend   | `npm install` + `npm test`              | 의존성 설치 + 단위 테스트  |
| Java backend   | `./gradlew build`                       | 컴파일 + 단위 테스트(빌드에 포함) |
| Python backend | `poetry install` + `poetry run pytest`  | 가상 환경 + 테스트         |
| Frontend       | `npm install` + `npm run build` + `npm test` | 의존성 + 타입 체크/빌드 + 테스트 |

각 대상은 자기 디렉토리(`generated/backend/` 또는 `generated/frontend/`)를 cwd로 실행.

명령은 표가 한 자리에 박힌다. 미래에 명령을 바꾸려면 ADR이 필요. 새 backend 언어가 ADR로 들어오면 같은 표가 그 언어 명령을 더한다.

### 결정 3: 사용자 머신에서 그대로 실행 (옵션 A)

이번 출시는 사용자 머신에서 외부 프로세스를 직접 띄운다. 컨테이너/샌드박스 없음.

근거:
- 우리 generator가 만든 package.json/build.gradle.kts/pyproject.toml의 의존성은 우리가 큐레이션한 자리(@fastify/*, react, spring-boot, fastapi 등). 위험 패키지가 들어갈 자리는 사용자가 직접 추가한 의존성뿐
- CI 환경에서도 사용 가능해야 함. 컨테이너 의존성은 CI 셋업을 복잡하게 만든다
- 1순위 사용자(비기술 창업자)에게 Docker 설치 요구는 부담

위험 안내는 README와 verify 명령어 출력에 명시. 사용자가 자기 의존성을 추가한 뒤 verify할 때는 그 의존성의 lifecycle script가 실행됨을 알린다.

미래 ADR로 컨테이너 옵션 도입 가능. 그 시점에 `--sandbox` 플래그를 추가.

### 결정 4: 대상별 섹션 + status/command/exit_code/output 마지막 N줄 (옵션 A)

`verify-report.md` 형식.

```markdown
# Verify Report

생성 시각: 2026-04-28T12:00:00.000Z
전체 결과: 1 성공, 1 실패

## Backend (node)

- 상태: 성공
- 명령: `npm install && npm test`
- 종료 코드: 0
- cwd: `.beoreum/project/generated/backend`

### 마지막 출력 (40줄)

```
... captured output ...
```

## Frontend (React)

- 상태: 실패
- 명령: `npm install && npm run build && npm test`
- 종료 코드: 1
- cwd: `.beoreum/project/generated/frontend`

### 마지막 출력 (40줄)

```
... captured output ...
```

미래에 풀 출력이 필요해지면 별도 `verify-{target}.log` 자리를 두는 ADR 가능. MVP는 마지막 40줄로 시작(요약).

`전체 결과` 줄이 한 눈에 보이는 신호. CI에서 마지막 줄만 읽어도 통과 여부 판정 가능.

### 결정 5: 차단하지 않음, 실패는 exit code로 신호 (옵션 C)

verify 실패는 다음 단계(inspect)를 막지 않는다. ADR 0003 동행 톤("답하지 못한 질문은 다음 단계를 막지 않는다")과 정합.

`beoreum verify` 명령어 자체는 모든 대상이 성공하면 exit 0, 하나라도 실패하면 exit 1. CI에서 verify 실패를 감지할 수 있는 신호.

사용자에게 보이는 콘솔 메시지에서도 실패 자리는 명시적으로 빨간색이 아니라(이모지 정책상) "실패" 한국어 단어로 강조.

### 결정 6: 기본은 전체, 대상별 플래그는 미래 ADR (옵션 A)

`beoreum verify`(인자 없음)는 backend(있는 경우)와 frontend 둘 다 실행.

미래 ADR로 `--backend` / `--frontend` 또는 `--target node-backend` 같은 플래그 추가 가능. MVP는 한 동작 모드.

### 결정 7: runCommand 의존성 주입 (옵션 A)

`runVerify({ cwd, runCommand })`. runCommand 기본은 child_process.spawn 래퍼. 테스트는 mock runCommand 주입.

mock runCommand는 (command, options) → { exitCode, stdout, stderr } 형태로 결정적 결과를 돌려준다. 단위 테스트가 npm install을 실제로 안 돌리고도 verify 흐름을 끝까지 검증.

ADR 0009의 AI 어댑터, ADR 0011의 picker, ADR 0019의 askArchitecture와 같은 패턴. 외부 I/O가 있는 자리는 인자로 추출해 결정성과 테스트 속도를 동시에 잡는다.

## 결과

### 긍정적
- verify가 별도 명령어라 사용자가 시점을 통제. set은 빠른 코드 생성, verify는 명시적 opt-in
- 언어/대상별 명령 표가 한 자리에 박혔다. 새 언어/대상이 들어와도 표만 갱신
- 외부 프로세스를 사용자 머신에 그대로 띄우는 결정이 1순위 사용자(비기술 창업자) 우선순위와 정합. Docker 설치 같은 추가 도구 부담 없음
- runCommand 의존성 주입 패턴이 단위 테스트를 5초 미만(CLAUDE.md 섹션 4)으로 유지. mock으로 흐름 검증, 실제 실행은 통합 테스트나 사용자 손에서
- 차단하지 않는 실패 처리가 ADR 0003 동행 톤을 형식 차원에서 박는다. 사용자가 실패를 보고 결정
- exit code로 CI 신호 보냄. CI/CD 파이프라인에서 자연스럽게 fail-on-verify-failure 가능
- verify-report.md가 한 눈에 보이는 형식. 전체 결과 줄, 대상별 섹션, 마지막 출력 40줄

### 부정적 / 트레이드오프
- 컨테이너/샌드박스 없이 사용자 머신에서 의존성 설치. 사용자가 자기 의존성을 추가한 뒤 install lifecycle script가 의외의 자리로 끌어갈 위험. README와 verify 출력에 안내. 미래 ADR로 보강
- 마지막 출력 40줄로 자르는 결정이 큰 실패에서 중요한 자리를 놓칠 수 있음. 미래 ADR로 별도 verify-{target}.log 자리 둘 수 있다
- set이 자동 verify를 안 함. ADR 0006의 set 정의("코드를 짓고 자기 발로 서는지 확인")가 두 명령어로 나뉜다. 다만 ADR 0015가 이미 split을 받아들였으니 일관성
- 명령어 표가 언어별 도구 표준에 묶임. 사용자가 다른 도구(yarn, mvn 등)를 쓰고 싶으면 직접 수정 자리. 미래 ADR로 사용자 정의 명령 도입 가능

### 미래 묶임
- 7개 결정 모두 표준이다. 변경하려면 ADR이 필요
- 컨테이너/샌드박스 옵션은 미래 ADR. `--sandbox` 플래그가 들어올 자리
- 부분 실행 플래그(--backend/--frontend) 미래 ADR
- 사용자 정의 명령어 미래 ADR(yarn 대신 npm 등)
- 풀 출력 보존 ADR(verify-{target}.log)
- 타임아웃 정책 ADR
- 새 backend 언어가 들어오면 결정 2의 표를 갱신하는 amendment

## 링크
- 이전 결정: ADR 0006 (set 단계 정의), ADR 0007 (verify-report.md 자리), ADR 0015 (set MVP는 README), ADR 0018/0019/0020 (backend 언어), ADR 0021 (frontend), ADR 0009 (어댑터 의존성 주입 패턴), ADR 0011 (picker 의존성 주입)
- 후속 작업: packages/cli/src/verify.js 구현(별도 PR), bin의 verify 명령어 등록, 단위 테스트(mock runCommand)
- 관련 정책: CLAUDE.md 섹션 0(사용자 우선순위), 섹션 4(단위 테스트 5초 미만), ADR 0003 결정 2(동행 톤)
