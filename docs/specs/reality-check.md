# Reality Check 명세

ADR 0003이 6영역과 톤을 결정했다. 이 문서는 그 결정 위에 각 영역의 구체적 질문 목록, 출력 형식, AI 어댑터 약속을 박는다. 명세 변경은 카탈로그 진화 노트(docs/catalog-evolution/)로 기록한다.

## 영역 목록

여섯 영역의 ID와 한국어 제목은 표준이다.

| ID | 한국어 제목 | 본질 |
|----|-------------|------|
| `market_saturation` | 시장 포화도 | 자리잡은 경쟁자가 있는가, 사용자가 어떻게 다를 것인가 |
| `entry_cost` | 진입 비용 | 코드 짜기 전 필요한 자금. 6개월 버틸 자금이 있는가 |
| `two_sided_market` | 양면 시장 함정 | 공급자와 수요자 양쪽이 필요한가, 어느 쪽을 먼저 모을 것인가 |
| `legal_risk` | 법적 리스크 | 개인정보, 인허가, 차별 같은 영역에서 변호사 자문이 필요한가 |
| `revenue_model` | 수익 모델 현실 | 누구한테 받을 것인가, 얼마, 첫 100명이 누구인가 |
| `graveyard` | 사라진 서비스들의 묘지 | 같은 도메인에서 시도하고 닫은 서비스들이 왜 실패했나 |

영역 추가/제거는 ADR 0003을 갱신하는 별도 ADR이 필요하다.

## 영역별 질문 시드

각 영역은 표준 질문 2~4개를 가진다. AI는 사용자의 7항목 답변과 카탈로그 도메인을 보고 이 시드를 도메인 맥락으로 다듬을 수 있다. 시드 질문이 도메인에 안 맞으면 같은 결의 다른 질문으로 대체 가능. 중요한 건 영역마다 사용자가 한 번 멈춰 생각할 자리를 만드는 것.

### market_saturation
- 같은 도메인에서 이미 자리잡은 서비스가 있나요? 있다면 누구인가요
- 그들과 비교해 사용자가 만들 서비스는 어디가 다른가요
- 첫 사용자가 기존 서비스 대신 이 서비스를 쓸 이유는 무엇인가요

### entry_cost
- 사업자등록, 도메인, 호스팅 같은 시작 비용은 얼마로 보세요
- 출시 후 6개월 버틸 자금이 있으세요
- 첫 매출이 나기 전까지 혼자 버틸 수 있는 자리인가요

### two_sided_market
- 공급자와 수요자 양쪽이 다 필요한 서비스인가요
- 그렇다면 어느 쪽을 먼저 모을 계획이세요
- 한쪽이 없을 때 다른 쪽이 머무를 이유가 있나요

### legal_risk
- 사용자 데이터를 어떻게 받고 어떻게 보관할 계획이세요
- 이 도메인에 인허가가 필요한가요(예: 통신판매업, 학원 등록, 식품 영업)
- 미성년자가 사용할 자리가 있나요

### revenue_model
- 누구한테 돈을 받을 건가요(사용자, 광고주, 후원자)
- 얼마를 받을 건가요. 한 번? 매월?
- 첫 100명의 결제자가 누구일지 그려지나요

### graveyard
- 같은 도메인에서 시도했다가 닫은 서비스가 있다면 누가 떠오르나요
- 그들이 왜 닫았다고 보세요
- 그 함정을 우리는 어떻게 피할 수 있나요

## 출력 형식

### AI 어댑터 generateRealityCheck 약속

입력:
```ts
{
  answers: ProspectAnswers,  // 7항목 답변(ADR 0026)
  catalog: Catalog,           // 카탈로그(ADR 0027)
}
```

출력:
```ts
{
  areas: {
    market_saturation: { observation: string, questions: string[] },
    entry_cost: { observation: string, questions: string[] },
    two_sided_market: { observation: string, questions: string[] },
    legal_risk: { observation: string, questions: string[] },
    revenue_model: { observation: string, questions: string[] },
    graveyard: { observation: string, questions: string[] },
  },
  legal_warnings: Array<{ item: string, reason: string }>,
}
```

`observation`은 사용자 도메인에 대한 AI의 한두 줄 한국어 관찰. 모르면 빈 문자열.

`questions`는 사용자가 이 영역에서 멈춰 생각할 한국어 질문 2~4개. 시드를 그대로 써도 되고 도메인에 맞춰 다듬어도 된다.

`legal_warnings`는 강한 신호 후보(즉각 손해 발생 가능 항목)의 모음 자리. ADR 0003 결정 3에 따라 prospect 단계에서는 차단/경고로 쓰지 않고 모아두기만 한다. Inspect 단계나 출시 직전에 이 자리를 다시 본다. 비어있을 수 있다.

## reality-check.md 마크다운 형식

prospect가 AI 출력을 받아 사용자에게 보여주는 결. 6영역 머리, AI 관찰, 질문 목록, legal_warnings 자리.

```markdown
# Reality Check

7항목 동행 질문에서 그린 서비스를 두 번째 시각으로 본다. 광맥의 가치를 보는 자리(ADR 0003).
답을 강요하지 않는다. 답할 수 없는 질문은 다이어리에 남겨두고 다음 단계로 같이 간다.

## 시장 포화도

[AI 한두 줄 관찰. 비어있을 수 있다]

생각해볼 질문
- [질문 1]
- [질문 2]

## 진입 비용
...(같은 결로 6영역)

## 법적 메모

[legal_warnings가 있으면 모은다. 출시 직전에 다시 본다는 안내]
- 항목 1: 이유
- 항목 2: 이유

[legal_warnings가 비어있으면 이 절은 생략]
```

`legal_warnings` 절은 비어있을 때 출력하지 않는다. 비어있는 안내 자리를 굳이 만들지 않음.

## 다이어리 통합

prospect 7항목에서 답하지 못한 자리와 Reality Check 질문은 다이어리(`.byeorim/project/diary.md`)에 머리를 분리해 적는다.

```markdown
## YYYY-MM-DD prospect 의도에서 미뤄둔 질문
- when: ...
- how_manage: ...

## YYYY-MM-DD Reality Check에서 미뤄둔 질문
- 시장 포화도: 같은 도메인에서 이미 자리잡은 서비스가 있나요? 있다면 누구인가요
- 시장 포화도: 그들과 비교해 사용자가 만들 서비스는 어디가 다른가요
...(6영역의 모든 질문)
```

prospect 단계에서는 사용자가 Reality Check 질문에 인터랙티브로 답하지 않는다. 모든 질문이 다이어리로 흘러간다. 사용자가 reality-check.md를 읽고 답을 자기 노트나 다이어리에 직접 적는 결이다.

후속 출시에서 Reality Check 질문을 인터랙티브로 묻는 자리가 생기면 그때 답한 자리만 빼고 다이어리로 보낸다. 그 변경은 별도 ADR.

## 톤 가이드

- 답을 강요하지 않는다(ADR 0003 결정 2). 모든 영역에서 같은 결
- AI observation은 단정형보다 가능성형 결. "보일 수 있다", "가능성이 있다", "한 번 보세요"
- 시장 포화도가 높다고 차단하지 않는다. 수익 모델이 약해 보인다고 차단하지 않는다(ADR 0003 결정 3)
- 법적 리스크 영역에서도 prospect 단계에서는 강한 신호를 안 쓴다. legal_warnings 자리에 모아두고 Inspect 단계가 다시 본다
- 사용자(비기술 창업자)가 압도되지 않게 한다. 영역마다 한두 줄 관찰 + 질문 2~4개로 끝
- 마케팅 카피 결의 형용사("강력한", "획기적인")를 쓰지 않는다(CLAUDE.md 섹션 10)

## 강한 신호의 미래 자리

ADR 0003 결정 3은 강한 신호를 Inspect 단계 또는 출시 직전 + 법적 리스크의 즉각 손해 항목으로 한정했다. 이번 출시(prospect 단계)는 강한 신호를 사용하지 않는다. 다만 `legal_warnings`로 자리를 모아둠으로써 Inspect 단계가 같은 데이터를 그대로 받을 수 있다.

Inspect 단계가 legal_warnings를 어떻게 사용할지는 ADR 0016(Inspect 단계 6영역과 리포트)이 정한다. 이 명세는 prospect 단계의 자리만 다룬다.
