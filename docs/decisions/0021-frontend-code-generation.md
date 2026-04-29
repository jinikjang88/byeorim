# ADR 0021. Frontend 코드 생성 구조 (React 표준)

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0017 결정 6이 backend/와 frontend/를 분리하기로 박았다. ADR 0018(Node), 0019(Java), 0020(Python)이 backend 코드 생성을 한 자리에 박은 뒤 backend 자리는 자리잡았다. 이제 frontend 차례.

backend는 세 언어(Node/Java/Python)가 다 자주 쓰여서 셋 다 ADR로 다뤘다. 그러나 frontend는 한 프로젝트가 보통 한 framework(React/Vue/Svelte 중 하나)만 쓴다. 한 팀이 같은 시점에 React와 Vue를 같이 쓰는 경우가 거의 없다. 그래서 backend의 패턴(여러 ADR로 여러 언어)을 frontend에 똑같이 적용하면 과한 자리가 된다.

이번 ADR은 한 framework을 표준으로 박고 다른 framework는 사용자 피드백을 보고 미래 ADR로 추가한다. 한 framework을 잘 만든 뒤 확장하는 패턴은 ADR 0013(forge가 REST만)과 ADR 0018(Node 먼저)에서 같은 결로 검증된 자리.

답해야 할 질문은 다음 여덟이다.

첫째, framework. React/Vue/Svelte/Solid/Angular 중 어느 자리. 둘째, build tool. 셋째, 언어(JS/TS). 넷째, 테스트 framework. 다섯째, 프로젝트 구조(feature/page/layer). 여섯째, API client 방식(자동 생성/수동/표준 도구). 일곱째, routing. 여덟째, 보안 기본값.

상태 관리(Redux/zustand/Context), 스타일링(Tailwind/CSS Modules/CSS-in-JS), form 처리 같은 자리는 이번 ADR이 정하지 않는다. MVP는 표준 자리만 박고 나머지는 사용자 또는 미래 ADR.

또한 architecture.yml에 frontend_framework 필드를 추가할지 미룬다. 이번 표준 출시는 frontend = React 고정. 미래에 두 번째 framework가 들어오면 ADR 0012를 amendment로 갱신해 5번째 결정을 추가한다.

## 검토한 옵션

### 결정 1. Framework

#### 옵션 A. React
- 장점: 가장 큰 생태계와 자료. 1순위 사용자가 만든 코드를 다른 사람에게 넘길 때 React 개발자 풀이 가장 크다. 컴포넌트 모델이 단순하고 학습 곡선이 평탄
- 단점: 보일러플레이트가 살짝 많음(Vue/Svelte보다)

#### 옵션 B. Vue
- 장점: 학습 곡선 평탄. 템플릿 문법이 직관적
- 단점: React보다 작은 생태계. 한국 시장에서는 React가 더 보편

#### 옵션 C. Svelte / SolidJS
- 장점: 모던, 빠름, 적은 보일러플레이트
- 단점: 비교적 새 자리. 1순위 사용자가 만난 다음 사람이 익숙하지 않을 수 있음

#### 옵션 D. Angular
- 장점: 풀 framework. TypeScript 기본
- 단점: 무거움. 학습 곡선 큼. 1순위 사용자 우선순위와 어긋남

### 결정 2. Build tool

#### 옵션 A. Vite
- 장점: 모던 표준. React/Vue/Svelte 어느 framework이든 받음. 빠른 dev server. ESM 친화. 설정 단순
- 단점: 일부 레거시 패키지와 호환성 자리가 있을 수 있음

#### 옵션 B. Webpack / Create React App
- 장점: 가장 전통적
- 단점: CRA는 사실상 deprecation 흐름. Webpack 직접 설정은 무거움

#### 옵션 C. Next.js / Remix
- 장점: SSR/풀스택 framework
- 단점: backend가 별도 자리(ADR 0017 결정 6)이고 우리 backend는 Node/Java/Python. Next.js는 자체 backend(Node)와 묶이는 결이라 우리 분리 정책과 살짝 충돌

### 결정 3. 언어

#### 옵션 A. TypeScript
- 장점: backend의 contracts.yml schema를 TS 타입으로 변환해 BE/FE 사이 타입 공유 가능. 컴파일 타임 검증으로 ADR 0017 결정 1(보안 우선) 정신과 결이 맞음
- 단점: 학습 비용 살짝 추가

#### 옵션 B. 평범한 JavaScript
- 장점: 학습 비용 없음
- 단점: 타입 검증이 없어 BE/FE 사이 계약 어긋남이 런타임에 드러남

### 결정 4. 테스트 framework

#### 옵션 A. Vitest + React Testing Library
- 장점: Vitest는 Vite와 같은 결(같은 설정 공유). React Testing Library는 React 표준 컴포넌트 테스트 도구
- 단점: 두 도구 묶음

#### 옵션 B. Jest + RTL
- 장점: 가장 큰 생태계
- 단점: ESM 호환 자리가 역사적으로 약함. Vite와 결이 다름

#### 옵션 C. Playwright (E2E)
- 장점: 통합 테스트
- 단점: 컴포넌트 단위 테스트 자리가 아니라 다른 결

### 결정 5. 프로젝트 구조

#### 옵션 A. feature-based (backend와 같은 결)
- 장점: backend의 features/{feature-name}/와 짝. 한 feature가 BE/FE 양쪽에서 같은 자리에 있다. 미래 MSA 분리 시 한 feature가 BE 모듈 + FE 자리로 함께 빠짐. ADR 0017 결정 2와 정합
- 단점: 작은 프로젝트에 살짝 무거움

#### 옵션 B. layer-based (components/, pages/, hooks/)
- 장점: 작은 프로젝트에 익숙
- 단점: 한 feature의 자리가 여러 폴더에 흩어진다. ADR 0017 결정 2와 충돌

#### 옵션 C. 페이지 단위 (Next.js style)
- 장점: 라우팅과 일치
- 단점: 페이지 ≠ feature. 한 feature가 여러 페이지를 가질 수 있고 한 페이지가 여러 feature를 보일 수 있음

### 결정 6. API client

#### 옵션 A. contracts.yml에서 자동 생성한 fetch 래퍼
- 장점: backend 계약과 짝. 한 endpoint가 한 함수. TypeScript 타입까지 자동 생성. ADR 0017 결정 7(인터페이스 우선) 정신과 결이 맞음
- 단점: 우리 자체 generator 코드가 길어짐(축복+부담)

#### 옵션 B. axios 또는 ky 같은 기성 클라이언트
- 장점: 익숙
- 단점: contracts.yml의 의도가 fetch 호출 한 줄로 흐려진다. 타입이 안 따라옴

#### 옵션 C. OpenAPI generator로 contracts.yml → OpenAPI → typescript-fetch
- 장점: 표준 도구
- 단점: 변환 단계가 둘. 우리 contracts.yml 형식과 OpenAPI가 1:1이 아님(ADR 0013 결정 4: TODO 자리). MVP에 과함

### 결정 7. Routing

#### 옵션 A. React Router (programmatic)
- 장점: React 가장 보편 라우터. 명시적 경로 정의
- 단점: 학습 자리

#### 옵션 B. TanStack Router (file-based 또는 type-safe)
- 장점: type-safe
- 단점: 비교적 새 자리. 1순위 사용자가 만난 다음 사람이 익숙하지 않을 수 있음

### 결정 8. 보안 기본값

#### 옵션 A. 표준 보안 default 묶음
- 장점: ADR 0017 결정 1(보안 최우선)을 frontend에서도 형식에 박는다. CSP meta 태그, secure cookie, fetch에 credentials 명시, 환경 변수로 API URL, no innerHTML 패턴
- 단점: 사용자가 일부 자리를 끄고 싶을 때 코드 손봐야 함

#### 옵션 B. 사용자가 자유 조립
- 장점: 자유도
- 단점: ADR 0017 결정 1 위배

## 결정

### 결정 1: React (옵션 A)

표준 framework는 **React**. 가장 큰 생태계. 한국 시장에서도 가장 보편. 1순위 사용자가 만든 코드를 다음 사람에게 넘길 때 마찰이 가장 작은 자리.

미래에 Vue/Svelte/Angular 등이 필요해지면 별도 ADR로 추가. ADR 0012의 architecture.yml에 `frontend_framework` 5번째 결정을 amendment로 더하는 자리.

### 결정 2: Vite (옵션 A)

빌드 도구는 **Vite**. 모던 표준. React + Vite 조합이 사실상 New CRA(Create React App 대체) 자리. dev server가 빠르고 설정이 단순.

### 결정 3: TypeScript (옵션 A)

언어는 **TypeScript**. backend의 contracts.yml schema를 TS 타입으로 자동 생성해 BE/FE 타입 공유. 컴파일 타임 검증이 런타임 contract 어긋남을 미리 잡음.

타입 strict는 기본 활성. tsconfig는 `"strict": true`.

### 결정 4: Vitest + React Testing Library (옵션 A)

테스트는 **Vitest** (단위) + **React Testing Library** (컴포넌트). Vitest가 Vite 설정을 공유하므로 두 번 설정할 필요 없음. RTL은 React 컴포넌트 테스트의 사실상 표준.

E2E 테스트(Playwright 등)는 별도 ADR 자리.

### 결정 5: feature-based (옵션 A)

backend와 같은 결로 feature 단위 폴더. 표준 디렉토리 구조.

```
generated/frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── README.md
└── src/
    ├── main.tsx                 # 엔트리
    ├── App.tsx                  # 루트 컴포넌트
    ├── router.tsx               # 라우트 정의
    ├── api/                     # contracts.yml에서 자동 생성된 fetch 래퍼
    │   └── {feature}.ts
    ├── types/                   # contracts.yml schema에서 자동 생성된 TS 타입
    │   └── {feature}.ts
    ├── shared/                  # feature 간 공유(최소화)
    └── features/
        └── {feature-name}/
            ├── {Feature}Page.tsx       # 라우트 진입 컴포넌트
            ├── {Feature}List.tsx       # 목록 뷰(있을 때)
            └── {Feature}Detail.tsx     # 상세 뷰(있을 때)
```

각 feature가 한 폴더에 모인다. backend의 features/와 1:1 짝. 미래 MSA 분리 시 한 feature가 BE 모듈 + FE 자리로 함께 빠진다(ADR 0017 결정 2와 정합).

### 결정 6: contracts.yml에서 자동 생성한 fetch 래퍼 (옵션 A)

API client는 **contracts.yml에서 자동 생성한 fetch 래퍼**. 한 endpoint가 한 함수. TypeScript 타입은 contracts.yml의 schema에서 자동 생성.

예: src/api/order.ts
```typescript
import type { CreateOrderRequest, CreateOrderResponse } from '../types/order';

const BASE = import.meta.env.VITE_API_BASE;

export async function createOrder(input: CreateOrderRequest): Promise<CreateOrderResponse> {
  const response = await fetch(`${BASE}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new ApiError(response);
  return response.json();
}

// list, get, update, delete, search per ADR 0013 mapping
```

`credentials: 'include'`가 secure cookie 정책과 짝. CORS는 backend의 화이트리스트와 짝.

OpenAPI generator는 미래 ADR. MVP는 자체 generator로 contracts.yml을 직접 다룬다.

### 결정 7: React Router (옵션 A)

라우터는 **React Router** (programmatic). v6+ 흐름. 라우트는 `src/router.tsx`에 명시적으로 정의.

각 feature의 `{Feature}Page`가 한 라우트의 진입 컴포넌트.

### 결정 8: 표준 보안 default (옵션 A)

다음 보안 자리가 모든 생성 프로젝트에 기본 적용된다.

| 영역             | 도구/패턴                                   | 역할                                          |
| ---------------- | ------------------------------------------ | --------------------------------------------- |
| CSP              | index.html의 `<meta http-equiv="Content-Security-Policy">` | 스크립트/스타일 출처 제한 |
| HTTPS            | secure cookie 사용 안내(README)            | 개발은 localhost, 운영은 HTTPS                |
| Cookie           | fetch에 `credentials: 'include'`           | secure/httpOnly cookie와 짝                   |
| 환경 변수        | `.env` 파일, `VITE_` prefix                | API URL 같은 비-시크릿 설정. 시크릿은 backend |
| XSS 방어         | React 기본(JSX는 자동 escape), `dangerouslySetInnerHTML` 금지 | innerHTML 패턴 회피 |
| 입력 검증        | TypeScript 타입 + form library(미래 ADR)  | 컴파일 + 런타임 양 자리 검증                  |

frontend는 사용자 시크릿(JWT 토큰 등)을 직접 다루지 않는다. backend가 secure cookie로 관리하고 frontend는 cookie 자동 송수신만.

`.env`는 `.gitignore`에 들어가는 자리. 다만 frontend의 `.env`는 빌드 시 정적으로 묶이므로 시크릿이 들어가면 안 된다(VITE_ prefix는 클라이언트 번들에 노출됨). 시크릿은 backend에만.

## 결과

### 긍정적
- React + Vite + TypeScript는 한국 시장에서 가장 보편한 frontend 묶음. 1순위 사용자가 만든 코드를 다음 사람에게 넘기는 마찰이 작음
- feature-based 구조가 backend와 1:1 짝이라 BE/FE 양쪽이 같은 머리 모형으로 다뤄진다. ADR 0017 결정 2(MSA 준비)가 양쪽에서 작동
- contracts.yml에서 API client + 타입을 자동 생성하므로 BE 변경이 FE 타입 오류로 즉시 드러난다. 컴파일 타임 검증이 BE/FE 계약을 묶음
- 보안 default가 ADR 0017 결정 1을 frontend에서도 형식에 박음. CSP meta, secure cookie, no innerHTML 패턴이 자동 적용
- Vite + Vitest 결이 같아 설정이 한 자리. 빌드와 테스트가 같은 도구 묶음

### 부정적 / 트레이드오프
- React 외 다른 framework이 필요한 사용자는 미래 ADR을 기다리거나 직접 갈아타야 함. MVP의 자유도 손실
- React 보일러플레이트가 Vue/Svelte보다 살짝 많음. 1순위 사용자에게는 살짝 무거워 보일 수 있지만 익숙한 자리라 학습 비용은 가장 작은 결정
- 자체 API client generator는 코드가 길어진다. 다만 OpenAPI 변환 단계 두 개를 거치는 부담보다 작다는 판단
- 상태 관리, 스타일링, form 처리는 이번 ADR이 정하지 않는다. 사용자가 직접 결정. 미래 ADR로 default를 둘 자리

### 미래 묶임
- 본 ADR의 8개 결정 모두 표준이다. 변경하려면 ADR이 필요
- React 외 framework(Vue/Svelte/Angular) 추가는 별도 ADR. ADR 0012의 architecture.yml에 `frontend_framework` 결정을 5번째로 amendment하는 자리
- 상태 관리 default(zustand/Redux 등)는 별도 ADR
- 스타일링 default(Tailwind/CSS Modules 등)는 별도 ADR
- E2E 테스트 framework(Playwright/Cypress)는 별도 ADR
- form 라이브러리(React Hook Form 등)는 별도 ADR
- 컴포넌트 라이브러리(MUI/Mantine 등)는 별도 ADR
- SSR/SSG가 필요해지면 Next.js 같은 풀 framework 도입은 큰 결정 ADR

## 링크
- 이전 결정: ADR 0007 (자리), ADR 0012 (architecture.yml의 4결정), ADR 0013 (contracts.yml 형식), ADR 0017 (생성 코드 7원칙), ADR 0015 (set MVP), ADR 0018 (Node backend)
- 후속 작업 후보: frontend generator 구현(packages/cli/src/generators/frontend.js, set.js 갱신), 다른 framework ADR(Vue/Svelte 등), 상태 관리/스타일링/form 라이브러리 default ADR
- 관련 정책: CLAUDE.md 섹션 0(사용자 우선순위), 섹션 8(파일당 책임, 한국어 메시지), ADR 0017 결정 1(보안 최우선)과 결정 6(BE/FE 분리)
