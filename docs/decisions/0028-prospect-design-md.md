# ADR 0028. 탐광이 design.md를 같이 만든다

- 상태: 채택
- 날짜: 2026-05-01
- 결정자: DevSmith

## 맥락

ADR 0026이 탐광을 카탈로그 생성기로 바꿨다. 그러나 카탈로그 한 채만으로는 사용자에게 닿지 않는다. 카탈로그는 기계 레이어다(절대 금지선 5번). YAML이 사용자 인터페이스가 되면 안 된다.

매니페스토 II.6은 "보이지 않는 것을 보이게 만든다"고 박았다. 사용자가 쿠폰을 추가할 때 환불, 정산, 결제에 대한 의무도 함께 추가된다는 사실. 이 정신이 smelt picker에서 약하게 깨져있다(`packages/cli/src/smelt.js:140-151`의 평면 checkbox는 worlds → bundles 트리도, requires/affects 엣지도, cascade 질문도 picker에 안 띄움). smelt UI 개선은 별도 PR로 미뤄지지만, 그 자리를 prospect의 사람용 거울 한 채가 먼저 채울 수 있다.

이 ADR이 그 거울을 박는다. 탐광이 카탈로그를 빚을 때 `.beoreum/project/design.md` 한 채를 같이 만든다. worlds → bundles → blocks 트리를 자연어 마크다운으로 펼치고, 블럭당 트레이드오프 한 자리(어떤 블럭이 따라오고, 어떤 결정이 발생하고, 어떤 prerequisite가 필요한지)를 일상 한국어로 적는다. 비기술 창업자가 smelt에서 고르기 전에 각 블럭의 무게를 자연어로 본다.

design.md는 set 단계의 합성 README와 다른 자리다. set의 README는 7단계 합성(intent + selected + decisions + architecture + contracts + scenarios)이고 prospect의 design.md는 카탈로그 한 채의 사람용 거울이다. 두 자리는 다른 시점, 다른 목적, 다른 수신자를 가진다. 다이어리(`.beoreum/project/diary.md`)와도 다른 자리다. 다이어리는 사용자가 만들고 사용자가 본다. design.md는 시스템이 짓고 사용자가 본다.

## 검토한 옵션

### 결정 1. design.md의 자리

#### 옵션 A. `.beoreum/project/design.md`
- 장점: 다른 prospect 산출물(intent.yml, catalog/, reality-check.md)과 같은 자리. ADR 0007의 `project/` 하위 결을 따름
- 단점: ADR 0007의 디렉토리 트리 표에 새 줄을 추가해야 함(amendment 자리)

#### 옵션 B. `.beoreum/project/catalog/design.md`
- 장점: 카탈로그 한 채와 같은 디렉토리에 묶임
- 단점: catalog/ 하위는 카탈로그 데이터 자리(catalog.yml). 사람용 마크다운이 섞임

#### 옵션 C. `.beoreum/project/prospect/design.md` (새 디렉토리)
- 장점: prospect 산출물끼리 묶임
- 단점: 기존 ADR 0007 자리(intent.yml, catalog/, reality-check.md)와 결이 깨짐

### 결정 2. design.md의 본문 구조

#### 옵션 A. 카탈로그 YAML을 그대로 인용
- 장점: 단순
- 단점: 사람용 거울이 아니라 데이터 덤프. YAML 인터페이스 회피 정신 위반

#### 옵션 B. worlds → bundles → blocks 트리를 헤딩으로, 블럭당 자연어 한 단락
- 장점: 사람이 읽기 자연스러움. 매니페스토 II.6 "보이지 않는 것을 보이게"를 형식이 살림
- 단점: mock 어댑터가 결정적으로 빚어야 함. 휴리스틱이 살짝 복잡해짐. 다만 시드 데이터를 구조 순회로 다루므로 결정성 보장 가능

### 결정 3. 블럭당 어떤 정보를 적는가

#### 옵션 A. user_desc만 한 줄
- 장점: 짧음
- 단점: 사용자가 트레이드오프를 못 봄. 매니페스토 II.6 위반

#### 옵션 B. user_desc + analogy + concerns + requires/affects 엣지 + prerequisites + 트리거된 cascades + 트레이드오프 한두 문장
- 장점: 사용자가 한 자리에서 무게를 봄. 카탈로그 데이터의 모든 자리가 거울에 비침
- 단점: 본문이 길어짐. 다만 사용자가 한 번 읽고 smelt에서 골라야 하므로 무게가 맞음

### 결정 4. fallback 분기는 어디에 표시하는가

#### 옵션 A. 다이어리(`.beoreum/project/diary.md`)에 한 줄
- 장점: 사용자가 다이어리를 보면 됨
- 단점: 다이어리는 사용자가 만들고 보는 자리(CLAUDE.md 섹션 5). 시스템 이벤트가 들어가면 두 결이 섞임

#### 옵션 B. design.md 맨 위에 한 줄짜리 인용 banner
- 장점: 사용자가 design.md를 열면 한눈에 봄. 다이어리 결 보존
- 단점: design.md가 fallback 사실로 살짝 더럽혀짐. 다만 banner는 한 줄이라 본문 흐름을 깨지 않음

#### 옵션 C. intent.yml의 source 필드만 사용
- 장점: 데이터에 박혀 미래 단계가 읽음
- 단점: 사용자가 intent.yml을 직접 안 봄. fallback 사실이 사용자에게 안 닿음

## 결정

### 결정 1: `.beoreum/project/design.md` (옵션 A)

다른 prospect 산출물과 같은 자리에 둔다. ADR 0007의 디렉토리 트리에 한 줄을 추가하는 amendment를 같이 한다(`docs/decisions/0007-beoreum-directory-layout.md`의 트리 표와 책임 표).

### 결정 2: 트리 + 자연어 단락 (옵션 B)

design.md 본문은 다음 결로 빚는다.

```markdown
# {intent.extracted.what 또는 '벼름 프로젝트'} 설계

이 문서는 탐광이 발견한 도메인 카탈로그를 사람이 읽을 결로 펼친 거울입니다.
다음 단계(smelt)에서 어떤 블럭을 고를지 정할 때 옆에 두고 보세요.

생성 시각: {now}
사용자 입력: "{intent.user_input}"

## {world 1 title}

{world 1 description}

### {bundle 1.1 title}

{bundle 1.1 description}

#### {block 1.1.1 name} (`{block.id}`)

{block.user_desc}

비유: {block.analogy 또는 생략}
관심사: {concerns join ', '}
이 블럭을 고르면 함께 따라오는 자리: {requires 엣지의 target들}
이 블럭이 영향을 주는 자리: {affects 엣지의 target들}
필요한 사전 준비: {prerequisites enables 역검색}
정해야 할 결정: {triggered cascades의 question들}

트레이드오프: {한두 문장 자연어 요약}
```

mock 어댑터의 generateTradeOffDoc은 이 결을 결정적으로 짓는다. 시드 데이터의 worlds 배열을 정렬(`order` 필드 또는 입력 순서)해 순회하고, 각 world 안 bundles, 각 bundle 안 blocks를 순회한다. 누락된 필드(analogy 없음 등)는 깔끔히 생략한다.

### 결정 3: 블럭당 풍성한 자연어 (옵션 B)

위 본문 결의 모든 항목을 적는다. 사용자가 smelt에서 고르기 전에 무게를 본다.

### 결정 4: design.md banner + intent.source (옵션 B + C)

fallback 분기는 두 자리에 같이 표시한다.

- design.md 맨 위 한 줄 인용 banner: `> 이번 prospect는 AI 카탈로그 생성에 실패해 ${seedName} seed로 대체됐습니다. 이유: ${errors[0].message}`
- intent.yml의 `source` 필드: `fallback:template:<seedName>`

다이어리에는 적지 않는다(CLAUDE.md 섹션 5 보존).

### 디렉토리 트리 amendment (ADR 0007)

ADR 0007의 트리에 한 줄과 책임 표 한 줄을 추가한다.

```
.beoreum/project/
├── ...
├── catalog/
├── design.md                # Prospect 산출. 카탈로그의 사람용 거울 (ADR 0028)
├── reality-check.md
└── ...
```

| 파일 | 만드는 단계 | 갱신하는 단계 |
|---|---|---|
| .beoreum/project/design.md | prospect | prospect 재실행 시 |

이 amendment는 ADR 0028이 ADR 0007의 해당 자리를 amend하는 결로 굳힌다.

### status.js 확장

`packages/cli/src/status.js`의 `buildArtifacts`에 `design: existsSync(join(projectDir, 'design.md'))` 한 줄을 추가한다. `beoreum status`가 새 산출물을 본다.

## 결과

### 긍정적
- 사용자가 smelt에서 고르기 전에 카탈로그의 무게를 자연어로 본다. 매니페스토 II.6 "보이지 않는 것을 보이게"가 형식으로 살아남
- design.md가 set의 합성 README와 다른 자리, 다른 시점이라 두 산출물이 충돌하지 않음
- fallback banner가 동행 톤(매니페스토 V) 안에서 사용자에게 한눈에 닿음
- 다이어리 결(CLAUDE.md 섹션 5)이 보존됨. 시스템 이벤트가 사용자 자리에 안 섞임
- ADR 0007 amendment로 디렉토리 진실의 단일 원천이 흔들리지 않음

### 부정적 / 트레이드오프
- design.md가 길어짐. commerce 시드 기준 worlds 6개 × bundles 약 12개 × blocks 21개 = 본문 수백 줄. 다만 사용자가 한 번 읽고 smelt에서 옆에 두는 자리라 무게가 맞음
- mock 어댑터의 generateTradeOffDoc 휴리스틱이 살짝 복잡함. 단위 테스트가 결정성을 단언
- design.md banner가 fallback 시 본문 첫 줄에 들어가 약간 더럽혀짐. 한 줄이라 영향 작음
- ADR 0007 amendment로 미래 기여자가 두 ADR을 같이 봐야 트리 전체가 보임. 0007 본문에 0028 링크를 박아 추적 쉽게 함

### 미래 묶임
- design.md 자리(`.beoreum/project/design.md`)와 본문 결은 표준이다. 변경하려면 ADR이 필요
- design.md 본문 결은 위 마크다운 결을 따른다. 새 필드(예: 비용 추정, 규모 추정)가 들어오면 별도 ADR
- smelt picker 개선(다음 PR)에서 design.md를 옆에 두고 보는 결로 안내 메시지 갱신. 그 PR이 이 ADR을 참조

## 링크
- 이전 결정: ADR 0007(디렉토리 레이아웃, 이 ADR이 amend), ADR 0015(set의 합성 README, 다른 자리)
- 짝 결정: ADR 0026(prospect 카탈로그 생성), ADR 0027(generateTradeOffDoc 인터페이스)
- 후속 작업: smelt picker 개선(World→Bundle→Block 줌, design.md 안내), reality-check.md 자동 생성
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 5(다이어리는 사용자 자리), 섹션 8(YAML이 인터페이스가 아님), 매니페스토 II.6(보이지 않는 것을 보이게), 매니페스토 V(동행)
