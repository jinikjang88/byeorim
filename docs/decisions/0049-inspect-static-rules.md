# ADR 0049. inspect 정적 규칙 기반 코드 검수

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0016이 inspect 단계의 6영역(보안/성능/운영/확장성/법적 리스크/시장 재검)과 정적 한국어 체크리스트 형식을 박았다. MVP에서는 사용자 자기 점검 질문만 emit하는 결로 출시했다. 결정 2 옵션 A를 골랐고 옵션 B(프로젝트 맞춤)와 옵션 C(AI 기반 검수)는 미래 ADR로 미뤘다.

ADR 0046/0047/0048이 set 단계의 로컬 실행 baseline과 verify smoke를 박은 뒤 inspect의 결을 한 단계 깊게 갈 결이 분명해졌다. set이 만든 generated 코드(.byeorim/project/generated/)와 프로젝트 메타데이터(intent.yml, architecture.yml, contracts.yml 등)가 다 모여있어 inspect가 그것들을 비춰 결함을 보고할 결.

MANIFESTO III장이 박은 비춤의 결: "빛에 비춰 결함을 보는 일이다. 보안, 성능, 운영, 확장성, 그리고 다시 시장의 관점까지." 정적 체크리스트는 이 결을 부분적으로만 풀고 있다. 이번 ADR이 다음 한 결을 박는다.

이번 ADR이 답하는 질문은 여섯이다. 첫째, 정적 규칙의 범위. 둘째, 검사 결과의 형식과 위치. 셋째, severity 결. 넷째, 언어별 vs 언어 무관 규칙 분리. 다섯째, 결함이 inspect의 통과/실패에 미치는 영향. 여섯째, 테스트 가능성.

이번 PR이 박는 결은 정적 규칙만(deterministic). AI 기반 검수는 ADR 0050에서 보강. 외부 검토 프롬프트 부산물과 import-review는 ADR 0051. 셋이 inspect의 한 묶음 후속 작업.

## 검토한 옵션

### 결정 1. 정적 규칙의 범위

#### 옵션 A. 6영역 다 (얇게)

- 장점: 사용자가 모든 영역에서 코드 검수 결을 본다
- 단점: 성능/확장성/법적 리스크/시장 재검은 정적 규칙으로 잡기 어려움. 얇은 검수가 거짓 안심을 줌

#### 옵션 B. 보안 + 운영만 (이번 출시)

- 장점: 두 영역은 코드 패턴이 분명해 정적 규칙이 의미 있음. 다른 4영역은 ADR 0050(AI 검수)이 보강
- 단점: 4영역에 코드 검수 안 보여 사용자가 빈 결로 느낄 수 있음. 다만 자기 점검 체크리스트는 그대로 남아있음

#### 옵션 C. 보안만 (하나에 집중)

- 장점: 보안이 가장 critical
- 단점: 운영도 정적 규칙으로 잡기 좋은데 빠뜨림

### 결정 2. 검사 결과의 형식과 위치

#### 옵션 A. inspect-report.md의 각 영역 섹션에 "### 코드 검수" 하위 섹션 추가 (이번 출시)

- 장점: 한 파일에 자기 점검 체크리스트 + 코드 검수가 함께 보이는 결. 사용자가 한 결로 스캔
- 단점: inspect-report.md가 길어짐. 다만 영역별 분리로 가독성 유지

#### 옵션 B. 별도 파일 inspect-findings.md

- 장점: 자기 점검과 코드 검수가 분리되어 보임
- 단점: 두 파일을 따로 봐야 함. 사용자 인지 비용 증가

#### 옵션 C. 둘 다

- 장점: 자유도
- 단점: 두 자리 동기화 부담

### 결정 3. severity 결

#### 옵션 A. ✓ pass / ⚠ warning / ✗ concern 셋 (이번 출시)

- 장점: 셋의 결이 분명. pass는 안심, warning은 검토 권장, concern은 출시 직전 강한 신호. ADR 0003 결정 3의 결과 정합
- 단점: 사용자가 셋을 구분해야 함. 다만 이모지 + 한국어 라벨로 명확

#### 옵션 B. ✓ pass / ✗ fail 둘

- 장점: 단순
- 단점: warning과 concern을 한 결로 묶어 미세한 차이가 사라짐

#### 옵션 C. severity 없음 (모두 같은 결)

- 장점: 형식 단순
- 단점: 사용자가 우선순위를 못 봄

### 결정 4. 언어별 vs 언어 무관 규칙 분리

#### 옵션 A. 둘 다 (이번 출시)

- 장점: 언어 무관(architecture.yml/contracts.yml의 schema 결)은 한 곳에서, 언어별(generated 코드의 패턴)은 언어마다 별도 표. 책임 분리 깨끗
- 단점: 규칙 모듈이 여러 파일로 갈라짐. 다만 인덱스 파일이 한 결로 묶음

#### 옵션 B. 언어 무관만

- 장점: 단순
- 단점: 언어별 generated 코드 검수가 빠짐. ADR 0046의 prod 가드 같은 결을 못 잡음

#### 옵션 C. 한 파일에 언어별 분기

- 장점: 한 결로 모음
- 단점: 파일이 길어짐. CLAUDE.md 섹션 8 파일당 책임 위배

### 결정 5. 결함이 inspect의 통과/실패에 미치는 영향

#### 옵션 A. 모든 결함은 안내만, current_stage='done'으로 진행 (동행 톤, 이번 출시)

- 장점: ADR 0003 결정 2(동행 톤)와 정합. 사용자가 결함을 보고 결정. 7단계 흐름이 막히지 않음
- 단점: 사용자가 concern을 무시하고 진행할 수 있음. 다만 markdown blockquote 경고로 강한 신호

#### 옵션 B. concern이 있으면 명시적 confirm 요청

- 장점: 안전
- 단점: 동행 톤 위배. 7단계 흐름이 막힘

### 결정 6. 테스트 가능성

#### 옵션 A. 각 규칙은 순수 함수, 단위 테스트가 결정적 (이번 출시)

- 장점: 규칙 함수가 (cwd, architecture, ...) → finding 배열 형식. 외부 I/O 없음. CLAUDE.md 섹션 4의 5초 미만 단위 테스트
- 단점: 파일 시스템 읽기는 함수 안에서 일어남. 다만 임시 디렉토리로 단위 테스트가 결정적

## 결정

### 결정 1: 보안 + 운영 (옵션 B)

이번 출시의 정적 규칙은 보안과 운영 두 영역만. 다른 4영역(성능/확장성/법적 리스크/시장 재검)은 ADR 0050(AI 검수)이 보강.

#### 보안 규칙

- (Backend, all) `/health` endpoint가 인증 없이 emit되는가
- (Backend, all) JWT_SECRET 같은 시크릿이 startup에서 검사되는가 (ADR 0046 결정 4 안전망 2)
- (Backend, all) prod placeholder 가드가 박혀 있는가 (ADR 0046)
- (Backend, all) `.gitignore`가 시크릿 파일을 제외하는가
- (Node) 모든 routes.js에 `schema:` 검증이 박혀 있는가 (ADR 0018 결정 5)
- (Node) `helmet`, `cors`, `rate-limit`이 등록되었는가 (ADR 0017)
- (Java) Spring Security가 등록되었는가
- (Python) `secure` 미들웨어가 등록되었는가
- (Frontend) `index.html`에 CSP meta가 있는가
- (Frontend) `vite.config.ts`에 prod placeholder 가드가 박혀 있는가

#### 운영 규칙

- (Backend, all) `/health` endpoint 존재 (보안과 같은 검사를 운영 영역에서 다른 시각으로 보고)
- (Backend, all) 로깅이 구성되었는가 (Node: pino, Java: Spring Boot 기본, Python: structlog)
- (Backend, all) `.env.production` 파일이 존재하는가 (ADR 0046 결정 2)
- (All) `.byeorim/state.yml`의 단계 상태가 inspect 진행 가능한가
- (Node, Frontend) `package.json`에 `dev` 또는 `start` 스크립트가 있는가

성능/확장성/법적 리스크/시장 재검 영역은 코드 검수 섹션이 비어있음을 명시(`(이 영역은 ADR 0050의 AI 검수에서 보강됩니다)` 한 줄). 사용자가 빈 결로 느끼지 않도록.

### 결정 2: inspect-report.md의 영역 섹션에 "### 코드 검수" 하위 섹션 (옵션 A)

기존 자기 점검 체크리스트 다음에 코드 검수 결을 같은 영역 섹션 안에 박는다.

```markdown
## 1. 보안

[기존 자기 점검 질문 4~6개 - 사용자가 답할 자리]
- [ ] 사용자 인증과 권한 관리는 어떻게 하시나요?
...

### 코드 검수 (정적 규칙)

✓ JWT_SECRET startup 검사가 박혀 있습니다 (server.js)
✓ /health endpoint가 인증 없이 공개됩니다 (server.js)
✓ helmet/cors/rate-limit이 등록되었습니다 (server.js)
⚠ routes.js의 일부 endpoint에 schema: 검증이 안 보입니다 (features/order/routes.js)
```

자기 점검 체크리스트는 사용자의 다이어리 결, 코드 검수는 발견된 결함의 결. 두 결이 한 영역 안에 함께 모여 사용자가 한 번에 본다.

### 결정 3: ✓ pass / ⚠ warning / ✗ concern 셋 (옵션 A)

severity는 셋. 의미는 다음과 같다.

- **✓ pass**: 검사 통과. 안심
- **⚠ warning**: 검토 권장. 결함은 아니지만 사용자가 의식적으로 보고 결정할 자리
- **✗ concern**: 출시 직전 강한 신호. 법적 리스크 영역의 blockquote 경고와 같은 결로 사용자가 멈춰서 봐야 할 자리(ADR 0003 결정 3)

대부분의 검사는 pass 또는 warning. concern은 명백한 보안 결함(예: prod placeholder가 prod 모드에서도 안 검사되는 결)에만.

### 결정 4: 언어 무관 + 언어별 규칙 분리 (옵션 A)

규칙 모듈 구조.

```
packages/cli/src/inspect/
├── inspect-rules.js         # 인덱스. 언어별 규칙 모음을 합쳐서 export
├── rules-language-agnostic.js  # architecture.yml, contracts.yml, state.yml 검사
├── rules-node.js            # Node backend 코드 검사
├── rules-java.js            # Java backend 코드 검사
├── rules-python.js          # Python backend 코드 검사
└── rules-frontend.js        # Frontend 코드 검사
```

각 규칙 파일은 `runRules({ cwd, architecture, ... })` 형태로 finding 배열을 반환. inspect-rules.js가 architecture.language에 따라 적절한 언어별 모듈을 선택.

기존 inspect.js는 packages/cli/src/inspect/inspect.js로 옮기는 결도 검토했지만, 그러면 import 경로가 갈라짐. 이번 출시는 inspect.js는 그대로 두고 inspect-rules.js만 새로 박는다. 미래에 inspect 자체가 자라면 디렉토리로 모으는 결.

### 결정 5: 모든 결함은 안내, 진행 막지 않음 (옵션 A)

ADR 0003 결정 2(동행 톤)와 정합. 결함이 있어도 inspect는 통과(current_stage='done'). 사용자가 결함을 보고 결정.

다만 concern severity가 있으면 inspect-report.md 머리에 한국어로 강한 신호 안내.

```markdown
# Inspect Report

⚠ concern severity의 결함이 N개 발견되었습니다. 출시 직전 자리이므로 각 영역의 코드 검수 섹션을 보고 결정해주세요.
```

### 결정 6: 순수 함수 단위 테스트 (옵션 A)

각 규칙 함수의 시그니처.

```js
// 한 규칙 함수
function checkHealthEndpointPresent({ cwd, architecture }) {
  // 파일 읽고 검사
  return [{
    area: '보안',
    severity: 'pass' | 'warning' | 'concern',
    title: '한국어 제목',
    detail: '한국어 본문',
    file: 'optional/path.js',
  }];
}

// 모듈의 export
export function runRulesLanguageAgnostic({ cwd, architecture, contracts, ... }) {
  return [
    ...checkHealthEndpointPresent({ cwd, architecture }),
    ...checkOtherRule({ cwd, architecture }),
  ];
}
```

단위 테스트는 임시 디렉토리에 generated/ 트리를 박고 finding 배열을 단언. 외부 프로세스 없음, LLM 없음, 결정적.

## 결과

### 긍정적

- inspect가 set이 만든 코드를 실제로 읽고 결함을 보고. MANIFESTO III장의 비춤 결이 한 단계 깊게 풀림
- 보안/운영 두 영역에 집중해 정적 규칙의 의미가 분명. 다른 4영역은 ADR 0050(AI)이 보강
- 자기 점검 체크리스트와 코드 검수가 한 영역 안에 함께 보이는 결. 사용자가 두 결을 한 번에 스캔
- 동행 톤 유지. 결함이 있어도 inspect 통과. concern severity로 강한 신호
- 규칙 함수가 순수 함수라 단위 테스트가 결정적. CLAUDE.md 섹션 4 5초 미만 정책
- 언어별/언어 무관 규칙 분리로 미래 새 언어 추가 시 한 모듈만 추가

### 부정적 / 트레이드오프

- 4영역(성능/확장성/법적 리스크/시장 재검)에 코드 검수 섹션이 비어있음을 명시. ADR 0050 전까지 사용자가 그 결로 보고 빈 결로 느낄 수 있음. 다만 자기 점검 체크리스트는 그대로 남음
- 정적 규칙은 정해진 패턴만 잡음. ADR 0046 baseline이 박혀있는 코드는 대부분 pass 받음. 사용자의 customization으로 가드가 깨졌을 때 잡는 결
- inspect-report.md가 길어짐. 영역별 분리로 가독성 유지
- 규칙 모듈이 여러 파일로 갈라짐. inspect-rules.js의 인덱스 결로 한 곳에서 묶음

### 미래 묶임

- 6개 결정 모두 표준
- 새 정적 규칙 추가는 amendment(rules-*.js에 함수 추가)
- ADR 0050(AI 기반 검수)이 4영역 보강
- ADR 0051(외부 검토 프롬프트 + import-review)이 다른 단계와 같은 결

## 링크

- 이전 결정: ADR 0003 결정 2(동행 톤), 결정 3(강한 신호), ADR 0006(7단계 메타포), ADR 0016(inspect 6영역과 정적 체크리스트), ADR 0046(생성 코드의 로컬 실행 가능성), ADR 0017(생성 코드 7원칙)
- 후속 작업 후보: ADR 0050(AI 기반 inspect), ADR 0051(외부 검토 프롬프트 + import-review)
- 동행 톤: ADR 0003 결정 2
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 4(테스트 결정성), 섹션 8(파일당 책임), 섹션 10(글쓰기 원칙)
