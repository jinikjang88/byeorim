# ADR 0051. inspect 외부 검토 프롬프트와 import-review

- 상태: 채택
- 날짜: 2026-05-07
- 결정자: DevSmith

## 맥락

ADR 0030/0033/0035/0038이 smelt/shape/forge/temper 단계의 외부 검토 프롬프트 부산물을 박았다. ADR 0039/0040/0045가 forge/temper의 import-review 명령으로 외부 AI 응답을 다시 yml에 반영하는 결을 박았다. 야금술 4단계가 외부 AI와의 두 갈래(부산물 → 외부 검토 → import-review) 결을 갖췄다.

ADR 0049가 inspect의 정적 규칙 검수, ADR 0050이 AI 검수를 박았다. inspect도 외부 검토 결을 갖춰 7단계 흐름이 한 결로 마무리된다. 비기술 창업자가 claude.ai/ChatGPT/Gemini 어느 LLM에서든 검수받고 받은 응답을 inspect-report.md에 반영.

이번 ADR이 답하는 질문은 여덟이다. 첫째, 부산물 위치와 이름. 둘째, 부산물 생성 시점. 셋째, 외부 AI 응답 형식. 넷째, import-review 명령 결. 다섯째, 단일 진실 소스 결. 여섯째, 외부 finding 재import 결. 일곱째, picker 결. 여덟째, graceful degrade.

이 ADR이 inspect 단계 셋(0049/0050/0051) 묶음의 마지막. 7단계 비춤이 정적 규칙 + AI 검수 + 외부 검토 셋으로 마무리.

## 검토한 옵션

### 결정 1. 부산물 위치와 이름

#### 옵션 A. `.byeorim/project/prompts/inspect-review-prompt.md` (이번 출시)

- 장점: forge/temper와 같은 결. 사용자가 한 디렉토리에서 모든 단계 부산물을 본다
- 단점: 없음

### 결정 2. 부산물 생성 시점

#### 옵션 A. inspect 명령이 자동 생성 (이번 출시)

- 장점: forge/temper 결과 같음. 사용자가 별도 명령 안 침. inspect 한 번 돌리면 자기 점검 + 정적 + AI + 외부 검토 부산물이 한 번에
- 단점: 사용자가 외부 검토를 안 쓸 때도 부산물이 생성됨. 다만 한 파일이라 비용 작음

#### 옵션 B. 별도 명령(`byeorim inspect prompt`)

- 장점: 사용자 선택권
- 단점: 학습 비용. 다른 단계와 결이 달라짐

### 결정 3. 외부 AI 응답 형식

#### 옵션 A. ```yaml 블록의 findings 배열 (이번 출시)

ADR 0049의 finding 결과 같은 형식. 외부 AI가 응답 끝에 마크다운 ```yaml 블록을 박음.

```yaml
findings:
  - area: 보안
    severity: concern
    title: amount 필드에 음수 검증 없음
    detail: 결제 도메인의 잠재 결함
    file: features/payment/schemas.js
```

- 장점: 정적/AI finding과 같은 형식. parser가 단순. ADR 0039/0040의 changes 패턴과 평행
- 단점: 외부 AI가 형식을 안 지킬 수 있음. graceful degrade로 풀어줌

#### 옵션 B. 자유 형식

- 장점: 외부 AI가 자유롭게
- 단점: parser가 깨질 위험. mock 어댑터가 못 다룸. 벤더 종속(ADR 0006 위배)

### 결정 4. import-review 명령 결

#### 옵션 A. `byeorim inspect import-review <file>` (이번 출시)

- 장점: forge/temper와 같은 결. 사용자가 같은 패턴으로 세 단계에서 사용
- 단점: 없음

### 결정 5. 단일 진실 소스 (큰 결정)

#### 옵션 A. `.byeorim/project/inspect-findings.yml` (이번 출시)

inspect-findings.yml에 static / ai / external 세 섹션을 둔다. inspect-report.md는 이 yml에서 derive.

```yaml
schema_version: 1
generated_at: 2026-05-07T12:00:00.000Z
findings:
  static:
    - area: 보안
      severity: pass
      title: ...
      ...
  ai:
    - area: 보안
      severity: warning
      ...
  external:
    - area: 보안
      severity: concern
      ...
```

- 장점: import-review가 yml의 external 섹션만 갱신, report 재렌더. 모든 finding이 한 곳에. 미래 새 source(예: SAST 도구) 추가 결도 자연스러움
- 단점: ADR 0049/0050 구현이 yml 저장 결로 갱신됨. inspect-rules.js와 inspect.js의 흐름 변경

#### 옵션 B. 별도 yml만

inspect-external-findings.yml에 외부 finding만 저장. inspect-report.md는 매번 static/ai 재계산 + external 합침.

- 장점: ADR 0049/0050 구현 그대로
- 단점: AI 호출이 import-review 시점에 또 필요(또는 cache 결을 박아야 함). 비용

### 결정 6. 외부 finding 재import 결

#### 옵션 A. external 섹션 교체 (이번 출시)

매 import-review가 yml의 external 섹션을 통째로 교체. 사용자가 두 번째 외부 AI 검수를 받으면 첫 번째 결과가 사라짐.

- 장점: 단순. 매 import-review가 fresh take
- 단점: 사용자가 두 번 검수를 누적하고 싶으면 미래 `--append` 플래그 필요(별도 ADR)

#### 옵션 B. append

- 장점: 누적
- 단점: 같은 결함이 두 번 박힐 위험. 중복 제거 결을 박아야 함

### 결정 7. picker 결

#### 옵션 A. forge/temper와 같은 batch picker (이번 출시)

ADR 0045 결과 같음. 적용/건너뛰기/모두 적용/모두 건너뛰기/멈추기.

- 장점: 사용자가 외부 AI 응답을 검토할 결. 가짜 결함이나 잘못된 안내를 골라낼 수 있음. 다른 import-review 단계와 같은 패턴
- 단점: 외부 AI 응답이 N개일 때 N번 묻는 결. ADR 0045의 batch 모드가 풀어줌

#### 옵션 B. 단순 적용

- 장점: 빠름
- 단점: 사용자 검토 결 없어 외부 AI의 가짜 결함이 그대로 들어감

### 결정 8. graceful degrade

#### 옵션 A. forge/temper와 같은 결 (이번 출시)

ADR 0039/0040의 graceful degrade 결을 그대로. ```yaml 섹션 못 찾으면 한국어 안내, yaml 파싱 실패해도 한국어 안내.

```
응답에서 ## 제안된 변경 사항 섹션을 못 찾았어요.
외부 AI가 자유 형식으로만 답했거나 형식이 어긋났을 수 있어요.
응답을 직접 보시고 손으로 다듬으시거나 외부 AI에 형식대로 다시 답해달라고 부탁해주세요.
```

## 결정

### 결정 1: `.byeorim/project/prompts/inspect-review-prompt.md` (옵션 A)

forge/temper와 같은 위치. 사용자가 한 디렉토리에서 모든 부산물을 봄.

### 결정 2: inspect 명령이 자동 생성 (옵션 A)

`byeorim inspect`가 inspect-report.md, inspect-findings.yml, inspect-review-prompt.md 셋을 만든다.

### 결정 3: ```yaml findings 배열 (옵션 A)

외부 AI 응답의 끝에 마크다운 ```yaml 블록. findings 배열의 각 finding은 ADR 0049 결과 같은 결.

inspect-review-prompt.md의 응답 형식 안내 섹션이 외부 AI에게 형식을 가이드.

```markdown
## 응답 형식 안내

검수가 끝나면 응답 끝에 다음 형식의 ```yaml 블록을 박아주세요.

```yaml
findings:
  - area: 보안 | 성능 | 운영 | 확장성 | 법적 리스크 | 시장 재검
    severity: pass | warning | concern
    title: 한국어 한 줄 제목
    detail: 한국어 본문(왜 결함인지 + 어떻게 풀지)
    file: 관련 파일 경로(있으면)
```
```

### 결정 4: `byeorim inspect import-review <file>` (옵션 A)

```
byeorim inspect import-review external-response.md
```

forge/temper와 같은 명령 결. <file>은 외부 AI 응답을 저장한 마크다운 파일.

### 결정 5: 단일 진실 소스 inspect-findings.yml (옵션 A)

`.byeorim/project/inspect-findings.yml` 파일이 모든 finding의 진실. inspect-report.md는 이 yml에서 derive.

#### inspect-findings.yml 형식

```yaml
schema_version: 1
generated_at: 2026-05-07T12:00:00.000Z
findings:
  static:
    - area: 보안
      severity: pass
      title: JWT_SECRET startup 검사가 박혀 있습니다
      detail: ...
      file: src/server.js
  ai:
    - area: 법적 리스크
      severity: concern
      title: ...
      detail: ...
  external:
    - area: 성능
      severity: warning
      title: ...
      detail: ...
```

#### inspect 흐름 변경

ADR 0049/0050의 흐름이 다음으로 갱신.

1. runInspect가 정적 규칙 + AI 검수로 static / ai 배열 만든다 (기존)
2. 기존 inspect-findings.yml의 external 섹션 읽기 (없으면 빈 배열)
3. inspect-findings.yml에 새 static / ai + 보존된 external 박기
4. inspect-report.md를 yml에서 derive해 박기
5. inspect-review-prompt.md 부산물 박기

#### import-review 흐름

1. 응답 파일 읽기
2. ```yaml 블록의 findings 파싱 + validateInspectFinding 검증
3. picker로 사용자가 적용/건너뛰기 결정
4. inspect-findings.yml의 external 섹션 교체 (결정 6)
5. inspect-report.md 재렌더
6. state는 안 건드림 (current_stage='done' 그대로)

### 결정 6: external 교체 (옵션 A)

매 import-review가 yml의 external 섹션을 통째로 교체. 누적은 미래 `--append` 플래그 ADR.

### 결정 7: forge/temper batch picker (옵션 A)

ADR 0045 결과 같은 결. 적용/건너뛰기/모두 적용/모두 건너뛰기/멈추기.

### 결정 8: graceful degrade (옵션 A)

ADR 0039/0040의 graceful degrade 결을 그대로 따른다. 응답 파싱 실패 시 한국어 안내. forge-import.js의 결을 그대로 가져온다.

## 결과

### 긍정적

- inspect 단계 셋(0049/0050/0051)이 한 묶음으로 마무리. 7단계 흐름이 자기 점검 + 정적 + AI + 외부 검토 결을 갖춤
- inspect-findings.yml이 단일 진실 소스라 미래 새 source(SAST 도구, 사용자 수동 추가) 추가 결도 자연스러움
- 비기술 창업자가 claude.ai/ChatGPT/Gemini 어느 LLM에서든 외부 검수 가능. 벤더 무관(CLAUDE.md 섹션 6)
- inspect-report.md가 yml에서 derive되니 yml만 갱신하면 report가 따라감
- forge/temper의 import-review 결을 그대로 옮긴 자리라 사용자 학습 비용 작음

### 부정적 / 트레이드오프

- ADR 0049/0050 구현이 yml 저장 결로 갱신됨. 큰 변경이지만 단일 진실 소스의 의미가 있음
- 외부 finding 재import가 교체 결이라 누적은 미래 ADR
- 외부 AI 응답이 ```yaml 형식을 안 지키면 graceful degrade. 다만 prompt에 명시했으니 적합도 높음
- inspect 한 번 실행에 부산물 5개(report.md, findings.yml, review-prompt.md, state.yml 갱신, 그리고 기존 6영역 체크리스트). 사용자에게 빈 결로 보일 수 있음. CLI 출력에 한 줄씩 안내

### 미래 묶임

- 8개 결정 모두 표준
- external 누적 결(`--append`)은 미래 ADR
- 새 source(SAST 도구 등) 추가는 amendment(yml 형식 그대로)
- inspect-review-prompt 형식 변경은 amendment

## 링크

- 이전 결정: ADR 0028(prospect import-catalog), ADR 0030/0033/0035/0038(외부 검토 프롬프트), ADR 0039/0040/0045(import-review 결), ADR 0049/0050(inspect 정적/AI 검수)
- 동행 톤: ADR 0003 결정 2(graceful degrade), 결정 3(concern 강한 신호)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 4(테스트 결정성), 섹션 6(벤더 종속 회피), 섹션 8(파일당 책임), 섹션 10(글쓰기 원칙)
