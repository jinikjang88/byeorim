// Reality Check 6영역 표준 질문 시드와 한국어 라벨.
// ADR 0003 결정 1로 정한 6영역(market_saturation, entry_cost, two_sided_market,
// legal_risk, revenue_model, graveyard)이 표의 키. 명세는 docs/specs/reality-check.md.
//
// 데이터만 둔다(코드 없음). CLAUDE.md 섹션 8 파일당 책임을 따른다.
// core에 둔 자리: cli와 ai 어댑터 양쪽이 같은 시드를 본다(의존성 규칙: cli, ai → core).
// 이 시드는 도메인 무관 표준 질문이다. AI 어댑터가 사용자 도메인에 맞춰 다듬을 수 있다.

export const AREAS = [
  'market_saturation',
  'entry_cost',
  'two_sided_market',
  'legal_risk',
  'revenue_model',
  'graveyard',
];

export const AREA_TITLES = {
  market_saturation: '시장 포화도',
  entry_cost: '진입 비용',
  two_sided_market: '양면 시장 함정',
  legal_risk: '법적 리스크',
  revenue_model: '수익 모델 현실',
  graveyard: '사라진 서비스들의 묘지',
};

// 영역별 표준 질문 시드. AI가 도메인 맥락으로 다듬을 수 있는 자리.
// 시드 자체가 답이 아니라 사용자가 멈춰 생각할 자리를 만드는 게 목적.
export const SEED_QUESTIONS = {
  market_saturation: [
    '같은 도메인에서 이미 자리잡은 서비스가 있나요? 있다면 누구인가요',
    '그들과 비교해 사용자가 만들 서비스는 어디가 다른가요',
    '첫 사용자가 기존 서비스 대신 이 서비스를 쓸 이유는 무엇인가요',
  ],
  entry_cost: [
    '사업자등록, 도메인, 호스팅 같은 시작 비용은 얼마로 보세요',
    '출시 후 6개월 버틸 자금이 있으세요',
    '첫 매출이 나기 전까지 혼자 버틸 수 있는 자리인가요',
  ],
  two_sided_market: [
    '공급자와 수요자 양쪽이 다 필요한 서비스인가요',
    '그렇다면 어느 쪽을 먼저 모을 계획이세요',
    '한쪽이 없을 때 다른 쪽이 머무를 이유가 있나요',
  ],
  legal_risk: [
    '사용자 데이터를 어떻게 받고 어떻게 보관할 계획이세요',
    '이 도메인에 인허가가 필요한가요(예: 통신판매업, 학원 등록, 식품 영업)',
    '미성년자가 사용할 자리가 있나요',
  ],
  revenue_model: [
    '누구한테 돈을 받을 건가요(사용자, 광고주, 후원자)',
    '얼마를 받을 건가요. 한 번? 매월?',
    '첫 100명의 결제자가 누구일지 그려지나요',
  ],
  graveyard: [
    '같은 도메인에서 시도했다가 닫은 서비스가 있다면 누가 떠오르나요',
    '그들이 왜 닫았다고 보세요',
    '그 함정을 우리는 어떻게 피할 수 있나요',
  ],
};
