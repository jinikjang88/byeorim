# 2026-05-01 — 탐광이 카탈로그를 생성한다

## 무엇이 바뀌었는가

`.beoreum/project/catalog/catalog.yml`의 출처가 한 자리에서 세 자리로 늘어났다. 직전까지는 `prospect`가 시드 디렉토리(`packages/templates/<seed>/catalog.yml`)를 그대로 `copyFileSync`했다. 이번 PR부터는 어댑터의 `generateCatalog`가 시드를 few-shot으로 받아 변형한 카탈로그가 들어간다(ADR 0026, 0027).

같이 두 번째 산출물 `.beoreum/project/design.md`가 새로 자리잡았다(ADR 0028). 카탈로그의 사람용 거울. worlds → bundles → blocks 트리를 자연어 마크다운으로 펼치고, 블럭당 트레이드오프 한 자리(requires/affects 엣지 카운트, 정해야 할 결정 한 줄, 사전 준비 목록)를 적는다.

## intent.source 매트릭스

`.beoreum/project/intent.yml`의 `source` 필드가 카탈로그가 어디서 왔는지 추적한다. 미래 단계가 이 신호를 보고 거동을 갈라쓸 수 있다. 세 값 형식이 표준 매트릭스다.

| source 값 형식 | 의미 |
|---|---|
| `template:<seedName>` | 시드를 그대로 복사. generateCatalog 미구현 어댑터(adapter-optional 분기) |
| `ai-generated:hybrid:<seedName>` | AI가 시드를 few-shot으로 받아 변형해 생성. mock 어댑터의 기본 결 |
| `fallback:template:<seedName>` | AI 생성 실패(검증 실패 또는 throw)로 시드 복사로 돌아감 |

## fallback 분기는 어떻게 다루는가

`generateCatalog` 결과가 `validateCatalog`를 통과 못 하거나 메서드 자체가 throw하면 시드 그대로를 catalog.yml에 적는다. 두 자리에 그 사실을 표시한다.

- `intent.yml`의 `source` 필드: `fallback:template:<seedName>`
- `design.md` 맨 위 한 줄 인용 banner: `> 이번 prospect는 AI 카탈로그 생성에 실패해 ${seedName} seed로 대체됐습니다. 이유: ${errors[0].message}`

다이어리(`.beoreum/project/diary.md`)에는 적지 않는다. 다이어리는 사용자가 만들고 사용자가 보는 자리(CLAUDE.md 섹션 5). fallback은 시스템 이벤트라 자리를 섞지 않는다.

## 시드의 새 역할

`packages/templates/`는 이제 결정점이 아니라 학습 예시다. 새 도메인을 진짜로 빚는 일은 AI(claude 어댑터의 generateCatalog, 다음 PR)가 한다. mock 어댑터는 결정성(섹션 4 5초 약속)을 위해 시드 그대로를 돌려주면서 `name`과 `domain`만 사용자 입력에서 뽑은 값으로 갈아끼운다.

mock 어댑터의 한계는 분명하다. mock은 새 도메인을 진짜로 빚지 않는다(commerce default seed 그대로). 사용자가 자기 도메인에 맞는 카탈로그를 진짜로 받으려면 claude 어댑터를 써야 한다. ADR 0026 결정 2가 이 한계를 박았다.

## 카탈로그 자체는 안 바뀌었다

이번 변경은 카탈로그 데이터(commerce/job-aggregator/reservation의 worlds/bundles/blocks/dependencies/cascades/prerequisites) 자체에는 손대지 않는다. 시드는 그대로, 카탈로그 스키마(ADR 0005)도 그대로. 바뀐 자리는 카탈로그가 어떻게 .beoreum/project/catalog/에 도달하는가의 결.

다음 단계(smelt부터 inspect까지)가 보는 카탈로그 형식은 동일하다. smelt의 `loadCatalog`가 진입점이라 그 위 흐름은 카탈로그가 어디서 왔는지 모른다. 이 사실 덕분에 prospect 한 자리만 바꾸고 나머지 6단계는 안 건드릴 수 있었다.

## 미래 자리

- claude 어댑터의 generateCatalog 실제 구현. structured output(catalog.schema.json), prompt caching(시드를 cache breakpoint로), max_tokens 예산. 다음 PR + 별도 ADR.
- 카탈로그 의미적 검수(예: "쿠폰이 환불에 affects는데 정산도 affects해야 하는가" 같은 자리). validateCatalog가 형식과 ID 무결성까지만 보니 이 자리는 사람이 봐야 한다. design.md가 펼쳐 보여주는 결로 푸는 중. 자동 의미 검수는 미래 ADR.
- intent.source 값에 '직접 편집(`hand:`)' 같은 새 출처가 들어올 자리. 사용자가 catalog.yml을 직접 손댄 뒤 다음 단계로 가는 결을 정식화하면 그때 ADR로 추가.
