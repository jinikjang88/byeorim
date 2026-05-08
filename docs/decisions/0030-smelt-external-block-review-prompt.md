# ADR 0030. Smelt 외부 AI 블럭 검토 프롬프트와 두 시점 추천 이유

- 상태: 채택
- 날짜: 2026-05-05
- 결정자: DevSmith
- 관계: ADR 0028(prospect 외부 프롬프트 경로)과 짝. ADR 0029(smelt 추천)의 reasons 형식 갱신

## 맥락

ADR 0028로 prospect는 catalog-prompt.md를 부산물로 만들어 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 카탈로그를 검토받게 했다. ADR 0029로 smelt는 AI 추천을 picker에 [추천] 라벨로 보여주고 의존성 검토 단계를 더했다. 두 자리는 도왔지만 1순위 사용자(비기술 창업자) 시점에서 두 한계가 드러났다.

첫째, 추천 이유가 한 줄이라 깊이가 얕다. picker 한 화면에 들어가는 한계가 있어서 "핵심 흐름으로 보여요" 정도로 끝난다. 비개발자는 "이 블럭이 진짜 내 빵집에 맞나? 빠진 자리는 없나?" 같은 자리에서 더 풍부한 검토를 원한다.

둘째, claude 어댑터의 추천 이유에 단축어가 들어갈 위험이 있다. PG, DTO, API 같은 자리가 비개발자에게 막막하다. 이유에 무엇을 못 쓰는지 강제할 자리가 비어있다.

셋째, smelt의 결과(선택 블럭 + 의존성 + 카탈로그)를 외부 AI에 보여주고 "이 결정을 같이 검토해줘"라고 부탁할 자리가 비어있다. ADR 0028이 prospect에 깐 길의 짝이 smelt에는 없다.

이 셋을 한 결로 묶어 벼린다. 추천 이유를 두 시점(일반 사용자/개발자)으로 분리하고, smelt 끝에 외부 AI 검토 프롬프트를 부산물로 만든다.

## 검토한 옵션

### 결정 1. 추천 이유 모양

#### 옵션 A. 한 줄 string 유지
- 장점: 단순. 변경 없음
- 단점: 비개발자/개발자 중 한쪽만 챙김. 단축어 풀어쓰기 강제가 어려움

#### 옵션 B. 두 시점 객체 (`{ user, dev }`)
- 장점: 비개발자 친근한 톤과 개발자 정확한 톤이 한 자리에 같이 산다. picker는 user만, prompt 부산물은 둘 다 보임
- 단점: schema가 복잡해짐(객체 중첩)

#### 옵션 C. 두 분리 맵 (`reasons_user`, `reasons_dev`)
- 장점: schema가 평면적
- 단점: 한 블럭의 두 시점이 떨어져 살아 추적이 흩어짐

### 결정 2. picker에 어느 시점을 보여줄지

#### 옵션 A. user 시점만
- 장점: 비기술 창업자(1순위 사용자)가 picker에서 막힘 없이 읽음. picker 한 줄 한계와 정합
- 단점: 개발자(3순위 사용자)는 picker만 보면 dev 시점 못 봄

#### 옵션 B. user 우선, dev 폴백
- 장점: user가 비어있으면 dev로 떨어짐
- 단점: 두 시점이 모두 비어있을 때 처리 자리 추가

#### 옵션 C. 둘 다 한 줄에
- 장점: 모든 시점 노출
- 단점: 한 줄이 길어 picker에서 깨짐

### 결정 3. 외부 AI 블럭 검토 프롬프트 자리

#### 옵션 A. 별도 명령 `byeorim smelt review-prompt`
- 장점: 책임 분리
- 단점: 사용자가 새 명령을 알아야 함

#### 옵션 B. smelt 끝에 부산물 자동 생성
- 장점: 사용자가 명령을 추가로 부르지 않아도 받음. ADR 0028의 prospect와 같은 결
- 단점: 쓰지 않는 사용자에게 노이즈(prompt 한 파일)

#### 옵션 C. confirmSelection 단계에서 옵션으로 추가("자세히 검토하기")
- 장점: 사용자가 의도적으로 받음
- 단점: confirmSelection이 두 갈래에서 셋으로 늘어나 흐름 복잡

### 결정 4. 프롬프트가 외부 AI에 보낼 자리

#### 옵션 A. 선택된 블럭 + 의존성 결과만
- 장점: 가벼움. 외부 AI 응답 빠름
- 단점: 카탈로그 다른 블럭과 비교 어려움. 비개발자에게 "다른 자리도 있어요" 안내 자리가 비어있음

#### 옵션 B. 카탈로그 전체 blocks + 사용자 답변 + 선택 + 의존성 결과
- 장점: 외부 AI가 "다른 블럭 X도 같이 고려해보세요" 안내 가능. 비개발자에게 더 풍부한 검토
- 단점: 프롬프트가 김(blocks 30개 도메인)

## 결정

### 결정 1: 두 시점 객체 (옵션 B)

`BlockRecommendation.reasons[blockId]`가 `{ user: string, dev: string }` 객체. 둘 다 선택(빈 문자열 허용). 어댑터가 한 시점만 채울 수 있음.

```ts
{
  recommended: ['order'],
  reasons: {
    order: {
      user: '단골 손님이 빵을 고르고 픽업 시간을 정하는 자리예요',
      dev: 'order create + payment intent. cart는 requires로 자동 추가됨'
    }
  }
}
```

### 결정 2: picker는 user 시점 (옵션 A)

picker는 `reason.user`만 보여준다. 비어있으면 prefix만 보임. dev 시점은 prompt 부산물에서만 노출.

picker 라벨: `[추천] order — 주문 (이유: 단골 손님이 빵을 고르고 픽업 시간을 정하는 자리예요)`

### 결정 3: smelt 끝에 부산물 자동 생성 (옵션 B)

ADR 0028이 prospect에 깐 결을 그대로 따른다. smelt가 끝날 때 항상 `.byeorim/project/prompts/block-review-prompt.md`를 만든다. 사용자가 외부 AI에 붙여넣어 검토받는 자리.

쓰지 않는 사용자에게는 약간의 노이즈(prompt 한 파일)지만 prompts/ 디렉토리 안에 catalog-prompt.md와 같이 모여있어 시각 부담 작음.

### 결정 4: 카탈로그 전체 + 모든 맥락 (옵션 B)

비개발자 1순위 사용자 정신과 정합. 외부 AI가 "당신 도메인에 다른 블럭도 어울려요" 같은 자리를 짚어줄 수 있어야 검토가 가치 있다. prompt에 다음을 모두 담는다.

- 사용자 7항목 답변(intent.yml의 user_answers)
- 카탈로그 전체 blocks(id, name, user_desc, priority)
- 사용자가 선택한 블럭 ID 배열
- 의존성 해결 결과(자동 추가, 영향, 준비물)
- AI 추천 결과와 두 시점 이유

### claude RECOMMEND_SYSTEM_PROMPT 풍부화 가이드

추천 이유를 두 시점으로 채울 때 따라야 할 결.

**user 시점**(비개발자, 1순위 사용자)
- 일상 한국어. "결제대행사", "데이터 모양" 같이 풀어쓰기. PG, DTO, API, REST, CRUD 같은 단축어 금지
- 두세 줄 가능(picker 한 줄 한계와 다른 자리). 사용자 도메인 단어 인용
- 가능성형 결("핵심으로 보여요", "잘 어울릴 수 있어요"). 단정형 자제
- 마케팅 카피 형용사("강력한", "획기적인", "본질적인") 금지(CLAUDE.md 섹션 10)

**dev 시점**(개발자, 3순위 사용자)
- 정확한 기술 용어 OK. PG, DTO, API 같은 단축어 사용 가능(개발자가 이해)
- 한 줄 권장(picker에 안 들어가지만 prompt 부산물이 길어지지 않게)
- 의존성, 데이터 흐름, 외부 시스템 같은 자리를 짚을 수 있음

## 결과

### 긍정적
- 비개발자가 picker에서 친근한 한국어 이유를 받음. 단축어로 막히지 않음
- 외부 AI 검토 자리(block-review-prompt.md)가 카탈로그 전체 맥락을 가져 풍부한 피드백
- ADR 0028의 prospect와 같은 결을 smelt에도 깔아 두 단계가 외부 AI 경로에서 일관됨
- claude 어댑터의 추천 이유 품질이 한 결로 박힘(시스템 프롬프트가 단축어 풀어쓰기 강제)

### 부정적 / 트레이드오프
- BlockRecommendation.reasons 모양이 string에서 객체로 바뀌어 어댑터 인터페이스 비호환 변경. 어댑터 구현체 모두 갱신 필요
- 모든 사용자에게 block-review-prompt.md 자리잡음. 쓰지 않는 사용자에게는 한 파일 노이즈
- 카탈로그 전체를 prompt에 담아 길이가 늘어남. 큰 카탈로그(blocks 30+)에서는 prompt가 수 KB. 외부 AI에 붙여넣을 때 사용자가 두 번 스크롤
- claude 추천 이유 두 시점이 늘어 max_tokens 자리 늘어날 수 있음(2048 → 3072 가능성). 첫 출시는 2048 유지하고 부족하면 후속 갱신

### 미래 묶임
- BlockRecommendation.reasons의 두 시점({user, dev})은 표준. 시점 추가(예: 디자이너, 운영자)는 새 ADR
- block-review-prompt.md 형식과 자리(.byeorim/project/prompts/)는 표준. ADR 0028과 같은 자리에 모임
- claude 어댑터의 단축어 풀어쓰기 가이드는 표준. 다른 AI 어댑터(GPT, Gemini)도 같은 가이드 따름
- 외부 AI 응답을 smelt로 import하는 자리(예: import-blocks)는 후속 ADR. 이번은 검토 프롬프트만

## 링크
- 짝 ADR: ADR 0028(prospect 외부 프롬프트 경로), ADR 0029(smelt 추천)
- 갱신 대상: ADR 0029의 reasons 형식(string → 객체)
- 명세: docs/specs/block-recommendation.md
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 10(글쓰기 원칙, 단축어/마케팅 카피 금지)
