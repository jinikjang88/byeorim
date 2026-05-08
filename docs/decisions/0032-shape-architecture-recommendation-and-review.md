# ADR 0032. Shape 아키텍처 추천과 검토 흐름

- 상태: 채택
- 날짜: 2026-05-04
- 결정자: DevSmith
- 관계: ADR 0009의 AiAdapter에 recommendArchitecture 추가. ADR 0012의 architecture.yml 형식과 4개 결정 자리는 그대로. ADR 0011의 의존성 주입 패턴 확장. ADR 0029의 결을 shape에 옮기는 자리
- 명세: [docs/specs/architecture-recommendation.md](../specs/architecture-recommendation.md)

## 맥락

smelt가 세 출시(ADR 0029/0030/0031)로 다 벼려졌다. AI 추천, 두 시점 reason, 외부 검토 프롬프트, picker 그룹화. 이제 사용자가 prospect로 자기 도메인을 그려 catalog.yml을 자리잡고, smelt에서 추천을 받아 블럭을 골라 selected-blocks.yml과 decisions.yml을 만든다. 그 다음 자리가 shape다.

ADR 0012가 shape의 4개 결정(language, database, api_style, architecture_pattern)과 architecture.yml의 평면 키-값 형식을 박았다. 코드는 단단하지만 1순위 사용자(비기술 창업자) 시점에서 두 자리가 비어있다.

첫째, picker가 4개 결정에 표준 옵션을 차례로 묻기만 한다. "어떤 언어로 만들 것인가요?"라는 질문 앞에서 카페 사장님은 막막해진다. prospect에서 정리한 답변과 smelt에서 고른 블럭이 shape의 추천에 활용되지 않는다. AI가 도와줄 자리가 비어있다.

둘째, 4개 결정을 다 고른 뒤 곧장 architecture.yml로 흘러간다. 한 번 멈춰 보여주는 자리가 없다. 동행 톤(ADR 0003 결정 2) 정신에 비추면 "이 네 자리를 이대로 가실래요?"라고 물을 자리가 비어있다.

이 두 자리를 한 결로 묶어 벼린다. smelt의 ADR 0029가 받은 결을 shape에 그대로 옮기는 자리다.

## 검토한 옵션

### 결정 1. 추천 메서드 자리

#### 옵션 A. AiAdapter에 새 메서드 recommendArchitecture 추가
- 장점: shape 안에서 호출이 자연스러움. ADR 0009 인터페이스 확장 결을 따름. mock과 claude가 같은 결로 구현. smelt의 recommendBlocks와 짝
- 단점: AiAdapter 메서드가 여섯 개로 늘어남(extractIntent, generateCatalog, generateRealityCheck, recommendBlocks, recommendArchitecture, extractSchema)

#### 옵션 B. recommendBlocks의 결과에 architecture 추천 묶기
- 장점: smelt 단계 LLM 호출이 한 번이면 끝. shape는 LLM 호출 없이 진행
- 단점: 추천이 smelt 시점에 박혀있어 사용자가 architecture를 다시 보거나 cascade 답안을 채운 뒤 다시 묻고 싶을 때 옛 추천이 남음. 시점 불일치. 한 메서드 책임이 두 단계로 갈라져 짝이 안 맞음

#### 옵션 C. 별도 명령 byeorim shape recommend
- 장점: 책임 분리 명확
- 단점: 사용자가 새 명령을 알아야 함. 비기술 창업자에게 학습 비용. 자연스러운 흐름 깨짐. smelt에서 옵션 C를 거절한 결과 같은 결

### 결정 2. picker 강조 방식

#### 옵션 A. [추천] 라벨 prefix와 user 시점 이유 description
- 장점: 단순. 사용자가 익숙한 옵션 위치(ADR 0012의 표준 순서)를 잃지 않음. @inquirer/prompts의 select가 description을 지원하므로 옵션을 선택할 때 한국어 풀이가 보임
- 단점: 4개 결정마다 하나씩 추천이 흩어짐. 한 결정에 옵션 두세 개라 한눈에 들어오는 건 OK

#### 옵션 B. 추천 옵션을 위로 정렬
- 장점: 추천이 한 자리에 모임
- 단점: 옵션 순서가 바뀜. 사용자가 두 번째 호출에서 다른 위치를 보면 혼란. ADR 0012의 표준 순서가 깨짐

#### 옵션 C. 추천에 default 표시(엔터로 바로 선택)
- 장점: 가장 부드러운 결. 사용자가 추천을 받아들이는 결정 비용이 낮음
- 단점: 사용자가 "왜 이게 default인지" 모른 채 엔터를 누르면 추천 신뢰가 약해짐. ADR 0012의 안전망(표준 옵션만 허용)과 결이 어긋날 수 있음

### 결정 3. 검토 단계 강제력

#### 옵션 A. 차단 없이 보여주기만
- 장점: 흐름 안 끊김
- 단점: 사용자가 안 읽고 넘어갈 위험

#### 옵션 B. "예/다시 고르기" 두 갈래 select
- 장점: 사용자가 한 번 멈춰 보고 결정. 동행 톤. "다시 고르기"가 막힘 자리를 풀어줌. smelt의 ADR 0029 결정 3과 짝
- 단점: 한 단계 추가됨. "다시 고르기"가 4개 결정을 모두 다시 묻게 됨(부분 재선택은 이번 출시 자리 아님)

#### 옵션 C. 4개 결정 각각에 "이대로 갈까요?" 묻기
- 장점: 결정마다 미세 조정 가능
- 단점: 4번 질문이 너무 많음. 비기술 창업자에게 부담. 흐름이 길어짐

### 결정 4. adapter 미구현 시 동작

#### 옵션 A. 에러로 중단
- 장점: 일관성
- 단점: shape는 prospect와 달리 LLM 호출이 필수가 아님(ADR 0012 결정 1의 4개 옵션이 표준이라 LLM 없이도 진행 가능). 에러는 과함

#### 옵션 B. 추천 없이 진행, 한국어 안내
- 장점: shape가 LLM 없이도 동작. 추천은 부가 가치. graceful degradation. smelt의 ADR 0029 결정 4와 짝
- 단점: 사용자가 추천을 기대했다가 못 받으면 미세하게 실망

## 결정

### 결정 1: AiAdapter에 recommendArchitecture 추가 (옵션 A)

ADR 0009의 AiAdapter에 새 메서드.

```ts
recommendArchitecture({
  answers: ProspectAnswers,
  catalog: Catalog,
  selectedBlocks: SelectedBlocks,
}): Promise<ArchitectureRecommendation>
```

selectedBlocks는 selected-blocks.yml의 모양(selected, auto_added, affected, prerequisites). 어댑터가 사용자가 고른 자리를 보고 추천을 다듬게 한다. 예를 들어 결제 블럭이 들어있으면 데이터베이스 추천이 관계형(postgresql/mysql) 쪽으로 기울 수 있다.

출력 모양은 4개 결정 키별 추천 값과 두 시점 이유.

```ts
{
  recommended: {
    language: 'node',
    database: 'postgresql',
    api_style: 'rest',
    architecture_pattern: 'modular-monolith',
  },
  reasons: {
    language: { user: '...', dev: '...' },
    database: { user: '...', dev: '...' },
    api_style: { user: '...', dev: '...' },
    architecture_pattern: { user: '...', dev: '...' },
  }
}
```

추천 값은 ADR 0012 결정 1의 표준 옵션 식별자(소문자)만 허용한다. 어댑터가 비표준 값을 돌려주면 어댑터 본체에서 안전망으로 비운다(picker에 [추천] 표시 안 함).

### 결정 2: [추천] 라벨 prefix와 user 시점 이유 description (옵션 A)

picker는 4개 결정 각각의 select에서 추천 옵션에 `[추천] ` prefix를 붙인다. user 시점 이유는 `description`으로 노출해 사용자가 옵션을 hover하거나 선택할 때 보인다. 옵션 순서는 ADR 0012의 표준 순서를 안 건드린다.

```
어떤 언어로 만들 것인가요?
❯ [추천] Node.js (JavaScript/TypeScript)
  Java (Spring Boot)
  Python (FastAPI/Django)
```

dev 시점은 picker에 노출하지 않는다(ADR 0030 결정 2의 결과 같은 결). 후속 작업 B(외부 검토 프롬프트)에서 부산물로만 보인다.

### 결정 3: "예/다시 고르기" 두 갈래 (옵션 B)

4개 결정을 다 고른 직후 확정 요약을 보여주고 select로 묻는다.

```
이 네 자리를 이대로 가실래요?
❯ 예, 진행
  아니오, 다시 고를게요
```

"다시 고를게요"를 누르면 4개 결정을 다시 고른다(picker 처음부터). 사용자 의지로 무한 루프 가능(차단 없음, 동행 톤). 부분 재선택(예: 언어만 다시)은 이번 출시 자리 아님. 4개 결정이 적어 다시 고르기 부담 작음.

### 결정 4: 추천 없이 진행, 한국어 안내 (옵션 B)

adapter가 없거나 recommendArchitecture 메서드를 구현하지 않으면 shape는 빈 추천(`recommended: {}`)으로 진행한다. picker에는 [추천] prefix 없이 ADR 0012의 표준 옵션이 그대로 보인다. 사용자에게 "이번 흐름은 AI 추천 없이 진행됩니다" 한 줄 안내.

## 결과

### 긍정적
- 비기술 창업자가 prospect 답변과 smelt 선택에 맞춘 [추천]을 보고 4개 결정 앞 막막함이 줄어듦
- 4개 결정을 다 고른 뒤 한 번 검토하는 자리가 생겨 "이대로 가도 되나?" 머뭇거림에 멈춤 자리를 줌
- AiAdapter 인터페이스가 한 결로 자라남(여섯 메서드). 새 어댑터(GPT, Gemini)도 같은 결로 구현
- adapter 미구현 시 graceful degradation으로 shape가 깨지지 않음. ADR 0012 흐름이 그대로 살아남
- ADR 0012의 architecture.yml 형식과 표준 옵션 식별자는 그대로(호환). 추천이 그 위에 얹히는 결

### 부정적 / 트레이드오프
- claude 어댑터를 쓰는 사용자에게 LLM 호출이 한 번 더 추가됨(prospect 셋 + smelt 한 번 + shape 한 번 = 다섯 번)
- 추천이 빗나가면 사용자가 [추천] 라벨에 끌려 도메인에 안 맞는 자리를 고를 위험. ADR 0012 결정 3(cascade 답안 직접 활용 안 함)과 결이 일관: 추천도 가이드일 뿐 사용자가 자유 선택
- 검토 단계 한 번 추가됨. 흐름이 살짝 길어짐. 4개 결정이 적어 부담 작음
- "다시 고를게요"가 4개 결정 모두 다시 묻기 때문에 부분 재선택 결이 비어있음. 후속 자리

### 미래 묶임
- recommendArchitecture 시그니처와 ArchitectureRecommendation 타입은 표준. 변경하려면 새 ADR
- [추천] prefix와 description 노출은 표준. 다른 시각 효과(아이콘, 색깔)는 별도 결정
- "예/다시 고르기" 두 갈래는 표준. 부분 재선택을 추가하려면 새 ADR
- selectedBlocks를 어댑터 입력에 넣은 결정으로 selected-blocks.yml 형식(ADR 0010)이 어댑터 입력 약속에 묶임. ADR 0010 변경 시 어댑터도 같이 봐야 함

## 링크
- 갱신 대상: ADR 0009 (AI 어댑터 인터페이스, recommendArchitecture 추가)
- 짝 결정: ADR 0012 (architecture.yml 형식과 4개 결정, 그대로 유지), ADR 0011 (인터랙티브 의존성 주입 패턴 확장)
- 결의 짝: ADR 0029 (smelt 추천 흐름, 같은 결을 shape에 옮김), ADR 0030 (두 시점 reason 형식 재사용)
- 동행 톤: ADR 0003 결정 2
- 입력 의존: ADR 0010 (selected-blocks.yml의 모양)
- 명세: docs/specs/architecture-recommendation.md
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(데이터 무관성)
