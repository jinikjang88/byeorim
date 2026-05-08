# ADR 0028. 외부 프롬프트 경로와 사용자 카탈로그 import

- 상태: 채택
- 날짜: 2026-05-04
- 결정자: DevSmith
- 관계: ADR 0008의 결정 3에 예약된 `custom` source를 구현. ADR 0006의 7단계 명령어에 prospect 보조 명령 추가

## 맥락

지금 prospect는 카탈로그 출처가 두 결이다. 빌트인 템플릿(`template:<name>`)과 AI API 어댑터(`ai:<adapter>`). 둘 다 동작 자리가 있지만 1순위 사용자(카페 사장님, 학원 원장님 등 비기술 창업자)에게 두 가지 한계가 있다.

첫째, AI API 경로는 Anthropic API 키 또는 브릿지 서버가 필요하다. 비용도 든다. 비기술 창업자가 첫 만남부터 API 키를 발급받고 결제 정보를 등록하기는 부담스럽다.

둘째, AI API 경로의 카탈로그 품질은 max_tokens 8192로 잡힌 한 번 호출의 한계 안에 있다. 사용자가 더 자세한 카탈로그를 원해도 API 어댑터 안에서 늘릴 자리가 좁다.

ADR 0008 결정 3은 source 형식의 미래 자리로 `custom`을 예약해뒀다. "사용자가 직접 작성한 카탈로그를 가리키는 자리". 그 자리를 이번에 구현한다. 사용자가 외부 AI(Claude.ai, ChatGPT, Gemini)에 자유롭게 물어 받은 카탈로그를 prospect에 가져올 길이다. API 키 없이도, 더 긴 대화로 더 자세한 카탈로그를 받아올 수 있다.

이 결은 절대 금지선 6번(특정 AI 벤더에 종속시키지 않는다)과도 정합한다. 사용자가 어떤 AI를 쓰든 catalog.schema.json만 통과하면 받아준다.

## 검토한 옵션

### 결정 1. 프롬프트 부산물 생성 자리

#### 옵션 A. 4지선다에 5번째 옵션 추가 (외부 프롬프트 받기)
- 장점: 명시적 선택. 사용자가 의도적으로 외부 경로를 고르는 자리
- 단점: 5번 고르면 prospect 흐름이 끊김(catalog.yml이 아직 없음). 임시 카탈로그를 둬야 다음 단계로 갈 수 있음. 흐름 복잡

#### 옵션 B. prospect 끝에 항상 부산물로 자동 생성
- 장점: 흐름 안 끊김. 모든 사용자가 prompt 자리를 받아 나중에 쓸 수 있음
- 단점: 모든 사용자에게 한 자리 더 만들어둠(쓰지 않을 사용자에게는 노이즈)

#### 옵션 C. 별도 명령 `byeorim prospect prompt-catalog`
- 장점: 책임 분리 명확. 원하는 사용자만 호출
- 단점: 사용자가 명령을 알아야 함. 비기술 창업자에게 학습 비용

### 결정 2. import 후 Reality Check 자동 갱신

#### 옵션 A. 갱신 안 함, 안내만
- 장점: import 책임이 명확(카탈로그 갈아끼우기까지). 비용 추가 없음
- 단점: reality-check.md가 이전 카탈로그 기준이라 살짝 어긋남(사용자가 안내 보고 알아야 함)

#### 옵션 B. 자동으로 RC 다시 돌림
- 장점: RC가 항상 새 카탈로그 기준
- 단점: LLM 호출 비용 한 번 더. import의 책임이 무거워짐

#### 옵션 C. `--refresh-rc` 플래그로 사용자가 선택
- 장점: 사용자 자율
- 단점: 플래그 학습 비용

### 결정 3. import 시 source 표시

#### 옵션 A. `custom`으로 박음 (ADR 0008 결정 3 예약 자리)
- 장점: ADR 0008과 정합. 미래 추적이 명확
- 단점: 어떤 외부 AI를 썼는지는 모름

#### 옵션 B. `custom:<adapter-hint>` 형식으로 사용자에게 적게 함
- 장점: 추적 정보 풍부
- 단점: 비기술 창업자가 무엇을 적을지 모름. 검증 어려움

## 결정

### 결정 1: 부산물 자동 생성 (옵션 B)

prospect 끝부분에 항상 `.byeorim/project/prompts/catalog-prompt.md`를 만든다. 사용자가 어떤 source를 골랐든(빌트인/AI/외부) 부산물이 자리잡는다. 사용자에게 한 줄 안내: "더 자세한 카탈로그를 원하시면 prompts/catalog-prompt.md를 외부 AI에 붙여넣고 응답을 `byeorim prospect import-catalog <file>` 명령으로 가져오세요".

쓰지 않는 사용자에게 약간의 노이즈가 되지만 prompts/는 한 디렉토리 안에 모여있어 시각적 부담이 작다. 그리고 사용자가 카탈로그 품질에 만족하지 못할 때 즉시 쓸 수 있는 결.

### 결정 2: 갱신 안 함, 안내 (옵션 A)

import-catalog 명령은 카탈로그만 갈아끼운다. reality-check.md는 그대로 둔다. 다만 한국어 안내를 띄운다.

```
카탈로그를 새로 가져왔어요.
reality-check.md는 이전 카탈로그 기준입니다. 새 카탈로그로 다시 보고 싶으시면
LLM 어댑터로 prospect를 다시 돌리거나, 후속 단계(smelt 이후)에서 자연스럽게 검토됩니다.
```

import 책임이 좁아 단위 테스트가 쉽고 한 결로 흐른다. 자동 갱신은 후속 명령(`byeorim prospect refresh-rc` 같은) 자리.

### 결정 3: source는 `custom` (옵션 A)

ADR 0008 결정 3의 예약 자리를 그대로 채운다. import한 카탈로그는 intent.yml의 source가 `custom`으로 박힌다. 어떤 외부 AI를 썼는지는 추적하지 않는다(사용자가 자유롭게 여러 AI를 시도할 자리이므로 한 어댑터로 묶지 않는다).

### prospect import-catalog 명령

```bash
byeorim prospect import-catalog <file>
```

- `<file>`은 사용자가 외부 AI에서 받은 yml 또는 yaml 파일 경로
- prospect 단계 또는 그 이후 단계 어디서든 호출 가능(state.yml의 current_stage가 prospect나 smelt 등 어디라도 OK). 단, intent.yml과 catalog.yml이 이미 있어야 함(prospect를 한 번은 끝내야 함)
- catalog.schema.json 검증 → 통과 시 catalog.yml 교체 + intent.yml의 source를 `custom`으로 갱신
- 검증 실패 시 한국어 에러로 첫 3개 오류 안내(--verbose 후속 자리)

이 명령은 7단계 메타포의 메인 명령이 아니다. prospect의 보조 명령 자리. ADR 0006의 7단계는 그대로다.

### catalog-prompt.md 형식

```markdown
# 카탈로그 생성 프롬프트

이 프롬프트를 Claude.ai, ChatGPT, Gemini 같은 AI에 붙여넣어 더 자세한 카탈로그를 받으세요.
응답을 yml 파일로 저장한 뒤 다음 명령으로 가져옵니다.

    byeorim prospect import-catalog <받은-파일.yml>

---

## AI에게 보낼 자리(여기서부터 끝까지 복사하세요)

너는 사용자가 만들고 싶은 서비스의 도메인 카탈로그를 만드는 도우미다.
[CATALOG_SYSTEM_PROMPT 본문 그대로]

## 사용자 답변

[7항목 답변을 JSON으로]

## 영감으로 쓸 빌트인 템플릿

[suggested_template 이름 또는 "없음"]

## 출력 형식

다음 모양의 YAML로 답해줘. 다른 설명 없이 YAML만.

[catalog.schema.json 부분집합 형식 안내와 짧은 예시]
```

## 결과

### 긍정적
- 비기술 창업자가 API 키 없이 외부 AI(Claude.ai 등)로 더 자세한 카탈로그를 받아올 길이 열림
- ADR 0008 결정 3의 `custom` 예약 자리가 드디어 구현됨. 미래 묶임이 풀림
- 절대 금지선 6번(벤더 무관) 강화: 사용자가 어떤 AI를 쓰든 catalog.schema.json만 통과하면 받아줌
- import 책임이 좁아 단위 테스트가 결정적이고 빠름

### 부정적 / 트레이드오프
- 부산물(catalog-prompt.md)이 모든 사용자에게 만들어짐. 쓰지 않는 사용자에게는 약간의 노이즈
- import 후 RC가 이전 카탈로그 기준이라 미세하게 어긋남(사용자가 안내로 알아야 함)
- 외부 AI가 만든 카탈로그가 검증 통과 못 하면 사용자가 다시 외부 AI에 가서 형식을 고쳐달라고 해야 함(흐름 마찰)
- prompt 자리에 catalog.schema.json 부분집합 형식 안내가 들어가서 한 번 어긋나면 사용자 응답이 검증 통과 못 할 위험. 명세 변경 시 prompt 자리도 함께 갱신 필요

### 미래 묶임
- catalog-prompt.md 형식은 표준. 변경하려면 ADR 또는 명세 갱신
- import-catalog 명령 시그니처(`<file>`)와 source 표시(`custom`)는 표준
- import 후 RC 자동 갱신은 후속 명령(`byeorim prospect refresh-rc` 같은) 자리. 별도 ADR
- 외부 AI 응답을 임시 파일로 받지 않고 stdin으로 받는 자리(파이프 결)는 후속 자리

## 링크
- 짝 결정: ADR 0008 결정 3 (custom 예약 자리), ADR 0006 (prospect 보조 명령)
- 관련 ADR: 0024(Claude API 어댑터), 0025(브릿지 URL), 0027(AI 카탈로그 생성)
- 명세: docs/specs/reality-check.md(RC가 이전 카탈로그 기준일 때 후속 처리 자리)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 2(절대 금지선 6번 벤더 무관)
