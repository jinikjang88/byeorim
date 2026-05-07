# ADR 0042. Block path override 옵셔널 + 영문 id 정책 명시

- 상태: 채택
- 날짜: 2026-05-06
- 결정자: DevSmith
- 관계: ADR 0041(REST path 복수형 default)의 짝. ADR 0005(카탈로그 형식)의 block 스키마 자리 갱신. ADR 0028(prospect import-catalog)과 ADR 0030(외부 카탈로그 프롬프트)의 결을 따른다

## 맥락

ADR 0041이 forge의 path 매핑을 복수형 default로 갱신했다. pluralize 라이브러리가 영문 명사의 결을 자동 복수화한다(`order` → `/orders`, `cancel-return` → `/cancel-returns`). 다만 두 자리가 사용자 부담으로 남았다.

첫째, mass noun(`shipping`)이나 동사형 복합어(`inventory-manage`)는 자동 복수화 결과가 어색하다(`/shippings`, `/inventory-manages`). 동작은 하지만 카탈로그 작성자가 정밀 조정하고 싶을 자리.

둘째, 한국어 block id가 들어오면 비ASCII 폴백으로 단수형 그대로 박힌다(`주문` → `/주문`). HTTP 자리에서 URL 인코딩이 박혀 깨진 path가 된다. 1순위 사용자(비기술 창업자)가 이 깨진 결을 만나면 풀 자리가 없다.

확인. catalog.schema.json을 보니 block.id의 `id` 정의가 이미 `^[a-z][a-z0-9-]*$` 패턴을 박아두었다(ADR 0005 시점). 즉 한국어 id는 schema 검증에서 거부되어야 한다. 다만 두 자리가 비어있다.

- prospect 외부 AI 프롬프트(packages/cli/src/prospect-prompt.js)가 ID 패턴 안내를 한 자리(line 40)에 넣어두었지만 영문임을 명시적으로 강조하지 않음. 사용자가 한국어로 대화하는 외부 AI는 한국어 id를 만들 수 있음
- import-catalog 거부 메시지가 일반적이라 사용자가 어떤 자리를 풀어야 할지 어렴풋함

세 번째 자리. mass noun과 동사형 복합어를 풀려면 카탈로그 작성자가 path를 직접 박을 자리가 필요하다. 카탈로그 스키마에 block.path 옵셔널 필드가 비어있다.

이 ADR로 두 자리를 한 묶음으로 푼다. block.path 옵셔널 추가(C 갈래) + AI 카탈로그 프롬프트의 영문 id 강조 + import 거부 메시지 한국어로 풀어쓰기(A 갈래의 보강).

## 검토한 옵션

### 결정 1. block.path 옵셔널 자리

#### 옵션 A. block 스키마에 path 옵셔널 필드 추가
- 장점: 카탈로그 작성자가 path를 자기 결로 박음(`shipping` → `path: /shipments`). pluralize 결과가 어색한 자리를 정밀 조정. 미래에 싱글톤 자원(`/me`)도 같은 자리에서 풀 수 있음
- 단점: 카탈로그 스키마 한 자리 추가. 다만 옵셔널이라 기존 카탈로그(commerce 등)에 영향 없음

#### 옵션 B. 카탈로그 root 레벨의 path_overrides 맵
- 장점: block 정의를 안 건드림
- 단점: 자리 흩어짐. block.id와 path가 두 곳에 박혀 가독성 떨어짐. 카탈로그 작성자가 두 자리를 동시에 익혀야 함

#### 옵션 C. 추가 안 함(자동 복수화로 충분)
- 장점: 스키마 변경 없음
- 단점: mass noun과 동사형 복합어를 풀 자리가 없음. 사용자 부담

### 결정 2. AI 카탈로그 프롬프트의 영문 id 강조

#### 옵션 A. SYSTEM_TEXT 규칙에 한 줄 추가("ID는 영문 소문자만. 한국어 ID는 거부됩니다")
- 장점: 외부 AI가 처음부터 영문 id를 만듦. 사용자가 import 거부 자리를 안 만남. 한 줄 추가라 가벼움
- 단점: 외부 AI가 규칙을 안 따를 수 있음. 다만 schema 검증이 안전망

#### 옵션 B. 별도 섹션으로 분리(## ID 정책)
- 장점: 강조됨
- 단점: 프롬프트 길이 증가. 한 줄로 충분한 자리

#### 옵션 C. 변경 안 함(schema 검증으로 충분)
- 장점: 변경 없음
- 단점: 사용자가 외부 AI에게 두 번 묻는 자리가 생김(처음 한국어 id → 거부 → 다시 영문으로 부탁). 1순위 사용자에게 부담

### 결정 3. import 거부 메시지 결

#### 옵션 A. ID 패턴 위반 자리는 한국어로 풀어쓰기("외부 AI가 한국어 ID를 만들었어요. 영문 ID로 다시 만들어달라고 부탁해주세요")
- 장점: 사용자가 다음 자리를 명확히 봄. 1순위 사용자(비기술 창업자)에게 친절
- 단점: 메시지 자리 한 자리 추가. 다만 사용자 시점에서 가치 큼

#### 옵션 B. 일반 검증 오류로 그대로 두기
- 장점: 코드 자리 안 늘림
- 단점: 사용자가 영문 검증 오류 메시지를 보고 한국어 ID 자리임을 추론해야 함. 동행 톤(ADR 0003) 정신과 어긋남

### 결정 4. block.path 형식 제약

#### 옵션 A. REST path 패턴 강제 (`^/[a-z0-9/_{}-]+$` 같은 결)
- 장점: 사용자가 잘못된 path를 박는 자리를 schema가 막음. URL 안전 자리
- 단점: 한국어 path(예외 자리)가 의도적으로 들어와도 거부됨. 미래에 i18n path 자리가 박히면 ADR로 풀어줄 자리

#### 옵션 B. 자유 형식 문자열
- 장점: 유연
- 단점: 사용자가 잘못된 path(예: 공백 들어간 자리)를 박을 수 있음

#### 옵션 C. 형식 제약 없이 forge.js가 검증
- 장점: 스키마는 단순
- 단점: 검증 자리 두 곳(스키마 + forge.js). 결이 흩어짐

## 결정

### 결정 1: block.path 옵셔널 필드 (옵션 A)

catalog.schema.json의 block 정의에 `path` 옵셔널 필드 추가. forge.js의 buildBlockContract가 block.path가 있으면 그대로 사용, 없으면 pathFromBlockId(block.id)로 폴백.

```json
"block": {
  ...
  "properties": {
    ...
    "path": {
      "type": "string",
      "pattern": "^/[a-z0-9/_{}-]+$",
      "description": "REST endpoint path 자리. 옵셔널. 비어있으면 block.id에서 자동 복수화(ADR 0041). 자동 결과가 어색한 자리(mass noun, 동사형 복합어, 싱글톤 자원)를 정밀 조정"
    }
  }
}
```

forge.js 변경.

```js
function pathForBlock(block) {
  if (typeof block.path === 'string' && block.path.length > 0) {
    return block.path;
  }
  return pathFromBlockId(block.id);
}
```

resource 블럭의 5개 endpoint와 query 블럭의 1개 endpoint가 같은 base path를 사용한다. 즉 block.path가 있으면 `${block.path}`, `${block.path}/{id}` 결로 박힘.

### 결정 2: 프롬프트에 영문 id 강조 한 줄 (옵션 A)

prospect-prompt.js의 SYSTEM_TEXT 규칙 자리에 한 줄 추가.

```
- ID는 반드시 영문 소문자/숫자/하이픈만. 한국어 ID는 import에서 거부됩니다(예: 'order' OK, '주문' 거부)
- block에 path를 직접 박고 싶으면 옵셔널 path 필드 사용 가능(예: shipping → /shipments)
```

이 자리는 외부 AI에 직접 안내. 사용자가 한국어로 대화 중이어도 카탈로그는 영문 id로 답하도록.

### 결정 3: import 거부 메시지 한국어로 풀어쓰기 (옵션 A)

prospect-import.js의 검증 실패 자리에서 ID 패턴 위반을 한국어로 풀어쓴다.

```js
if (!valid) {
  const idPatternErrors = errors.filter((e) => e.includes('pattern') && e.includes('id'));
  if (idPatternErrors.length > 0) {
    throw new Error(
      '카탈로그에 한국어 ID 또는 잘못된 형식의 ID가 있어요.\n' +
        '외부 AI에게 "ID는 영문 소문자/숫자/하이픈만 쓰세요"라고 다시 부탁해주세요.\n' +
        `예: 'order' OK, '주문' 거부.\n` +
        `검증 오류: ${idPatternErrors.slice(0, 3).join('; ')}`,
    );
  }
  // 기존 일반 메시지
  ...
}
```

### 결정 4: block.path는 REST path 패턴 (옵션 A)

`^/[a-z0-9/_{}-]+$`. 슬래시로 시작, 영문 소문자/숫자/하이픈/언더스코어/슬래시/중괄호(`{id}` 같은 자리)만 허용. 한국어 path는 schema에서 거부.

미래에 i18n path 자리가 들어오면 별도 ADR로 풀어줄 자리.

## 결과

### 긍정적
- 카탈로그 작성자가 mass noun과 동사형 복합어를 자기 결로 풀 수 있는 자리 생김(`shipping` → `/shipments`)
- 1순위 사용자가 한국어 id 카탈로그를 만나는 자리가 차단됨(외부 AI 프롬프트가 영문 강조 + import 거부 메시지가 한국어로 풀어줌)
- 한국어 ID 카탈로그가 import되어도 사용자가 다음 자리(외부 AI에 다시 부탁)를 명확히 봄. 동행 톤(ADR 0003) 정신
- 미래 자리(싱글톤 자원 `/me`, 커스텀 path 결)가 같은 옵셔널 필드로 풀린다

### 부정적 / 트레이드오프
- 스키마 한 자리 추가(block.path). 옵셔널이라 기존 카탈로그(commerce 등)에 영향 없지만 카탈로그 작성자가 알아야 할 결 한 자리 추가
- 카탈로그 작성자가 path를 박을지 자동 복수화에 맡길지 한 번 더 결정 자리. 다만 default가 좋아서(자동 복수화) 박을 자리는 예외 자리만
- 외부 AI 프롬프트 한 줄 추가. 다만 짧음
- block.path의 REST path pattern이 한국어 path를 거부. i18n path 자리가 들어오면 별도 ADR

### 미래 묶임
- block.path 형식(`^/[a-z0-9/_{}-]+$`)은 표준. 변경하려면 새 ADR
- block.path가 있으면 무조건 우선이라는 결은 표준
- 외부 AI 프롬프트의 영문 id 안내는 표준. 다국어 지원 자리는 미래 ADR
- import 거부 메시지의 한국어 풀어쓰기 결은 표준. 다른 검증 오류 자리(예: required field 누락)도 같은 결로 자라날 자리

## 링크
- 짝 결정: ADR 0041 (REST path 복수형 default, 자동 복수화의 정밀 조정 자리를 풀어줌)
- 갱신 대상: ADR 0005 (block 스키마 자리), ADR 0030 (외부 카탈로그 프롬프트의 영문 id 안내)
- 입력 의존: ADR 0028 (prospect import-catalog 자리)
- 동행 톤: ADR 0003 결정 2
- 후속 작업 후보: 싱글톤 자원 결(예: `/me`, `/account`), i18n path 자리, 다른 검증 오류의 한국어 풀어쓰기
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(파일당 책임, 데이터 무관성), 섹션 10(글쓰기 원칙)
