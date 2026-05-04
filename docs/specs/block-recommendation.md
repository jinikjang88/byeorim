# Block Recommendation 명세

ADR 0029의 결정 1을 따라 AiAdapter에 추가된 `recommendBlocks` 메서드의 약속.
mock과 claude 어댑터, 그리고 미래의 다른 어댑터(GPT, Gemini)가 모두 이 명세를 지킨다.

## 인터페이스

```ts
recommendBlocks({
  answers: ProspectAnswers,
  catalog: Catalog,
}): Promise<BlockRecommendation>
```

### 입력

- `answers`: prospect 7항목 답변(ADR 0026). 빈 객체일 수 있다(intent.yml schema_version 1 또는 모든 항목이 비어있는 경우)
- `catalog`: 카탈로그 객체(catalog.schema.json 통과). 어댑터는 catalog의 `blocks` 배열만 본다(다른 필드는 추천 결정에 안 씀)

### 출력 (BlockRecommendation)

```ts
{
  recommended: string[],          // 추천 블럭 ID 배열(우선순위 순, 최대 10개)
  reasons: { [blockId: string]: string }  // 추천 이유 한국어 한 줄
}
```

- `recommended`는 catalog.blocks에 실재하는 ID만. 추천 못 할 때 빈 배열
- `reasons`의 키는 `recommended`의 ID 부분집합. 모든 추천 블럭에 이유가 있어야 하지는 않음(일부만 있어도 OK)
- 이유가 없는 블럭은 picker에서 prefix만 보임("[추천] order — 주문")
- 이유가 있는 블럭은 picker에서 prefix + 이유("[추천] order — 주문 (이유: ...)")

## 추천 기준 가이드

다음을 따라 어댑터를 구현한다(claude, GPT, Gemini 등 LLM 어댑터).

### 무엇을 추천하는가
- 사용자의 `what`(만들고 싶은 것)과 직접 연결된 블럭을 가장 먼저 추천
- 사용자의 `why`(만드는 이유)를 푸는 자리가 있는 블럭을 그 다음
- 카탈로그의 `priority='required'` 블럭이 도메인 핵심이라 사용자 답변과 무관하게 우대 가능
- 사용자가 답하지 않은 항목(빈 자리)은 추측하지 않는다(ADR 0026 정신)

### 무엇을 추천 안 하는가
- 한 번 시작에 너무 많은 블럭(>10개)은 비기술 창업자에게 압도. 5~7개 권장
- 카탈로그에 없는 ID는 절대 추천하지 않는다(picker에서 의미 없음)
- 사용자 답변과 무관해 보이는 블럭은 비운다(억지로 채우지 않음)

### 이유 작성 결
- 한 줄(50자 이내)로 끝내기. picker 한 줄에 들어가야 함
- 단정형보다 가능성형 결("핵심 흐름이에요" 보다 "핵심 흐름으로 보여요")
- 마케팅 카피 형용사("강력한", "획기적인") 금지(CLAUDE.md 섹션 10)
- 사용자 답변의 단어를 인용하면 더 친근

## mock 어댑터 결정적 휴리스틱

mock은 LLM 없이 도는 단위 테스트용 자리. 결정성과 형식만 보장한다.

### 추천 전략(우선순위 순)
1. catalog의 `blocks` 중 `priority === 'required'`인 자리를 모두 추천
2. 위에서 5개 미만이면 부족분을 catalog 순서대로 채워 5개로
3. 추천이 10개를 넘으면 앞 10개로 자른다

### reason
- `priority='required'` 블럭: `'카탈로그가 핵심으로 표시한 자리'`
- 그 외 블럭: `'카탈로그 순서 기준 추천(mock)'`

### 빈 입력 처리
- catalog가 비어있거나 blocks가 빈 배열이면 `{ recommended: [], reasons: {} }`
- answers가 모두 비어있어도 위 휴리스틱대로 동작(answers는 mock에서 안 씀)

### 결정성
- 같은 catalog는 항상 같은 추천. answers는 mock에서 결과에 영향 안 줌
- 단위 테스트는 추천 ID 배열을 정확히 단언 가능

## claude 어댑터 약속

### 시스템 프롬프트
한국어 본문. 7항목 답변과 catalog의 blocks 목록을 보여주고 추천 + 이유를 요청.
"추측 강요 금지", "비어있는 답변은 비어있는 자리로", "도메인에 안 맞으면 빈 추천" 가이드 포함.

### structured output
JSON Schema가 `recommended`(string array)와 `reasons`(object) 두 필드를 required로 박는다. additionalProperties 비허용.

### max_tokens
2048. 추천 결과는 평면 응답이라 카탈로그 합성(8192)보다 짧다. intent 추출(1024)보다는 약간 더 자리 줘서 이유 적기 여유.

### 검증
어댑터가 catalog에 없는 ID를 돌려주면 smelt 호출 자리에서 필터링한다. 어댑터 자체는 LLM 출력을 그대로 통과시킨다.

## 미래 자리

- 추천 점수(0~1)를 노출해 picker에서 강한 추천과 약한 추천을 구분하는 자리. 후속 ADR
- "왜 이 블럭이 추천 안 됐나?" 묻는 reverse 추천. 후속 자리
- 사용자가 추천을 그대로 받아 들이면 "이 추천에 만족하시나요?" 피드백을 다이어리에 기록. 후속 자리
