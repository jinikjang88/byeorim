# 벼림 (Byeorim)

[![CI](https://github.com/jinikjang88/byeorim/actions/workflows/ci.yml/badge.svg)](https://github.com/jinikjang88/byeorim/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)

> English: [README.en.md](README.en.md). 두 문서가 어긋나면 이 한국어판을 정본으로 본다.

벼림은 AI로 자기 서비스를 만들고 싶은 사람을 돕는 도구다. 막연한 아이디어를 곧장 코드로 바꾸기 전에, 그 서비스가 어떤 모양으로 이루어질지 함께 본다. AI는 동료처럼 꼼꼼히 묻는다. 답을 강요하지 않는다. 답하지 못한 질문은 다이어리에 남겨두고 함께 다음 단계로 간다.

자세한 배경은 [docs/MANIFESTO.md](docs/MANIFESTO.md)에서 본다.

## 누구를 위한 것인가

우선순위 순이다.

1. **카페 사장님, 학원 원장님 같은 도메인 전문가**. 아이디어와 자금은 있지만 코딩은 못 하는 분들
2. **신사업 개발자**. 새 도메인을 탐색하면서 시작점이 필요한 엔지니어
3. **시니어 개발자**. CLI와 YAML을 직접 만지고 싶은 파워 유저

3번 사용자만 도와주고 1번과 2번을 혼란스럽게 만드는 기능은 채택하지 않는다.

## 7단계로 만든다

벼림은 대장장이의 일곱 단계로 일을 진행한다. 각 단계가 끝나면 다음 단계로 자연스럽게 넘어간다.

| 단계 | 한국어 | 명령어 | 무엇을 하는가 |
|------|--------|--------|---------|
| 0 | 탐광 | `byeorim prospect` | 7가지 질문에 답하면서 만들고 싶은 서비스를 그린다. AI가 도메인 카탈로그(블럭 모음)를 가져온다 |
| 1 | 제련 | `byeorim smelt` | 카탈로그에서 필요한 블럭을 고른다. AI가 어울리는 블럭을 추천한다 |
| 2 | 빚다 | `byeorim shape` | 4가지 핵심을 정한다. 어떤 언어, 어떤 데이터베이스, 어떤 API 형태, 어떤 코드 구조 |
| 3 | 단조 | `byeorim forge` | API 계약을 만든다. AI가 입출력 데이터 모양을 채운다 |
| 4 | 다듬 | `byeorim temper` | 시나리오로 무엇을 검증할지 정한다. AI가 테스트 코드를 채운다 |
| 5 | 세움 | `byeorim set` | 실제 코드(Backend + Frontend)를 만든다 |
| 6 | 비춤 | `byeorim inspect` | 만든 서비스를 보안/성능/운영/확장성/법적/시장 6각도에서 점검한다 |

별칭이 있다. `prs`(prospect), `sml`(smelt), `shp`(shape), `frg`(forge), `tmr`(temper), `set`, `ins`(inspect).

이 외에 보조 명령이 있다.

| 명령어 | 무엇을 하는가 |
|---|---|
| `byeorim init` | 작업 공간을 만든다 (다른 명령 전에 한 번만) |
| `byeorim status` | 지금 어디까지 왔는지 본다 |
| `byeorim answer` | smelt에서 미뤄둔 질문에 답한다 |
| `byeorim run` | 만든 Backend + Frontend를 한 번에 띄운다 |
| `byeorim verify` | 만든 코드가 잘 컴파일되고 테스트가 통과하는지 본다. `--smoke` 옵션을 더하면 실제로 띄워서 살아있는지도 확인 |
| `byeorim <단계> import-review <응답파일>` | 외부 AI(Claude.ai/ChatGPT/Gemini 등)에서 받은 검토 응답을 다시 가져온다. smelt/shape/forge/temper/inspect 단계에서 모두 같은 결로 동작(아래 "외부 AI에 검토받기" 참고). prospect는 `import-catalog`로 카탈로그 자체를 교체 |

## 시작하기

```bash
npm install
node bin/byeorim.js init
node bin/byeorim.js prospect
```

prospect가 7가지 질문을 차례로 한다. 답하기 어려운 질문은 비워둬도 된다. 다이어리(`.byeorim/project/diary.md`)에 모인다. 만들면서 다시 돌아와 답할 수 있다.

prospect가 끝나면 두 결과가 만들어진다.

- **카탈로그**: 도메인의 블럭 모음(예: 결제, 환불, 배송)
- **시장 리포트** (`prospect-reality-check.md`): 시장 포화/진입 비용/법적 리스크 등 6각도 시각

비대화형으로 한 줄만 적고 싶다면 다음과 같이 한다.

```bash
node bin/byeorim.js prospect 동네 빵집 단골 주문 앱
```

## 외부 AI에 검토받기

각 단계가 끝나면 부산물로 검토용 프롬프트가 자동으로 만들어진다. 사용자는 그 프롬프트를 외부 AI(Claude.ai, ChatGPT, Gemini 등)에 그대로 붙여넣어 자세한 검토를 받을 수 있다.

```
.byeorim/project/prompts/
├── catalog-prompt.md                       # prospect: 더 자세한 카탈로그
├── block-review-prompt.md                  # smelt: 블럭 선택 검토
├── architecture-review-prompt.md           # shape: 아키텍처 검토
├── contracts-review-prompt.md              # forge: API 계약 검토
├── test-scenarios-review-prompt.md         # temper: 시나리오 검토
└── inspect-review-prompt.md                # inspect: 6각도 코드 검수
```

받은 답을 다시 벼림에 가져오는 명령도 있다. 단계마다 다음 명령을 쓴다.

```bash
node bin/byeorim.js prospect import-catalog ./응답.yml      # 카탈로그 교체
node bin/byeorim.js smelt import-review ./응답.md           # 블럭 추가/삭제
node bin/byeorim.js shape import-review ./응답.md           # 아키텍처 4가지 변경
node bin/byeorim.js forge import-review ./응답.md           # API 계약 갱신
node bin/byeorim.js temper import-review ./응답.md          # 시나리오 갱신
node bin/byeorim.js inspect import-review ./응답.md         # 검수 결과 추가
```

가져올 때 변경마다 "적용/건너뛰기/모두 적용" 등을 묻는다. 외부 AI가 가짜 안내를 줘도 사용자가 골라서 받을 수 있다.

## 만든 서비스를 띄워서 보기

`set` 단계가 끝나면 실제 Backend + Frontend 코드가 만들어진다. 두 서버를 한 번에 띄울 수 있다.

```bash
node bin/byeorim.js run
```

콘솔에 두 서버 출력이 `[backend]` / `[frontend]` 표시로 함께 나온다. Backend가 준비되면 "✓ ready: http://localhost:3000" 같은 안내가 박힌다. Ctrl-C로 두 서버를 한 번에 정리한다.

`--backend-only` 또는 `--frontend-only` 옵션으로 한쪽만 띄울 수도 있다.

CI나 배포 직전 검증은 `verify` 명령으로 한다.

```bash
node bin/byeorim.js verify          # 의존성 설치 + 테스트
node bin/byeorim.js verify --smoke  # 위 + 실제 띄워서 살아있는지 확인
```

## 만든 코드의 안전망

set 단계가 만드는 코드는 단순한 빈 껍질이 아니다. 처음부터 다음을 갖추고 나온다.

- **`/health` endpoint**: "내 서비스가 살아있다"를 확인하는 표준 주소
- **개발용 환경 변수(`.env`)**: 처음부터 동작하도록 채워져 나옴
- **운영용 환경 변수 템플릿(`.env.production`)**: 운영 배포 전에 채워야 할 자리만 표시
- **운영 안전 장치**: 운영 모드에서 개발용 값이 그대로 남아있으면 시작이 거부됨
- **메모리 데이터베이스**: 외부 DB 설치 없이도 첫 기동 가능

## 비춤(inspect) — 출시 직전 점검

7단계의 마지막 `inspect`는 만든 코드를 6각도에서 점검한다.

| 영역 | 무엇을 본다 |
|---|---|
| 보안 | 인증, 권한, 데이터 보호, 입력 검증 |
| 성능 | 응답 시간, 캐싱, 데이터베이스 효율 |
| 운영 | 모니터링, 로깅, 백업, 배포 |
| 확장성 | 사용자 증가 대응, 비동기 처리 |
| 법적 리스크 | 개인정보, 인허가, 미성년자 보호, 결제 규정 |
| 시장 재검 | prospect 단계에서 본 시장이 여전히 같은지 |

`inspect`는 세 가지 시각으로 결함을 모은다.

1. **자기 점검 질문**: 사용자가 직접 답하는 질문지(예: "백업 주기는 정하셨나요?")
2. **자동 코드 검수**: 만든 코드가 안전망을 갖췄는지 자동 검사 (예: "`/health` endpoint가 박혀있나요?")
3. **AI 검수**: AI가 도메인-특화 결함을 본다 (예: "결제 블럭의 amount에 음수 검증이 빠짐")

결과는 `inspect-report.md` 한 파일에 모인다. 결함마다 출처(`[자기 점검]` / `[자동 검수]` / `[AI 검수]`)와 심각도(✓ 통과 / ⚠ 검토 권장 / ✗ 출시 전 풀 자리)가 표시된다.

외부 AI에서 더 자세한 검수를 받고 싶으면 `inspect-review-prompt.md`를 외부 AI에 붙여넣고 받은 답을 `inspect import-review`로 가져온다.

## AI 어댑터 설정

`prospect`, `smelt`, `shape`, `forge`, `temper`, `inspect` 단계는 AI를 부른다. 기본은 `mock`이라 네트워크 호출도 비용도 없다. 흐름만 따라가 보고 싶다면 그대로 둔다.

실제 AI(Claude)를 쓰려면 환경 변수를 둔다.

| 환경 변수 | 값 | 무엇 |
| --- | --- | --- |
| `BYEORIM_AI_ADAPTER` | `mock` 또는 `claude` | 어떤 AI를 쓸지 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic API 키 (직접 호출 시) |
| `ANTHROPIC_BASE_URL` | `http://localhost:3000` 등 | API 키 없이 Claude Code 같은 도구를 거쳐 호출 |
| `BYEORIM_AI_MODEL` | `claude-opus-4-7` (기본) | 모델 변경 (선택) |

### 두 가지 호출 경로

**경로 1. Anthropic API 키로 직접**

```bash
export BYEORIM_AI_ADAPTER=claude
export ANTHROPIC_API_KEY=sk-ant-...
node bin/byeorim.js prospect "온라인 책방"
```

한 흐름을 끝까지 도는 비용은 일반적으로 1달러 미만이다.

**경로 2. Claude Code 같은 도구 거쳐서 (API 키 없이)**

이미 Claude Code를 쓰고 있다면 그것을 통해 우회할 수 있다. 비기술 창업자도 이 경로를 쓸 수 있다.

```bash
# 1) Claude Code 브릿지 도구를 띄운다 (도구마다 명령이 다름)
npx some-claude-bridge --port 3000

# 2) 벼림이 그곳을 보게 한다
export BYEORIM_AI_ADAPTER=claude
export ANTHROPIC_BASE_URL=http://localhost:3000
node bin/byeorim.js prospect "온라인 책방"
```

이 경로는 인증을 브릿지가 처리한다. 브릿지 도구는 외부 프로젝트라 벼림이 보증하지는 않는다. 사용자가 자기 환경에 맞는 도구를 고른다.

키도 baseURL도 없이 `BYEORIM_AI_ADAPTER=claude`를 켜면 한국어 안내로 멈춘다. 비용 걱정이 있으면 `BYEORIM_AI_ADAPTER`를 지우거나 `mock`으로 둔다.

## 약속

- **무료 오픈소스 프로토타입**이다. 유료 등급, 게이트 기능, 옵트인 없는 사용 정보 수집은 없다
- **모델 무관**이다. Claude, GPT, Gemini 어느 모델로도 `.byeorim/` 디렉토리를 읽을 수 있다
- **한국에서 시작된 글로벌 표준**을 지향한다

## 자세한 배경

각 단계의 결정 배경은 [docs/decisions/](docs/decisions/)에 ADR(Architecture Decision Records)로 정리되어 있다. ADR을 읽어야 벼림을 쓸 수 있는 것은 아니다. 위 명령어만으로 충분하다.

## 기여와 라이선스

벼림은 MIT 라이선스를 따르는 무료 오픈소스다. 한국어가 정본이고 영문판이 함께 있다.

- [LICENSE](LICENSE): MIT 라이선스 전문
- [CONTRIBUTING.md](CONTRIBUTING.md) ([English](CONTRIBUTING.en.md)): 기여 동선과 PR 흐름
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) ([English](CODE_OF_CONDUCT.en.md)): 행동 강령
- [SECURITY.md](SECURITY.md) ([English](SECURITY.en.md)): 보안 이슈 신고 채널
