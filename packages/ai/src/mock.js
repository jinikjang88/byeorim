// Mock AI 어댑터. 결정적 휴리스틱으로 의도를 추출하고 빌트인 템플릿을 추천한다.
// 단위 테스트가 LLM 호출 없이 prospect 흐름을 끝까지 돌릴 수 있게 하는 자리.
// 실제 의도 추출은 미래의 LLM 어댑터가 한다(ADR 0009).

// 도메인별 키워드 표. commerce가 아닌 다른 도메인이 추가될 때 이 표만 갱신한다.
// 카탈로그 데이터(commerce/job-aggregator의 블럭 ID)에는 매몰되지 않는다.
// 이 표는 사용자 자연어 → 빌트인 템플릿 추천이라는 한 단계만 본다.
const TEMPLATE_KEYWORDS = {
  commerce: ['쇼핑', '마켓', '상점', '커머스', '판매', '주문', '결제', '장바구니', '배송'],
  'job-aggregator': ['채용', '구인', '일자리', '공고', '잡', '커리어', '리크루팅'],
  reservation: ['예약', '대관', '클래스', '강좌', '시간표', '부킹', '레슨', '강의', '룸예약'],
};

function suggestTemplate(userInput) {
  const text = (userInput || '').toLowerCase();
  for (const [template, keywords] of Object.entries(TEMPLATE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      return template;
    }
  }
  return null;
}

// 사용자 입력에서 첫 명사구처럼 보이는 자리를 'what'으로 잡는다. 휴리스틱이라 완벽하지 않다.
// who, why는 mock에서는 빈 문자열로 둔다. 실제 LLM 어댑터가 채울 자리.
function extractWhat(userInput) {
  const trimmed = (userInput || '').trim();
  if (!trimmed) return '';
  // 사용자가 "쇼핑몰 만들어줘" 같이 입력하면 동사 앞부분만 잡는다.
  const beforeAction = trimmed.split(/\s*(만들|만들어|만들고|짓|지어|구현)/)[0];
  return (beforeAction || trimmed).trim();
}

// operation별 generic schema placeholder. ADR 0023 결정 5의 표.
// 도메인 무관(CLAUDE.md 섹션 8). 사용자가 실제 도메인 필드로 갱신하거나 미래의 실제
// LLM 어댑터가 도메인 맞춤 필드를 채운다.
const OPERATION_SCHEMAS = {
  create: {
    request: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        created_at: { type: 'string' },
      },
      required: ['id', 'created_at'],
    },
  },
  list: {
    request: null,
    response: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
      },
      required: ['items', 'total'],
    },
  },
  get: {
    request: null,
    response: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update: {
    request: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
    response: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        updated_at: { type: 'string' },
      },
      required: ['id', 'updated_at'],
    },
  },
  delete: {
    request: null,
    response: null,
  },
  search: {
    request: null,
    response: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        total: { type: 'integer' },
      },
      required: ['items', 'total'],
    },
  },
};

// Mock AI 어댑터를 만든다. 인자가 없는 단순 팩토리.
// 미래의 createClaudeAdapter({ apiKey, model }) 같은 시그니처와 같은 결을 따른다.
//
// @returns {import('./adapter.js').AiAdapter}
export function createMockAdapter() {
  return {
    name: 'mock',
    async extractIntent(userInput) {
      return {
        what: extractWhat(userInput),
        who: '',
        why: '',
        suggested_template: suggestTemplate(userInput),
      };
    },
    // ADR 0023의 extractSchema. block과 operation을 받아 generic placeholder schema 반환.
    // _block 인자는 미래의 실제 LLM 어댑터가 도메인 추론에 사용할 자리(현재 mock은 사용 안 함).
    async extractSchema({ block: _block, operation }) {
      const schemas = OPERATION_SCHEMAS[operation];
      if (!schemas) {
        return { request: null, response: null };
      }
      // 깊은 복사로 호출 자리에서 변경해도 표가 안 바뀌게 한다.
      return {
        request: schemas.request ? structuredClone(schemas.request) : null,
        response: schemas.response ? structuredClone(schemas.response) : null,
      };
    },
  };
}
