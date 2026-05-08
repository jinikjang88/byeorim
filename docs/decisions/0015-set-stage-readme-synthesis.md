# ADR 0015. Set 단계 MVP 책임과 README 합성 정책

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0006이 Set 단계를 도입했다. "도구를 일으켜 세우는 일. 단조에서 정의한 계약과 다듬에서 적은 의도를 합쳐 실제 코드를 짓고, 그 코드가 자기 발로 서는지 컴파일과 테스트로 확인한다."

ADR 0007이 산출물 자리를 박았다.
- `.byeorim/project/generated/`: 생성된 코드
- `.byeorim/project/verify-report.md`: 검증 결과 리포트

지금까지 7단계 중 6단계까지 결정과 산출물이 모였다.
- intent.yml: 사용자 의도(prospect)
- catalog/catalog.yml: 도메인 카탈로그(prospect)
- selected-blocks.yml: 선택 + 자동 추가 + 영향 + World 0 준비물(smelt)
- decisions.yml: cascade 결정(smelt, answer가 답을 채움)
- architecture.yml: 4개 핵심 아키텍처 결정(shape)
- contracts.yml: API 계약(forge)
- test-scenarios.yml: Given-When-Then 테스트 의도(temper)

여기서 set이 무엇을 해야 하는가가 결정 자리다. 답해야 할 질문은 다음 셋이다.

첫째, MVP의 범위가 어디인가. 합성 README만 만들 것인가, 실제 코드 스켈레톤까지 만들 것인가, 풀 코드 생성을 할 것인가. 풀 코드는 지금 결정할 자리가 너무 많다(언어, 빌드 도구, 웹 프레임워크, 테스트 프레임워크, 디렉토리 구조). 한 ADR에 묶으면 미래 마이그레이션 부담이 모든 자리에 동시에 걸린다.

둘째, MVP가 합성 README라면 어떤 섹션을 가져야 하는가. 비기술 창업자가 받자마자 의미 있는 단일 문서가 되어야 한다. 7단계의 산출물이 어떻게 한 문서로 합쳐지는지가 표준이 된다.

셋째, verify-report.md는 어떻게 채울 것인가. 실제 코드가 없으면 verify(컴파일/테스트 실행)가 의미 없다. placeholder로 두되 미래 자리를 어떻게 비워둘지 정해야 한다.

## 검토한 옵션

### 결정 1. MVP 범위

#### 옵션 A. README 합성만 (이번 출시)
- 장점: ADR이 짧아진다. 언어/프레임워크 결정을 미래 ADR로 미룬다. 비기술 창업자가 받을 수 있는 가장 큰 가치(7단계 산출물의 단일 문서 합성)를 즉시 만든다. 그 문서를 개발자나 AI 도우미에게 들고 가면 코드 작업의 출발점이 된다
- 단점: "도구를 일으켜 세운다"는 메타포가 약해진다. 코드는 미래 자리

#### 옵션 B. Node.js 스켈레톤 + README
- 장점: 메타포 충실
- 단점: 언어(node), 빌드 도구(npm), 웹 프레임워크(Express), 테스트 프레임워크(node:test) 결정을 한 ADR에 박아야 한다. 미래에 java/python 추가 시 매핑 표가 늘어난다. ADR 0013(REST만)과 ADR 0014(템플릿 표)가 잡은 "한 자리에 집중하고 미래로 확장" 패턴과 결이 다르다(이쪽은 한 자리라기보다 한 묶음)

#### 옵션 C. 풀 코드 생성
- 장점: 사용자 가치가 가장 큼
- 단점: 한 ADR에 너무 많은 결정. forge-protocol이 풀 코드 생성을 했지만 그건 v0.5.0까지 자란 결과물. 처음부터 풀 코드는 위험

### 결정 2. README 섹션 구성

#### 옵션 A. 7단계 산출물을 7개 섹션으로 + 다음 단계 안내
- 장점: 산출물과 섹션이 짝. 사용자가 어느 섹션이 어느 단계의 결과인지 즉시 안다
- 단점: 7개 섹션이 길어 보일 수 있음

#### 옵션 B. 카테고리별 섹션 (개요, 도메인, 기술 결정, 다음 단계)
- 장점: 짧고 구조적
- 단점: 단계와 섹션이 1:1이 아니라 사용자가 머리 모형을 다시 만들어야 함

### 결정 3. verify-report.md 형식

#### 옵션 A. 한국어 placeholder + 미래 자리 안내
- 장점: 사용자가 이 자리가 비어있음을 명시적으로 본다. ADR 0014의 test_code TODO와 같은 결
- 단점: 의미 있는 검증 결과가 없음

#### 옵션 B. 생략 (파일 자체를 안 만듦)
- 장점: 빈 파일 노이즈 없음
- 단점: ADR 0007이 박은 자리(verify-report.md)가 비어있는 게 아니라 아예 없는 상태가 됨. 미래 자리가 안 보임

### 결정 4. generated/ 디렉토리 미래 확장

#### 옵션 A. README.md만 두고 다른 파일은 미래 ADR로
- 장점: MVP 범위 명확. 언어별 코드 생성이 들어올 때 디렉토리 구조도 함께 결정
- 단점: 지금은 generated/ 안에 한 파일만 있어 디렉토리가 살짝 비어 보임

#### 옵션 B. README.md + 빈 src/ test/ 디렉토리 placeholder
- 장점: 미래 자리가 시각적으로 보임
- 단점: 빈 디렉토리는 git에서 추적이 어렵다(.gitkeep 파일 필요). 노이즈

## 결정

### 결정 1: README 합성만 (옵션 A)

이번 출시의 set은 `.byeorim/project/generated/README.md` 한 파일과 `.byeorim/project/verify-report.md` 한 파일을 만든다. 실제 코드 생성(언어/프레임워크/빌드 도구)은 모두 미래 ADR로 미룬다.

이 결정의 핵심은 "한 자리에 집중하고 미래로 확장"이다. ADR 0013과 ADR 0014가 같은 결로 결정했고, set도 같은 결을 따른다. 풀 코드 생성을 한 ADR에 박으면 미래 마이그레이션 부담이 모든 자리에 동시에 걸린다는 위험을 회피.

set의 의미는 합성 README 한 자리에서 살아남는다. 7단계의 산출물이 한 문서로 합쳐지는 자리. 비기술 창업자가 그 문서를 들고 개발자나 AI 도우미에게 갈 수 있는 단일 출발점.

### 결정 2: 7개 섹션 + 다음 단계 안내 (옵션 A)

README의 표준 섹션은 다음과 같다. 각 섹션이 한 단계의 산출물에서 나온다.

1. **프로젝트 개요** — intent.yml의 what/who/why와 source
2. **만들 블럭** — selected-blocks.yml의 selected, auto_added, affected, prerequisites
3. **cascade 결정** — decisions.yml의 답한 결정과 빈 결정
4. **아키텍처 결정** — architecture.yml의 4개 결정
5. **API 계약** — contracts.yml의 블럭별 endpoints
6. **테스트 의도** — test-scenarios.yml의 블럭별 시나리오
7. **다음 단계 안내** — 이 문서를 어떻게 활용할지, 미래 출시에서 코드 생성이 들어온다는 안내

각 섹션의 본문은 입력 파일의 데이터를 deterministic하게 풀어낸다. AI 추론이나 휴리스틱 없이 입력이 정해지면 출력도 정해진다.

빈 자리는 한국어로 명시한다(예: who가 비어있으면 "(아직 답하지 않음)"). ADR 0003의 동행 톤을 글에 박는다.

### 결정 3: 한국어 placeholder + 미래 자리 안내 (옵션 A)

`.byeorim/project/verify-report.md`는 다음과 같은 placeholder로 채워진다.

```markdown
# Verify Report

이 자리는 다음 출시에서 채워집니다.

set 단계의 verify(생성된 코드의 컴파일과 테스트 실행)는 실제 코드 생성이 들어와야 의미가 있습니다. 이번 출시는 합성 README 중심이고, 코드 생성과 verify 실행은 미래 ADR로 정합니다.

지금은 다음 단계(inspect)로 그대로 넘어가실 수 있습니다.

생성된 시각: {created_at}
```

ADR 0014의 test_code TODO와 같은 결. 빈 자리가 명시적으로 보이고 미래 자리가 비워져 있다.

### 결정 4: README.md만 두고 미래 확장은 ADR (옵션 A)

`.byeorim/project/generated/`에 이번 출시는 README.md 한 파일만 둔다. 빈 디렉토리(src/, test/) placeholder는 두지 않는다.

미래에 언어별 코드 생성 ADR이 들어오면 그 ADR이 `generated/` 안의 디렉토리 구조를 함께 결정한다(예: node 코드 생성 ADR이 `generated/src/`, `generated/test/` 구조를 박는다).

`.byeorim/.gitignore`(ADR 0007)가 `project/generated/`를 무시하므로 README는 git에 올라가지 않는다. 다만 사용자가 직접 봐야 하는 문서이므로, 사용자가 commit할지는 본인 선택이다(.gitignore에 예외를 추가).

## 결과

### 긍정적
- 7단계 산출물이 한 문서로 합쳐지는 자리가 박혔다. 사용자가 받자마자 단일 출발점을 얻는다
- 언어/프레임워크/빌드 도구 결정을 미래 ADR로 미뤘으므로 잘못된 결정으로 미래 마이그레이션 부담이 동시에 걸리는 위험 없음
- 7개 섹션과 7단계의 1:1 짝이 사용자에게 머리 모형을 만든다. 어느 섹션이 어느 단계의 결과인지 즉시 안다
- README가 deterministic 변환이라 단위 테스트가 결정적이고 빠르다. 같은 입력은 같은 출력
- verify-report.md placeholder가 ADR 0007이 박은 자리를 비워두는 자리로 살아남는다. 미래에 verify 실행이 들어오면 자연스럽게 채워짐

### 부정적 / 트레이드오프
- "도구를 일으켜 세운다"는 메타포가 MVP에서는 합성 문서로 표현된다. 메타포 충실도는 미래 출시(코드 생성)에서 더 살아남
- 사용자가 실제 코드는 직접 짜거나 다른 도구로 만들어야 한다. 다만 README가 그 작업의 명확한 출발점을 제공
- generated/가 한 파일만 가지고 있어 디렉토리가 살짝 비어 보임. 미래 확장 시 자연스럽게 풍부해짐
- 7개 섹션이 길어 보일 수 있다. 다만 섹션 헤더가 명확하면 사용자가 필요한 자리만 보면 됨

### 미래 묶임
- README의 7개 섹션 구성은 표준이다. 변경하려면 ADR이 필요하다
- 언어별 코드 생성(Node/Java/Python)은 별도 ADR로. 각 ADR이 generated/ 안의 디렉토리 구조와 파일 형식을 함께 박는다
- verify 실행(컴파일/테스트)은 별도 ADR로. 외부 프로세스 호출 정책, 보안, 결과 형식이 함께 결정된다
- 빌드 도구(npm/maven/poetry 등)는 언어별 ADR에 묶여 들어옴
- AI 기반 코드 채움(test_code, request_schema 등)은 별도 ADR로
- 합성 README의 본문 깊이도 미래에 확장될 수 있음(예: AI가 도메인 맥락으로 풀어 쓰는 자리). 본 ADR은 deterministic 변환만 정함

## 링크
- 이전 결정: ADR 0006 (set 단계 도입), ADR 0007 (자리), ADR 0008-0014 (각 단계 산출물 형식)
- 후속 작업 후보: 언어별 코드 생성 ADR(Node/Java/Python), verify 실행 ADR, 빌드 도구 ADR, AI 기반 채움 ADR
- 관련 정책: CLAUDE.md 섹션 0(사용자 우선순위), 섹션 6(아키텍처 결정 ADR), 섹션 8(파일당 책임, 한국어 메시지)
