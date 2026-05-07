// Mock AI 어댑터. 결정적 휴리스틱으로 사용자 7항목 답변에서 빌트인 템플릿을 추천한다.
// 단위 테스트가 LLM 호출 없이 prospect 흐름을 끝까지 돌릴 수 있게 하는 자리.
// 실제 의도 정리는 미래의 LLM 어댑터가 한다(ADR 0009 + 0026).

import { REALITY_CHECK_AREAS, REALITY_CHECK_SEED_QUESTIONS } from '@beoreum/core';

// 도메인별 키워드 표. commerce가 아닌 다른 도메인이 추가될 때 이 표만 갱신한다.
// 카탈로그 데이터(commerce/job-aggregator의 블럭 ID)에는 매몰되지 않는다.
// 이 표는 사용자 답변 → 빌트인 템플릿 추천이라는 한 단계만 본다.
const TEMPLATE_KEYWORDS = {
  commerce: ['쇼핑', '마켓', '상점', '커머스', '판매', '주문', '결제', '장바구니', '배송'],
  'job-aggregator': ['채용', '구인', '일자리', '공고', '잡', '커리어', '리크루팅'],
  reservation: ['예약', '대관', '클래스', '강좌', '시간표', '부킹', '레슨', '강의', '룸예약'],
};

function suggestTemplate(text) {
  const lower = (text || '').toLowerCase();
  for (const [template, keywords] of Object.entries(TEMPLATE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return template;
    }
  }
  return null;
}

// catalog.schema.json의 id 패턴(^[a-z][a-z0-9-]*$)에 맞춰 슬러그를 만든다.
// 한국어 답변에서 알파벳 추출은 휴리스틱이라 빈 결과면 안전한 기본값으로.
function slugFromAnswer(text, fallback) {
  const slug = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  return slug || fallback;
}

// 7항목 답변에서 누락된 자리를 빈 문자열로 정규화한다. AI 어댑터의 입력 약속(ADR 0026).
function normalizeAnswers(answers) {
  const a = answers || {};
  return {
    what: typeof a.what === 'string' ? a.what : '',
    who: typeof a.who === 'string' ? a.who : '',
    when: typeof a.when === 'string' ? a.when : '',
    where: typeof a.where === 'string' ? a.where : '',
    why: typeof a.why === 'string' ? a.why : '',
    how_use: typeof a.how_use === 'string' ? a.how_use : '',
    how_manage: typeof a.how_manage === 'string' ? a.how_manage : '',
  };
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
    async extractIntent(answers) {
      const normalized = normalizeAnswers(answers);
      // 답변을 그대로 통과시키고 모든 답변을 합친 텍스트에서 키워드를 본다.
      // ADR 0026 결정 2에 따라 mock은 답변 정규화/번역을 하지 않는다.
      const combined = Object.values(normalized).join(' ');
      return {
        ...normalized,
        suggested_template: suggestTemplate(combined),
      };
    },
    // ADR 0029 + ADR 0030 + docs/specs/block-recommendation.md의 recommendBlocks.
    // 결정적 휴리스틱: priority='required' 블럭을 먼저, 부족하면 catalog 순서대로 채워 5개,
    // 너무 많으면 앞 10개로 자른다. answers는 mock에서 결과에 영향 안 줌(결정성 보장).
    // reasons는 두 시점({user, dev}) 객체(ADR 0030 결정 1).
    async recommendBlocks({ answers: _answers, catalog } = {}) {
      const blocks = Array.isArray(catalog?.blocks) ? catalog.blocks : [];
      if (!blocks.length) return { recommended: [], reasons: {} };
      const required = blocks.filter((b) => b && b.priority === 'required');
      const others = blocks.filter((b) => !b || b.priority !== 'required');
      const picked = [...required];
      for (const b of others) {
        if (picked.length >= 5) break;
        picked.push(b);
      }
      const limited = picked.slice(0, 10);
      const recommended = limited.map((b) => b.id).filter((id) => typeof id === 'string');
      const reasons = {};
      for (const b of limited) {
        if (typeof b?.id !== 'string') continue;
        if (b.priority === 'required') {
          reasons[b.id] = {
            user: '카탈로그가 핵심으로 표시한 자리예요',
            dev: 'priority=required 블럭',
          };
        } else {
          reasons[b.id] = {
            user: '카탈로그 순서 기준으로 골라봤어요(자동 추천이라 도메인은 못 봐요)',
            dev: 'mock heuristic: catalog index fallback',
          };
        }
      }
      return { recommended, reasons };
    },
    // ADR 0032 + docs/specs/architecture-recommendation.md의 recommendArchitecture.
    // 결정적 휴리스틱: ADR 0012의 4개 결정에 첫 옵션을 추천한다(node/postgresql/rest/monolith).
    // answers와 selectedBlocks는 mock에서 결과에 영향 안 줌(결정성 보장).
    // reasons는 두 시점({user, dev}) 객체. 모든 시점이 같은 한 줄로 결정성을 유지.
    async recommendArchitecture({
      answers: _answers,
      catalog: _catalog,
      selectedBlocks: _selectedBlocks,
    } = {}) {
      const recommended = {
        language: 'node',
        database: 'postgresql',
        api_style: 'rest',
        architecture_pattern: 'monolith',
      };
      const reasonText = {
        user: '흔히 시작하는 자리로 골라봤어요(자동 추천이라 도메인은 못 봐요)',
        dev: 'mock heuristic: ADR 0012 default option',
      };
      const reasons = {
        language: { ...reasonText },
        database: { ...reasonText },
        api_style: { ...reasonText },
        architecture_pattern: { ...reasonText },
      };
      return { recommended, reasons };
    },
    // ADR 0003 + docs/specs/reality-check.md의 generateRealityCheck.
    // 6영역 표준 시드 질문을 그대로 돌려주고 observation은 빈 문자열, legal_warnings는 빈 배열.
    // 실제 도메인 관찰은 LLM 어댑터가 한다. mock은 결정성과 형식만 보장.
    async generateRealityCheck({ answers: _answers, catalog: _catalog } = {}) {
      const areas = {};
      for (const area of REALITY_CHECK_AREAS) {
        areas[area] = {
          observation: '',
          questions: [...REALITY_CHECK_SEED_QUESTIONS[area]],
        };
      }
      return { areas, legal_warnings: [] };
    },
    // ADR 0027의 generateCatalog. 7항목 답변을 받아 최소 검증 통과 카탈로그를 결정적으로 돌려준다.
    // 단위 테스트가 LLM 호출 없이 prospect의 AI 옵션 흐름을 끝까지 돌릴 수 있게 하는 자리.
    // 실제 도메인 합성은 미래의 실제 LLM 어댑터가 한다.
    // seedTemplate은 mock에선 무시(테스트 결정성을 위해). 실제 어댑터에서는 영감으로 사용.
    async generateCatalog({ answers, seedTemplate: _seedTemplate } = {}) {
      const a = normalizeAnswers(answers);
      const name = a.what || '사용자 도메인';
      // 사용자 세계와 운영자 세계를 기본으로 둔다. 답변에서 더 풍부한 worlds를 만드는 일은
      // mock 범위가 아니다(섹션 8 데이터 무관성: 도메인 가정 금지).
      return {
        name,
        domain: slugFromAnswer(a.what, 'service'),
        worlds: [
          {
            id: 'w-user',
            title: '사용자 세계',
            description: a.who || '서비스 사용자',
          },
          {
            id: 'w-operator',
            title: '운영자 세계',
            description: '서비스를 운영하는 사람',
          },
        ],
        blocks: [
          {
            id: 'b-core',
            name: '핵심 기능',
            user_desc: a.what || '핵심 기능',
            tech_desc: '핵심 기능을 구현하는 자리',
          },
          {
            id: 'b-manage',
            name: '관리',
            user_desc: a.how_manage || '운영자 관리',
            tech_desc: '운영 흐름을 다루는 자리',
          },
        ],
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
    // ADR 0036의 fillTestCode. 시나리오 GWT 텍스트를 인용한 의도 한 줄 주석을 돌려준다.
    // 도메인 무관(CLAUDE.md 섹션 8). 결정적: 같은 입력에 같은 출력.
    // _block과 _endpoint는 미래의 실제 LLM 어댑터가 도메인 추론에 사용할 자리.
    async fillTestCode({
      block: _block,
      endpoint: _endpoint,
      scenario,
      architecture: _architecture,
    } = {}) {
      const s = scenario || {};
      const given = (s.given || '').trim();
      const when = (s.when || '').trim();
      const then = (s.then || '').trim();
      if (!given && !when && !then) return '';
      return `// TODO: ${given}을 준비하고 ${when}을 호출해 ${then}을 검증한다`;
    },
    // ADR 0050의 inspectCode. 6영역 결정적 placeholder finding을 돌려준다.
    // 결정 4 옵션 A: mock은 가짜 finding이지만 사용자가 어떤 결로 자라날지 본다.
    // claude 어댑터로 바꾸면 실제 검수가 된다.
    async inspectCode({
      language: _language,
      files: _files,
      intent: _intent,
      architecture: _architecture,
      contracts: _contracts,
      scenarios: _scenarios,
    } = {}) {
      const placeholderDetail =
        'mock 어댑터는 가짜 finding을 반환합니다. 실제 검수는 claude 어댑터(BEOREUM_AI_ADAPTER=claude)로 실행하세요. Claude Code 사용자는 ANTHROPIC_BASE_URL로 브릿지할 수 있습니다(ADR 0025).';
      const areas = ['보안', '성능', '운영', '확장성', '법적 리스크', '시장 재검'];
      return areas.map((area) => ({
        area,
        severity: 'warning',
        title: 'AI 검수 결과가 들어올 자리(mock)',
        detail: placeholderDetail,
        source: 'ai',
      }));
    },
  };
}
