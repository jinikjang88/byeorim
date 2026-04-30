# 벼름 (Beoreum)

벼름은 AI로 자신의 서비스를 만들고 싶은 사람을 위한 협업 프로토콜이다. 막연한 아이디어를 곧장 코드로 바꾸기 전에, 그 서비스가 어떤 세계와 블럭으로 이루어질지 함께 본다. AI는 같이 회사를 키울 동료처럼 꼼꼼히 묻는다. 다만 답을 강요하지 않는다. 답하지 못한 질문은 다이어리에 남겨두고 함께 다음 단계로 간다.

자세한 배경은 [docs/MANIFESTO.md](docs/MANIFESTO.md)에서 읽는다.

## 7단계

벼름은 대장장이의 일곱 단계로 일을 진행한다. 명령어는 영문, 이름은 한국어로 병기한다. 처음에는 여섯이었고 ADR 0006으로 다듬과 비춤 사이에 세움이 들어와 일곱이 됐다.

| 단계 | 한국어 | 명령어 | 별칭 | 하는 일 |
|------|--------|--------|------|---------|
| 0 | 탐광 | `beoreum prospect` | `prs` | 도메인 카탈로그 발견과 Reality Check |
| 1 | 제련 | `beoreum smelt` | `sml` | 의도 추출, 블럭 선택, 의존성 해결 |
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
