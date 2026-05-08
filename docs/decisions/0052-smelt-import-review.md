# ADR 0052. smelt import-review

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0030이 smelt의 외부 검토 프롬프트(block-review-prompt.md)를 박았다. 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 응답을 다시 selected-blocks.yml에 반영하는 결은 미루어 두었다.

ADR 0039(forge import-review)가 외부 AI 응답을 picker로 yml에 반영하는 패턴을 박았고, ADR 0040(temper), ADR 0051(inspect)이 같은 결로 따라왔다. 이번 ADR이 smelt에도 같은 결을 박아 7단계 흐름의 외부 검토 일관성을 마무리한다.

이번 ADR이 답하는 질문은 여섯이다. 첫째, 변경 종류. 둘째, 응답 형식. 셋째, 의존성 재해결 결. 넷째, decisions.yml 갱신 결. 다섯째, 검증 결. 여섯째, picker 결.

## 검토한 옵션

### 결정 1. 변경 종류

#### 옵션 A. block_add + block_remove 둘만 (이번 출시)

- 장점: 단순. 외부 AI가 가장 자주 줄 결("이 블럭을 추가하세요" / "이 블럭은 빼도 돼요")이 다 들어감
- 단점: prerequisite_modify(World 0 준비물)나 cascade 결정 직접 변경은 못 함. 다만 cascade는 `byeorim answer` 명령이 풀고, prerequisite은 미래 ADR

#### 옵션 B. 더 많은 종류(prerequisite_modify, decision_answer, priority_modify 등)

- 장점: 자유도
- 단점: 검증 결이 복잡. 첫 출시는 단순한 결이 자연스러움. 사용자 피드백 쌓이면 추가

### 결정 2. 응답 형식

#### 옵션 A. forge/temper와 같은 결 (이번 출시)

```yaml
changes:
  - kind: block_add
    block_id: <카탈로그의 블럭 id>
    reason: <한 두 줄 이유>
  - kind: block_remove
    block_id: <selected에 있는 블럭 id>
    reason: <한 두 줄 이유>
```

- 장점: forge/temper/inspect와 같은 결. 사용자 학습 비용 0. parser는 `parseReviewResponse`(이미 있음) 그대로 재사용
- 단점: 없음

### 결정 3. 의존성 재해결 결

#### 옵션 A. 모든 변경 적용 후 한 번 resolveAll 재실행 (이번 출시)

picker가 끝나면 (적어도 한 변경 적용 시) resolveAll을 한 번 더 돌려 selected → autoAdded/affected/prerequisites/decisions를 다시 만든다.

- 장점: 의존성 그래프가 일관성 유지. block_add 한 개로 끌려오는 자동 추가 블럭 자리도 정확
- 단점: 사용자가 수정한 자리를 한 번 더 처리해야 함. 다만 결정적

#### 옵션 B. 각 변경마다 resolveAll

- 장점: 한 변경의 영향이 picker 다음 단계에 보임
- 단점: N번의 변경에 N번 resolve 호출. 결과는 같지만 비용

### 결정 4. decisions.yml 갱신 결

#### 옵션 A. resolveAll의 새 decisions로 통째로 교체 (이번 출시)

decisions.yml은 cascade 결정(answer가 채울 자리). 사용자가 이미 답한 결정은 보존하되, 새 selected에 따라 결정 목록이 추가/삭제될 수 있음.

- 적용: 옛 decisions.yml의 사용자 답변(`answer` 필드)을 보존하면서 새 decisions 목록과 머지
- 같은 trigger의 기존 답변은 그대로 유지
- 새 trigger에 대한 답변은 빈 자리로 박힘

#### 옵션 B. decisions.yml 안 건드림

- 장점: 단순
- 단점: 새 selected에 추가된 블럭이 새 cascade 결정을 만드는데 decisions.yml에 안 박힘. 사용자가 `byeorim answer`로 채울 자리를 못 봄

### 결정 5. 검증 결

#### 옵션 A. 형식 + catalog 위치 검증 (이번 출시)

- block_add: block_id가 catalog에 존재
- block_remove: block_id가 selected에 존재
- 둘 다: block_id가 비어있지 않음

#### 옵션 B. 더 깊은 검증(internal 블럭 거부 등)

- 장점: 안전
- 단점: 검증 표가 길어짐. 미래 amendment

### 결정 6. picker 결

#### 옵션 A. forge/temper/inspect와 같은 batch picker (이번 출시)

ADR 0045 결과 같은 결. 적용/건너뛰기/모두 적용/모두 건너뛰기/멈추기.

## 결정

### 결정 1: block_add + block_remove (옵션 A)

이번 출시의 변경 종류는 둘.

```yaml
- kind: block_add
  block_id: payment        # 카탈로그의 블럭 id
  reason: 결제 도메인이 들어왔는데 selected에 빠짐

- kind: block_remove
  block_id: shipping       # 사용자가 고른 블럭 중 하나
  reason: 단순 주문 앱이라 배송이 과함
```

prerequisite_modify, decision_answer, priority_modify 같은 결은 미래 ADR.

### 결정 2: forge/temper와 같은 응답 형식 (옵션 A)

```markdown
## 제안된 변경 사항

```yaml
changes:
  - kind: block_add
    block_id: payment
    reason: 결제가 빠짐
  - kind: block_remove
    block_id: shipping
    reason: 단순 주문 앱이라 과함
```
```

`parseReviewResponse`(review-response-parser.js)를 그대로 재사용. validateSmeltChange 함수 추가.

### 결정 3: 모든 변경 적용 후 한 번 resolveAll (옵션 A)

picker 루프가 끝난 뒤 적어도 한 변경이 적용됐으면 resolveAll(selected, catalog)를 한 번 호출. autoAdded/affected/prerequisites/decisions를 새로 만듦.

### 결정 4: decisions.yml 갱신 with answer 보존 (옵션 A)

새 decisions 목록을 만들 때 옛 decisions.yml의 사용자 답변(`answer` 필드)을 trigger 단위로 보존. 같은 trigger가 새 목록에도 있으면 답변 유지, 없으면 사라짐. 새 trigger는 빈 답변으로 박힘.

### 결정 5: 형식 + catalog 위치 검증 (옵션 A)

`validateSmeltChange`가 형식만 본다. catalog 대비 위치 검증(block_id가 catalog에 존재 등)은 호출자(applySmeltReview)가 한다(ADR 0039의 결과 같은 결).

### 결정 6: forge batch picker (옵션 A)

ADR 0045 결과 같은 결. 적용/건너뛰기/모두 적용/모두 건너뛰기/멈추기.

## 결과

### 긍정적

- smelt가 forge/temper/inspect와 같은 외부 검토 결을 갖춤. 7단계 흐름의 외부 AI 검토가 모두 같은 패턴
- 의존성 재해결로 selected 변경의 영향이 yml에 정확히 반영
- decisions.yml의 사용자 답변이 보존되어 `byeorim answer`로 채운 자리가 안 사라짐
- review-response-parser.js의 parseReviewResponse를 그대로 재사용. 새 파서 안 만듦
- forge/temper/inspect의 batch picker 결을 그대로 따라가니 사용자 학습 비용 0

### 부정적 / 트레이드오프

- block_add/block_remove 둘만 지원. prerequisite_modify, decision_answer 같은 결은 미래 ADR
- 의존성 재해결이 매 import-review 후 한 번 더 실행. 다만 결정적이라 비용 작음
- 외부 AI가 internal 블럭(공개 API 없음)을 block_add로 제안할 수 있음. 검증에서 거부

### 미래 묶임

- 6개 결정 모두 표준
- 새 변경 종류(prerequisite_modify, decision_answer 등)는 amendment
- 의존성 재해결의 호출 결은 표준. 미래에 다른 단계의 import-review가 같은 결로 자랄 수 있음

## 링크

- 이전 결정: ADR 0028(prospect import-catalog), ADR 0030(smelt 외부 검토 부산물), ADR 0039(forge import-review), ADR 0040(temper import-review), ADR 0045(batch picker), ADR 0051(inspect import-review)
- 후속 작업 후보: ADR 0053(shape import-review)
- 동행 톤: ADR 0003 결정 2(graceful degrade)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 4(테스트 결정성), 섹션 8(파일당 책임), 섹션 10(글쓰기 원칙)
