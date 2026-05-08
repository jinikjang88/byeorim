# ADR 0024. 실제 LLM 어댑터(Claude) 도입

- 상태: 채택
- 날짜: 2026-04-29
- 결정자: DevSmith

## 맥락

ADR 0009가 AiAdapter 인터페이스를 박고 mock 어댑터를 출시했다. ADR 0023이 두 번째 메서드 extractSchema를 더했다. 두 메서드 모두 mock으로만 구현되어 있어 실제 사용자 환경에서는 generic placeholder만 돌아온다. 이번 ADR은 그 자리를 실제 LLM(Claude)으로 채운다.

답해야 할 질문 일곱.

첫째, 첫 번째 LLM 벤더로 무엇을 고를지. 둘째, API 키를 어떻게 받을지. 셋째, 어댑터를 어떻게 선택할지(mock vs claude). 넷째, 모델을 어떻게 정할지. 다섯째, 구조화된 출력을 어떻게 강제할지. 여섯째, 에러를 어떻게 다룰지. 일곱째, 테스트는 LLM 호출 없이 어떻게 결정적으로 돌릴지.

CLAUDE.md 절대 금지선 6번이 한 자리에서 다시 작동한다. Claude를 첫 어댑터로 도입하더라도 ADR 0009의 인터페이스를 우회하면 안 된다. 다른 벤더 어댑터(GPT, Gemini)가 들어올 자리는 같은 결로 열려 있어야 한다.

## 검토한 옵션

### 결정 1. 첫 LLM 벤더

#### 옵션 A. Claude (@anthropic-ai/sdk)
- 장점: 한국어 품질이 강하고, structured output(JSON schema 강제)을 1급으로 지원. prompt caching, adaptive thinking 같은 최신 기능이 SDK 안에 있음. claude-opus-4-7이 최신 기준 모델
- 단점: Anthropic 계정과 API 키 필요. 다른 벤더보다 호출 비용이 큼

#### 옵션 B. OpenAI (openai)
- 장점: 사용자 풀이 가장 큼. 많은 사람이 이미 키를 갖고 있음
- 단점: 한국어 품질 편차. structured output은 지원되나 형식이 다름

#### 옵션 C. Gemini (google-genai)
- 장점: 무료 등급 존재
- 단점: 한국어 출력 품질 편차. SDK가 상대적으로 덜 성숙

### 결정 2. API 키 전달 방식

#### 옵션 A. 환경 변수 ANTHROPIC_API_KEY
- 장점: SDK가 기본으로 읽음. 12-factor 표준. 사용자가 쉘 프로필에 한 번만 두면 됨. 키가 코드/저장소에 들어갈 위험이 작음
- 단점: 사용자가 환경 변수 설정을 직접 해야 함

#### 옵션 B. 설정 파일 (.byeorim/config.yml에 평문)
- 장점: 명시적
- 단점: 키가 디스크에 평문. .gitignore 깜박하면 유출. 절대 금지선 6번의 정신과는 별개로 보안 위험

#### 옵션 C. 매 호출마다 CLI 인자
- 장점: 가장 명시적
- 단점: 매번 입력. shell history에 남음

### 결정 3. 어댑터 선택 메커니즘

#### 옵션 A. 환경 변수 BYEORIM_AI_ADAPTER (기본값 mock)
- 장점: 사용자가 `BYEORIM_AI_ADAPTER=claude` 한 줄로 활성화. 기본은 mock이라 비용/네트워크 의존이 없는 출발선. 단위 테스트는 환경 변수 무시하고 직접 mock 주입(ADR 0009 결정 4 의존성 주입 보존)
- 단점: 환경 변수 두 개(키 + 선택)를 설정해야 함

#### 옵션 B. 명령어 플래그 (--ai claude)
- 장점: 매 명령어에서 바꾸기 쉬움
- 단점: 모든 명령어에 같은 플래그를 박아야 함. CLI 표면이 커짐

#### 옵션 C. 자동 감지 (키가 있으면 claude, 없으면 mock)
- 장점: 사용자가 명시적으로 안 해도 됨
- 단점: 의도치 않은 비용 발생 위험. 사용자가 mock으로 테스트하다 모르고 실제 호출이 일어나는 사고

### 결정 4. 모델 선택

#### 옵션 A. claude-opus-4-7 기본, BYEORIM_AI_MODEL로 override
- 장점: claude-api 스킬의 강력한 권고와 정합. 최고 품질이 첫 출시 기준선. 사용자가 비용을 줄이고 싶으면 sonnet이나 haiku로 바꿀 수 있음
- 단점: 기본 비용이 가장 높음

#### 옵션 B. claude-haiku-4-5 기본 (저비용)
- 장점: 호출 비용 최소
- 단점: 추론 품질이 schema 추출에서 떨어질 수 있음. extractIntent의 한국어 명사구 추출도 약해질 가능성

#### 옵션 C. 호출마다 다른 모델 (intent는 sonnet, schema는 haiku 등)
- 장점: 작업별 비용 최적화
- 단점: 모델 선택 로직이 어댑터에 박힘. 미래 변경이 어려움

### 결정 5. 구조화된 출력 형식

#### 옵션 A. output_config.format: json_schema (Anthropic structured output)
- 장점: SDK가 응답을 JSON으로 강제. 파싱 실패가 거의 없음. ADR 0023의 Schema 부분집합을 그대로 schema로 넘길 수 있음
- 단점: SDK 베타 표면을 일부 사용. SDK 업데이트로 형식이 바뀔 위험은 작지만 0은 아님

#### 옵션 B. 프롬프트로 "JSON으로 답하라" 강제 + try/catch 파싱
- 장점: SDK 의존 없이 동작
- 단점: 모델이 JSON을 살짝 빗나갈 가능성. 실패율과 재시도 로직 필요

#### 옵션 C. tool use 패턴 (응답을 도구 호출로 강제)
- 장점: tool 호출은 구조 강제가 가장 강함
- 단점: 한 번 호출에 tool_use 응답을 또 한 번 처리해야 함. 비용 두 배

### 결정 6. 에러 처리

#### 옵션 A. 인증 / 레이트리밋 / 타임아웃 / 네트워크 오류를 한국어 메시지로 변환
- 장점: CLAUDE.md 섹션 8(사용자 출력은 비기술 창업자도 이해)과 정합. 영문 stack trace를 사용자에게 던지지 않음
- 단점: 에러 종류별 매핑 코드 추가

#### 옵션 B. SDK 에러를 그대로 throw
- 장점: 단순
- 단점: 사용자가 영문 에러를 본다. 일순위 사용자(비기술 창업자) 경험 위배

### 결정 7. 테스트 전략

#### 옵션 A. SDK 의존성을 어댑터 팩토리에 주입(client 옵션)
- 장점: 테스트가 mock client(가짜 messages.create)를 주입해서 LLM 호출 없이 어댑터의 프롬프트 조립과 응답 파싱을 검증. CLAUDE.md 섹션 4의 5초 미만 약속 보존. ADR 0009 결정 4의 의존성 주입 정신과 정합
- 단점: 어댑터 팩토리 인자가 하나 더 늘어남(client)

#### 옵션 B. 실제 SDK를 부르되 fetch을 monkey-patch
- 장점: SDK 내부까지 검증
- 단점: 테스트가 SDK 버전에 강하게 묶임. 깨지기 쉬움

#### 옵션 C. nock 같은 HTTP mocking
- 장점: 실제 SDK 흐름 그대로 검증
- 단점: 외부 의존성 추가. 네트워크 layer mocking이 흔들리기 쉬움

## 결정

### 결정 1: Claude 어댑터 (옵션 A)

첫 LLM 어댑터는 Claude(@anthropic-ai/sdk). 한국어 품질, structured output, prompt caching이 셋 다 강하다. 다른 벤더(GPT, Gemini) 어댑터가 들어올 자리는 같은 ADR 0009 인터페이스 위에 열어둔다. ADR 0024가 "유일한" 어댑터를 박는 게 아니라 "첫 번째" 어댑터를 박는 자리다.

### 결정 2: ANTHROPIC_API_KEY 환경 변수 (옵션 A)

API 키는 ANTHROPIC_API_KEY 환경 변수로 받는다. SDK 기본 동작과 정합. 사용자에게는 README와 CLI 메시지로 한 번만 안내한다.

키가 없는 상태에서 BYEORIM_AI_ADAPTER=claude로 실행하면 한국어 메시지로 "ANTHROPIC_API_KEY가 설정되어 있지 않습니다. https://console.anthropic.com에서 키를 발급받아 환경 변수에 두세요" 같이 안내한다.

### 결정 3: BYEORIM_AI_ADAPTER 환경 변수, 기본 mock (옵션 A)

어댑터 선택은 BYEORIM_AI_ADAPTER 환경 변수.

| 값 | 동작 |
| --- | --- |
| (미설정) 또는 `mock` | mock 어댑터. 네트워크 호출 없음. 비용 0 |
| `claude` | Claude 어댑터. ANTHROPIC_API_KEY 필요 |

기본을 mock으로 둔 이유는 두 가지. 첫째, 사용자가 의도치 않게 비용을 쓰지 않게. 둘째, 이번 출시의 mock이 이미 흐름 검증에 충분하다. 사용자가 "이제 진짜 AI를 써보고 싶다"라고 결정할 때 환경 변수 한 줄을 켠다.

엔트리 포인트(bin/byeorim.js)에서 어댑터를 선택해 runProspect/runForge에 주입한다. 단위 테스트는 환경 변수를 무시하고 직접 mock을 주입(ADR 0009 결정 4의 의존성 주입 보존).

선택 로직은 packages/ai/src/select.js 한 자리에 산다. 미래에 GPT나 Gemini가 추가되면 이 표만 갱신.

### 결정 4: claude-opus-4-7 기본, BYEORIM_AI_MODEL로 override (옵션 A)

기본 모델은 claude-opus-4-7. claude-api 스킬이 강하게 권고하는 자리(2026-04 기준 최신/최고 품질). 사용자가 비용을 줄이고 싶으면 BYEORIM_AI_MODEL=claude-sonnet-4-6 또는 claude-haiku-4-5로 바꾼다.

모델 ID는 표 그대로 쓴다. 날짜 suffix(`-20250514` 같은)는 절대 만들지 않는다(claude-api 스킬 지침).

### 결정 5: structured output (json_schema) (옵션 A)

extractIntent와 extractSchema 둘 다 messages.create에 output_config.format = { type: 'json_schema', schema: ... }를 넘겨 응답을 JSON 스키마로 강제한다.

extractIntent의 응답 schema:
```json
{
  "type": "object",
  "properties": {
    "what": { "type": "string" },
    "who": { "type": "string" },
    "why": { "type": "string" },
    "suggested_template": { "type": ["string", "null"] }
  },
  "required": ["what", "who", "why", "suggested_template"]
}
```

extractSchema의 응답 schema는 ADR 0023의 ExtractedSchema와 같은 모양 (request, response 각각 JSON Schema 부분집합 또는 null).

응답 파싱은 SDK가 JSON으로 강제한 자리에서 받기에 try/catch만 두르면 된다. 파싱이 실패하면 한국어 에러로 변환(결정 6).

### 결정 6: 에러를 한국어로 변환 (옵션 A)

SDK가 던지는 typed exception을 어댑터가 잡아 한국어 메시지로 변환한다.

| SDK 에러 | 한국어 메시지 |
| --- | --- |
| 인증 실패 (401) | "Anthropic API 키가 잘못되었거나 만료되었습니다. ANTHROPIC_API_KEY 환경 변수를 다시 확인해주세요" |
| 레이트리밋 (429) | "Anthropic API 호출 제한에 걸렸습니다. 잠시 후 다시 시도해주세요" |
| 네트워크 / 타임아웃 | "Anthropic API에 연결하지 못했습니다. 네트워크 상태를 확인해주세요" |
| 그 외 | "Anthropic API 호출에 실패했습니다: <원본 메시지>" |

원본 SDK 에러는 cause로 묶어둔다(디버깅 시 `--verbose` 자리에서 보일 수 있게 향후 확장 가능). 사용자에게 영문 stack trace를 그대로 던지지 않는다(섹션 8).

### 결정 7: client 의존성 주입 (옵션 A)

createClaudeAdapter 시그니처:
```js
createClaudeAdapter({ apiKey, model, client })
```

`client`는 옵셔널. 주어지면 그대로 사용, 안 주어지면 `new Anthropic({ apiKey })`로 만든다. 단위 테스트는 mock client(가짜 messages.create를 가진 객체)를 주입해 LLM 호출 없이 어댑터의 프롬프트 조립과 응답 파싱을 검증.

이 패턴은 ADR 0009/0011/0019/0022에서 이미 네 번 등장한 의존성 주입 패턴의 다섯 번째 적용.

### Prompt caching 정책

extractSchema는 같은 시스템 프롬프트(JSON Schema 부분집합 설명, 출력 형식 약속)를 endpoint마다 반복 호출한다. 시스템 프롬프트에 cache_control: { type: 'ephemeral' }을 박아 두 번째 호출부터 캐시 적중. claude-api 스킬의 prefix-match 불변식대로 시스템 프롬프트는 항상 같은 바이트로 맞춘다.

extractIntent는 한 세션에 한 번이라 캐시 효과가 적지만 같은 시스템 프롬프트를 사용해 일관성을 유지한다.

### Adaptive thinking 정책

복잡한 도메인 추론(extractSchema)은 thinking: { type: 'adaptive' }로 모델이 필요할 때 깊이 생각하게 한다. extractIntent는 단순 추출이라 thinking 없이도 충분하지만, opus-4-7의 권고가 "remotely complicated"인 자리에 adaptive를 켜라이므로 양쪽 모두 켠다.

## 결과

### 긍정적
- 사용자가 BYEORIM_AI_ADAPTER=claude 한 줄로 실제 LLM 활용 가능. 비용 우려가 있으면 기본 mock 그대로
- ADR 0009의 인터페이스가 첫 실제 구현으로 검증된다. 미래의 GPT/Gemini 어댑터가 같은 자리만 채우면 prospect/forge는 한 줄도 안 바뀐다
- structured output으로 응답 파싱 실패가 거의 사라진다
- 한국어 에러 메시지로 비기술 창업자(섹션 0의 1순위 사용자)에게 영문 stack trace를 던지지 않는다
- prompt caching으로 extractSchema의 반복 호출 비용이 첫 호출 이후 크게 줄어든다
- 단위 테스트는 mock client 주입으로 LLM 호출 없이 결정적. 5초 미만 약속 보존

### 부정적 / 트레이드오프
- @anthropic-ai/sdk 외부 의존성 추가. 모노레포 의존성 트리가 커진다
- 환경 변수 두 개(ANTHROPIC_API_KEY, BYEORIM_AI_ADAPTER)를 사용자가 알아야 함. README와 CLI 안내로 보완
- claude-opus-4-7이 첫 출시 기준이라 호출 비용이 가장 큰 모델이 기본. 사용자가 BYEORIM_AI_MODEL로 줄일 수 있도록 안내
- structured output은 SDK 베타 표면. 향후 SDK 업데이트로 시그니처가 바뀔 가능성. 어댑터 한 파일만 갱신하면 되므로 영향은 국소적
- mock과 claude의 출력이 다를 수 있다. mock은 generic placeholder, claude는 도메인 추론. 사용자가 두 모드를 오갈 때 결과 차이를 인식해야 함

### 미래 묶임
- BYEORIM_AI_ADAPTER, BYEORIM_AI_MODEL 환경 변수 이름은 표준이다. 변경하려면 ADR
- ANTHROPIC_API_KEY는 SDK 표준. 변경 불가
- 어댑터 선택 표(packages/ai/src/select.js)는 표준. 새 벤더 추가는 amendment
- 한국어 에러 메시지 표는 표준. 추가 에러 종류는 amendment
- structured output 형식은 ADR 0023의 Schema 부분집합과 묶여있다. 둘 중 하나만 바뀌면 안 됨
- 다른 LLM 어댑터(GPT, Gemini)는 별도 ADR. 이번 ADR과 같은 패턴 재사용 예상
- prompt caching, adaptive thinking 같은 모델별 기능은 어댑터 안에 캡슐화. 미래 모델 변경 시 어댑터만 갱신

## 링크
- 이전 결정: ADR 0009 (AI 어댑터 인터페이스), ADR 0023 (extractSchema)
- 후속 작업 후보: GPT 어댑터 ADR, Gemini 어댑터 ADR, 비용/사용량 추적 ADR, 캐시 통계 ADR
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 2(절대 금지선 6번 벤더 무관, 7번 텔레메트리 금지), 섹션 3(packages/ai만 LLM 호출), 섹션 4(단위 테스트 5초 미만 결정성), 섹션 8(한국어 사용자 출력)
- 외부 참고: claude-api 스킬(claude-opus-4-7 기본, adaptive thinking, structured output, prompt caching)
