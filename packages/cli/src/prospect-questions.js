// Prospect 7항목 질문 표. 한국어 라벨, 입력 예시, 다이어리 문구를 한 자리에 모은다.
// ADR 0026 결정 1로 정한 7항목(what/who/when/where/why/how_use/how_manage)이 표의 키.
// 데이터만 둔다(코드 없음). CLAUDE.md 섹션 8 파일당 책임을 따른다.
//
// 이 표는 prospect UI 카피라 데이터 무관성 원칙(섹션 8)에 위배되지 않는다.
// 빵집/카페 예시는 한 예일 뿐이고 다른 도메인(학원, 농장, 동아리)도 자연스럽게 채울 수 있다.

export const FIELDS = ['what', 'who', 'when', 'where', 'why', 'how_use', 'how_manage'];

export const QUESTIONS = {
  what: {
    label: '어떤 서비스를 만들고 싶으세요?',
    example: '(예: 동네 빵집 단골 주문 앱)',
    diary: 'what: 어떤 서비스를 만들고 싶으세요? 명사구 한두 마디로 적어보세요.',
  },
  who: {
    label: '누가 사용할까요?',
    example: '(예: 카페 단골 손님과 사장님)',
    diary: 'who: 누가 사용할까요? 카페 단골, 학원 원생처럼 구체적으로 적으면 좋습니다.',
  },
  when: {
    label: '언제 주로 쓰는 서비스일까요?',
    example: '(예: 평일 점심 직전, 주말 오전)',
    diary:
      'when: 언제 주로 쓰는 서비스일까요? 하루 중 시점, 계절, 특정 사건 직전 같은 시간축이 있나요?',
  },
  where: {
    label: '어디에서 쓸까요?',
    example: '(예: 손님은 모바일, 사장님은 매장 태블릿)',
    diary: 'where: 어디에서 쓸까요? 매장 안인지, 모바일인지, 데스크인지 같은 자리가 있나요?',
  },
  why: {
    label: '왜 만드세요?',
    example: '(예: 전화 주문이 자꾸 끊겨서)',
    diary:
      'why: 왜 만드세요? 어떤 문제를 풀고 싶은지, 어떤 가치를 주고 싶은지 한두 줄로 적어보세요.',
  },
  how_use: {
    label: '사용자는 어떻게 쓸까요?',
    example: '(예: QR로 메뉴 보고 주문)',
    diary: 'how_use: 사용자는 어떻게 쓸까요? 한두 줄 시나리오로 그려보면 됩니다.',
  },
  how_manage: {
    label: '운영자는 어떻게 관리할까요?',
    example: '(예: 주방 화면에서 주문 확인, 매주 정산 보고서 받기)',
    diary: 'how_manage: 운영자는 어떻게 관리할까요? 매일/매주 어떤 일을 하실지 떠올려보세요.',
  },
};
