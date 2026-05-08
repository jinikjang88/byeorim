# Architecture Recommendation 명세

ADR 0032의 결정 1을 따라 AiAdapter에 추가된 `recommendArchitecture` 메서드의 약속.
mock과 claude 어댑터, 그리고 미래의 다른 어댑터(GPT, Gemini)가 모두 이 명세를 지킨다.

## 인터페이스

```ts
recommendArchitecture({
  answers: ProspectAnswers,
  catalog: Catalog,
  selectedBlocks: SelectedBlocks,
}): Promise<ArchitectureRecommendation>
```

### 입력

- `answers`: prospect 7항목 답변(ADR 0026). 빈 객체일 수 있다(intent.yml schema_version 1 또는 모든 항목이 비어있는 경우)
- `catalog`: 카탈로그 객체(catalog.schema.json 통과). 어댑터는 catalog의 `blocks` 배열만 본다(다른 필드는 추천 결정에 안 씀)
- `selectedBlocks`: smelt 산출물(ADR 0010). selected/auto_added/affected/prerequisites 배열을 가진다. 어댑터는 사용자가 고른 자리를 보고 추천을 다듬는다

### 출력 (ArchitectureRecommendation)

```ts
{
  recommended: {
    language?: 'node' | 'java' | 'python',
    database?: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb',
    api_style?: 'rest' | 'graphql' | 'rpc',
    architecture_pattern?: 'monolith' | 'modular-monolith' | 'microservices',
  },
  reasons: {
    [key in keyof recommended]?: {
      user: string,  // 비개발자(1순위 사용자)가 읽는 한국어 일상어. 두세 줄 가능. 단축어 금지
      dev: string,   // 개발자가 읽는 기술 한 줄. 단축어(PG, DTO, API 등) 사용 가능
    }
  }
}
```

- `recommended`의 값은 ADR 0012 결정 1의 표준 옵션 식별자(소문자)만. 비표준 값은 어댑터 본체에서 안전망으로 비움
- 어떤 결정 키에 추천 못 할 자리가 있으면 그 키는 비워둠. 전부 비어있어도 됨(`recommended: {}`)
- `reasons`의 키는 `recommended`의 키 부분집합. 모든 추천에 이유가 있어야 하지는 않음
- `reasons[key].user`와 `reasons[key].dev`는 각각 빈 문자열 허용
- picker는 `reasons[key].user`만 보여줌(ADR 0032 결정 2). 비어있으면 prefix만 보임("[추천] PostgreSQL ...")
- `dev` 시점은 후속 부산물 자리에서만 노출(개발자가 외부 AI에 검토 부탁할 때 도움)

## 추천 기준 가이드

다음을 따라 어댑터를 구현한다(claude, GPT, Gemini 등 LLM 어댑터).

### 무엇을 보고 추천하는가

- 사용자의 `what`(만들고 싶은 것)이 거래성 서비스(주문/결제/예약)면 데이터베이스는 관계형(postgresql/mysql) 쪽
- 사용자의 `who`(누가 사용)와 `where`(어디서 사용)가 다양하면 api_style은 rest(보편)
- selectedBlocks의 selected/auto_added 합계가 5개 안팎이면 architecture_pattern은 monolith. 10개 이상이면 modular-monolith
- 사용자가 답하지 않은 항목은 추측하지 않는다(ADR 0026 정신)

### 무엇을 추천 안 하는가

- ADR 0012 결정 1의 표준 식별자 외의 값은 절대 돌려주지 않는다
- 도메인이 모호하면 그 결정 키를 비운다(억지로 채우지 않음)
- selectedBlocks가 비어있으면 architecture_pattern을 추천 못 할 자리. 비운다

### 이유 작성 결 (ADR 0030의 두 시점 결을 재사용)

**user 시점**(비개발자, 1순위 사용자)
- 일상 한국어. PG는 "결제대행사", DTO는 "데이터 모양", API는 "프로그램 사이의 약속" 같이 풀어쓰기
- 두세 줄 가능. 사용자 답변의 단어를 인용하면 친근
- 단정형보다 가능성형 결("가장 흔한 자리예요"보다 "가장 흔한 자리로 보여요")
- 마케팅 카피 형용사("강력한", "획기적인", "본질적인") 금지(CLAUDE.md 섹션 10)

**dev 시점**(개발자, 3순위 사용자)
- 정확한 기술 용어 OK. PG, DTO, API, REST, CRUD 같은 단축어 사용 가능
- 한 줄 권장. 트레이드오프, 운영 부담, 의존성을 짚을 수 있음

## mock 어댑터 결정적 휴리스틱

mock은 LLM 없이 도는 단위 테스트용 자리. 결정성과 형식만 보장한다.

### 추천 전략

`answers`와 `selectedBlocks`를 보지 않고 ADR 0012 결정 1의 4개 결정에 첫 옵션을 항상 추천한다.

- language: `'node'`
- database: `'postgresql'`
- api_style: `'rest'`
- architecture_pattern: `'monolith'`

### reasons (두 시점)

mock은 4개 결정 키 모두에 같은 한 줄을 채운다.

- user: `'흔히 시작하는 자리로 골라봤어요(자동 추천이라 도메인은 못 봐요)'`
- dev: `'mock heuristic: ADR 0012 default option'`

### 결정성

- 같은 입력은 항상 같은 추천(어떤 입력이든 위 4개 값이 그대로 나옴)
- answers와 selectedBlocks는 mock에서 결과에 영향 안 줌

## claude 어댑터 약속

### 시스템 프롬프트

한국어 본문. ADR 0012의 4개 결정 키와 표준 옵션 식별자를 표로 박는다. "표준 식별자 외 절대 돌려주지 않는다", "추측 강요 금지", "selectedBlocks를 보고 도메인에 어울리는 자리 고르기" 가이드 포함. 단축어 풀어쓰기 가이드(PG, DTO, API, REST, CRUD, SDK, JWT, OAuth 8개)는 ADR 0030에서 박은 결을 그대로 사용.

### structured output

JSON Schema가 `recommended`와 `reasons` 두 필드를 required로 박는다. recommended의 4개 결정 키는 각각 선택적(없을 수 있음). additionalProperties는 막아 비표준 키가 흘러들지 않게 한다.

### max_tokens

2048. 추천 결과는 평면 응답이라 카탈로그 합성(8192)보다 짧다. block-recommendation과 같은 자리.

### 안전망

LLM이 비표준 식별자(예: `'kotlin'`, `'redis'`)를 돌려주면 어댑터 본체가 그 키를 비운다. ADR 0012 결정 1의 표준 식별자만 통과한다. picker에는 [추천] 표시가 안 붙고, 사용자는 표준 옵션 전체에서 자유 선택.

## 외부 검토 프롬프트 부산물 (ADR 0033)

shape가 끝나면 항상 `.byeorim/project/prompts/architecture-review-prompt.md`가 자리잡는다. 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 마크다운을 그대로 붙여넣어 4개 결정의 도메인 적합성, 결정 사이 트레이드오프, 시작 무게를 자세히 검토받는 자리.

### 부산물에 담기는 정보

- 사용자 7항목 답변(intent.yml의 user_answers)
- 카탈로그 전체 blocks (id/name/user_desc/priority)
- 사용자가 고른 블럭(selected-blocks.yml의 selected/auto_added)
- 4개 결정과 사용자 선택값(architecture.yml의 language/database/api_style/architecture_pattern)
- 12개 표준 옵션 표(외부 AI가 다른 옵션과 비교한 검토를 줄 수 있도록)
- AI 추천 두 시점({user, dev}). picker는 user만 노출하지만 부산물에는 둘 다 담는다(개발자가 외부 AI에 검토 부탁할 때 도움)

### 외부 AI에 부탁하는 검토 항목

1. 도메인 적합성: 4개 결정이 사용자 도메인(7항목 답변 + 고른 블럭)에 잘 맞는지
2. 결정 사이 트레이드오프: 4개 결정이 서로 어떻게 영향을 주는지
3. 시작 무게: 지금 4개가 너무 무거우면 줄일 자리, 너무 가벼우면 키울 자리

### 단축어 풀어쓰기 가이드

ADR 0030의 단축어 가이드(PG, DTO, API, REST, CRUD, SDK, JWT, OAuth 8개)를 부산물 시스템 텍스트에 그대로 담는다. 외부 AI가 비기술 창업자 1순위 사용자에게 일상어로 답하도록 강제한다.

## 미래 자리

- 추천 점수(0~1)를 노출해 picker에서 강한 추천과 약한 추천을 구분하는 자리. 후속 ADR
- 부산물 응답을 다시 import하는 자리(예: `byeorim shape import-architecture-review`). 후속 ADR
- 4개 결정 외 추가 결정(인증, 캐시, 메시지 큐)에 대한 추천. ADR 0012가 결정 자리 추가를 별도 ADR로 미뤄둠
- 부분 재선택(예: 언어만 다시 고르기). 이번 출시는 "다시 고르기"가 4개 결정을 모두 다시 묻는다
