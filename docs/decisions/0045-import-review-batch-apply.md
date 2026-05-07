# ADR 0045. Import-review 일괄 적용 단축

- 상태: 채택
- 날짜: 2026-05-06
- 결정자: DevSmith
- 관계: ADR 0039(forge import-review)와 ADR 0040(temper import-review)의 picker에 새 자리 추가. 두 ADR의 미래 묶임에서 약속한 자리

## 맥락

ADR 0039와 ADR 0040이 인터랙티브 picker로 사용자가 자리마다 결정하는 결을 박았다. 동행 톤(ADR 0003 결정 2) 정신상 적절했지만 두 ADR 모두 트레이드오프 자리에서 명시적으로 한 줄 남겨두었다.

> 변경 수가 많을 때 사용자가 N번 결정. "남은 N개 모두 적용"/"여기서 멈추기" 자리로 풀지만 인지 비용은 있음

"여기서 멈추기"는 박았는데 "남은 N개 모두 적용/건너뛰기"는 안 박았다. 이 자리.

외부 AI가 큰 응답을 돌려줄 때(20개 이상 변경 제안) 사용자가 매번 같은 결정을 반복하는 자리. 첫 몇 자리에서 "이 외부 AI는 결을 잘 박는다"는 신뢰가 생기면 나머지를 한 번에 적용하고 싶은 자리. 반대로 "이 외부 AI는 결이 어긋난다"는 인상이 생기면 나머지를 한 번에 건너뛰고 싶은 자리.

ADR 0039 미래 묶임에서 "큰 응답에서 '남은 N개 모두 적용' 단축 자리는 미래 ADR"이라 박아두었다. 이 ADR이 그 자리.

## 검토한 옵션

### 결정 1. 새 picker 자리 결

#### 옵션 A. 5개 자리(적용/건너뛰기/모두 적용/모두 건너뛰기/멈추기)
- 장점: 사용자가 한 화면에서 5가지 결을 다 본다. 일괄 자리가 명확
- 단점: 자리 수가 많아짐. 다만 select picker는 5개도 한 화면에 들어옴

#### 옵션 B. 처음 결정만 3개, 두 번째부터 5개(점진적)
- 장점: 첫 자리에서 화면이 단순
- 단점: 사용자가 첫 자리에서 일괄 자리가 있는 줄 모름. 일관성 떨어짐

#### 옵션 C. 일괄 적용을 별도 명령(`--all`, `--all-skip` 플래그)
- 장점: picker 화면이 단순
- 단점: 사용자가 처음에 모드를 정해야 함. 첫 몇 자리 보고 결정하는 결이 안 됨. 본 ADR의 핵심 요구가 풀리지 않음

### 결정 2. "남은 N개 모두 적용"의 의미

#### 옵션 A. 이번 자리 포함 남은 모두(현재 + 다음 모두 적용)
- 장점: 사용자가 이번 자리를 보고 적용 결정한 뒤 나머지도 같은 결로 가는 자연스러운 흐름
- 단점: 한국어 표현이 살짝 모호("남은"이 현재 포함인지 자명하지 않음). 라벨에 "이번부터"를 박으면 풀림

#### 옵션 B. 이번 자리 제외 다음부터(이번은 별도)
- 장점: 라벨이 명확
- 단점: 사용자가 이번 자리를 따로 결정해야 함. 두 번 결정 자리

### 결정 3. ADR 0039/0040과의 후행 호환

#### 옵션 A. confirmChange의 반환 값이 새 결로 자라남(apply, skip, stop, apply_all_remaining, skip_all_remaining)
- 장점: 점진적 확장. 기존 confirmChange 구현이 그대로 동작(새 자리는 모르면 안 부르면 됨)
- 단점: 반환 값 자리가 5개로 자라남. 호출자가 모두 알아야 함. 다만 default picker에 모두 박혀있어 외부 호출자에게는 같은 결

## 결정

### 결정 1: 5개 자리 (옵션 A)

picker 화면.

```
어떻게 할까요?
❯ 적용하기
  건너뛰기
  이번부터 모두 적용
  이번부터 모두 건너뛰기
  여기서 멈추기 (나머지 변경 안 보고 끝내기)
```

forge-import와 temper-import의 defaultConfirmChange가 같은 결로 박힌다.

### 결정 2: 이번 자리 포함 (옵션 A)

라벨 "이번부터 모두 적용". 사용자가 보고 있는 변경부터 끝까지 모두 적용. "이번부터 모두 건너뛰기"도 같은 결.

### 결정 3: confirmChange 반환 값 확장 (옵션 A)

| 반환 값 | 의미 |
| --- | --- |
| `apply` | 이번 자리 적용. 다음 자리에서 다시 묻기 |
| `skip` | 이번 자리 건너뜀. 다음 자리에서 다시 묻기 |
| `apply_all_remaining` | 이번 + 남은 모두 적용. 더 안 묻기 |
| `skip_all_remaining` | 이번 + 남은 모두 건너뜀. 더 안 묻기 |
| `stop` | 이번 + 남은 모두 안 보고 끝내기 |

apply 흐름의 모드 자리.

```js
let mode = 'prompt'; // 'prompt' | 'apply_all' | 'skip_all'
for (...) {
  let decision;
  if (mode === 'apply_all') decision = 'apply';
  else if (mode === 'skip_all') decision = 'skip';
  else decision = await confirmChange(...);
  
  if (decision === 'apply_all_remaining') { mode = 'apply_all'; decision = 'apply'; }
  else if (decision === 'skip_all_remaining') { mode = 'skip_all'; decision = 'skip'; }
  
  // 그 다음 apply/skip/stop 결로 흐름
}
```

기존 호출자(테스트)가 'apply'/'skip'/'stop'만 돌려줘도 그대로 동작. 후행 호환.

## 결과

### 긍정적
- 큰 응답(20개 이상)에서 사용자 인지 비용 절감. 첫 몇 자리 보고 일괄 결정 가능
- forge import-review와 temper import-review가 같은 결의 picker. 사용자가 두 단계에서 같은 사용 패턴
- 기존 confirmChange 호출자(테스트)가 그대로 동작. 후행 호환
- "이번부터 모두" 결로 사용자 의지가 명확하게 풀림

### 부정적 / 트레이드오프
- picker 자리 5개로 자라남. 첫 사용자에게 살짝 인지 부담. 다만 한 화면에 들어오고 select가 친숙
- 사용자가 잘못 일괄 적용 누르면 잘못된 변경이 다 박힘. 다만 import-review는 git 자리 아니라 사용자가 그 결과를 다시 외부 AI에 보내거나 직접 다듬는 결로 풀어줌(파괴적 자리 아님)
- 기존 ADR 0039/0040의 picker 결정(3개 자리) 결을 갱신. 두 ADR에 amendment 자리

### 미래 묶임
- 5개 자리(picker choices)는 표준
- "이번부터 모두" 라벨 결은 표준
- 일괄 적용 후 undo/redo 자리는 미래 ADR(이번 출시는 한 번 적용 후 사용자가 다시 import하는 결로 풀어줌)
- 사용자가 처음에 모드를 정하는 자리(예: `--all` CLI 플래그)는 별도 ADR

## 링크
- 짝 결정: ADR 0039 (forge import-review), ADR 0040 (temper import-review)
- 동행 톤: ADR 0003 결정 2
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(파일당 책임)
