# ADR 0018. Node.js 코드 생성 구조

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0017이 생성 코드의 7대 원칙을 박았다. 이 ADR은 그 원칙을 Node.js로 풀어낸다. architecture.yml의 language가 `node`일 때 set 단계가 어떤 구조로 코드를 생성할지를 정한다.

Node.js 생태계는 선택지가 많다. 웹 프레임워크만 해도 Express, Fastify, Hono, Koa, NestJS 등. 각 도구의 장단점이 ADR 0017의 7원칙(특히 보안과 유지보수)에 어떻게 답하는지가 결정의 기준.

이번 출시(MVP)는 backend 코드 생성에만 집중한다. frontend 자동 생성은 별도 ADR(미래 자리). 또한 set 단계의 실제 코드 생성 구현은 이 ADR이 정한 구조를 따라 별도 PR에서 들어온다. 본 ADR은 설계 자리만 박는다.

## 검토한 옵션

### 결정 1. 웹 프레임워크

#### 옵션 A. Fastify
- 장점: 보안 최우선(ADR 0017 결정 1)에 잘 맞음. JSON Schema 기반 입력 검증이 기본 내장. 응답 직렬화도 스키마 기반이라 의도하지 않은 필드 누설 방지. plugin 시스템이 명시적이라 의존성 추적 용이. pino 로깅 내장
- 단점: Express보다 커뮤니티 자료가 살짝 적음. 마이그레이션 부담이 미래에 있을 수 있음

#### 옵션 B. Express
- 장점: Node.js 웹 프레임워크의 가장 큰 생태계. 자료와 라이브러리 풍부
- 단점: 보안이 기본값이 아니다. helmet, body-parser, express-validator를 따로 끼워야 함. 조립 누락이 보안 구멍이 됨. ADR 0017 결정 1과 맞지 않음

#### 옵션 C. Hono
- 장점: 모던, 빠름, edge runtime 지원, 작은 번들
- 단점: 비교적 새 자리라 1순위 사용자(비기술 창업자)가 만난 다음 사람이 익숙하지 않을 수 있음

#### 옵션 D. NestJS
- 장점: 풀 프레임워크. Java Spring Boot 같은 체계
- 단점: 무거움. 데코레이터 기반이라 학습 곡선 큼. 1순위 사용자에게 과하다

### 결정 2. 빌드 도구와 의존성 관리

#### 옵션 A. npm + workspaces
- 장점: Node.js 표준 도구. 모노레포(BE/FE 분리)에 workspaces가 자연스럽게 동작. 벼름 자체도 npm workspaces 사용
- 단점: pnpm이나 yarn보다 살짝 느림

#### 옵션 B. pnpm
- 장점: 디스크 효율, 엄격한 의존성 그래프
- 단점: 추가 도구 설치 필요. 1순위 사용자 시작 마찰

#### 옵션 C. yarn
- 장점: 모노레포 기능 풍부
- 단점: 두 메이저 버전(yarn 1, berry) 분기로 자료가 흩어짐

### 결정 3. 테스트 프레임워크

#### 옵션 A. node:test (Node.js 빌트인)
- 장점: 의존성 0. Node 18+ 빌트인. 벼름 자체도 사용. 학습 일관성
- 단점: 매처가 vitest/jest보다 적음. watch mode와 snapshot 같은 자리는 직접 짜야 함

#### 옵션 B. vitest
- 장점: ESM 친화, watch mode 우수, jest 호환 매처 풍부
- 단점: 추가 의존성

#### 옵션 C. jest
- 장점: 가장 큰 생태계
- 단점: ESM 지원이 역사적으로 약함. 모던 Node 코드와 마찰

### 결정 4. 모듈 시스템과 디렉토리 구조

#### 옵션 A. ESM + feature 단위 모듈 (`src/features/{feature-name}/`)
- 장점: ADR 0017 결정 2(MSA 준비, feature 분리)에 정확히 맞음. 각 feature가 한 폴더에 모이고 미래 마이크로서비스 분리 시 폴더가 그대로 빠짐. ESM은 모던 Node 표준
- 단점: feature 간 공통 자리(공유 유틸 등)를 어디에 둘지 추가 결정 필요

#### 옵션 B. CommonJS + 레이어 단위 (`src/controllers/`, `src/services/`, `src/repositories/`)
- 장점: 익숙한 구조. 작은 프로젝트에 단순
- 단점: 같은 feature의 자리가 폴더 셋에 흩어진다. MSA 분리 시 셋 폴더에서 같은 feature를 골라내야 함. ADR 0017 결정 2와 충돌

#### 옵션 C. ESM + 평면 (`src/*.js` 한 자리)
- 장점: 가장 단순
- 단점: 파일이 늘면 통제 어려움

### 결정 5. 보안 기본값

#### 옵션 A. Fastify 기본 + 보안 plugin 자동 등록
- 장점: 모든 생성 프로젝트가 같은 보안 기본값을 가짐. 사용자가 빼먹을 자리 없음
- 단점: 사용자가 일부 자리를 끄고 싶을 때 코드를 고쳐야 함

#### 옵션 B. 보안 plugin은 사용자 선택
- 장점: 자유도
- 단점: ADR 0017 결정 1(보안 최우선) 위배. 보안이 옵션이 됨

표준 보안 plugin(옵션 A 채택 시):
- `@fastify/helmet`: 보안 헤더(CSP, HSTS, X-Frame-Options 등)
- `@fastify/auth` + `@fastify/jwt`: JWT 인증
- `@fastify/cors`: CORS 명시적 설정(기본은 거부)
- `@fastify/rate-limit`: 속도 제한
- `@fastify/sensible`: 표준 에러 응답
- 입력 검증: Fastify 빌트인(JSON Schema)
- 비밀번호 해시: `argon2` 또는 `bcrypt`
- 시크릿: `dotenv`로 환경 변수, .env는 .gitignore

### 결정 6. 로깅

#### 옵션 A. pino
- 장점: Fastify 빌트인. 빠름. 구조화 로그(JSON). 운영 환경에서 분석 도구와 연결 쉬움
- 단점: 사람이 읽기에는 별도 도구(pino-pretty) 필요

#### 옵션 B. winston
- 장점: 가장 큰 생태계
- 단점: pino보다 느림. Fastify 통합이 추가 작업

#### 옵션 C. console.log
- 장점: 의존성 0
- 단점: 운영에 부적합. 구조화 안 됨

### 결정 7. 백엔드/프론트엔드 분리

#### 옵션 A. 모노레포 + npm workspaces (`backend/`, `frontend/`)
- 장점: 한 저장소에서 두 자리를 함께 관리. workspaces로 의존성과 빌드를 분리
- 단점: 한 모노레포가 두 빌드 시스템(BE, FE)을 가짐

#### 옵션 B. 두 별도 저장소
- 장점: 완전 분리
- 단점: 사용자가 두 저장소를 관리. 1순위 사용자 부담

이번 출시는 backend만 생성하지만 디렉토리 구조는 미래에 frontend가 추가될 자리를 비워둔다.

### 결정 8. 디자인 패턴 표현

#### 옵션 A. 함수형 + factory DI
- 장점: Node.js 관용. 클래스 강제 안 함. 함수 합성으로 의존성 주입
- 단점: Java 출신 개발자에게 살짝 낯섦

#### 옵션 B. 클래스 + DI 컨테이너 (예: tsyringe)
- 장점: Java/Spring 친화
- 단점: 추가 의존성. Node 관용에서 멀어짐

#### 옵션 C. NestJS 데코레이터
- 장점: 강력
- 단점: NestJS 종속(결정 1 옵션 D와 묶임)

## 결정

### 결정 1: Fastify (옵션 A)

웹 프레임워크는 **Fastify**. 보안 최우선(ADR 0017 결정 1) 정신을 프레임워크 기본값에서부터 지키기 위함. JSON Schema 기반 검증이 모든 엔드포인트에 강제되고, 응답 직렬화 스키마로 의도치 않은 필드 누설을 막는다.

Express는 익숙하지만 보안이 plugin 조합에 의존한다. 빠뜨리는 자리가 곧 구멍이 된다. ADR 0017 결정 1과 맞지 않아 채택하지 않는다.

### 결정 2: npm + workspaces (옵션 A)

빌드 도구는 **npm workspaces**. Node.js 표준 도구를 그대로 사용하고, BE/FE 분리(결정 7)도 workspaces로 자연스럽게 처리. 벼름 자체도 같은 도구를 쓰므로 학습 일관성.

### 결정 3: node:test (옵션 A)

테스트 프레임워크는 **node:test**. 의존성 0이고 Node 18+ 빌트인. 벼름 자체와 같은 도구. 매처가 부족한 자리는 `node:assert`로 보강한다.

미래에 watch mode나 snapshot이 절실해지면 vitest로 옮기는 ADR을 별도로.

### 결정 4: ESM + feature 단위 모듈 (옵션 A)

모듈 시스템은 **ESM**, 디렉토리는 **feature 단위**. 다음 구조가 표준이다.

```
backend/
├── package.json
├── src/
│   ├── server.js              # 엔트리, plugin 등록
│   ├── config.js              # 환경 변수 로드
│   ├── plugins/               # 공통 plugin (auth, cors 등 등록 자리)
│   ├── shared/                # feature 간 공유 유틸/타입(최소화)
│   └── features/
│       └── {feature-name}/
│           ├── routes.js       # web 레이어 (Fastify 라우트)
│           ├── service.js      # application 레이어
│           ├── repository.js   # infrastructure 레이어
│           ├── schemas.js      # 입력/출력 JSON Schema
│           └── domain.js       # domain 레이어 (엔티티, 값 객체)
└── test/
    └── features/
        └── {feature-name}/
            └── {operation}.test.js
```

각 feature가 한 폴더에 모인다. selected-blocks.yml의 한 블럭이 한 feature 폴더가 된다. 미래 MSA 분리 시 한 폴더가 한 서비스로 빠진다(ADR 0017 결정 2).

shared/는 최소화한다. feature 간 공유 코드는 가능한 한 적게. 공유가 늘어나면 그 자리가 새 feature가 되어야 할 신호.

### 결정 5: 보안 plugin 자동 등록 (옵션 A)

다음 plugin이 모든 생성 프로젝트에 기본 등록된다.

| 영역             | plugin                   | 역할                                      |
| ---------------- | ------------------------ | ----------------------------------------- |
| 보안 헤더        | `@fastify/helmet`        | CSP, HSTS, X-Frame-Options 등             |
| 인증             | `@fastify/jwt`           | JWT 발급과 검증                           |
| 권한             | `@fastify/auth`          | 라우트별 인증 가드                        |
| CORS             | `@fastify/cors`          | 명시적 origin 화이트리스트                |
| 속도 제한        | `@fastify/rate-limit`    | DDoS/brute-force 완화                     |
| 표준 에러        | `@fastify/sensible`      | HTTP 표준 에러 응답                       |
| 입력 검증        | Fastify 빌트인           | JSON Schema 강제                          |
| 비밀번호         | `argon2`                 | 안전한 비밀번호 해시                      |
| 환경 변수        | `dotenv`                 | 시크릿을 .env에서 로드(.env는 git 무시)   |

각 라우트는 다음을 명시적으로 가진다.
- `schema`: 입력/출력 JSON Schema
- `preHandler`: 인증/권한 가드(공개 엔드포인트는 명시적으로 표시)

라우트 등록 시 schema를 빠뜨리면 정적 검증(린트 또는 빌드 시점)에서 막는다. ADR 0017 결정 1의 "입력 검증 강제"가 코드 차원에서 실행되는 자리.

### 결정 6: pino (옵션 A)

로깅은 **pino**. Fastify 빌트인이라 추가 의존성 없음. JSON 구조화 로그라 운영 도구와 연결 쉬움. 개발 환경은 pino-pretty로 사람이 읽음.

민감정보 마스킹: pino의 `redact` 옵션으로 password, token, ssn 같은 키를 자동 마스킹. ADR 0017 결정 1의 "로그에 민감정보 금지"가 형식에 박힘.

### 결정 7: 모노레포 (backend/, frontend/) (옵션 A)

생성된 프로젝트의 구조.

```
generated/
├── package.json              # 워크스페이스 루트
├── backend/
│   ├── package.json
│   └── src/...
└── frontend/                 # 이번 출시는 placeholder. 별도 ADR
    └── README.md             # "frontend 자동 생성은 미래 출시 자리"
```

이번 출시는 frontend 자동 생성을 안 하지만 디렉토리 자리는 비워둔다. 미래 ADR이 들어오면 그 자리가 자연스럽게 채워짐.

### 결정 8: 함수형 + factory DI (옵션 A)

디자인 패턴은 함수형 관용. 클래스 강제 없음. 의존성은 factory 함수로 주입.

예: feature/order/repository.js
```js
export function createOrderRepository({ db }) {
  return {
    async findById(id) { /* ... */ },
    async create(order) { /* ... */ },
  };
}
```

feature/order/service.js
```js
export function createOrderService({ orderRepository }) {
  return {
    async placeOrder(input) {
      // ...
      return orderRepository.create(/* ... */);
    },
  };
}
```

feature/order/routes.js (Fastify 등록)
```js
export async function orderRoutes(fastify) {
  const repository = createOrderRepository({ db: fastify.db });
  const service = createOrderService({ orderRepository: repository });

  fastify.post('/orders', { schema: createOrderSchema }, async (req) => {
    return service.placeOrder(req.body);
  });
}
```

테스트에서는 mock repository를 주입해 service를 단위 검증. 별도 DI 컨테이너 없이 함수 합성으로 의존성 주입이 깨끗하게 표현된다.

추가로 다음 패턴이 표준이다.

- **Repository 인터페이스 우선**: repository는 다른 layer가 import하는 자리. 구현 변경(예: SQL → NoSQL)이 service에 새지 않음
- **Service는 use case 단위**: `placeOrder`, `cancelOrder` 같은 한 가지 일
- **schemas.js로 경계 검증**: 입력/출력 JSON Schema가 한 파일에 모임
- **domain.js는 순수 함수**: I/O 없음. 테스트 빠르고 결정적

### 의존성 방향 강제

ADR 0017 결정 4의 단방향 의존성을 다음 도구로 강제한다.

- `eslint-plugin-import`의 `no-restricted-paths` 규칙(벼름 자체와 같은 도구)
- 금지 엣지: domain.js → service.js, domain.js → repository.js, domain.js → routes.js
- 금지 엣지: service.js → routes.js, repository.js → routes.js
- 금지 엣지: feature/A → feature/B (feature 간 직접 import 금지. shared/를 통해서만)

### 코드 컨벤션

- Prettier (벼름 자체와 같은 설정: printWidth 100, single quote, 2-space)
- ESLint (Airbnb 또는 Standard 베이스 + 벼름 자체 규칙)
- 함수는 50줄 이하 권장(강제 안 함, 린트 경고로)

## 결과

### 긍정적
- Fastify의 schema-first 디자인이 ADR 0017 결정 1(보안 최우선)을 프레임워크 기본값에서 보장
- feature 단위 폴더가 ADR 0017 결정 2(MSA 준비)를 자연스럽게 만든다. 한 폴더가 한 서비스
- npm workspaces가 BE/FE 분리(결정 7)를 모노레포로 깔끔하게 해결
- node:test가 의존성 0이라 생성 프로젝트의 의존성 트리가 가벼움
- 함수형 + factory DI가 Node 관용에 충실하면서 ADR 0017 결정 7(인터페이스/패턴)을 만족
- pino의 redact가 로그 민감정보 누설을 형식 차원에서 막음

### 부정적 / 트레이드오프
- Fastify가 Express보다 자료가 살짝 적음. 1순위 사용자가 막혔을 때 검색 결과가 덜할 수 있음
- node:test가 watch mode와 snapshot 같은 자리는 약함. 미래에 vitest로 옮기는 ADR이 들어올 수 있음
- feature 폴더 구조가 작은 프로젝트에는 살짝 무거워 보일 수 있음. 다만 MSA 준비가 우선이라는 ADR 0017 결정 2를 받침
- frontend 자동 생성이 비어있어 사용자가 직접 짜야 함. 미래 ADR로 채울 자리

### 미래 묶임
- 본 ADR의 8개 결정 모두 표준이다. 변경하려면 ADR이 필요
- 보안 plugin 표(결정 5)에 라이브러리 추가/제거는 별도 ADR
- frontend 자동 생성은 별도 ADR. 본 ADR은 자리만 비워둠
- 다른 Node 프레임워크(NestJS, Hono 등)로 옮기려면 별도 ADR. 마이그레이션 부담을 감안한 결정 필요

## 링크
- 이전 결정: ADR 0017 (생성 코드 7대 원칙)
- 짝 결정: ADR 0019 (Java), ADR 0020 (Python)
- 후속 작업 후보: frontend 자동 생성 ADR, set 단계의 Node 코드 생성 구현(별도 PR), 보안 plugin 추가 ADR
- 관련 정책: CLAUDE.md 섹션 3(의존성 방향, 같은 도구 사용)
