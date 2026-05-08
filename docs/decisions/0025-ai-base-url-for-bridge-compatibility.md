# ADR 0025. 외부 브릿지 호환을 위한 baseURL 노출

- 상태: 채택
- 날짜: 2026-04-29
- 결정자: DevSmith

## 맥락

ADR 0024가 Claude 어댑터를 박았다. 사용자는 ANTHROPIC_API_KEY를 발급해 환경 변수로 두고 BYEORIM_AI_ADAPTER=claude로 켜면 실제 LLM 응답을 받는다.

이 흐름이 일순위 사용자(섹션 0의 비기술 창업자)에게 두 가지 마찰을 남긴다.

첫째, API 키 발급 자체가 진입 장벽이다. Anthropic 계정 생성, 결제 수단 등록, 키 발급, 환경 변수 설정. 카페 사장님에게는 네 단계가 다 낯설다. 둘째, 비용 관리 부담이다. 호출량을 통제하지 못하면 청구서가 무서워 첫 시도 자체를 안 한다.

이미 다른 경로로 Claude에 접근하는 사용자가 있다. Claude Code 구독자, 사내 LLM 게이트웨이를 가진 팀, 자체 프록시를 띄운 개발자 같은 자리. 이들은 자신이 띄운 브릿지 서버(예: Anthropic API 형식을 흉내 내는 로컬 프록시)로 호출을 우회할 수 있어야 한다. 우리가 그 브릿지를 직접 만들 필요는 없다. Anthropic SDK는 이미 baseURL 옵션을 받는다. 우리가 그 한 자리만 사용자에게 열어주면 된다.

CLAUDE.md 절대 금지선 6번이 한 번 더 작동한다. Claude Code SDK나 subprocess를 우리 코드에 박으면 그 도구의 변화를 우리가 따라가야 한다. 어댑터 한 자리에 baseURL만 노출하면 사용자가 어떤 브릿지를 고르든 우리는 신경 쓰지 않는다.

답해야 할 질문 셋.

첫째, baseURL을 어떤 환경 변수로 받을지. 둘째, baseURL이 있을 때 API 키 검증을 어떻게 다룰지. 셋째, 별도 어댑터(claude-code)를 만드는 무거운 옵션과 비교해 정말 baseURL 노출만으로 충분한지.

## 검토한 옵션

### 결정 1. baseURL 환경 변수 이름

#### 옵션 A. ANTHROPIC_BASE_URL 단일 (SDK 표준 따름)
- 장점: SDK가 이미 표준으로 인식하는 이름. 사용자가 다른 Anthropic SDK 기반 도구로 옮겨도 같은 변수가 통함. 인지 부담이 작음. 외부 브릿지 도구의 README들이 대부분 이 이름으로 안내
- 단점: 벼림 고유 변수가 아니라 다른 Anthropic 도구와 환경 변수 이름이 충돌할 수 있음(좋은 충돌이지만)

#### 옵션 B. BYEORIM_AI_BASE_URL 단일
- 장점: 벼림 표준. 다른 벤더 어댑터가 들어와도 같은 결의 이름
- 단점: 새 환경 변수 표면 추가. 사용자가 두 이름(SDK 표준 + 벼림 표준)을 알아야 함

#### 옵션 C. 둘 다 받음, BYEORIM_AI_BASE_URL이 우선
- 장점: 양쪽 사용자 모두 수용
- 단점: 우선순위 규칙이 또 늘어남. 디버깅 시 어느 변수가 먹혔는지 헷갈림

### 결정 2. baseURL이 있을 때 API 키 처리

#### 옵션 A. 키 검증을 완화. baseURL이 있으면 키 없이도 통과. SDK 인스턴스화는 placeholder 키로
- 장점: 사용자가 Anthropic 계정 없이 브릿지만으로 시작 가능. 일순위 사용자의 진입 장벽이 낮아짐. 브릿지가 자체 인증을 처리한다고 신뢰
- 단점: SDK가 placeholder 키를 받아도 실제 호출 자리에서 어떻게 다룰지는 브릿지 책임. 우리가 보장할 수 없음

#### 옵션 B. baseURL이 있어도 ANTHROPIC_API_KEY를 강제
- 장점: SDK 호출 시 항상 명시적 키. 동작 일관성
- 단점: 키가 필요 없는 브릿지(Claude Code 기반 등)를 쓰는 사용자에게 불필요한 마찰. 사용자가 "dummy"라고 적어 두면 보안상 무의미한 자리가 생김

### 결정 3. 별도 어댑터(claude-code) 신설 vs baseURL 노출

#### 옵션 A. baseURL만 노출. claude 어댑터는 그대로
- 장점: 변경 면적 최소. ADR 0024가 박은 약속(structured output, prompt caching, 한국어 에러 변환)이 그대로 산다. 외부 브릿지의 변화는 사용자 선택에 묶임
- 단점: 사용자가 브릿지 서버를 직접 띄워야 함. 첫 진입 자리에 한 단계 더

#### 옵션 B. claude-code 어댑터를 별도 신설(Claude Code SDK 또는 subprocess)
- 장점: 사용자가 브릿지를 안 띄워도 됨. 환경 변수 한 줄로 끝
- 단점: ADR 0024 결정 5(structured output)가 흔들림. Claude Code의 출력은 JSON Schema 강제를 보장하지 않아 우리가 프롬프트로 강제하고 try/catch로 파싱하는 자리(ADR 0024가 옵션 B로 거절했던 자리)가 다시 살아남. 의존성과 유지보수 면적이 큼. Claude Code 변화에 우리가 묶임

#### 옵션 C. 자체 브릿지 서버를 벼림이 번들
- 장점: 사용자 경험이 가장 매끄러움
- 단점: 면적이 가장 큼. 새 패키지, 새 명령어, 외부 도구 모방 책임. 절대 금지선 6번(벤더 무관)도 위태로워짐

## 결정

### 결정 1: ANTHROPIC_BASE_URL 단일 (옵션 A)

baseURL 환경 변수는 ANTHROPIC_BASE_URL만 인정한다. SDK 표준 이름을 그대로 따른다. 외부 브릿지 도구들이 대부분 이 이름으로 안내하고 있어 사용자 작업 흐름과 정합. 새 변수를 만들지 않아 인지 부담을 더하지 않는다.

미래에 GPT 어댑터가 들어오면 OPENAI_BASE_URL을 같은 패턴으로 받는다(별도 ADR). 어댑터 무관 통합 변수는 만들지 않는다.

### 결정 2: 키 검증 완화 (옵션 A)

ANTHROPIC_API_KEY가 비어 있어도 ANTHROPIC_BASE_URL이 설정되어 있으면 통과한다. SDK 인스턴스화 시점에 placeholder 키(`'byeorim-bridge-placeholder'`)를 자동으로 채워 SDK가 인스턴스 자리에서 던지는 검증 에러를 피한다. 실제 인증은 브릿지가 처리한다.

| ANTHROPIC_BASE_URL | ANTHROPIC_API_KEY | 결과 |
| --- | --- | --- |
| 미설정 | 미설정 | 한국어 에러("키 또는 brigeURL이 필요합니다") |
| 미설정 | 설정 | 기존 동작. api.anthropic.com에 키로 호출 |
| 설정 | 미설정 | 통과. placeholder 키로 SDK 만들고 baseURL로 호출 |
| 설정 | 설정 | 통과. 사용자 키로 SDK 만들고 baseURL로 호출 |

키도 baseURL도 없을 때의 한국어 에러는 두 경로를 모두 안내한다. "ANTHROPIC_API_KEY를 설정하거나, Claude Code 같은 브릿지를 쓰는 경우 ANTHROPIC_BASE_URL을 설정해주세요" 같은 결.

### 결정 3: baseURL 노출만 (옵션 A)

별도 어댑터를 만들지 않는다. ADR 0024의 약속(structured output 강제, prompt caching, 한국어 에러 변환)을 흔들지 않는다. 외부 브릿지를 직접 만들거나 번들하지 않는다. 사용자가 자기 환경에 맞는 브릿지를 골라 띄우고, 우리는 SDK의 baseURL 자리만 통과시킨다.

이 결정이 맞지 않다는 신호가 나타나는 자리는 명확하다. 비기술 창업자 사용자가 "브릿지 띄우는 게 너무 어려워요"라고 손을 들면 그때 별도 어댑터(claude-code)를 ADR로 다시 본다. 미리 만들어두지 않는다.

### 구현

`createClaudeAdapter` 시그니처가 baseURL 인자를 추가로 받는다.
```js
createClaudeAdapter({ apiKey, model, client, baseURL })
```

`baseURL`이 주어지면 `new Anthropic({ apiKey, baseURL })`. `client`가 명시적으로 주입되면 `baseURL` 인자는 무시(ADR 0024 결정 7의 의존성 주입 정신 보존, 테스트는 client를 직접 주입).

`selectAdapter`는 환경 변수 두 개(ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL)를 읽어 위 표대로 분기. baseURL이 있으면 placeholder 키로 채워 createClaudeAdapter에 명시적으로 넘김. 환경 변수를 직접 createClaudeAdapter 안에서 읽지 않는 이유는 ADR 0024 결정 7의 결정성 약속(테스트는 환경 변수와 무관해야 함).

## 결과

### 긍정적
- API 키 없는 사용자가 브릿지를 통해 벼림을 쓸 수 있다. 일순위 사용자의 진입 장벽이 낮아진다
- 변경 면적이 작다. 어댑터 팩토리에 인자 한 개, select 분기 하나, 환경 변수 한 개. ADR 0024가 박은 약속은 그대로
- 절대 금지선 6번이 더 단단해진다. Claude Code SDK도 자체 브릿지도 박지 않아 외부 도구 변화에서 자유로움
- 사용자가 어떤 브릿지를 고르든 우리는 모름. 사용자 자율 영역이 늘어남

### 부정적 / 트레이드오프
- 사용자가 브릿지 서버를 직접 띄우거나 외부 도구를 알아야 함. README가 외부 프로젝트(claude-code-router 같은) 후보를 안내하지만 보증할 수 없음. 한 줄짜리 면책 문구 필요
- placeholder 키 방식은 SDK가 미래에 키 형식 검증을 강화하면 깨질 수 있음(`sk-`로 시작 강제 등). 그 시점이 오면 placeholder를 형식에 맞게 갱신하면 됨. 한 자리 변경으로 끝
- ANTHROPIC_API_KEY와 ANTHROPIC_BASE_URL 둘 다 설정한 경우 사용자가 어느 자리를 보는지 헷갈릴 수 있음. SDK 동작에 따라 baseURL이 우선시됨을 README와 한국어 안내에 명시

### 미래 묶임
- ANTHROPIC_BASE_URL은 표준 이름이다. 변경하려면 ADR
- placeholder 키 값(`byeorim-bridge-placeholder`)도 표준이다. 변경 시 ADR amendment
- 별도 claude-code 어댑터는 미래 자리. 사용자 신호가 나타나면 ADR로
- 다른 벤더 어댑터(GPT, Gemini)가 들어오면 같은 패턴(벤더별 BASE_URL 환경 변수)으로 받는다

## 링크
- 이전 결정: ADR 0009 (AiAdapter 인터페이스), ADR 0024 (Claude LLM 어댑터)
- 후속 작업 후보: claude-code 별도 어댑터 ADR(필요 시), GPT/Gemini 어댑터 ADR
- 관련 정책: CLAUDE.md 섹션 0(1순위 비기술 창업자), 섹션 2(절대 금지선 6번 벤더 무관, 7번 텔레메트리 금지), 섹션 8(한국어 사용자 출력)
- 외부 참고: @anthropic-ai/sdk의 baseURL 옵션, Anthropic API 호환 브릿지 도구들
