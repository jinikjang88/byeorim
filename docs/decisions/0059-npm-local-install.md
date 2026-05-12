# ADR 0059. npm 패키지로 박는 결 — 로컬 install 1차

- 상태: 채택
- 날짜: 2026-05-13
- 결정자: DevSmith

## 맥락

오픈소스 공개 직전, 사용자가 벼림을 자기 머신에서 `byeorim` 한 단어로 부를 수 있어야 외부 사용자 결의 진입 마찰이 줄어든다. 지금까지는 저장소 클론 후 `node bin/byeorim.js <명령>` 결로만 동작했다. 글로벌 install이 박혀야 어느 디렉토리에서나 `byeorim init`이 가능.

벼림은 npm workspace 모노레포(packages/cli, packages/ai, packages/catalog, packages/core, packages/templates)로 구성됐다. 글로벌 install을 박는 결을 정할 때 두 갈래가 있다.

1. 로컬 결: `npm install -g <path>` — 클론한 저장소를 글로벌로 symlink. 저장소 옮기면 같이 깨짐
2. 정식 결: npm registry 배포 — `npm install -g byeorim` 어디서나. tarball에 workspace 의존성을 동봉(`bundleDependencies`)하는 결이 필요

이 ADR이 답하는 질문은 셋이다.

1. 1차로 어느 결을 박을까
2. tarball 결로 풀려면 추가로 어떤 결이 필요한가
3. private: true 결을 어떻게 둘까

## 검토한 옵션

### 결정 1. 1차 install 결

#### 옵션 A. `npm install -g <path>` 결만 (이번 채택)

장점.
- 추가 패키징 작업 없음. 현 workspace 결 그대로 동작
- 로컬 개발자가 자기 머신에서 클론하고 박은 결로 바로 쓸 수 있음
- npm registry 배포의 비가역 결(이름 선점, 버전 정책, 보안 책임)을 차후로 미룸
- ADR 0057의 CI 게이트가 작동하는 안전 결을 한 결 더 본 뒤 정식 배포

단점.
- 외부 사용자가 "1순위 비기술 창업자"인데, git clone + npm install + npm install -g . 3단계가 부담일 수 있음
- tarball 결로는 동작 안 함. 동봉된 워크스페이스 결이 없어 `@byeorim/cli` 결을 못 찾음

#### 옵션 B. 정식 npm registry 배포

장점.
- `npm install -g byeorim` 한 줄로 끝. 1순위 사용자 결과 맞음
- 버전 박힘. 사용자가 자기 결의 버전을 안다

단점.
- workspace 결을 단일 tarball로 묶는 결이 까다로움. `bundleDependencies` + dependencies 결을 박아야 함
- 이름 `byeorim`이 npm registry에 비어있는지 확인 결 필요(아직 확인 안 함)
- 보안 책임 결. CVE 대응, supply chain 결을 본인이 진다
- 비가역 결. 잘못된 결로 publish 후 unpublish는 24시간 안에서만 가능
- 0.1.0의 결로 정식 배포는 이른 결. 1.0 시점이 자연스러움

#### 옵션 C. tarball 결을 GitHub Release에 박기

장점.
- npm registry 의존 없이도 사용자가 tarball 한 결로 install
- 버전 박힘. unpublish 결의 위험 없음

단점.
- npm install -g <tarball>은 여전히 워크스페이스 결을 못 풀음. bundleDependencies가 필요
- 옵션 B의 작업 결을 거의 다 해야 함. 그렇다면 옵션 B로 가는 게 자연스러움

### 결정 2. tarball 결로 풀기 위한 추가 작업

옵션 B로 갈 때 필요한 결. 이 ADR은 차후로 미루는 결이지만 결을 적어둔다.

- `dependencies`에 `@byeorim/cli`, `@byeorim/ai`, `@byeorim/catalog`, `@byeorim/core`, `@byeorim/templates`를 박음. 버전은 0.1.0(workspace 안 결과 정합)
- `bundleDependencies`에 같은 5개를 박음. npm pack 결로 node_modules 안 워크스페이스 빌드가 tarball에 동봉됨
- `files` 필드 명시. bin/, packages/, LICENSE만 동봉. 문서/테스트/도구 결은 제외
- `private: true` 제거 (npm publish 게이트 해제)
- 새 ADR로 정식 결을 박음 (예: ADR 0060. npm registry 정식 배포)

### 결정 3. private: true

#### 옵션 A. 그대로 유지 (이번 채택)

- 장점: 실수로 `npm publish` 박는 결을 막음. 1차 결에서 안전망
- 단점: 없음. 옵션 B/C로 갈 때 별도 ADR로 풀면 됨

#### 옵션 B. 지금 풀기

- 장점: 향후 publish 결이 한 결 가까워짐
- 단점: 정식 배포 결을 별도 ADR로 정해야 하는데, 그 사이에 실수로 publish 박힐 위험. 게이트로 두는 결이 자연스러움

### 결정 4. 메타데이터 보강

#### 옵션 A. 한 묶음으로 박기 (이번 채택)

- `homepage`, `repository`, `bugs`, `keywords` 박음
- npm view, GitHub link, 사용자가 패키지 메타를 볼 때 도움
- 정식 배포 결에서 추가로 필요하지 않음. 미리 박아둠

## 결정

### 결정 1: `npm install -g <path>` 결만 (옵션 A)

저장소를 클론한 뒤 `npm install -g .`을 박으면 글로벌 결로 symlink가 박힌다. 어디서나 `byeorim` 결로 부를 수 있다. README 한/영 두 판본에 설치 결을 박았다.

### 결정 2: tarball 결은 차후 (deferred)

bundleDependencies + dependencies + files 결을 박는 작업은 별도 ADR(0060 예상)로 미룬다. 그 결을 박을 때 npm 이름 선점도 함께 봄.

### 결정 3: private: true 유지 (옵션 A)

지금은 정식 publish 게이트로 두는 결. 풀 결을 박을 때 별도 ADR로.

### 결정 4: 메타데이터 박음 (옵션 A)

`homepage`, `repository`, `bugs`, `keywords`를 루트 package.json에 박는다. 정식 배포 결을 박기 전에 미리 둔다.

## 결과

### 긍정적

- 사용자가 자기 머신에서 `byeorim` 결로 부를 수 있음. 어느 디렉토리에서나
- 추가 패키징 작업 없이 동작. 첫 외부 사용자가 시도하는 결의 진입 마찰이 한 결 줄어듦
- private: true 결이 살아있어 실수 publish 결의 위험 없음
- 메타데이터 결이 박혀 미래 정식 배포 결에서 따로 박을 결 줄어듦

### 부정적 / 트레이드오프

- git clone + npm install + npm install -g . 3단계 결. 1순위 비기술 창업자에게는 여전히 가벼운 결이 아님. 정식 npm registry 배포가 차후 결로 자연스러움
- symlink 결이라 저장소를 옮기거나 지우면 글로벌 `byeorim`도 깨짐. README에 안내 한 줄 박음
- tarball 결로는 동작 안 함. 사용자가 GitHub Release 결로 받은 tarball을 install하려 하면 깨짐. 차후 ADR에서 풀음

### 미래 묶임

- 정식 npm registry 배포 결로 갈 때 별도 ADR(0060 예상). 결정 2의 작업 결을 그때 박음. private: true 결도 그때 풀음
- npm 이름 `byeorim` 선점 결을 1차 결로 박는 결도 검토 자리. 다만 결정 1 시점에 이름만 publish는 깔끔하지 않음(0.0.1-alpha 결 같은 비공식 결로 박는 결도 있음). 정식 결 박을 때 함께 봄
- 차후 사용자가 `byeorim` 명령을 어디서나 깐 뒤 `byeorim init` → `byeorim prospect` 결로 시작. 이 흐름이 README의 "설치" → "시작하기" 결과 정합

## 링크

- 손댄 파일: package.json(메타데이터 박음), README.md / README.en.md(설치 결 안내)
- 관련 ADR: 0057(CI 게이트), 0058(파일명 프리픽스)
- 관련 정책: CLAUDE.md 섹션 1(프로젝트 성격 — 무료 오픈소스 프로토타입), 섹션 2 7번 금지선(유료 게이트 결 없음)
- 다음 결: 정식 npm registry 배포 결을 박을 때 ADR 0060(예상)
