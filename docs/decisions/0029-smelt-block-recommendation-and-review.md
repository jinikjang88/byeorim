# ADR 0029. Smelt 블럭 추천과 선택 검토

- 상태: 채택
- 날짜: 2026-05-04
- 결정자: DevSmith
- 관계: ADR 0009의 AiAdapter에 recommendBlocks 추가. ADR 0010의 산출물 형식은 그대로. ADR 0011의 의존성 주입 패턴 확장
- 명세: [docs/specs/block-recommendation.md](../specs/block-recommendation.md)

## 맥락

prospect가 세 출시로 다 벼려졌다. 7항목 동행 질문, AI 카탈로그 생성, Reality Check, 외부 프롬프트 경로. 이제 사용자가 prospect를 끝내면 자기 도메인이 그려진 catalog.yml이 자리잡고 다음 단계로 간다. 그 다음 자리가 smelt다.

현재 smelt는 코드가 단단하지만 1순위 사용자(비기술 창업자) 시점에서 두 자리가 비어있다.

첫째, picker가 카탈로그 블럭을 "order — 주문" 형태로만 보여준다. commerce 카탈로그는 30개가 넘는 블럭을 가진다. 카페 사장님이 "내 빵집에는 무엇을 골라야 하지?" 막막해진다. prospect에서 이미 7항목으로 자기 도메인을 그렸는데, 그 답변이 smelt에서 활용되지 않는다. AI가 도와줄 자리가 비어있다.

둘째, 사용자가 블럭을 고르면 `resolveAll`이 자동으로 requires 체인을 따라가 auto_added를 더한다. 사용자가 3개 골랐는데 8개가 산출물에 들어간다. selected-blocks.yml을 열어보지 않으면 무엇이 추가됐는지 모른다. 동행 톤(ADR 0003 결정 2) 정신에 비추면 한 번 멈춰 보여주고 "이대로 갈까요?" 묻는 자리가 비어있다.

이 두 자리를 한 결로 묶어 벼린다.

## 검토한 옵션

### 결정 1. 추천 메서드 자리

#### 옵션 A. AiAdapter에 새 메서드 recommendBlocks 추가
- 장점: smelt 안에서 호출이 자연스러움. ADR 0009 인터페이스 확장 결을 따름. mock과 claude가 같은 결로 구현
- 단점: AiAdapter 메서드가 다섯 개로 늘어남(extractIntent, generateCatalog, generateRealityCheck, recommendBlocks, extractSchema)

#### 옵션 B. prospect의 generateCatalog 결과에 추천 묶기
- 장점: prospect가 한 번에 끝내면 smelt가 LLM 호출 없이 진행
- 단점: 추천이 prospect 시점에 박혀있어 사용자가 카탈로그를 import-catalog로 교체해도 옛 추천이 남음. 시점 불일치

#### 옵션 C. 별도 명령 beoreum smelt recommend
- 장점: 책임 분리 명확
- 단점: 사용자가 새 명령을 알아야 함. 비기술 창업자에게 학습 비용. 자연스러운 흐름 깨짐

### 결정 2. picker 강조 방식

#### 옵션 A. [추천] 라벨 prefix
- 장점: 단순. 사용자가 익숙한 위치(catalog 순서)를 잃지 않음
- 단점: 추천이 흩어져 있으면 한눈에 안 들어옴

#### 옵션 B. 추천 블럭만 위로 정렬
- 장점: 추천이 한 자리에 모임
- 단점: 카탈로그 순서가 바뀜. 사용자가 두 번째 호출에서 다른 위치를 보면 혼란

#### 옵션 C. 둘 다(prefix + 정렬)
- 장점: 가장 강한 시각 효과
- 단점: 변경이 무거움

### 결정 3. 검토 단계 강제력

#### 옵션 A. 차단 없이 보여주기만
- 장점: 흐름 안 끊김
- 단점: 사용자가 안 읽고 넘어갈 위험

#### 옵션 B. "예/다시 고르기" 두 갈래 select
- 장점: 사용자가 한 번 멈춰 보고 결정. 동행 톤. "다시 고르기"가 막힘 자리를 풀어줌
- 단점: 한 단계 추가됨

#### 옵션 C. 예/아니오/자세히 셋
- 장점: 자세히 옵션이 더 풍부한 정보 제공
- 단점: 선택 부담 증가. "자세히"의 의미가 모호

### 결정 4. adapter 미구현 시 동작

#### 옵션 A. 에러로 중단
- 장점: 일관성
- 단점: smelt는 prospect와 달리 LLM 호출이 필수가 아님(catalog가 이미 자리잡음). 에러는 과함

#### 옵션 B. 추천 없이 진행, 한국어 안내
- 장점: smelt가 LLM 없이도 동작. 추천은 부가 가치. graceful degradation
- 단점: 사용자가 추천을 기대했다가 못 받으면 미세하게 실망

## 결정

### 결정 1: AiAdapter에 recommendBlocks 추가 (옵션 A)

ADR 0009의 AiAdapter에 새 메서드.

```ts
recommendBlocks({ answers: ProspectAnswers, catalog: Catalog }): Promise<BlockRecommendation>
```

출력 모양은 추천 블럭 ID 배열과 블럭별 짧은 한국어 추천 이유.

```ts
{
  recommended: ['order', 'payment'],
  reasons: { order: '빵집 단골 주문이 핵심 흐름', payment: '주문과 짝' }
}
```

### 결정 2: [추천] 라벨 prefix (옵션 A)

picker는 추천 블럭에 `[추천] ` prefix를 붙인다. 가능하면 같은 줄 끝에 `(이유: ...)`를 추가한다. 카탈로그 순서는 안 건드린다.

### 결정 3: "예/다시 고르기" 두 갈래 (옵션 B)

선택을 마친 직후 의존성 해결 결과(선택 N개, 자동 추가 M개, 영향받는 K개, prereq Q개)를 표로 출력하고 select로 묻는다.

```
이대로 다음 단계로 갈까요?
❯ 예, 진행
  아니오, 다시 고를게요
```

"다시 고를게요"를 누르면 picker가 다시 뜬다. 사용자 의지로 무한 루프 가능(차단 없음, 동행 톤).

### 결정 4: 추천 없이 진행, 한국어 안내 (옵션 B)

adapter가 없거나 recommendBlocks 메서드를 구현하지 않으면 smelt는 빈 추천(`recommended: []`)으로 진행한다. picker에는 [추천] prefix 없이 카탈로그가 그대로 보인다. 사용자에게 "이번 흐름은 AI 추천 없이 진행됩니다" 한 줄 안내(verbose 자리는 후속).

## 결과

### 긍정적
- 비기술 창업자가 prospect 답변에 맞춘 [추천] 블럭을 보고 막막함이 줄어듦
- 의존성 해결 결과를 한 번 검토하는 자리가 생겨 "갑자기 8개가 들어가있네?" 놀람을 줄임
- AiAdapter 인터페이스가 한 결로 자라남(extractIntent, generateCatalog, generateRealityCheck, recommendBlocks, extractSchema 다섯 메서드). 새 어댑터(GPT, Gemini)도 같은 결로 구현
- adapter 미구현 시 graceful degradation으로 smelt가 깨지지 않음

### 부정적 / 트레이드오프
- claude 어댑터를 쓰는 사용자에게 LLM 호출 한 번 더 추가됨(prospect의 셋 + smelt의 한 번 = 네 번)
- 추천이 빗나가면 사용자가 [추천] 라벨에 끌려 잘못 고를 위험. 추천은 가이드일 뿐 사용자가 자유 선택 가능. 한 줄 안내로 명시
- 검토 단계 한 번 추가됨. 흐름이 살짝 길어짐
- intent.yml schema_version 1 사용자(이전 출시)는 user_answers가 없음. 빈 객체 폴백으로 추천이 빈 배열 → graceful

### 미래 묶임
- recommendBlocks 시그니처와 BlockRecommendation 타입은 표준. 변경하려면 새 ADR
- [추천] prefix 표기는 표준. 다른 시각 효과(아이콘, 색깔)를 추가하려면 별도 결정
- "예/다시 고르기" 두 갈래는 표준. 셋 이상으로 늘리려면 새 ADR
- intent.yml의 user_answers 필드 의존이 강해짐. ADR 0026의 schema_version 2가 사실상 smelt의 입력 약속이 됨

## 링크
- 갱신 대상: ADR 0009 (AI 어댑터 인터페이스, recommendBlocks 추가)
- 짝 결정: ADR 0010 (smelt 산출물, 그대로 유지), ADR 0011 (인터랙티브 의존성 주입 패턴 확장)
- 동행 톤: ADR 0003 결정 2
- 입력 의존: ADR 0026 (intent.yml schema_version 2의 user_answers)
- 명세: docs/specs/block-recommendation.md
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(데이터 무관성)
