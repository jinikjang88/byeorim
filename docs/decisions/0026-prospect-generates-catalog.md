# ADR 0026. 탐광은 카탈로그를 생성한다

- 상태: 채택
- 날짜: 2026-05-01
- 결정자: DevSmith

## 맥락

지금 `beoreum prospect`는 사실상 시드 카탈로그 picker다. `packages/cli/src/prospect.js:104-108`이 `copyFileSync(templatePath(suggested_template), catalogFile)`로 빌트인 시드 한 채를 `.beoreum/project/catalog/catalog.yml` 자리에 복사한다. 추천 후보는 commerce, job-aggregator, reservation 셋(2026-04-30 reservation 추가). 이 결의 한계가 두 자리에서 동시에 드러난다.

첫째, 새 도메인이 들어오려면 메인 소스 다섯 자리가 흔들린다. `packages/templates/<domain>/catalog.yml` 신규, `packages/templates/index.js` 등록, `packages/ai/src/mock.js`의 `TEMPLATE_KEYWORDS` 표, `packages/ai/src/claude.js`의 `INTENT_SYSTEM_PROMPT` 안 후보 목록, 관련 테스트. 매니페스토 IV의 1순위 사용자(카페 사장님, 학원 원장님, 공방 운영자)가 시드 셋에 안 들어맞는 도메인을 가지면, 비기술 창업자가 PR을 직접 짜야 한다는 모순에 닿는다.

둘째, 매니페스토 III 7단계 메타포의 첫 자리 의미가 약하다. 탐광은 광맥을 찾는 일이고, 그 광맥이 사용자 도메인에 맞춰 빚어져야 다음 단계가 그 위에 올라갈 수 있다. 시드 복사 한 줄로는 "발견"이라는 무게가 안 잡힌다. 이전 Forge Protocol의 Meta-Smelt mode B(6단계 설문 + AI 카탈로그 생성)가 그 자리를 채웠는데, ADR 0004로 처음부터 다시 지으면서 빈 자리로 남았다.

이 ADR이 그 빈 자리를 다시 채운다. Beoreum의 철학과 7단계 메타포는 그대로 보존하면서, 탐광의 알맹이를 picker에서 generator로 바꾼다.

## 검토한 옵션

### 결정 1. picker를 어떻게 generator로 바꾸는가

#### 옵션 A. 시드 picker만 남기고 AI 생성 안 함
- 장점: 변경 없음. 안전
- 단점: 위 두 한계가 그대로 남는다. 1순위 사용자가 자기 도메인을 만나지 못한다

#### 옵션 B. 순수 AI 생성. 시드 없이 카탈로그를 처음부터 빚는다
- 장점: 새 도메인이 자유롭게 들어옴
- 단점: AI가 같은 입력에 대해 결과가 흔들리기 쉽다. 비용도 큼. mock 어댑터가 결정성을 보장하기 어렵다(CLAUDE.md 섹션 4 5초 미만 약속)

#### 옵션 C. Hybrid. 가장 가까운 시드를 few-shot 예시로 끼우고 AI가 도메인 맞게 변형
- 장점: 시드가 형식과 의미적 결을 잡아줌. 새 도메인도 같은 결로 빚어짐. mock은 시드 그대로를 결정적으로 돌려주고 실제 LLM 어댑터만 변형. 비용도 prompt caching으로 절감 가능(시드는 캐시 적중)
- 단점: 시드와 닿지 않는 도메인은 가장 가까운 시드의 흔적이 남음. 다만 사용자가 design.md를 보고 갱신하거나 다음 turn에 다시 prospect 가능

### 결정 2. 시드 후보가 없는 도메인은 어떻게 다루는가

#### 옵션 A. 한국어 에러로 거부
- 장점: 단순. 사용자가 시드 키워드에 맞춰 다시 입력하게 안내
- 단점: 매니페스토 V 동행 톤 위반. 답을 강요하는 자리. 1순위 사용자가 막힘

#### 옵션 B. mock은 commerce를 default seed로, claude는 시드 없이도 생성
- 장점: mock은 결정성 유지(CLAUDE.md 섹션 4), claude는 자유도 확보. 두 어댑터의 책임이 분명히 나뉜다
- 단점: mock의 commerce default가 데이터 결을 흐림. 다만 generateCatalog가 name/domain만 사용자 입력으로 갈아끼우는 결이라 흐름은 유지

### 결정 3. AI 생성 카탈로그가 검증을 통과 못 하면 어떻게 다루는가

#### 옵션 A. 한국어 에러로 거부, 사용자가 다시 시도
- 장점: 단순
- 단점: 사용자가 다시 prospect를 돌려도 결정성 없는 LLM이 또 실패할 수 있음. 답을 강요하는 자리

#### 옵션 B. 가장 가까운 시드를 그대로 fallback 복사하고 사용자에게 banner 안내
- 장점: 동행 톤. 사용자가 막히지 않고 다음 단계로 갈 수 있음. design.md banner와 intent.source 필드에 fallback 사실이 남음. 미래 단계가 그 신호를 보고 거동을 갈라쓸 자리도 열림
- 단점: 사용자가 받은 카탈로그가 시드와 같다는 사실을 한눈에 못 보면 헷갈릴 수 있음. design.md banner와 intent.source 두 자리에 분명히 표시

### 결정 4. INTENT_SYSTEM_PROMPT의 시드 후보 목록은 정적인가 동적인가

#### 옵션 A. 하드코딩된 후보 목록 (현재 결)
- 장점: 한 자리만 보면 됨
- 단점: 시드를 늘릴 때마다 prompt도 같이 손대야 함. 두 자리 동기화 부담

#### 옵션 B. 호출 자리에서 `Object.keys(templates)`로 동적으로 끼움
- 장점: 시드 추가가 한 자리(`packages/templates/index.js`)만 손대면 끝남
- 단점: 호출 자리에서 시스템 프롬프트가 동적으로 만들어짐. prompt caching 적중률에 영향. 다만 시드 목록은 거의 안 바뀌므로 실제 영향 작음

## 결정

### 결정 1: Hybrid 채택 (옵션 C)
탐광이 사용자 입력에서 가장 가까운 시드를 고르고, 그 시드를 few-shot 예시로 끼워 AI가 도메인 맞게 변형한다. 시드는 결정점이 아니라 학습 예시. mock 어댑터는 시드 그대로를 결정적으로 돌려주고 name과 domain만 갈아끼운다. 실제 LLM 어댑터(다음 PR)는 시드를 참고하면서도 사용자 도메인에 맞춰 worlds, bundles, blocks를 변형한다.

### 결정 2: mock은 commerce default, claude는 시드 없이도 생성 (옵션 B)
mock 어댑터는 시드 후보가 없으면 commerce를 default seed로 본다. 이 결정은 mock의 결정성 약속(CLAUDE.md 섹션 4)을 위한 자리이지, 데이터 의미를 강제하지 않는다. 실제 LLM 어댑터는 시드 없이도 generateCatalog를 호출할 수 있다. claude의 그 결정은 다음 PR(0027 후속)에서 구체화한다.

### 결정 3: 검증 실패 시 시드 fallback + banner (옵션 B)
generateCatalog가 돌려준 카탈로그가 `validateCatalog`(`packages/catalog/src/validate.js`)를 통과하지 못하면, 가장 가까운 시드를 그대로 복사한다. intent.yml의 `source` 필드를 `fallback:template:<seedName>`으로 박는다. design.md 맨 위에 한 줄짜리 인용 banner를 넣어 사용자가 한눈에 보게 한다. 다이어리(`.beoreum/project/diary.md`)는 사용자가 만들고 보는 자리(CLAUDE.md 섹션 5)라 시스템 이벤트를 거기 적지 않는다.

### 결정 4: INTENT_SYSTEM_PROMPT 후보 목록 동적화 (옵션 B)
`packages/ai/src/claude.js`의 `INTENT_SYSTEM_PROMPT` 안 시드 후보 목록을 호출 자리에서 `Object.keys(templates)`로 끼운다. 시드를 늘리려면 `packages/templates/index.js`만 손대면 된다. 메인 소스 다섯 자리 흔들림이 한 자리로 줄어든다.

### intent.source 필드 값 매트릭스

`intent.yml`의 `source` 필드가 카탈로그가 어디서 왔는지 추적한다. 미래 단계가 이 신호를 보고 거동을 갈라쓸 수 있다.

| source 값 형식 | 의미 |
|---|---|
| `template:<seedName>` | 시드를 그대로 복사(generateCatalog 미구현 어댑터 또는 명시적 시드 모드) |
| `ai-generated:hybrid:<seedName>` | AI가 시드를 few-shot으로 받아 변형해 생성 |
| `fallback:template:<seedName>` | AI 생성 실패로 시드 복사로 돌아감 |

## 결과

### 긍정적
- 새 도메인이 메인 소스 수정 없이 들어온다. 비기술 창업자가 자기 도메인을 직접 빚을 수 있다(claude 어댑터 후속 PR 후)
- 시드는 형식과 의미적 결을 잡는 학습 예시로 남는다. 데이터 무관성(CLAUDE.md 섹션 8)이 더 강해진다
- mock과 claude의 책임이 분명히 나뉜다. mock은 결정성, claude는 도메인 빚기. 단위 테스트 5초 미만 약속 보존
- fallback 정책이 동행 톤(매니페스토 V)을 지킨다. 사용자가 막히지 않는다
- INTENT_SYSTEM_PROMPT 후보 목록 동기화 부담이 없어진다. 시드 추가가 가벼워진다

### 부정적 / 트레이드오프
- mock은 시드 없는 도메인을 진짜로 빚지 않는다(commerce default). 이 한계는 mock의 결정성과 짝. 사용자가 새 도메인을 진짜로 빚으려면 claude 어댑터(다음 PR) 필요
- AI 생성 카탈로그의 의미적 정합성은 사람이 봐야 한다. `validateCatalog`가 형식과 ID 무결성까지만 본다. design.md가 그 자리를 사람용 거울로 펼쳐 보임(ADR 0028)
- INTENT_SYSTEM_PROMPT 동적화로 prompt caching 적중률이 미세하게 흔들릴 가능성. 시드 목록이 거의 안 바뀌어 실제 영향 작음
- intent.source 값 매트릭스가 늘어남. 미래 단계가 이 값을 어떻게 처리할지 별도 결정 자리

### 미래 묶임
- generateCatalog 시그니처와 fallback 정책은 표준이다. 변경하려면 ADR이 필요
- intent.source 값 형식(`template:`, `ai-generated:hybrid:`, `fallback:template:`)은 표준 매트릭스. 새 출처가 들어오면 ADR로 추가
- mock의 commerce default는 데이터 결정이 아니라 결정성 보장 자리. 실제 데이터 의미는 사용자가 갱신하거나 claude 어댑터가 빚음
- claude 어댑터의 generateCatalog 실제 구현은 후속 PR + 별도 ADR. structured output schema, prompt caching 정책, max_tokens 예산을 거기서 결정

## 링크
- 이전 결정: ADR 0008(intent.yml 형식, source 필드의 자리), ADR 0009(AiAdapter 인터페이스), ADR 0023(extractSchema 패턴)
- 짝 결정: ADR 0027(AiAdapter.generateCatalog 시그니처), ADR 0028(design.md를 prospect가 같이 만든다)
- 후속 작업: claude 어댑터의 generateCatalog 실제 구현, smelt 줌 4단(World→Bundle→Block→TechSpec), shape의 tech_desc 키워드 마이닝, temper의 엣지케이스 추론, inspect의 심각도 점수
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자 우선순위), 섹션 2(절대 금지선 1번 설계 우선, 6번 벤더 무관), 섹션 4(단위 테스트 5초 미만), 섹션 5(다이어리는 사용자 자리), 섹션 8(데이터 무관성, 사용자 출력 정책), 매니페스토 III(7단계 메타포), 매니페스토 V(동행 톤)
