# ADR 0040. Temper 외부 검토 응답 import

- 상태: 채택
- 날짜: 2026-05-06
- 결정자: DevSmith
- 관계: ADR 0039(forge import-review)의 결을 temper에 옮김. ADR 0038의 외부 검토 프롬프트 부산물(test-scenarios-review-prompt.md)에서 짝이 비어있던 자리. ADR 0037의 인터랙티브 검토 흐름과 결이 평행

## 맥락

ADR 0038이 temper에 외부 검토 프롬프트 부산물(`.byeorim/project/prompts/test-scenarios-review-prompt.md`)을 박았다. 사용자는 이 마크다운을 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 시나리오 종류 누락, test_code 도메인 적합성, 시작 무게를 자세히 검토받는다. 그러나 받은 응답을 다시 test-scenarios.yml에 반영하는 자리가 비어있다.

ADR 0039가 같은 자리를 forge에서 풀었다. 외부 AI에게 자유 형식 검토 끝에 구조화된 "## 제안된 변경 사항" 섹션을 한 번 더 추가하라고 안내(검토 프롬프트에 형식 가이드 박음). 사용자는 받은 응답을 `byeorim forge import-review <file>`로 가져온다. 코드는 구조화 섹션을 파싱하고 각 제안마다 사용자에게 picker로 묻는다.

이 ADR로 같은 결을 temper에 옮긴다. 변경 가능 자리는 forge와 다름. forge가 endpoint와 schema를 다듬는 자리였다면, temper는 시나리오와 test_code를 다듬는 자리.

## 검토한 옵션

ADR 0039와 결이 평행이라 같은 자리에서 같은 결을 따른다. 다른 자리는 변경 가능 자리(결정 3)뿐.

### 결정 3. 변경 가능한 자리(scope, temper 자리)

#### 옵션 A. scenario_add + scenario_remove + gwt_modify + test_code_modify (4종)
- 장점: temper의 산출물(test-scenarios.yml) 자리에 정확히 맞춤. 외부 AI의 검토 셋(시나리오 종류 누락, test_code 도메인 적합성, 시작 무게)이 곧 이 4종을 통해 풀림. forge 4종과 평행한 결
- 단점: gwt와 test_code 두 자리가 같은 시나리오 객체에 박혀있어 미세하게 결이 갈라짐. 다만 한 변경 안에서 한 자리만 다듬는 결이라 자연스러움

#### 옵션 B. scenario 객체 전체 교체 한 가지(replace)
- 장점: 변경 결이 단순
- 단점: 부분 다듬기 자리가 사라짐. 외부 AI가 "test_code만 고치고 싶다"는 자리도 시나리오 전체를 다시 줘야 함. 부담 큼

#### 옵션 C. 4종 + endpoint 자체 추가/삭제도 포함
- 장점: 더 자유로움
- 단점: endpoint 추가/삭제는 forge import-review 자리(ADR 0039). 단계 경계가 흐려짐(절대 금지선 1번 정신). 사용자가 같은 자리를 두 명령에서 풀 수 있게 되면 결이 어긋남

## 결정

### 결정 1: 구조화 형식 강제 (ADR 0039 결정 1과 같은 결)

검토 프롬프트(test-scenarios-review-prompt.md)에 "## 응답 형식 안내" 섹션 박음. 외부 AI에게 자유 형식 검토 끝에 다음 형식의 "## 제안된 변경 사항" 섹션을 한 번 더 추가하라고 안내.

```yaml
changes:
  - kind: scenario_add        # 시나리오 추가
    block_id: order
    target_endpoint: { method: POST, path: /orders }
    new_scenario:
      kind: error_invalid_input    # happy_path 외 자리(error_*, edge_*)
      given: 잘못된 입력 데이터가 준비되어 있다
      when: POST /orders로 요청한다
      then: 400 응답과 함께 검증 오류 메시지가 돌아온다
      test_code: <코드 또는 TODO>
    reason: 입력 검증 자리

  - kind: scenario_remove      # 시나리오 삭제
    block_id: order
    target_endpoint: { method: POST, path: /orders }
    target_scenario_kind: happy_path
    reason: 다른 자리로 옮김

  - kind: gwt_modify           # given/when/then 수정
    block_id: order
    target_endpoint: { method: POST, path: /orders }
    target_scenario_kind: happy_path
    new_value:
      given: 새 given 텍스트       # given/when/then 중 일부만 박을 수 있음
      then: 새 then 텍스트
    reason: 텍스트 다듬기

  - kind: test_code_modify     # test_code 수정
    block_id: order
    target_endpoint: { method: POST, path: /orders }
    target_scenario_kind: happy_path
    new_value: <새 test_code 코드 한 덩어리>
    reason: 검증 자리 추가
```

### 결정 2: 인터랙티브 picker (ADR 0039 결정 2와 같은 결)

각 제안마다 "적용/건너뛰기/멈추기" select. 동행 톤(절대 금지선 2번) 정신.

### 결정 3: 4종 변경 (옵션 A)

`scenario_add` / `scenario_remove` / `gwt_modify` / `test_code_modify`. endpoint 추가/삭제는 forge import-review 자리(ADR 0039)라 여기 안 박음.

각 변경의 필드.

- `scenario_add`: `block_id`, `target_endpoint`(method/path), `new_scenario`(kind/given/when/then/test_code), `reason`. new_scenario.kind는 같은 endpoint 안에서 unique
- `scenario_remove`: `block_id`, `target_endpoint`(method/path), `target_scenario_kind`(예: happy_path), `reason`
- `gwt_modify`: `block_id`, `target_endpoint`(method/path), `target_scenario_kind`, `new_value`(given/when/then 중 일부 또는 전부 객체), `reason`
- `test_code_modify`: `block_id`, `target_endpoint`(method/path), `target_scenario_kind`, `new_value`(문자열), `reason`

검증.

- `block_id`가 test-scenarios.yml에 없으면 변경 건너뜀
- `target_endpoint`가 해당 블럭에 없으면 변경 건너뜀
- modify/remove에서 `target_scenario_kind`가 endpoint에 없으면 변경 건너뜀
- `scenario_add`에서 new_scenario.kind가 같은 endpoint에 이미 있으면 변경 건너뜀(중복)
- internal 블럭은 endpoints가 없어서 변경 자리 아님

invalid 자리는 picker 시작 전에 한 번에 안내(forge와 같은 결).

### 결정 4: 서브커맨드 `byeorim temper import-review <file>` (ADR 0039 결정 4와 같은 결)

forge import-review 결과 평행.

### 결정 5: 파일 경로 (ADR 0039 결정 5와 같은 결)

`byeorim temper import-review ./response.md`.

### 결정 6: graceful degrade (ADR 0039 결정 6과 같은 결)

응답에서 섹션을 못 찾거나 yaml이 깨지거나 changes 배열이 없으면 안내하고 종료. test-scenarios.yml은 그대로.

### 결정 7: state 안 건드림 (ADR 0039 결정 7과 같은 결)

import는 test-scenarios.yml만 다듬는 자리라 state.current_stage를 안 건드림. 다음 단계(set 등)로 이미 진행한 사용자도 import 가능.

## 결과

### 긍정적
- ADR 0038의 검토 프롬프트와 짝이 맞음. 외부 AI 응답이 자연스럽게 test-scenarios.yml에 반영
- 비기술 창업자가 yml을 직접 편집 안 해도 외부 AI 추천을 자기 결로 받음. 절대 금지선 5번 정신
- 인터랙티브 picker로 사용자가 자리마다 결정. 동행 톤 정신
- 로컬 어댑터 없이 동작(절대 금지선 6번 정신)
- forge import-review와 같은 결이라 사용자가 두 단계에서 같은 사용 패턴
- 시나리오 종류(error_*, edge_*)를 자연스럽게 추가하는 자리. happy_path 한 가지만 자동 생성되던 결을 외부 AI 검토로 풀어줌

### 부정적 / 트레이드오프
- 외부 AI가 형식을 안 따를 수 있음. graceful degrade로 풀지만 사용자가 import 자리를 못 씀
- 변경 종류가 forge보다 미세하게 갈라짐(gwt와 test_code가 같은 시나리오 객체 안에 박힌 두 자리). 다만 한 변경 안에서 한 자리만 다듬는 결이라 사용자에게 자연스러움
- target_scenario_kind를 매번 박아야 함(같은 endpoint에 시나리오 여러 종류가 있을 수 있어). 이번 출시는 endpoint당 happy_path 한 개라 단순하지만 외부 AI에게 명시 자리

### 미래 묶임
- 응답 형식과 4종 변경 표는 표준
- 시나리오 종류(happy_path, error_*, edge_*) 결은 별도 ADR(이번 출시는 자유 명명, 외부 AI가 박는 결)
- 일괄 적용 단축 자리는 후속 ADR(forge와 같은 묶음으로 풀어줄 자리)
- 부산물 응답 import의 구조 자체(parser + 검증 + 적용 + state 보존)는 forge와 temper 두 자리에서 같은 결이라 미래에 set/inspect 자리에 옮길 때도 같은 패턴

## 링크
- 짝 결정: ADR 0039 (forge import-review, 같은 결을 옮김)
- 입력 의존: ADR 0014 (test-scenarios.yml 형식), ADR 0036 (fillTestCode), ADR 0037 (인터랙티브 검토), ADR 0038 (외부 검토 프롬프트)
- 결의 짝: ADR 0028 (prospect import-catalog, 같은 결)
- 동행 톤: ADR 0003 결정 2
- 후속 작업 후보: 일괄 적용 단축 자리, 시나리오 종류 표준화, set/inspect 자리 import
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(파일당 책임, 데이터 무관성), 섹션 10(글쓰기 원칙)
