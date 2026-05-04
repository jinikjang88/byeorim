# 벼름 (Beoreum)

벼름은 AI로 자신의 서비스를 만들고 싶은 사람을 위한 협업 프로토콜이다. 막연한 아이디어를 곧장 코드로 바꾸기 전에, 그 서비스가 어떤 세계와 블럭으로 이루어질지 함께 본다. AI는 같이 회사를 키울 동료처럼 꼼꼼히 묻는다. 다만 답을 강요하지 않는다. 답하지 못한 질문은 다이어리에 남겨두고 함께 다음 단계로 간다.

자세한 배경은 [docs/MANIFESTO.md](docs/MANIFESTO.md)에서 읽는다.

## 7단계

벼름은 대장장이의 일곱 단계로 일을 진행한다. 명령어는 영문, 이름은 한국어로 병기한다. 처음에는 여섯이었고 ADR 0006으로 다듬과 비춤 사이에 세움이 들어와 일곱이 됐다.

| 단계 | 한국어 | 명령어 | 별칭 | 하는 일 |
|------|--------|--------|------|---------|
| 0 | 탐광 | `beoreum prospect` | `prs` | 7항목 동행 질문, 카탈로그 선택, Reality Check 6영역 |
| 1 | 제련 | `beoreum smelt` | `sml` | AI 추천 + 블럭 선택 + 의존성 해결 + 검토 |
| 2 | 빚다 | `beoreum shape` | `shp` | 아키텍처 결정과 ADR 기록 |
| 3 | 단조 | `beoreum forge` | `frg` | 계약 우선 정의(contracts.yml) |
| 4 | 다듬 | `beoreum temper` | `tmr` | Given-When-Then 테스트 의도 |
| 5 | 세움 | `beoreum set` | `set` | 산출물 합성과 코드 스켈레톤 생성 |
| 6 | 비춤 | `beoreum inspect` | `ins` | 6영역 다관점 리뷰 |

## 시작하기

아직 v0.1.0 골격만 갖춘 상태다. 명령어는 등록되어 있지만 구현은 단계별로 채워진다.

```bash
npm install
node bin/beoreum.js --help
```

## 탐광 한 번 돌려보기

탐광은 세 자리를 함께 다룬다. 7항목 차례 질문으로 사용자의 서비스를 그리고(ADR 0026), 카탈로그 출처를 4지선다로 고르고(ADR 0027), 마지막으로 Reality Check 6영역으로 광맥의 가치를 본다(ADR 0003). 모든 자리에서 답을 강요하지 않는다. 빈 자리는 다이어리로 흘러간다.

```bash
node bin/beoreum.js init
node bin/beoreum.js prospect
```

다이어리(`.beoreum/project/diary.md`)에는 두 머리가 자리한다. `prospect 의도에서 미뤄둔 질문`은 7항목에서 비운 자리, `Reality Check에서 미뤄둔 질문`은 6영역의 모든 질문. Reality Check 리포트는 `.beoreum/project/reality-check.md`에서 영역별 AI 관찰과 함께 본다.

## 제련 한 번 돌려보기

prospect가 끝나면 smelt가 같은 카탈로그 위에서 블럭을 고르는 자리다. AI 어댑터가 prospect 답변을 보고 어울리는 블럭을 추천하고(ADR 0029), picker에서 [추천] 라벨로 강조한다. 사용자가 선택하면 의존성 해결 결과(자동 추가, 영향받는 자리, 준비물)를 한 화면에서 검토한 뒤 진행할지 다시 고를지 정한다.

```bash
node bin/beoreum.js smelt
```

mock 어댑터는 카탈로그가 핵심으로 표시한 블럭(priority='required')을 우선 추천하고, 그 외에는 카탈로그 순서대로 5개를 채운다. claude 어댑터를 쓰면 사용자 도메인에 맞춘 추천을 받는다(LLM 호출 한 번 더 추가). 추천 이유는 두 시점으로 적힌다(ADR 0030). 비개발자(1순위 사용자)가 picker에서 일상어로 짧게 보고, 개발자가 외부 AI 검토 프롬프트에서 기술 한 줄을 본다.

picker는 카탈로그의 시각 구조 그대로 보여준다(ADR 0031). 세계(world) 단위 머리와 번들(bundle) 단위 소제목 두 단계로 그룹화돼 있어, commerce처럼 30개 블럭이 든 카탈로그도 막막함이 줄어든다. 한 블럭에 커서를 올리면 user_desc 외에 priority(필수 자리), 예상 작업 일수, 주의 항목까지 한 단락으로 보인다. 선택 검토 단계에서는 자동 추가/영향/준비물이 영문 ID 대신 한국어 이름과 한 줄 설명으로 풀어쓰여 비기술 창업자도 자동으로 따라온 자리가 무엇인지 한눈에 본다.

### 외부 AI로 블럭 더 자세히 검토받기 (ADR 0030)

smelt가 끝나면 부산물로 `.beoreum/project/prompts/block-review-prompt.md`가 자리잡는다. 사용자가 고른 블럭 + 의존성 결과 + 카탈로그 전체 + AI 추천이 한 자리에 묶여 있어 외부 AI(Claude.ai/ChatGPT/Gemini 등)에 그대로 붙여넣으면 "잘 맞는 부분, 빠진 자리, 시작 무게"를 자세히 검토받는다. 응답은 자유 형식이라 사용자가 읽고 selected-blocks.yml을 다듬거나 smelt를 다시 돌릴 수 있다.

### 외부 AI로 더 자세한 카탈로그 받기 (ADR 0028)

prospect가 끝나면 부산물로 `.beoreum/project/prompts/catalog-prompt.md`가 자리잡는다. API 키 없이 Claude.ai, ChatGPT, Gemini 같은 외부 AI에 그 프롬프트를 그대로 붙여넣어 더 자세한 카탈로그를 받을 수 있다. 응답을 yml 파일로 저장한 뒤 다음 명령으로 가져온다.

```bash
node bin/beoreum.js prospect import-catalog ./received-catalog.yml
```

가져오는 시점에 catalog.schema.json 검증이 자동으로 돌고, 통과하면 `.beoreum/project/catalog/catalog.yml`을 교체하고 intent.yml의 source를 `custom`으로 박는다. reality-check.md는 이전 카탈로그 기준 그대로 두고 사용자에게 한국어로 안내한다.

비대화형으로 한 줄만 적고 싶다면 다음과 같이 한다. 나머지 6개는 비어 다이어리로 흘러간다.

```bash
node bin/beoreum.js prospect 동네 빵집 단골 주문 앱
```

## AI 어댑터 설정

`prospect`와 `forge` 단계는 AI 어댑터를 부른다. 기본은 `mock`이라 네트워크 호출도 비용도 없다. 흐름만 따라가 보고 싶다면 환경 변수를 건드리지 않아도 된다.

실제 LLM을 쓰려면 환경 변수를 둔다.

| 환경 변수 | 값 | 설명 |
| --- | --- | --- |
| `BEOREUM_AI_ADAPTER` | `mock` (기본) 또는 `claude` | 어떤 어댑터를 쓸지 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | `claude` 어댑터를 쓸 때 필요. https://console.anthropic.com 에서 발급 |
| `ANTHROPIC_BASE_URL` | `http://localhost:3000` 등 | 외부 브릿지를 통해 호출할 때(아래 절). API 키 대신 쓸 수 있음 |
| `BEOREUM_AI_MODEL` | `claude-opus-4-7` (기본) 등 | 모델을 바꾸고 싶을 때만. 예: `claude-sonnet-4-6`, `claude-haiku-4-5` |

### 경로 1. Anthropic API 키로 직접 호출

```bash
export BEOREUM_AI_ADAPTER=claude
export ANTHROPIC_API_KEY=sk-ant-...
node bin/beoreum.js prospect "온라인 책방"
```

한 흐름을 끝까지 돌리는 비용은 일반적으로 1달러 미만이다(`claude-opus-4-7` 기준, prompt caching 적용). 비용을 더 줄이려면 `BEOREUM_AI_MODEL=claude-sonnet-4-6` 같이 모델을 낮춘다.

### 경로 2. Claude Code 등 브릿지 서버로 호출

Anthropic API 키가 없거나, 이미 Claude Code 같은 도구로 Claude에 접근하고 있다면 브릿지 서버를 통해 우회할 수 있다. 브릿지는 Anthropic API 형식을 흉내 내는 로컬 프록시(예: `claude-code-router` 같은 외부 도구)다. 벼름은 그쪽으로 호출만 보낸다.

```bash
# 1) 브릿지 서버를 띄운다(외부 도구. 예시 명령은 도구마다 다름)
npx some-claude-bridge --port 3000

# 2) 벼름이 브릿지를 보게 한다
export BEOREUM_AI_ADAPTER=claude
export ANTHROPIC_BASE_URL=http://localhost:3000
node bin/beoreum.js prospect "온라인 책방"
```

이 경로에서는 `ANTHROPIC_API_KEY`를 두지 않아도 된다. 인증은 브릿지가 처리한다. 브릿지 도구는 외부 프로젝트라 벼름이 보증하지 않는다. 사용자가 자기 환경에 맞는 도구를 고른다.

### 안내

키도 baseURL도 없이 `BEOREUM_AI_ADAPTER=claude`를 켜면 한국어 안내 메시지로 멈춘다. 두 경로 중 하나를 알려준다. 비용 걱정이 있으면 `BEOREUM_AI_ADAPTER`를 지우거나 `mock`으로 두면 된다.

배경은 [ADR 0024](docs/decisions/0024-claude-llm-adapter.md)와 [ADR 0025](docs/decisions/0025-ai-base-url-for-bridge-compatibility.md)에 정리되어 있다.

## 누구를 위한 것인가

우선순위 순이다.

1. 비기술 창업자. 아이디어와 자금은 있지만 코딩은 못 하는 사람들
2. 신사업 개발자. 새 도메인을 탐색하면서 발판이 필요한 엔지니어
3. 시니어 개발자. CLI와 YAML을 직접 다루고 싶은 파워 유저

3번 사용자만 도와주고 1번과 2번을 혼란스럽게 만드는 기능은 채택하지 않는다.

## 약속

- 무료 오픈소스 프로토타입이다. 유료 등급, 게이트 기능, 옵트인 없는 텔레메트리는 없다
- 모델 무관이다. Claude, GPT, Gemini 어느 모델로도 .beoreum/ 디렉토리를 읽을 수 있다
- 한국에서 시작된 글로벌 표준을 지향한다

## 라이선스

MIT 라이선스.
