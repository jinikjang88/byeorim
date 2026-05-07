# ADR 0053. shape import-review

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0033이 shape의 외부 검토 프롬프트(architecture-review-prompt.md)를 박았다. 사용자가 외부 AI에서 받은 응답을 다시 architecture.yml에 반영하는 결은 미루어 두었다.

ADR 0052가 smelt에 import-review를 박아 7단계 외부 검토 결의 일관성이 거의 완성됐다. shape만 남았다. 이번 ADR이 마지막 한 자리를 박는다.

shape는 4개 결정(language/database/api_style/architecture_pattern) 표라서 forge/temper/inspect/smelt와 결정 모양이 다르다. 변경 종류가 한 가지(decision_modify)로 단순하고, ADR 0012의 표준 옵션 enum이 강제되어야 한다.

이번 ADR이 답하는 질문은 다섯이다. 첫째, 변경 종류. 둘째, 검증 결. 셋째, 응답 형식. 넷째, picker 결. 다섯째, graceful degrade.

## 검토한 옵션

### 결정 1. 변경 종류

#### 옵션 A. decision_modify 한 종류만 (이번 출시)

```yaml
- kind: decision_modify
  target_key: language        # 4개 키 중 하나
  new_value: python           # ADR 0012 표준 옵션 enum 안의 값
  reason: 데이터 처리가 핵심이라 python이 어울려요
```

- 장점: shape의 결이 4개 필드라 변경 종류는 한 가지면 충분. 단순
- 단점: 다른 종류(예: 옵션 추가)는 표준 옵션 자체를 바꾸는 결이라 ADR 0012 amendment가 필요. 이 ADR 범위 밖

### 결정 2. 검증 결

#### 옵션 A. target_key는 4개 enum, new_value는 ADR 0012 표준 옵션 enum (이번 출시)

shape.js에서 export한 ARCHITECTURE_DECISION_KEYS와 getValidArchitectureValues로 검증.

- 장점: ADR 0012의 표준 옵션이 단일 진실 소스. shape.js의 결이 그대로 import에서 동작
- 단점: shape.js에서 export 추가. 다만 작은 결

### 결정 3. 응답 형식

#### 옵션 A. forge/smelt와 같은 결 (이번 출시)

```markdown
## 제안된 변경 사항

```yaml
changes:
  - kind: decision_modify
    target_key: language
    new_value: python
    reason: ...
```
```

- parseReviewResponse 그대로 재사용

### 결정 4. picker 결

#### 옵션 A. forge/temper/inspect/smelt와 같은 batch picker (이번 출시)

ADR 0045 결정. 적용/건너뛰기/모두 적용/모두 건너뛰기/멈추기.

### 결정 5. graceful degrade

#### 옵션 A. forge/temper와 같은 결 (이번 출시)

응답 형식 어긋나면 한국어 안내. ADR 0039/0040의 결.

## 결정

### 결정 1: decision_modify 한 종류 (옵션 A)

```yaml
- kind: decision_modify
  target_key: language | database | api_style | architecture_pattern
  new_value: <ADR 0012 표준 옵션 안의 값>
  reason: <한 두 줄 이유>
```

새 옵션을 추가하는 변경은 ADR 0012 amendment의 결(별도 ADR).

### 결정 2: 표준 옵션 enum 검증 (옵션 A)

`validateShapeChange`가 형식만 보고, 표준 옵션 enum은 호출자(applyShapeReview)가 검증한다(ADR 0039의 결 같음).

shape.js에 ARCHITECTURE_DECISION_KEYS와 getValidArchitectureValues(key) 두 export 추가.

### 결정 3: forge와 같은 응답 형식 (옵션 A)

parseReviewResponse 그대로 재사용. validateShapeChange 함수 추가.

### 결정 4: forge batch picker (옵션 A)

ADR 0045 결과 같은 결.

### 결정 5: graceful degrade (옵션 A)

ADR 0039/0040의 결을 그대로.

## 결과

### 긍정적

- 7단계 흐름의 외부 검토 결이 완성. prospect(import-catalog) → smelt → shape → forge → temper → inspect 모두 import 결을 갖춤
- shape.js의 표준 옵션 enum이 단일 진실 소스. 미래 ADR 0012 amendment가 들어오면 shape.js 한 곳만 갱신해도 import-review가 따라감
- 변경 종류 한 가지(decision_modify)로 단순. 사용자 인지 비용 작음
- forge/smelt와 같은 응답 형식이라 사용자 학습 비용 0

### 부정적 / 트레이드오프

- 표준 옵션을 추가하는 결은 별도 ADR(ADR 0012 amendment). 즉 외부 AI가 새 옵션을 제안해도 import-review가 거부함. 다만 표준 옵션이 광범위하게 합의되는 자리라 자주 일어나는 일 아님

### 미래 묶임

- 5개 결정 모두 표준
- 새 결정 키(예: 5번째 결정) 추가는 ADR 0012 amendment
- 새 변경 종류(option_add 등)는 별도 ADR

## 링크

- 이전 결정: ADR 0012(architecture.yml 4개 결정과 표준 옵션), ADR 0033(shape 외부 검토 부산물), ADR 0039(forge import-review), ADR 0045(batch picker), ADR 0052(smelt import-review)
- 동행 톤: ADR 0003 결정 2(graceful degrade)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 4(테스트 결정성), 섹션 8(파일당 책임), 섹션 10(글쓰기 원칙)
