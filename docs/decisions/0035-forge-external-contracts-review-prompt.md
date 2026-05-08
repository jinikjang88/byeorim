# ADR 0035. Forge 외부 계약 검토 프롬프트

- 상태: 채택
- 날짜: 2026-05-05
- 결정자: DevSmith
- 관계: ADR 0030(smelt 외부 검토)과 ADR 0033(shape 외부 검토)의 결을 forge에 옮긴다. ADR 0034의 인터랙티브 검토 흐름은 그대로. ADR 0028의 외부 프롬프트 경로(.byeorim/project/prompts/) 결을 따름

## 맥락

ADR 0034가 forge에 인터랙티브 검토 자리를 박았다. 검토 화면은 블럭별 한 줄과 메서드/path 줄만 보여주고 schema 자체(필드명, 타입)는 안 보여준다(ADR 0034 결정 2). 한 화면에 들어가는 정보 한도가 있다. schema 검토는 별도 자리에서 다루는 약속이 있었다.

smelt가 ADR 0030으로, shape가 ADR 0033으로 같은 자리를 외부 검토 프롬프트 부산물로 풀었다. 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 마크다운을 그대로 붙여넣어 자기 도메인을 자세히 검토받는 자리. forge에도 같은 결이 비어있다.

forge의 산출물(contracts.yml)은 비기술 창업자(1순위 사용자) 시점에서 두 자리가 검토 가치를 가진다.

첫째, endpoint 누락/과다. block.api_style → endpoint 매핑(ADR 0013 결정 3)은 평균에 맞춰져 있어 평균에서 벗어난 블럭은 자동으로 안 보인다. 예를 들어 읽기 전용 자원이 5개 endpoint를 다 가질 필요가 없다. 외부 AI가 사용자 도메인을 보고 "이 블럭은 update/delete가 어울리지 않을 수 있어요"를 짚어줄 수 있다.

둘째, schema 도메인 적합성. AI 어댑터(ADR 0023)가 채운 schema가 도메인에 잘 맞는지 사용자가 검토 화면에서는 못 본다. 외부 AI가 "주문 블럭의 create는 quantity, item_id 필드가 더 어울려요" 같은 자세한 안내를 줄 수 있다.

이 두 자리를 한 묶음으로 풀어 contracts-review-prompt.md 부산물을 둔다. smelt/shape와 같은 결.

## 검토한 옵션

### 결정 1. 부산물 생성 시점

#### 옵션 A. interactiveForge가 끝나면 항상 자동 생성
- 장점: 사용자가 부산물 존재를 잊지 않음. smelt(ADR 0030)/shape(ADR 0033)와 같은 결. CLI 출력에 안내 한 줄로 흐름 자연스러움
- 단점: 사용자가 안 쓰면 디스크 자리만 차지. 다만 마크다운 한 파일이라 무게 작음

#### 옵션 B. 별도 명령 `byeorim forge review-prompt`
- 장점: 사용자가 원할 때만 생성
- 단점: 사용자가 새 명령을 알아야 함. 비기술 창업자에게 학습 비용. smelt/shape가 자동 생성으로 갔는데 forge만 다른 결이면 일관성 깨짐

#### 옵션 C. 사용자에게 매번 묻기
- 장점: 사용자 의지 반영
- 단점: 흐름이 길어짐. 동행 톤 정신과 어긋남(매번 멈춰 물음). smelt/shape의 결과 어긋남

### 결정 2. 프롬프트 정보 범위

#### 옵션 A. 7항목 + 카탈로그 전체 + 선택 블럭 + 아키텍처 4개 결정 + contracts 전체(블럭별 endpoint와 schema)
- 장점: 외부 AI가 사용자 도메인의 모든 자리를 한 번에 본다. ADR 0030/0033과 같은 결로 일관성. 외부 AI가 "다른 블럭의 endpoint와 비교해보면..." 같은 안내를 줄 수 있음
- 단점: 프롬프트 길이가 큼. 카탈로그 30~50 블럭 + contracts 10~50 endpoint + schema라 외부 AI 컨텍스트 한도가 부담스러울 수 있음. 다만 평균 도메인 크기에서는 무리 없음

#### 옵션 B. 아키텍처 결정 + contracts만(가볍게)
- 장점: 프롬프트가 가벼움
- 단점: 외부 AI가 사용자 도메인을 못 봄. "이 endpoint가 도메인에 어울리는가?"를 답할 자리가 없음. ADR 0030/0033과 다른 결이라 일관성 깨짐

#### 옵션 C. 카탈로그 빼고 7항목 + 선택 블럭 + 아키텍처 + contracts
- 장점: 옵션 A와 옵션 B의 중간 무게
- 단점: 카탈로그 빼면 외부 AI가 "사용자 도메인의 다른 블럭이 이 자리에 영향을 주는가"를 못 봄. ADR 0030/0033 결과 어긋남

### 결정 3. 검토 요청 항목

#### 옵션 A. endpoint 누락/과다 + schema 도메인 적합성 + 시작 무게(REST 5개가 너무 많은가)
- 장점: forge의 산출물 결에 정확히 맞춤. 사용자가 contracts.yml에서 풀 수 있는 자리(endpoint 가감, schema 수정, REST 부담)를 외부 AI에 묻는 결
- 단점: 항목 셋이 smelt(잘 맞음/비어있음/시작 무게)와 shape(도메인 적합성/트레이드오프/시작 무게)와 살짝 다르나 forge의 산출물 자리에 맞춤이 더 가치 있음

#### 옵션 B. smelt와 같은 셋(잘 맞음, 비어있음, 시작 무게)
- 장점: 두 단계에서 같은 검토 결
- 단점: forge의 산출물(contracts)에 맞지 않음. "어떤 endpoint가 어울리는가"는 smelt의 "잘 맞음"과 결이 다름

#### 옵션 C. 자유 형식
- 장점: 외부 AI가 자기 결로 답함
- 단점: 사용자가 받는 응답 결이 매번 달라 일관성 떨어짐. 비기술 창업자에게 어디를 봐야 할지 막막

### 결정 4. schema 노출 깊이

#### 옵션 A. JSON Schema 객체를 그대로 풀어쓰기(YAML 들여쓰기 한 자리)
- 장점: 외부 AI가 schema 구조를 그대로 봄. 가장 풍부한 검토. JSON Schema는 표준이라 외부 AI가 잘 이해
- 단점: 비기술 창업자 사용자가 부산물을 직접 읽을 때 JSON Schema가 어색. 다만 부산물의 1차 독자는 외부 AI라 외부 AI 결에 맞춤이 옳음

#### 옵션 B. 필드명 한국어 풀이만(타입 표시 없음)
- 장점: 비기술 창업자가 부산물을 읽기 쉬움
- 단점: 외부 AI가 타입을 못 봐서 검토 정확도 떨어짐. "주문에 amount 필드가 number라면 BigDecimal 자리가 안전" 같은 안내 어려움

#### 옵션 C. TODO 자리는 빈 줄로, 채워진 자리는 JSON Schema 객체로
- 장점: TODO와 채워진 자리를 사용자가 명확히 구분
- 단점: 옵션 A에 한 자리(TODO 안내) 추가만 다른 결. 옵션 A에 TODO 표시를 함께 넣으면 됨

## 결정

### 결정 1: 자동 생성 (옵션 A)

forge의 인터랙티브 검토(ADR 0034)가 'proceed'로 끝나는 자리에서 항상 부산물을 생성한다. 위치는 `.byeorim/project/prompts/contracts-review-prompt.md`. smelt의 `block-review-prompt.md`(ADR 0030)와 shape의 `architecture-review-prompt.md`(ADR 0033)와 같은 디렉토리, 같은 결.

### 결정 2: 7항목 + 카탈로그 전체 + 선택 블럭 + 아키텍처 + contracts (옵션 A)

부산물에 다음 자리를 모두 담는다.

- 사용자 7항목 답변(intent.yml의 user_answers)
- 카탈로그 전체 blocks(id/name/user_desc/priority)
- 사용자가 고른 블럭(selected-blocks.yml의 selected/auto_added)
- 4개 아키텍처 결정(architecture.yml의 language/database/api_style/architecture_pattern)
- contracts 전체(블럭별 block_id/name/api_style/endpoints/schema)

ADR 0030/0033과 같은 결로 일관성이 박힌다. forge의 자리는 contracts 전체가 새로 추가되는 결. 카탈로그와 선택 블럭은 외부 AI가 도메인을 보는 자리(ADR 0030/0033 결과 동일).

### 결정 3: endpoint 누락/과다 + schema 도메인 적합성 + 시작 무게 (옵션 A)

외부 AI에게 다음 셋을 묻는다.

1. **endpoint 누락/과다**: 자동 생성된 block.api_style → endpoint 매핑(resource=5/query=1/internal=0)이 사용자 도메인에 어울리는지. 평균에서 벗어난 블럭(예: 읽기 전용 자원, write 전용 endpoint가 더 필요한 자리)을 짚어달라.
2. **schema 도메인 적합성**: AI 어댑터가 채운 request/response schema가 사용자 도메인 의미에 맞는지. 예: 주문의 create에 quantity가 누락됐다, 결제의 amount는 BigDecimal이 안전하다 같은 자리.
3. **시작 무게**: REST endpoint가 너무 많아 무거운지(MVP에 5개 모두 필요한지), 너무 가벼워 비어있는 자리가 있는지. 표준 매핑 안에서 가감할 자리를 일상어로 안내.

smelt(ADR 0030)와 shape(ADR 0033)의 검토 항목 셋과 결이 살짝 다르지만 forge의 산출물 결에 맞춤. 두 단계의 결을 그대로 따르기보다 forge의 자리에서 사용자가 풀 수 있는 자리(endpoint, schema, 무게)에 정확히 맞추는 결.

### 결정 4: JSON Schema 객체 그대로 + TODO 표시 (옵션 A + C 결합)

각 endpoint의 request/response schema를 부산물에 다음 결로 담는다.

- 채워진 자리: JSON Schema 객체를 YAML 들여쓰기로 풀어 보여줌
- TODO 자리: `(TODO — 아직 채워지지 않음)` 한 줄 표시

부산물의 1차 독자는 외부 AI다. JSON Schema는 표준이라 외부 AI가 정확히 이해. TODO 자리도 외부 AI에게 "여기 채워야 한다"는 신호로 가치 있음.

## 결과

### 긍정적
- ADR 0034의 검토 화면이 안 보여주던 schema 자리를 외부 AI에 자세히 검토받는 자리가 생김
- 비기술 창업자가 contracts.yml의 endpoint와 schema가 자기 도메인에 어울리는지 외부 AI에 일상어로 묻는 결
- ADR 0030/0033과 같은 결로 사용자가 세 단계(smelt/shape/forge)에서 같은 사용 패턴을 따라감
- 부산물 자동 생성으로 사용자가 흐름을 멈추지 않고도 검토 자리를 손에 쥠
- 카탈로그 전체와 7항목 답변을 함께 보내 외부 AI가 도메인 시각으로 검토할 수 있음

### 부정적 / 트레이드오프
- 부산물 마크다운이 매번 자리잡음. 사용자가 안 쓰면 디스크 자리만 차지(마크다운 한 파일이라 무게 작음)
- contracts가 큰 도메인(블럭 10+ × endpoint 5)에서는 프롬프트 길이가 부담될 수 있음. 사용자 피드백 받으면 truncation 자리 검토(후속 ADR)
- JSON Schema를 부산물에 담는 결이 비기술 창업자가 부산물을 직접 읽을 때 어색. 1차 독자가 외부 AI라 외부 AI 결에 맞춤
- 검토 항목 셋이 smelt/shape와 살짝 다른 결. forge의 산출물 자리에 맞춤이지만 사용자가 세 단계의 검토 결을 통일된 단어로 기억하기 살짝 어려울 수 있음

### 미래 묶임
- `contracts-review-prompt.md` 위치(.byeorim/project/prompts/)와 마크다운 형식은 표준
- 부산물에 담는 정보 범위(7항목 + 카탈로그 + 선택 + 아키텍처 + contracts)는 표준. 변경하려면 새 ADR
- 검토 항목 셋(endpoint 누락/과다, schema 도메인 적합성, 시작 무게)은 표준. 항목 추가/제거는 새 ADR
- schema 표시 결(JSON Schema 객체 + TODO 안내)은 표준
- 부산물 응답을 다시 import하는 자리(예: `byeorim forge import-review`)는 미래 ADR. 이번 출시는 사용자가 응답 읽고 수동으로 contracts.yml 다듬거나 forge를 다시 돌리는 결

## 링크
- 짝 결정: ADR 0030 (smelt 외부 검토), ADR 0033 (shape 외부 검토, 같은 결을 forge에 옮김)
- 입력 의존: ADR 0010 (selected-blocks.yml), ADR 0012 (architecture.yml), ADR 0013 (contracts.yml 형식), ADR 0023 (extractSchema), ADR 0026 (intent.yml의 user_answers), ADR 0034 (forge 인터랙티브 검토)
- 결의 짝: ADR 0028 (prospect 외부 프롬프트 경로, 같은 결)
- 동행 톤: ADR 0003 결정 2
- 후속 작업 후보: 부산물 응답 import 명령, 큰 도메인의 truncation, schema가 깊어졌을 때(중첩 2단계 이상) 자리
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(데이터 무관성), 섹션 10(글쓰기 원칙)
