# ADR 0054. import-helpers.js 공통 결 추출

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0039(forge), 0040(temper), 0051(inspect), 0052(smelt), 0053(shape)이 5개 import-review 모듈을 박았다. 다섯 모듈이 거의 같은 결로 짜여있다.

1. 응답 파일 읽기(ENOENT는 한국어 안내)
2. 마크다운 파싱(parseReviewResponse 또는 parseFindingsResponse)
3. graceful degrade 안내
4. 형식 + 위치 검증 루프
5. batch picker 루프(적용/건너뛰기/모두 적용/모두 건너뛰기/멈추기, ADR 0045)
6. 변경 적용 + yml 저장
7. 정리 한 줄 출력

이 패턴이 다섯 모듈에 같은 결로 박혀 있어 한 곳에서 변경할 때 다섯 곳을 따라가야 한다(예: picker 메시지 한국어 다듬기, 새 batch 모드 추가). CLAUDE.md 섹션 8 패턴 일관성과 단일 진실 소스 정신을 살리기 위해 공통 결을 한 모듈로 추출한다.

이번 ADR이 답하는 질문은 셋이다. 첫째, 어느 함수를 추출하는가. 둘째, 모듈별 차이는 어떻게 표현하는가. 셋째, inspect-import는 결이 약간 달라(findings 배열, 다른 파서) 같이 갈지.

## 검토한 옵션

### 결정 1. 추출할 함수

#### 옵션 A. 6개 헬퍼 (이번 출시)

- `readResponseFile(path)`: 파일 읽기 + ENOENT 한국어 에러
- `runValidationLoop({ proposed, validate, locate, describe })`: 형식 + 위치 검증, `{validItems, invalidNotes}` 반환
- `runChangePicker({ items, applyOne, confirmChange, log })`: batch picker 루프, `{appliedCount, skippedCount, stopped}` 반환
- `logGracefulDegrade({ log, parseResult, ymlName, sectionName })`: 형식 어긋남 안내
- `batchPickerSelect({ description, reason, log })`: 5지선다 select wrapper
- `logSummary({ log, appliedCount, skippedCount, stopped, remaining })`: 정리 줄

장점: 6개 헬퍼가 5개 모듈에서 공유. 한 결로 변경하면 5곳 따라감

#### 옵션 B. 더 적게 (3개 헬퍼)

- 단점: validation/picker가 한 결로 묶이면 모듈별 차이 표현이 어려움. 각 모듈이 결국 직접 짜는 결이 됨

### 결정 2. 모듈별 차이 표현

#### 옵션 A. 함수 인자로 주입 (이번 출시)

각 모듈은 다음을 자기에서 정의하고 헬퍼에 주입.

- `validate(change)`: 형식 검증 (review-response-parser.js의 validateXxxChange)
- `locate(change, context)`: 위치 검증. `{ ok, located }` 또는 `{ ok: false, reason }`
- `describe(change, located)`: picker에 표시할 한 줄
- `applyOne(change, located, context)`: yml 변경

#### 옵션 B. 클래스 상속

- 단점: ESM 모듈 결과 안 어울림. 클래스 결을 도입하는 비용

### 결정 3. inspect-import.js 통합

#### 옵션 A. 부분 통합 (이번 출시)

inspect-import는 다음만 공유.

- `readResponseFile`: 같음
- `logGracefulDegrade`: 섹션 이름과 ymlName 다르지만 같은 결
- `runChangePicker`: items가 findings든 changes든 같은 picker 결
- `batchPickerSelect`: 같음
- `logSummary`: 같음

다음은 inspect만의 결이라 빼고 둠.

- 파서 호출 (parseFindingsResponse vs parseReviewResponse)
- runValidationLoop의 locate 자리(inspect의 finding은 위치 검증 없음 — 단순 외부 추가)

#### 옵션 B. 완전 통합

- 단점: parser와 locate 자리에 분기 결이 들어가 헬퍼가 무거워짐

## 결정

### 결정 1: 6개 헬퍼 추출 (옵션 A)

`packages/cli/src/import-helpers.js`에 6개 함수 export.

### 결정 2: 함수 인자로 차이 주입 (옵션 A)

각 모듈은 validate/locate/describe/applyOne 자리만 자기에서 정의하고 헬퍼에 주입.

### 결정 3: inspect-import 부분 통합 (옵션 A)

inspect-import는 readResponseFile/logGracefulDegrade/runChangePicker/batchPickerSelect/logSummary 5개 사용. runValidationLoop는 inspect의 finding이 단순 추가라 locate 없음 — 자체 검증 루프 유지.

## 결과

### 긍정적

- 5개 import 모듈이 같은 헬퍼를 공유. 한 결로 변경하면 5곳 따라감
- batch picker 메시지(한국어 다듬기), 새 모드 추가, graceful degrade 결이 한 곳에서 관리
- 단일 진실 소스(CLAUDE.md 섹션 8) 정신과 정합
- 기존 동작은 그대로 (행동 변경 없는 리팩터)

### 부정적 / 트레이드오프

- 함수 인자로 주입하는 결이 처음 보는 개발자에게 추적 비용. 다만 6 헬퍼가 한 파일이라 빠르게 익힘
- inspect-import가 부분 통합이라 5개 모듈 결의 미세한 차이가 한 곳에 안 모임. 미래에 inspect도 완전 통합하는 결이 자연스러우면 amendment

### 미래 묶임

- 새 import-review 단계가 들어오면 같은 헬퍼 사용. 일관성 유지 비용 작음
- 헬퍼 자체의 결 변경(예: picker 메시지)은 한 곳에서

## 링크

- 이전 결정: ADR 0039(forge import-review), 0040(temper), 0045(batch picker), 0051(inspect), 0052(smelt), 0053(shape)
- 관련 정책: CLAUDE.md 섹션 8(패턴 일관성, 파일당 책임, 단일 진실 소스), 섹션 4(테스트 결정성)
