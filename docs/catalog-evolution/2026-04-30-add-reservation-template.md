# 2026-04-30. reservation 도메인 카탈로그 추가

## 무엇을 추가했는가

`packages/templates/reservation/catalog.yml`을 신설했다. 매니페스토 IV의 1순위 사용자(학원 원장님, 카페 사장님, 공방 운영자, 미용실 주인 같은 시간 단위 자리를 가진 비기술 창업자)가 첫 만남에서 자기 도메인을 만나볼 수 있도록 하는 자리다. 기존 두 카탈로그(commerce, job-aggregator) 옆에 세 번째 도메인이 들어왔다.

| 도메인 | worlds | bundles | blocks | dependencies | cascades | prerequisites |
|--------|--------|---------|--------|--------------|----------|---------------|
| commerce | 6 | 13 | 21 | 19 | 3 | 5 |
| job-aggregator | 4 | 7 | 17 | 19 | 0 | 0 |
| reservation | 4 | 8 | 14 | 21 | 3 | 3 |

## 도메인 모양

reservation은 시간 자리를 자원으로 다루는 모든 서비스를 가린다. 학원의 한 시간 수강 슬롯, 카페의 룸 한 자리, 공방 클래스, 미용실 예약, 마사지샵 시간대. 자원은 다르지만 흐름은 같다. 손님이 빈 시간을 본다. 자리를 잡는다. 결제한다. 알림을 받는다. 필요하면 취소한다. 정책에 따라 환불을 받는다.

worlds 네 개로 자리를 잡았다. 손님의 세계, 주인의 세계, 돈이 흐르는 세계, 연결하는 세계. 손님과 주인을 분리한 건 commerce(파는 사람/사는 사람)와 같은 결이지만, 정산(settlement)이 빠진 자리는 다르다. 예약 도메인은 일반적으로 한 주인이 자기 자리를 직접 운영하거나 멀티 호스트 정산이 별도 layer로 들어간다. 첫 출시는 단일 호스트 가정으로 가볍게 둔다. 멀티 호스트 정산이 필요해지면 별도 cascade 또는 ADR로 본다.

## 핵심 의존성과 cascade

### reservation의 자동 추가 (requires)

reservation 한 블럭만 선택해도 다음이 따라온다.
- schedule-manage (시간표가 있어야 잡을 수 있다)
- customer-account (예약자 신원 필요)
- payment (결제와 묶인 흐름. 무료 예약은 cascade 질문에서 분기)

payment의 requires 체인을 따라 pg-integration까지 끌려온다. 매니페스토 II.6 "쿠폰을 넣었으면 환불, 정산, 결제도 따라온다"의 reservation 도메인 버전이 데이터에 살아있다.

### 매니페스토와 직접 연결되는 cascade 두 개

**reservation cascade**의 첫 질문은 "두 손님이 동시에 마지막 자리를 잡으면 어떻게 처리하나요?"다. 매니페스토 II.6의 동시성 예시가 데이터에 그대로 박혔다. 옵션은 셋. 결제까지 끝낸 사람이 가져감(낙관적 락), 선착순 자리 잠금 후 결제 시간 부여, 랜덤 추첨. 셋 중 어느 결정이 사용자 도메인에 맞는지가 cascade의 본 질문이다.

**cancellation-policy cascade**의 첫 질문은 "취소는 언제까지 가능한가요?"다. 음식점 예약 안내문에 적혀있는 정책 그대로다. 취소 가능 시간과 환불률이 묶여 있고 그 결정이 refund 블럭의 환불액 계산 로직을 분기시킨다.

### World 0 prerequisite 셋

- 사업자등록 (PG 연동, payment의 enable)
- PG사 계약 (payment의 enable, 사업자등록 prereq의 후속)
- 카카오 비즈채널 (notification의 enable)

commerce의 다섯 prerequisite 중 통신판매업 신고와 택배사 계약은 reservation에는 안 들어간다. 통신판매업은 물건을 파는 자리에 묶인 신고이고 reservation은 시간 자원을 파는 자리라 다른 등록 카테고리(예약 서비스는 별도 신고가 일반적으로 불필요)에 속한다. 택배사 계약은 물리 배송이 없어 자연스럽게 빠진다. 만약 도메인이 "예약 + 자재 배송"으로 확장되면 그 자리는 별도 ADR.

## 어댑터 후보 표 갱신

`packages/ai/src/mock.js`의 `TEMPLATE_KEYWORDS` 표에 reservation 키워드 묶음을 추가했다. 키워드는 예약, 대관, 클래스, 강좌, 시간표, 부킹, 레슨, 강의, 룸예약. mock 어댑터가 이 키워드 중 한 단어라도 만나면 reservation을 추천한다.

`packages/ai/src/claude.js`의 `INTENT_SYSTEM_PROMPT`에도 reservation 후보를 한 자리 추가했다. 기존 두 줄짜리 후보 목록("commerce", "job-aggregator")에 세 번째가 들어왔다. Claude 모델은 자연어 추론으로 도메인을 잡으니 키워드 표보다 폭이 넓다.

## 다이어리에 남길 자리

reservation 카탈로그를 짜면서 답하지 못한 질문 몇 가지가 떠올랐다. 미래의 사용자 또는 우리가 자체 적용을 시작하면 다시 만날 자리.

- 첫째, 무료 예약(결제 없는 학원 첫 상담 같은 자리)을 reservation cascade의 결제 필수성 질문으로 분기시켰다. 그러나 무료 예약 도메인이 압도적이라면 payment를 requires가 아니라 affects로 두는 게 맞을 수도 있다. commerce의 coupon이 affects로 들어간 결과 패턴을 본받을 자리. 사용자 신호가 나오면 한 번 더 본다
- 둘째, 멀티 호스트(여러 주인이 한 플랫폼을 공유) 시나리오를 첫 출시에서 제외했다. 카페 사장님이 자기 카페만 운영하는 게 일반적이지만, 공유 사무실/공유 스튜디오 도메인이 들어오면 정산(settlement) 블럭이 다시 필요해진다
- 셋째, 노쇼 처리 옵션 중 "다음 예약 제한(블랙리스트)"은 PII와 사용자 권리 문제와 묶인다. 절대 금지선 7번(텔레메트리 금지)과는 결이 다르지만 사용자 데이터를 다룬다는 자리에서 한 번 더 검토 필요. cancellation-policy cascade의 두 번째 질문 결정 자리

## 형식 일관성

commerce의 결을 따라 작성했다. 모든 블럭에 user_desc, tech_desc, analogy를 두고, priority/effort_days/api_style을 채웠다. job-aggregator는 analogy가 없는 결로 자라서 reservation과 일관성이 살짝 어긋나지만 이번 PR에서는 reservation이 commerce 결을 따른다는 결정만 명시한다. 두 도메인 사이 형식 차이를 통일하는 별도 ADR이 필요해지면 그때 본다(2026-04-28 노트의 "형식 차이"가 이미 같은 자리에서 한 번 기록됨).
