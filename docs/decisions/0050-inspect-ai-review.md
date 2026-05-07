# ADR 0050. AI 기반 inspect 검수

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0049가 inspect에 정적 규칙 코드 검수를 박았다. 보안/운영 두 영역에 baseline 검사가 들어왔다. 다만 4영역(성능/확장성/법적 리스크/시장 재검)은 정적 규칙으로 잡기 어려워 비어있는 결로 출시했다. ADR 0049 결정 1이 그 결을 명시했다. "다른 4영역은 ADR 0050(AI 검수)이 보강."

이번 ADR이 그 결을 박는다. ADR 0024가 박은 Claude 어댑터에 inspectCode 메서드를 추가한다. generated 코드와 메타데이터(intent.yml, architecture.yml, contracts.yml, scenarios.yml)를 보내 6영역 nuanced finding을 받는다. 정적 규칙이 잡지 못하는 도메인-특화 결함, 비즈니스 맥락 결함, 출시 직전 강한 신호 자리를 풀어낸다.

이번 ADR이 답하는 질문은 여덟이다. 첫째, inspectCode 메서드 시그니처. 둘째, AI에 보낼 파일 범위. 셋째, prompt에서의 집중점. 넷째, mock 어댑터의 결. 다섯째, inspect.js 통합. 여섯째, AI 실패 시 결. 일곱째, 출력 결. 여덟째, 정적/AI finding 표시 결.

이번 PR로 4영역의 빈 결이 채워지고 보안/운영도 nuanced 검토로 보강된다. ADR 0051(외부 검토 프롬프트 부산물 + import-review)이 마지막 PR.

## 검토한 옵션

### 결정 1. inspectCode 메서드 시그니처

#### 옵션 A. 한 메서드 (이번 출시)

`inspectCode({ language, files, intent, architecture, contracts, scenarios }) → finding[]`. 한 번 호출로 6영역 finding을 모두 반환.

- 장점: 한 호출에 컨텍스트가 모여 영역 간 상관 검토 가능. 토큰 비용 한 번
- 단점: 한 호출의 컨텍스트가 큼. Claude의 200k 토큰 한계는 일반 프로젝트에 충분

#### 옵션 B. 영역별 분리

inspectSecurity/inspectPerformance 등 6개 메서드.

- 장점: 영역별 컨텍스트 작음
- 단점: 6번 호출, 토큰 비용 6배. 영역 간 상관 검토 약함(예: 성능 결함이 보안에 영향)

### 결정 2. AI에 보낼 파일 범위

#### 옵션 A. 균형 (이번 출시)

backend 엔트리(server.js / Application.java + HealthController.java + EnvSecretsValidator.java / main.py + config.py) + features 첫 한 개 sample(routes.js + service.js + schemas.js / Controller.java + Service.java / routes.py + schemas.py) + frontend 엔트리(vite.config.ts + index.html) + 메타데이터(intent.extracted, architecture.yml, contracts.yml 요약, scenarios.yml 요약).

- 장점: 핵심 코드를 다 보면서 토큰 한도 안에. 일반 프로젝트(블럭 5~10개)에 충분
- 단점: 큰 프로젝트(블럭 20+)는 첫 한 개 sample만 봐서 다른 feature의 결함을 못 잡음. 미래에 다중 sample 또는 chunking ADR

#### 옵션 B. 모든 generated 파일

- 장점: 가장 깊은 검수
- 단점: 200k 토큰 한계 위험. 큰 프로젝트에서 truncation 필요

#### 옵션 C. 메타데이터만

- 장점: 토큰 적게 듦
- 단점: 코드를 안 보니 비춤의 결이 약함

### 결정 3. prompt에서의 집중점

#### 옵션 A. 4영역 집중 + 6영역 nuanced 보강 (이번 출시)

prompt가 명시한다.

- 보안/운영은 정적 규칙(ADR 0049)이 baseline을 잡았다. AI는 도메인-특화 보안 결함, 비즈니스 맥락 운영 결함에 집중
- 성능/확장성/법적 리스크/시장 재검은 정적 규칙이 비어있다. AI가 채운다

#### 옵션 B. 6영역 모두 동등하게

- 장점: 균형
- 단점: 보안/운영의 baseline은 정적과 중복

### 결정 4. mock 어댑터의 결

#### 옵션 A. 영역별 결정적 placeholder finding (이번 출시)

mock.js의 inspectCode가 6영역마다 결정적 placeholder finding을 한 개씩 반환. severity는 모두 'warning', title은 "AI 검수 결과가 들어올 자리".

- 장점: inspect 통합 테스트가 결정적. 사용자가 mock 어댑터로 실행해도 어떤 결로 자라날지 결을 본다. claude 어댑터로 바꾸면 실제 검수
- 단점: mock에 가짜 finding이 들어가 사용자 혼란 가능. 제목과 detail에 명시적 안내("mock placeholder입니다")

#### 옵션 B. 메서드 없음(옵셔널)

- 장점: 단순. graceful degradation
- 단점: mock일 때 4영역이 그대로 비어있어 결이 약함

#### 옵션 C. 빈 배열 반환

- 장점: 결정적. 사용자에게 가짜 finding 안 보냄
- 단점: 사용자에게 신호 없음. 어떤 결로 자라날지 안 보임

### 결정 5. inspect.js 통합

#### 옵션 A. 옵셔널 adapter 인자 (이번 출시)

`runInspect({ cwd, now, adapter })`. adapter가 있고 inspectCode를 가지면 정적 + AI finding 합쳐 emit. adapter 없으면 정적만(ADR 0049 결과 후행 호환).

- 장점: 후행 호환. 기존 사용자에게 영향 없음. CLI는 selectAdapter()로 자동 결합
- 단점: 함수 시그니처에 인자 추가

#### 옵션 B. AI 검수 별도 명령(`beoreum inspect-ai`)

- 장점: 명령 분리
- 단점: 학습 비용. 한 inspect-report.md에 통합되는 결이 깨짐

### 결정 6. AI 실패 시 결

#### 옵션 A. graceful degrade (이번 출시)

AI 호출 실패 시 정적 finding만으로 계속. inspect-report.md에 한국어 안내 한 줄("AI 검수가 실패했습니다. 정적 검수만 보고합니다").

- 장점: ADR 0003 결정 2(동행 톤)와 정합. 사용자 진행 막히지 않음
- 단점: 사용자가 실패를 못 보고 진행할 수 있음. 안내 한 줄로 신호

#### 옵션 B. throw

- 장점: 안전
- 단점: 사용자 진행 막힘. 동행 톤 위배

### 결정 7. 출력 결 (structured output)

#### 옵션 A. JSON Schema 강제(structured output) (이번 출시)

claude.js의 inspectCode가 max_tokens 4096과 output_schema(finding[] 배열)로 호출. 응답이 항상 결정된 형식.

- 장점: 파싱 안정적. finding 형식 보장. ADR 0023 extractSchema 결과 정합
- 단점: claude API의 structured output 기능 의존. 다른 어댑터(GPT 등 미래)는 다른 결로 풀어야 함

#### 옵션 B. free-form text + parse

- 장점: 유연
- 단점: 파싱 깨질 위험

### 결정 8. 정적/AI finding 표시 결

#### 옵션 A. 한 섹션에 섞음, severity로만 구분

- 장점: 단순
- 단점: 사용자가 정적인지 AI인지 구분 못 함. 출처가 결과 신뢰도에 영향(정적은 결정적, AI는 비결정적)

#### 옵션 B. "### 코드 검수 (정적)" + "### 코드 검수 (AI)" 분리

- 장점: 출처 분명
- 단점: 한 영역에 두 섹션이라 결이 무거워짐

#### 옵션 C. 한 섹션에 섞되 출처 prefix 표시 (이번 출시)

`[정적] ✓ JWT_SECRET startup 검사가 박혀 있습니다`, `[AI] ⚠ amount 필드에 음수 검증이 없습니다`. finding 객체에 source 필드 추가('static' | 'ai').

- 장점: 한 결로 사용자가 본다. 동시에 출처가 prefix로 분명. 미래에 분리 결로 자라날 수 있음(source 필드가 박힘)
- 단점: 한 줄이 prefix로 길어짐. 다만 사용자에게 의미 있는 정보

## 결정

### 결정 1: 한 메서드 inspectCode (옵션 A)

```js
inspectCode({ language, files, intent, architecture, contracts, scenarios }) → InspectFinding[]
```

여기서 files는 `{ 'src/server.js': '...content...', ... }` 형식의 객체. 메타데이터는 yml 객체 그대로 전달(직렬화는 어댑터 책임).

### 결정 2: 균형 파일 범위 (옵션 A)

inspect.js가 buildInspectInput을 박아 다음 파일을 모은다.

| 언어 | 파일 |
|---|---|
| Node backend | src/server.js + src/features/{first}/(routes.js, service.js, schemas.js, repository.js, domain.js) + package.json + .env.production |
| Java backend | app/.../Application.java, HealthController.java, config/EnvSecretsValidator.java + modules/{first}/.../{Class}{,Repository,Service,Controller}.java + application.yml, application-production.yml |
| Python backend | src/{pkg}/main.py, config.py + src/{pkg}/features/{first}/(routes.py, application.py, schemas.py, infrastructure.py, domain.py) + pyproject.toml + .env.production |
| Frontend | vite.config.ts + index.html + src/main.tsx, App.tsx + src/api/{first}.ts + src/features/{first}/{First}Page.tsx + .env.production |

메타데이터는 항상 다 포함. 큰 프로젝트의 다중 feature sample은 미래 ADR.

### 결정 3: 4영역 집중 + 6영역 nuanced 보강 (옵션 A)

system prompt가 명시한다. claude.js에 한국어로 박힘.

- 보안: ADR 0046 baseline은 이미 정적 규칙이 잡았다. 도메인-특화 결함만 본다(예: 결제 블럭의 amount 검증, 인증 누락 endpoint, 비밀번호 plain 처리)
- 운영: 백업/복구/모니터링/알림 결을 본다
- 성능: N+1 쿼리 패턴, 캐싱 누락, 응답 시간 위험 자리
- 확장성: stateless 결, DB 풀링, 비동기 처리, 큰 데이터 자리
- 법적 리스크: 개인정보 필드 검출, 미성년자/결제/AI 차별. 출시 직전 강한 신호
- 시장 재검: intent.what과 reality-check.md 결을 비춰 시장 부적합 자리

### 결정 4: mock의 영역별 결정적 placeholder (옵션 A)

mock.js의 inspectCode가 다음을 반환.

```js
[
  { area: '보안', severity: 'warning', title: 'AI 검수 결과가 들어올 자리(mock)',
    detail: 'mock 어댑터는 가짜 finding을 반환합니다. 실제 검수는 claude 어댑터로 실행하세요.', source: 'ai' },
  // ... 6개 영역
]
```

각 영역에 한 개씩, 결정적. inspect 통합 테스트가 mock으로 끝까지 돌아감.

### 결정 5: 옵셔널 adapter 인자 (옵션 A)

```js
runInspect({ cwd, now, adapter })
```

adapter가 있고 `adapter.inspectCode`가 있으면 호출. 없으면 정적만(후행 호환). bin/beoreum.js의 inspect 핸들러가 selectAdapter()를 호출해 자동 결합.

### 결정 6: graceful degrade (옵션 A)

AI 호출이 throw하면 try/catch로 잡고 정적 finding만으로 계속. inspect-report.md 머리에 한국어 안내.

```
> AI 검수가 실패했습니다. 정적 검수만 보고합니다(원인: ...). claude 어댑터 설정을 확인해주세요.
```

reportFile 객체에 aiFailed: true와 aiError 메시지가 들어가 사용자가 디버그 가능.

### 결정 7: structured output (옵션 A)

claude.js의 inspectCode 호출.

- max_tokens: 4096
- output_schema: `{ type: 'object', properties: { findings: { type: 'array', items: findingSchema } }, required: ['findings'] }`
- findingSchema는 `{ area, severity, title, detail, file? }`

응답을 그대로 finding[] 배열로 사용.

### 결정 8: 한 섹션 + 출처 prefix (옵션 C)

inspect-report.md의 코드 검수 섹션에 정적과 AI finding이 섞여 박힘. 각 finding 줄 머리에 출처 prefix.

```markdown
### 코드 검수

[정적] ✓ **JWT_SECRET startup 검사가 박혀 있습니다** _(src/server.js)_
  시크릿 누락 시 시작이 실패합니다(ADR 0017 결정 1).

[정적] ✓ **prod placeholder 가드가 박혀 있습니다** _(src/server.js)_
  NODE_ENV=production에서 dev placeholder 값이 검출되면 시작이 거부됩니다.

[AI] ⚠ **amount 필드에 음수 검증이 없습니다** _(features/payment/schemas.js)_
  결제 도메인에서 음수 amount는 환불/사기 결로 흘러갈 수 있습니다.
```

finding 객체에 source 필드 추가('static' | 'ai'). 정적 finding은 inspect-rules.js가 'static'으로, AI finding은 mock/claude 어댑터가 'ai'로 박는다.

## 결과

### 긍정적

- inspect의 4영역(성능/확장성/법적/시장)이 빈 결에서 AI nuanced finding으로 채워짐. ADR 0049 결정 1의 약속이 풀림
- 보안/운영도 정적 baseline + AI nuanced 결로 두 갈래 검수
- mock 어댑터의 결정적 placeholder가 사용자에게 미래 결을 안내하면서 통합 테스트 결정성 유지
- claude 어댑터의 structured output으로 finding 형식 안정적
- graceful degrade로 AI 실패 시 사용자 진행 막히지 않음(동행 톤)
- 출처 prefix([정적]/[AI])로 사용자가 출처를 구분. 정적은 결정적이라 신뢰, AI는 nuanced 검토라 검증 권장
- ANTHROPIC_BASE_URL로 Claude Code 브릿지 사용 가능(ADR 0025). 비기술 창업자도 API 키 없이 Claude Code 통해 AI 검수 가능

### 부정적 / 트레이드오프

- AI 호출이 분 단위로 길어질 수 있음. 사용자가 inspect 명령에 시간이 걸리는 결을 안내 한 줄로 풀어줌
- 큰 프로젝트(블럭 20+)는 첫 한 개 sample만 봐서 다른 feature의 nuanced 결함을 못 잡음. 미래에 다중 sample 또는 chunking ADR
- mock의 가짜 finding이 사용자에게 혼란을 줄 수 있음. 제목과 detail에 명시적 안내로 풀어줌
- AI finding은 비결정적이라 같은 코드라도 호출마다 다른 결을 받을 수 있음. 사용자가 결정의 기반으로 삼을 때 의식해야 함

### 미래 묶임

- 8개 결정 모두 표준
- 다중 sample 또는 chunking은 미래 ADR(큰 프로젝트 사용자 피드백 시점)
- 다른 LLM 어댑터(GPT, Gemini)에 inspectCode 추가는 amendment
- AI finding의 결정성을 높이는 방법(seed, deterministic prompt)은 미래 ADR
- inspect-report.md의 정적/AI 분리 섹션 결도 미래 amendment 가능(source 필드가 미리 박혀 있음)

## 링크

- 이전 결정: ADR 0009(AI 어댑터 인터페이스), ADR 0023(extractSchema 결), ADR 0024(Claude 어댑터), ADR 0025(ANTHROPIC_BASE_URL 브릿지), ADR 0036(fillTestCode 결), ADR 0046/0047/0048(set 단계 baseline + run + smoke), ADR 0049(정적 규칙 코드 검수)
- 후속 작업 후보: ADR 0051(외부 검토 프롬프트 + import-review)
- 동행 톤: ADR 0003 결정 2와 결정 3
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 4(테스트 결정성), 섹션 6(벤더 종속 회피), 섹션 8(파일당 책임), 섹션 10(글쓰기 원칙)
