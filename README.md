# 벼름 (Beoreum)

벼름은 AI로 자신의 서비스를 만들고 싶은 사람을 위한 협업 프로토콜이다. 막연한 아이디어를 곧장 코드로 바꾸기 전에, 그 서비스가 어떤 세계와 블럭으로 이루어질지 함께 본다. AI는 같이 회사를 키울 동료처럼 꼼꼼히 묻는다. 다만 답을 강요하지 않는다. 답하지 못한 질문은 다이어리에 남겨두고 함께 다음 단계로 간다.

자세한 배경은 [docs/MANIFESTO.md](docs/MANIFESTO.md)에서 읽는다.

## 6단계

벼름은 대장장이의 여섯 단계로 일을 진행한다. 명령어는 영문, 이름은 한국어로 병기한다.

| 단계 | 한국어 | 명령어 | 별칭 | 하는 일 |
|------|--------|--------|------|---------|
| 0 | 탐광 | `beoreum prospect` | `prs` | 도메인 카탈로그 발견과 Reality Check |
| 1 | 제련 | `beoreum smelt` | `sml` | 의도 추출, 블럭 선택, 의존성 해결 |
| 2 | 빚다 | `beoreum shape` | `shp` | 아키텍처 결정과 ADR 기록 |
| 3 | 단조 | `beoreum forge` | `frg` | 계약 우선 구현과 코드 생성 |
| 4 | 다듬 | `beoreum temper` | `tmr` | 자동 검증과 Given-When-Then 테스트 |
| 5 | 비춤 | `beoreum inspect` | `ins` | 다관점 리뷰 |

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
| `BEOREUM_AI_MODEL` | `claude-opus-4-7` (기본) 등 | 모델을 바꾸고 싶을 때만. 예: `claude-sonnet-4-6`, `claude-haiku-4-5` |

```bash
# mock 그대로 (기본)
node bin/beoreum.js prospect "온라인 책방"

# Claude로 전환
export BEOREUM_AI_ADAPTER=claude
export ANTHROPIC_API_KEY=sk-ant-...
node bin/beoreum.js prospect "온라인 책방"
```

키가 없는데 `claude`를 켜면 한국어 안내 메시지로 멈춘다. 비용 걱정이 있으면 `BEOREUM_AI_ADAPTER`를 지우거나 `mock`으로 두면 된다.

배경은 [ADR 0024](docs/decisions/0024-claude-llm-adapter.md)에 정리되어 있다.

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
