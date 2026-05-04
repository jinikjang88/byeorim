# ADR 0031. Smelt picker 세계/번들 그룹화와 의존성 상세 검토

- 상태: 채택
- 날짜: 2026-05-05
- 결정자: DevSmith
- 관계: ADR 0029(picker), ADR 0030(두 시점 추천), ADR 0011(인터랙티브 패턴)의 picker UX 보강. ADR 0010 산출물 형식은 그대로

## 맥락

ADR 0029로 smelt가 추천 + 검토 자리를 가졌고, ADR 0030으로 두 시점 reason과 외부 검토 프롬프트를 더했다. picker는 이제 [추천] 라벨로 강조되지만 여전히 두 자리에 막힘이 있다.

첫째, picker가 카탈로그의 모든 블럭을 평면 목록으로 보여준다. commerce 카탈로그는 30개가 넘는 블럭을 5개 세계(파는 사람, 사는 사람, 물류, 돈, 관리) × 10개 안팎 번들로 나누어 둔다. 사용자가 picker를 보면 이 구조가 다 사라지고 한 줄짜리 목록만 보여 막막하다.

둘째, picker focused 자리에 user_desc 한 줄만 보인다. 카탈로그의 priority(필수/선택), effort_days(예상 작업 일수), concerns(주의 자리) 같은 메타가 catalog.schema.json에 박혀있는데 picker에서 사라진다. 사용자가 "이 블럭이 얼마나 무거운지" 모르고 고른다.

셋째, confirm 단계에서 자동 추가/영향/준비물이 ID 목록만 보인다. `cart, product-detail, product-register, payment, pg-integration` 같은 영문 ID 줄을 비기술 창업자가 한국어로 이해하기 어렵다.

이 셋을 한 결로 묶어 picker와 confirm UX를 풍부히 한다. 산출물 형식(selected-blocks.yml ADR 0010)은 그대로.

## 검토한 옵션

### 결정 1. 그룹 깊이

#### 옵션 A. world 단위만(Separator 한 단계)
- 장점: 단순. Separator 5개 안팎. 비기술 창업자가 한 단계만 본다
- 단점: 같은 세계 안의 블럭이 여전히 평면 목록(commerce의 파는 사람 세계는 6~8개)

#### 옵션 B. world + bundle 두 단계
- 장점: 카탈로그의 모든 시각 구조를 picker에 그대로 노출. 사용자가 "상품 관리 안에 등록과 수정이 있어요" 같이 이해
- 단점: Separator가 많아짐(commerce 5 + 12 = 17개). 깊은 카탈로그에서 picker가 김

#### 옵션 C. 사용자가 일단 world만 고르고, 그 안에서 bundle/block을 다음 단계에서
- 장점: 한 번에 한 단계만 본다
- 단점: 인터랙션이 두 번. "고를 자리"가 여러 단계로 나뉘면 확정감 약해짐

### 결정 2. focused 자리 description

#### 옵션 A. user_desc만(현재)
- 장점: 단순
- 단점: priority, effort_days, concerns가 사라짐

#### 옵션 B. user_desc + priority + effort_days + concerns(있으면)
- 장점: 사용자가 블럭 무게를 가늠. 고를 때 결정 도구
- 단점: description이 짧은 단락이 됨(focused 자리만 보임)

#### 옵션 C. dev 시점 정보(tech_desc, api_style)도 함께
- 장점: 개발자에게 풍부
- 단점: 비개발자에게 의미 없는 자리. 1순위 사용자 정신과 어긋남

### 결정 3. confirm 단계 의존성 표시

#### 옵션 A. ID 목록만(현재)
- 장점: 한 줄
- 단점: 사용자가 한국어로 이해 어려움

#### 옵션 B. ID + name(catalog lookup으로 이름 조회)
- 장점: 한국어 이름이 보임
- 단점: name만으로는 무엇을 하는지 정확히 모름

#### 옵션 C. ID + name + user_desc(catalog lookup으로 한국어 한 줄)
- 장점: 비기술 창업자가 한국어로 자동 추가된 자리가 무엇인지 이해
- 단점: 표가 길어짐(자동 추가 6개면 6줄 + 짧은 설명)

### 결정 4. selected-blocks.yml 형식 영향

#### 옵션 A. 그대로 유지(ADR 0010 다섯 필드)
- 장점: 호환성. 다음 단계(shape) 영향 없음
- 단점: 없음

#### 옵션 B. selected-blocks.yml에 name/user_desc 함께 직렬화
- 장점: shape가 catalog 안 읽어도 됨
- 단점: 카탈로그 갱신 시 selected-blocks.yml과 어긋날 위험. 진실의 자리 두 곳

## 결정

### 결정 1: world + bundle 두 단계 (옵션 B)

picker는 worlds → bundles → blocks 두 단계로 그룹화한다. `@inquirer/prompts`의 `Separator`로 각 단계 머리를 끼운다.

```
─── 파는 사람의 세계 ───
  · 상품 관리
    ☐ product-register — 상품 등록
    ☐ product-category — 카테고리
  · 재고 관리
    ☐ inventory — 재고

─── 사는 사람의 세계 ───
  · 가입/인증
    ☐ buyer-signup — 구매자 가입
  · 상품 탐색
    ☐ product-detail — 상품 상세
```

- bundle이 없는 블럭은 world 직속(bundle Separator 없이 바로 block)
- world에 속하지 않은 블럭(bundle도 없거나 bundle.world_id가 catalog에 없음)은 "기타" 그룹
- worlds가 비어있는 catalog는 평면 목록으로 폴백(현재 동작)

### 결정 2: user_desc + priority + effort_days + concerns (옵션 B)

focused 자리에 다음을 한 단락으로 합쳐 보인다.

```
[user_desc 한 단락]
필수 자리예요. 예상 작업 5일. 주의: file-upload
```

- priority가 'required'이면 "필수 자리예요" 한 줄. 'optional'이거나 없으면 안 보임
- effort_days가 있으면 "예상 작업 N일"
- concerns가 있으면 "주의: c1, c2" 한 줄(첫 두세 개)
- tech_desc는 picker에 안 노출(개발자 시점은 prompt 부산물에서 봄)

### 결정 3: confirm은 ID + name + user_desc (옵션 C)

자동 추가/영향/준비물을 한국어로 풀어쓴다.

```
선택한 자리 2개
  - order (주문): 손님이 상품을 주문하는 기능

자동 추가 4개 (선택한 자리가 함께 필요로 하는 자리예요)
  - cart (장바구니): 손님이 고른 상품을 모아두는 자리
  - product-detail (상품 상세): 손님이 상품을 자세히 보는 자리

영향받는 자리 1개 (선택한 자리가 영향을 주는 자리예요)
  - refund (환불): 환불 처리

필요한 준비물 3개
  - 사업자등록 (해당 자리: payment)
  - 통신판매업 신고 (해당 자리: payment)
  - PG사 계약 (해당 자리: pg-integration)
```

catalog의 blocks lookup으로 name과 user_desc를 끌어온다. user_desc가 길면 한 줄로 잘라 표시(첫 70자).

### 결정 4: selected-blocks.yml 그대로 (옵션 A)

ADR 0010 다섯 필드 그대로. picker/confirm은 사용자 화면 자리만 풍부화하고 산출물은 안 건드린다. 다음 단계(shape)가 catalog를 다시 lookup한다(필요 시).

## 결과

### 긍정적
- 비기술 창업자가 picker에서 카탈로그의 시각 구조를 그대로 본다. 30개 블럭이 5개 세계 × 12개 번들로 정리돼 막막함이 줄어듦
- focused 자리의 priority/effort_days/concerns가 사용자 결정을 돕는다. "이 블럭은 5일 무게구나" 같은 가늠
- confirm 단계의 자동 추가가 한국어로 풀이돼 영문 ID에 막히지 않음
- ADR 0010 산출물 형식이 그대로라 다음 단계(shape) 호환성 유지

### 부정적 / 트레이드오프
- picker가 길어짐. commerce는 worlds 5 + bundles 12 + blocks 30 = 47줄 안팎(Separator 17 + 블럭 30). @inquirer checkbox는 스크롤 가능하지만 첫 화면 부담 증가
- focused 자리의 description이 두세 줄 단락이 됨. 기존 한 줄에 익숙한 사용자에게 살짝 무거움
- confirm 단계 표가 길어짐. 자동 추가 6개면 6줄 + 빈 줄 = 8줄. 화면이 한 번에 안 들어올 수 있음

### 미래 묶임
- 그룹 깊이는 두 단계 표준. 세 단계(예: world > bundle > sub-bundle)는 새 ADR
- focused description의 메타 항목 셋(priority, effort_days, concerns)은 표준. 추가하려면 결정 갱신
- confirm 표 형식(ID + name + user_desc)은 표준. 다른 자리(tech_desc 같은) 추가는 결정 갱신
- catalog의 blocks lookup이 sm picker/confirm 둘 다에서 일어남. 헬퍼 함수 한 자리(smelt-picker-helpers.js)에서 책임짐

## 링크
- 갱신 대상: ADR 0029(picker 흐름)와 ADR 0030(두 시점 reason 표기)을 본 picker UX 자리에 풍부화
- 짝 결정: ADR 0010(산출물 형식 그대로 유지), ADR 0011(인터랙티브 패턴 의존성 주입)
- 관련 정책: CLAUDE.md 섹션 0(1순위 사용자), 섹션 8(데이터 무관성: catalog 구조만 가정, 도메인 ID는 안 가정)
