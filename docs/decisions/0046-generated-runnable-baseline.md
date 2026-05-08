# ADR 0046. 생성 코드의 로컬 실행 가능성

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0006이 set 단계의 책임을 박았다. "실제 코드를 짓고, 그 코드가 자기 발로 서는지 컴파일과 테스트로 확인한다." ADR 0018(Node), 0019(Java), 0020(Python), 0021(React)이 4 generator를 박아 generated/backend, generated/frontend가 만들어지는 결까지 왔다. ADR 0022는 `byeorim verify`가 install/test를 돌리는 결을 박았다.

여기까지 와도 1순위 사용자(비기술 창업자)가 생성된 코드를 실제로 띄워 자기 서비스가 살아 있는 것을 보려면 다음을 거쳐야 한다.

1. generated/backend로 들어가 .env를 손으로 만든다
2. JWT_SECRET 같은 시크릿을 직접 채운다(어떤 값이 안전한지 모른다)
3. `npm install`, `npm start`로 띄운다
4. 다른 터미널에서 `curl`로 endpoint를 두드린다
5. frontend도 같은 결로 따로 띄운다

비기술 창업자에게는 단계가 너무 많고, 첫 단계에서 막힌다. 이번 ADR은 generated 코드 자체가 "로컬에서 한 번에 떠서 살아있는 것을 보여주는 결"을 갖추도록 baseline을 박는다.

이번 ADR이 답하는 질문은 여섯이다.

첫째, healthcheck endpoint를 표준으로 emit할지 사용자가 forge에서 명시적으로 선택할지.

둘째, .env 파일을 set이 자동 생성할지, .env.example만 둘지.

셋째, dev 모드의 데이터베이스를 어떤 결로 잡을지(in-memory/SQLite vs architecture.database 따름).

넷째, prod 모드 안전 가드의 결(런타임 throw vs 별도 prod 파일 강제).

다섯째, dev placeholder의 표준 마커.

여섯째, 4 generator(Node, Java, Python, Frontend) 각각의 표준 결을 어떻게 정렬할지.

`byeorim run` 명령(ADR 0047)과 verify 스모크 테스트(ADR 0048)는 이 ADR의 baseline이 박혀야 의미를 가진다. 셋이 한 묶음의 후속 작업.

## 검토한 옵션

### 결정 1. healthcheck endpoint

#### 옵션 A. 표준 자동 emit (이번 출시)

- 장점: 사용자 선택 없이 모든 backend가 `/health`를 갖는다. run/verify 스모크 테스트가 의지할 표준이 한 곳에 박힌다. 비기술 창업자가 "내 서비스가 살아있다" 신호를 한 URL로 본다
- 단점: 사용자가 healthcheck 의미를 안 골라도 emit된다. 다만 ops 자리는 어차피 표준이 있어야 하는 것

#### 옵션 B. forge에서 사용자가 health 블럭을 명시적으로 선택

- 장점: 사용자 선택권
- 단점: 비기술 창업자가 "health가 뭔지" 결정해야 한다. CLAUDE.md 섹션 0 위배. run/verify가 의지할 결이 일관되지 않음

### 결정 2. .env 파일 자동 생성

#### 옵션 A. `.env`(dev 채움) + `.env.production`(템플릿) 둘 다 (이번 출시)

- 장점: 사용자가 한 단계 줄인다. dev로 즉시 띄울 수 있고, prod로 옮길 때 채워야 할 자리가 한 파일에 모인다. .env.production은 placeholder만 박혀있어 실수로 dev 값이 prod로 흘러갈 위험이 0
- 단점: 두 파일이라 처음에 본 사용자가 헷갈릴 수 있다. README 안내로 풀 수 있는 결

#### 옵션 B. .env.example만 둠

- 장점: 표준 결(많은 OSS 프로젝트가 .env.example 제공)
- 단점: 사용자가 한 단계 더 거쳐야 함(.env.example을 .env로 복사). 1순위 사용자에게 부담

#### 옵션 C. .env만 둠

- 장점: 가장 빠름
- 단점: prod 안전 결이 약함. dev 값이 prod로 흘러갈 위험

### 결정 3. dev 모드 데이터베이스

#### 옵션 A. in-memory / SQLite default (이번 출시)

- 장점: 외부 의존성 0. 1순위 사용자가 Docker나 PostgreSQL 설치 없이 즉시 띄운다. CLAUDE.md 섹션 0 우선순위와 정합
- 단점: architecture.database가 PostgreSQL 같은 다른 DB라면 dev와 prod의 결이 갈라진다. 다만 prod 모드에서는 architecture.database를 따르도록 가드

#### 옵션 B. docker-compose 부산물 생성

- 장점: prod와 dev의 DB가 같은 결
- 단점: Docker 설치 부담. ADR 0022 결정 3에서 verify에 대해 이미 거부했던 결

#### 옵션 C. architecture.database 그대로

- 장점: 일관성
- 단점: 외부 의존성 동반. 비기술 창업자 부담

### 결정 4. prod 모드 안전 가드

#### 옵션 A. .env.production 별도 파일 + 런타임 placeholder 검출 throw (이번 출시)

- 장점: 두 안전망. (1) 파일 분리로 dev 값과 prod 값이 같은 자리에 안 섞인다. (2) NODE_ENV/profile=production에서 dev placeholder 마커가 그대로면 한국어 에러로 throw. 사용자가 prod 배포 전에 반드시 한국어 메시지를 본다
- 단점: 두 결이 동시에 박힘. 다만 두 안전망이 평행이라 어느 하나가 빠져도 다른 하나가 잡음

#### 옵션 B. .env 한 파일 + 런타임 검출만

- 장점: 단순
- 단점: dev 값과 prod 값이 한 파일에 섞여 사용자가 dev 값을 prod로 commit할 위험

#### 옵션 C. 별도 파일만, 런타임 검출 없음

- 장점: 단순
- 단점: 사용자가 .env.production을 안 채우고 그대로 띄우면 시작은 성공해버림. 위험

### 결정 5. dev placeholder 표준 마커

#### 옵션 A. `BYEORIM_DEV_PLACEHOLDER_` prefix (이번 출시)

- 장점: 브랜드 prefix라 충돌 없음. 한국어/영문 모두에서 검색 가능. 의도가 분명. 마커가 prefix로 박혀있어 startup 검사가 단순(prefix 검사)
- 단점: 길이가 23자라 짧진 않음. 다만 시크릿 자체가 길어야 안전한 결이라 큰 부담 아님

#### 옵션 B. `CHANGE_ME` 또는 `TODO`

- 장점: 짧음
- 단점: 사용자 코드의 다른 자리(예: 도메인 코드의 TODO 주석)와 충돌 가능. 검출 정확도 약함

#### 옵션 C. 환경 변수별 다른 마커

- 장점: 자유도
- 단점: 검출 로직이 복잡. 테이블이 늘어남

### 결정 6. 4 generator 정렬

#### 옵션 A. 각 언어의 표준 idiom을 그대로 따름 (이번 출시)

- 장점: 사용자가 자기 언어 표준을 그대로 본다(Node=dotenv, Java=Spring profile, Python=pydantic-settings env_file, Vite=mode). 학습 비용 낮음
- 단점: 표가 길어짐. 각 generator가 다른 결로 갈라짐. 다만 baseline 의미(dev 값 자동 + prod 안전 가드)는 4 generator에서 같음

#### 옵션 B. 한 결로 통합(.env 파일을 4 generator가 공유)

- 장점: 일관성
- 단점: Spring은 application.yml이 표준이라 .env를 쓰려면 dotenv-spring 같은 라이브러리 의존. Vite는 빌드 타임이라 런타임 검출 결이 안 어울림. 결국 어색

## 결정

### 결정 1: 표준 healthcheck endpoint를 모든 backend generator가 emit (옵션 A)

`/health`가 표준 endpoint다. 4 backend generator(Node, Java, Python, Frontend는 backend 아님)가 emit하는 결.

- 메서드: GET
- 경로: `/health`
- 인증: 없음(public)
- 응답: HTTP 200 + `{ "status": "ok" }`
- 위치: feature 외부의 root level에 박힘. ops 자리이므로 도메인 feature와 갈라둔다

### 결정 2: `.env`(dev 채움) + `.env.production`(템플릿) 둘 다 자동 생성 (옵션 A)

각 backend generator(+ frontend)는 다음 두 파일을 generated 디렉토리에 만든다.

- `.env`: dev에서 즉시 동작하는 값으로 채워짐. JWT_SECRET 같은 시크릿은 dev placeholder로 채워짐
- `.env.production`: prod 템플릿. 모든 시크릿이 dev placeholder로 박혀 있어 사용자가 한국어 안내를 보고 직접 채워야 함

`.gitignore`에 두 파일 모두 등록. 사용자가 실수로 commit하지 않게 보호.

별도로 `.env.example`을 commit 가능한 결로 둘지는 미루는 결. dev/.env가 자동 생성되면 .env.example의 의미가 약함. 미래에 사용자 피드백이 쌓이면 추가하는 결로 미룬다.

### 결정 3: dev 모드는 in-memory / SQLite default (옵션 A)

dev에서는 외부 DB 의존성 없이 띄우는 결.

| 언어 | dev DB | prod DB(.env.production) |
|---|---|---|
| Node | `:memory:` 또는 SQLite 파일 (`./dev.db`) | architecture.database 따름 |
| Java | H2 in-memory | architecture.database 따름 |
| Python | SQLite 파일 (`./dev.db`) | architecture.database 따름 |

architecture.database가 PostgreSQL 같은 외부 DB일 때 prod 템플릿은 그 DB의 connection string 마커를 박는다. 사용자가 dev에서 prod-like하게 테스트하고 싶다면 .env의 DATABASE_URL을 직접 갱신.

### 결정 4: 두 안전망(파일 분리 + 런타임 placeholder throw) (옵션 A)

prod 모드 안전은 두 결로 박는다.

#### 안전망 1. 파일 분리

dev 모드는 `.env` 또는 application.yml(default profile)을 로드. prod 모드는 `.env.production` 또는 application-production.yml(production profile)을 로드. 모드는 환경 변수로 결정한다.

| 언어 | 모드 환경 변수 | dev 파일 | prod 파일 |
|---|---|---|---|
| Node | `NODE_ENV` | `.env` | `.env.production` |
| Java | `SPRING_PROFILES_ACTIVE` | `application.yml` | `application-production.yml` |
| Python | `PYTHON_ENV` | `.env` | `.env.production` |
| Frontend (Vite) | `mode` (build-time) | `.env` | `.env.production` |

#### 안전망 2. 런타임 placeholder throw

서버 startup 시 prod 모드인데 시크릿 값이 `BYEORIM_DEV_PLACEHOLDER_` prefix로 시작하면 한국어 에러로 throw. 사용자가 .env.production을 안 채우고 띄우려 하면 즉시 막힌다.

```
startup 거부: PROD 모드에서 JWT_SECRET 값이 dev placeholder입니다.
.env.production의 JWT_SECRET을 prod 값으로 채운 뒤 다시 시작하세요.
```

Frontend(Vite)는 빌드 타임이라 startup 자체가 없다. 대신 vite.config의 prod 빌드 hook에서 `import.meta.env`의 값들을 검사해 placeholder가 남아있으면 빌드를 실패시킨다.

### 결정 5: `BYEORIM_DEV_PLACEHOLDER_` prefix 표준 마커 (옵션 A)

dev placeholder 값의 표준 마커는 `BYEORIM_DEV_PLACEHOLDER_` prefix.

예시.

```
JWT_SECRET=BYEORIM_DEV_PLACEHOLDER_jwt_secret_change_before_production
DATABASE_URL=BYEORIM_DEV_PLACEHOLDER_database_url_change_before_production
```

런타임 가드는 단순한 prefix 검사로 가드한다.

```js
const PLACEHOLDER_PREFIX = 'BYEORIM_DEV_PLACEHOLDER_';
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET?.startsWith(PLACEHOLDER_PREFIX)) {
  throw new Error('PROD 모드에서 JWT_SECRET 값이 dev placeholder입니다. .env.production을 채워주세요.');
}
```

dev 모드에서는 placeholder가 그대로 동작한다(JWT가 약하지만 dev라 무방). prod에서만 차단.

### 결정 6: 각 언어의 표준 idiom을 따른다 (옵션 A)

각 generator는 자기 언어 표준을 그대로 사용. 베이스라인 의미(healthcheck + dev 자동 + prod 가드)는 4 곳에서 같지만 표현은 언어별로 다르다.

#### Node (Fastify)

- `.env` / `.env.production` 파일 생성
- `dotenv` 패키지로 NODE_ENV에 따라 분기 로드
- server.js에 `/health` 라우트 박음
- startup에서 placeholder prefix 검사
- package.json에 `dev`(nodemon 또는 node --watch), `start`(prod 가정 안 함, NODE_ENV로 분기) 스크립트

#### Java (Spring Boot)

- `application.yml` (dev 채움) + `application-production.yml` (템플릿) 생성
- `@Value`로 주입받은 시크릿을 `@PostConstruct`에서 검사. spring.profiles.active=production이면 placeholder prefix면 IllegalStateException
- HealthController에 `@GetMapping("/health")` 박음
- README에 `./gradlew bootRun`(dev), `./gradlew bootRun --args='--spring.profiles.active=production'`(prod) 안내

#### Python (FastAPI)

- `.env` / `.env.production` 파일 생성
- pydantic-settings의 `BaseSettings`가 PYTHON_ENV로 env_file 분기
- main.py에 `@app.get("/health")` 박음
- Settings의 `__init__` 또는 model_validator에서 placeholder prefix 검사
- README에 `poetry run uvicorn ...`(dev), `PYTHON_ENV=production poetry run uvicorn ...`(prod) 안내

#### Frontend (Vite + React)

- `.env` / `.env.production` 파일 생성
- Vite native mode가 .env.production을 prod 빌드에 자동 사용
- vite.config에 prod 빌드 검사 plugin 추가. `VITE_API_BASE`가 placeholder prefix면 빌드 실패
- frontend는 backend 아니라 healthcheck endpoint는 없음. 대신 client.ts에 healthcheck 호출 헬퍼(`pingHealth`) 박는다. ADR 0047의 run 명령이 readiness 안내에 사용

## 결과

### 긍정적

- 1순위 사용자(비기술 창업자)가 generated 코드를 받자마자 한 명령으로 띄울 수 있다. 시크릿을 손으로 채우는 단계가 사라진다
- prod 안전이 두 안전망(파일 분리 + 런타임 throw)으로 박혀 dev 값이 prod로 흘러갈 위험이 0에 가까움. 한 안전망이 뚫려도 다른 하나가 잡음
- `BYEORIM_DEV_PLACEHOLDER_` prefix가 표준이라 4 generator에서 같은 검출 로직이 박힘. 미래에 새 언어 generator가 들어와도 같은 결
- healthcheck endpoint가 표준이라 ADR 0047(run)과 ADR 0048(verify 스모크)이 의지할 표준이 한 곳에 박힘
- in-memory/SQLite default가 외부 의존성 없이 동작하는 결을 살린다. 사용자가 PostgreSQL을 골라도 dev에서는 SQLite로 빠르게 띄움
- 각 언어의 표준 idiom을 그대로 따라 학습 비용 낮음. Node 사용자는 dotenv를 본다, Java 사용자는 Spring profile을 본다

### 부정적 / 트레이드오프

- 두 .env 파일이 처음에 헷갈릴 수 있다. README의 안내로 푸는 결
- dev에서는 SQLite, prod에서는 architecture.database라 dev/prod의 동작 결이 갈라진다. 사용자가 prod-like하게 테스트하려면 .env의 DATABASE_URL을 직접 바꿔야 함. 미래에 docker-compose 부산물 ADR이 들어오면 보강
- 4 generator가 표준 idiom을 따르니 표가 길어짐. 다만 의미는 같으니 6개월 뒤 기여자가 한 generator를 익히면 다른 generator도 결을 안다
- placeholder prefix 검사가 단순 prefix이라 사용자가 "BYEORIM_DEV_PLACEHOLDER_real_secret_for_prod" 같은 실수로 시작하는 prod 값을 박으면 검사가 잡는다. 다만 그런 사용자 실수는 검사가 잘 잡는 결로 결과적으로 옳음

### 미래 묶임

- healthcheck endpoint가 표준이라 ADR 0047/0048이 의지. 표준 변경은 ADR로
- placeholder prefix는 표준이라 변경하려면 ADR. 모든 generator의 검사 로직이 따라가야 함
- in-memory/SQLite default는 표준. 다른 dev DB 옵션(예: docker-compose 추가)는 미래 ADR
- 두 .env 파일 결은 표준. .env.example 추가나 다른 환경(.env.staging) 추가는 미래 ADR
- 새 backend 언어가 generator로 들어오면 결정 6의 표를 갱신하는 amendment

## 링크

- 이전 결정: ADR 0006(set 단계 정의), ADR 0017(생성 코드 7원칙, 결정 1 보안 최우선), ADR 0018/0019/0020/0021(4 generator 정책), ADR 0022(verify 실행 정책)
- 후속 작업: ADR 0047(byeorim run 명령), ADR 0048(verify 스모크 테스트 추가)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자 우선순위), 섹션 4(테스트 결정성), 섹션 8(데이터 무관성), 섹션 10(글쓰기 원칙)
