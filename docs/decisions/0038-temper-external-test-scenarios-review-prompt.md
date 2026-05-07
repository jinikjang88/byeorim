# ADR 0038. Temper 외부 테스트 시나리오 검토 프롬프트

- 상태: 채택
- 날짜: 2026-05-06
- 결정자: DevSmith
- 관계: ADR 0030(smelt 외부 검토), ADR 0033(shape 외부 검토), ADR 0035(forge 외부 검토)의 결을 temper에 옮긴다. ADR 0037의 인터랙티브 검토 흐름은 그대로. ADR 0028의 외부 프롬프트 경로(.beoreum/project/prompts/) 결을 따름

## 맥락

ADR 0037이 temper에 인터랙티브 검토 자리를 박았다. 검토 화면은 블럭별 한 줄과 endpoint별 메서드/path/시나리오 종류 줄만 보여주고 test_code 자체(코드 본문)는 안 보여준다(ADR 0037 결정 2). 한 화면에 들어가는 정보 한도가 있다. test_code 검토는 별도 자리에서 다루는 약속이 있었다.

smelt가 ADR 0030으로, shape가 ADR 0033으로, forge가 ADR 0035로 같은 자리를 외부 검토 프롬프트 부산물로 풀었다. 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 마크다운을 그대로 붙여넣어 자기 도메인을 자세히 검토받는 자리. temper에도 같은 결이 비어있다.

temper의 산출물(test-scenarios.yml)은 비기술 창업자(1순위 사용자) 시점에서 세 자리가 검토 가치를 가진다.

첫째, 시나리오 종류 누락. 이번 출시는 endpoint당 happy_path 한 가지만 만든다(ADR 0014 결정 3). 실제 도메인에서는 에러 시나리오(잘못된 입력, 권한 부족, 동시성 충돌)와 엣지 시나리오(빈 결과, 큰 결과, 경계값)가 함께 있어야 안전하다. 외부 AI가 도메인을 보고 "이 endpoint는 동시성 충돌이 핵심이라 happy만으로는 부족해요"를 짚어줄 수 있다.

둘째, test_code 도메인 적합성. AI 어댑터(ADR 0036)가 채운 test_code가 도메인에 잘 맞는지 사용자가 검토 화면에서는 못 본다. 외부 AI가 "주문 생성 happy_path에 quantity가 0인 자리도 함께 검증하면 안전해요" 같은 자세한 안내를 줄 수 있다.

셋째, 시나리오 무게. 한 endpoint에 happy_path 하나가 적절한지, 더 필요한지를 도메인 시각으로 본다. forge의 시작 무게 검토와 같은 결.

이 세 자리를 한 묶음으로 풀어 test-scenarios-review-prompt.md 부산물을 둔다. smelt/shape/forge와 같은 결.

## 검토한 옵션

### 결정 1. 부산물 생성 시점

#### 옵션 A. interactiveTemper가 끝나면 항상 자동 생성
- 장점: 사용자가 부산물 존재를 잊지 않음. smelt(ADR 0030)/shape(ADR 0033)/forge(ADR 0035)와 같은 결. CLI 출력에 안내 한 줄로 흐름 자연스러움
- 단점: 사용자가 안 쓰면 디스크 자리만 차지. 다만 마크다운 한 파일이라 무게 작음

#### 옵션 B. 별도 명령 `beoreum temper review-prompt`
- 장점: 사용자가 원할 때만 생성
- 단점: 사용자가 새 명령을 알아야 함. smelt/shape/forge와 다른 결이면 일관성 깨짐

#### 옵션 C. 사용자에게 매번 묻기
- 장점: 사용자 의지 반영
- 단점: 흐름이 길어짐. 동행 톤과 어긋남. 세 단계의 결과 어긋남

### 결정 2. 프롬프트 정보 범위

#### 옵션 A. 7항목 + 카탈로그 전체 + 선택 블럭 + 아키텍처 + contracts + 시나리오
- 장점: 외부 AI가 사용자 도메인의 모든 자리를 한 번에 본다. ADR 0030/0033/0035와 같은 결로 일관성. test_code 검토에 schema 정보(contracts)가 필요한 자리가 있음(예: "이 schema에는 quantity 필드가 있어 test_code도 quantity를 검증해야 해요")
- 단점: 프롬프트 길이가 큼. 카탈로그 30~50 블럭 + contracts 10~50 endpoint + 시나리오 10~50개라 외부 AI 컨텍스트 한도가 부담스러울 수 있음

#### 옵션 B. 7항목 + 아키텍처 + 시나리오만
- 장점: 프롬프트가 가벼움
- 단점: 외부 AI가 schema와 도메인 후보를 못 봄. test_code 도메인 적합성을 안내할 자리가 약함. 세 단계와 다른 결

#### 옵션 C. 카탈로그 빼고 7항목 + 선택 블럭 + 아키텍처 + contracts + 시나리오
- 장점: 옵션 A와 옵션 B의 중간 무게
- 단점: 카탈로그 빼면 외부 AI가 "사용자 도메인의 다른 블럭이 시나리오에 영향을 주는가"를 못 봄. 세 단계 결과 어긋남

### 결정 3. 검토 요청 항목

#### 옵션 A. 시나리오 종류 누락 + test_code 도메인 적합성 + 시작 무게
- 장점: temper의 산출물 결에 정확히 맞춤. 사용자가 test-scenarios.yml에서 풀 수 있는 자리(시나리오 추가, test_code 수정, 시나리오 가감)를 외부 AI에 묻는 결. forge의 셋과 결이 평행(누락/과다, 도메인 적합성, 무게)
- 단점: forge의 셋과 단어 한 자리만 다름(endpoint vs 시나리오 종류, schema vs test_code). 사용자가 비슷한 단어 사이에서 헷갈릴 수 있음. 다만 temper의 자리에 맞춤이 더 가치 있음

#### 옵션 B. forge와 같은 셋(endpoint 누락/과다, schema 도메인 적합성, 시작 무게)
- 장점: 두 단계에서 같은 검토 결
- 단점: temper의 산출물(시나리오)에 맞지 않음. "endpoint 누락"은 forge에서 이미 검토. test_code의 도메인 적합성 자리가 빠짐

#### 옵션 C. 자유 형식
- 장점: 외부 AI가 자기 결로 답함
- 단점: 사용자가 받는 응답 결이 매번 달라 일관성 떨어짐. 비기술 창업자에게 어디를 봐야 할지 막막

### 결정 4. test_code 노출 깊이

#### 옵션 A. 코드 블록(``language) 그대로 + TODO 자리 한 줄 안내
- 장점: 외부 AI가 test_code 본문을 그대로 봄. 가장 풍부한 검토. 코드 블록의 language 힌트(architecture.language)는 외부 AI가 문법을 이해하는 자리. TODO 자리도 외부 AI에 "여기 채워야 한다"는 신호
- 단점: 비기술 창업자 사용자가 부산물을 직접 읽을 때 코드가 어색. 다만 부산물의 1차 독자는 외부 AI라 외부 AI 결에 맞춤이 옳음

#### 옵션 B. test_code를 빼고 GWT 텍스트만
- 장점: 부산물이 가벼움. 사용자 가독성 좋음
- 단점: 외부 AI가 실제 코드 결을 못 봄. "이 코드는 권한 검증 자리가 빠졌어요" 같은 자세한 안내 어려움. ADR 0035의 schema 노출 결과 어긋남

#### 옵션 C. test_code 일부만(첫 N줄) 노출
- 장점: 길이 제한
- 단점: 자른 자리에서 의미가 흐려짐. test_code는 보통 짧아 자를 자리가 적음. 옵션 A와 비슷한 결이지만 일관성 낮음

## 결정

### 결정 1: 자동 생성 (옵션 A)

temper의 인터랙티브 검토(ADR 0037)가 'proceed'로 끝나는 자리에서 항상 부산물을 생성한다. 위치는 `.beoreum/project/prompts/test-scenarios-review-prompt.md`. smelt의 `block-review-prompt.md`(ADR 0030), shape의 `architecture-review-prompt.md`(ADR 0033), forge의 `contracts-review-prompt.md`(ADR 0035)와 같은 디렉토리, 같은 결.

### 결정 2: 7항목 + 카탈로그 + 선택 + 아키텍처 + contracts + 시나리오 (옵션 A)

부산물에 다음 자리를 모두 담는다.

- 사용자 7항목 답변(intent.yml의 user_answers)
- 카탈로그 전체 blocks(id/name/user_desc/priority)
- 사용자가 고른 블럭(selected-blocks.yml의 selected/auto_added)
- 4개 아키텍처 결정(architecture.yml의 language/database/api_style/architecture_pattern)
- API 계약 요약(contracts.yml의 블럭별 endpoint와 schema)
- 테스트 시나리오 전체(test-scenarios.yml의 블럭별 endpoint별 GWT와 test_code)

ADR 0030/0033/0035와 같은 결로 일관성이 박힌다. temper의 자리는 시나리오가 새로 추가되는 결. contracts는 forge에서 이미 한 번 외부 검토 자리에 담았지만 temper에서도 schema 정보가 test_code 검토에 필요해 다시 담는다. 두 부산물이 서로 다른 자리(forge는 schema 자체, temper는 test_code)를 묻기에 중복 담음이 의미 있다.

### 결정 3: 시나리오 종류 누락 + test_code 도메인 적합성 + 시작 무게 (옵션 A)

외부 AI에게 다음 셋을 묻는다.

1. **시나리오 종류 누락**: 이번 출시는 endpoint당 happy_path 한 가지만 자동 생성. 실제 도메인에서 에러 시나리오(잘못된 입력, 권한 부족, 동시성 충돌)나 엣지 시나리오(빈 결과, 경계값)가 핵심인 자리를 짚어달라.
2. **test_code 도메인 적합성**: AI 어댑터가 채운 test_code가 사용자 도메인 의미에 맞는지. 누락된 검증, 과다한 자리, 권한/동시성/경계 처리가 빠진 자리를 일상어로 안내해주세요. test_code가 TODO인 자리는 어떤 결로 채워야 어울리는지도 같이.
3. **시작 무게**: 지금 시나리오 개수가 너무 적어 위험한 자리, 너무 많아 MVP에 무거운 자리. 표준 매핑(endpoint당 happy_path 한 개) 안에서 추가/축소 자리를 일상어로 안내.

forge(ADR 0035)와 평행한 셋(누락/과다, 도메인 적합성, 무게). 단어 한 자리만 다른 결이라 사용자가 두 단계에서 비슷한 사용 패턴을 따라간다.

### 결정 4: 코드 블록 그대로 + TODO 표시 (옵션 A)

각 시나리오의 test_code를 부산물에 다음 결로 담는다.

- 채워진 자리: ````<language>` 코드 블록(language는 architecture.language). 코드 블록 안은 test_code 문자열 그대로
- TODO 자리: `(TODO — 아직 채워지지 않음)` 한 줄 표시
- 빈 문자열 자리: TODO와 같은 결

architecture.language가 표준 옵션이 아니거나 누락이면 language 힌트 없이 일반 코드 블록(```)으로 풀어쓴다. 외부 AI는 보통 코드 본문을 보고 언어를 추론한다.

GWT 텍스트(given/when/then)는 코드 블록 위에 일상어로 풀어쓴다. 외부 AI가 의도와 코드를 함께 본다.

## 결과

### 긍정적
- ADR 0037의 검토 화면이 안 보여주던 test_code 자리를 외부 AI에 자세히 검토받는 자리가 생김
- 비기술 창업자가 test-scenarios.yml의 시나리오 종류와 test_code가 자기 도메인에 어울리는지 외부 AI에 일상어로 묻는 결
- ADR 0030/0033/0035와 같은 결로 사용자가 네 단계(smelt/shape/forge/temper)에서 같은 사용 패턴을 따라감
- 부산물 자동 생성으로 사용자가 흐름을 멈추지 않고도 검토 자리를 손에 쥠
- 카탈로그 전체와 7항목 답변을 함께 보내 외부 AI가 도메인 시각으로 검토할 수 있음
- contracts와 시나리오를 함께 보내 외부 AI가 schema와 test_code를 교차 검토할 수 있음

### 부정적 / 트레이드오프
- 부산물 마크다운이 매번 자리잡음. 사용자가 안 쓰면 디스크 자리만 차지. 마크다운 한 파일이라 무게 작음
- 시나리오와 contracts가 함께 들어가 큰 도메인(블럭 10+ × endpoint 5)에서는 프롬프트 길이가 forge보다 더 부담될 수 있음. 사용자 피드백 받으면 truncation 자리 검토(후속 ADR)
- 코드 블록을 부산물에 담는 결이 비기술 창업자가 부산물을 직접 읽을 때 어색. 1차 독자가 외부 AI라 외부 AI 결에 맞춤
- 검토 항목 셋이 forge와 단어 한 자리만 달라 사용자가 두 단계 사이에서 헷갈릴 수 있음. 다만 같은 결의 평행 자리

### 미래 묶임
- `test-scenarios-review-prompt.md` 위치(.beoreum/project/prompts/)와 마크다운 형식은 표준
- 부산물에 담는 정보 범위(7항목 + 카탈로그 + 선택 + 아키텍처 + contracts + 시나리오)는 표준. 변경하려면 새 ADR
- 검토 항목 셋(시나리오 종류 누락, test_code 도메인 적합성, 시작 무게)은 표준. 항목 추가/제거는 새 ADR
- test_code 표시 결(코드 블록 + language 힌트 + TODO 안내)은 표준
- 부산물 응답을 다시 import하는 자리(예: `beoreum temper import-review`)는 미래 ADR. 이번 출시는 사용자가 응답 읽고 수동으로 test-scenarios.yml 다듬거나 temper를 다시 돌리는 결
- 시나리오 종류가 늘어나면(에러/엣지) 외부 검토 항목 1번이 자연스럽게 다른 결로 옮겨갈 자리(별도 ADR)

## 링크
- 짝 결정: ADR 0030 (smelt 외부 검토), ADR 0033 (shape 외부 검토), ADR 0035 (forge 외부 검토, 같은 결을 temper에 옮김)
- 입력 의존: ADR 0010 (selected-blocks.yml), ADR 0012 (architecture.yml), ADR 0013 (contracts.yml 형식), ADR 0014 (test-scenarios.yml 형식), ADR 0026 (intent.yml의 user_answers), ADR 0036 (fillTestCode), ADR 0037 (temper 인터랙티브 검토)
- 결의 짝: ADR 0028 (prospect 외부 프롬프트 경로, 같은 결)
- 동행 톤: ADR 0003 결정 2
- 후속 작업 후보: 부산물 응답 import 명령, 큰 도메인의 truncation, 시나리오 종류 확장(에러/엣지) 자리, frontend 시나리오 자리(있을지 검토)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(데이터 무관성), 섹션 10(글쓰기 원칙)
