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

// 사용자 입력에서 카탈로그 name/domain 한 자리에 들어갈 문자열을 만든다.
// extractWhat과 같은 결로 명사구를 잡는다. 빈 입력은 '벼름 프로젝트'로 fallback.
function extractCatalogName(userInput) {
  const what = extractWhat(userInput);
  return what || '벼름 프로젝트';
}

// 사용자 입력에서 domain 식별자(소문자, 하이픈)를 만든다. catalog.schema의 id 패턴은 아님(name/domain은 자유 형식).
// 한국어가 들어와도 안전한 fallback. 빈 입력은 'beoreum-project'.
function extractCatalogDomain(userInput) {
  const what = extractWhat(userInput) || '';
  const ascii = what
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'beoreum-project';
}

// ── generateTradeOffDoc 헬퍼 ─────────────────────────────────

function joinBlockNames(ids, blockNameMap) {
  if (!Array.isArray(ids) || ids.length === 0) return '';
  return ids.map((id) => `${blockNameMap.get(id) || id}(\`${id}\`)`).join(', ');
}

// 한 블럭에 대한 트레이드오프 한 단락을 짓는다. 카탈로그 데이터(블럭 ID, 도메인 의미)를 본문에 박지 않는다.
// CLAUDE.md 섹션 8 데이터 무관성. 구조만 본다.
function buildBlockSection(block, ctx) {
  const { dependencies, prerequisites, cascades, blockNameMap } = ctx;
  const lines = [`#### ${block.name} (\`${block.id}\`)`, ''];
  if (block.user_desc) {
    lines.push(block.user_desc, '');
  }
  if (block.analogy) {
    lines.push(`비유: ${block.analogy}`);
  }
  if (Array.isArray(block.concerns) && block.concerns.length > 0) {
    lines.push(`관심사: ${block.concerns.join(', ')}`);
  }

  const requires = dependencies
    .filter((d) => d && d.type === 'requires' && d.source === block.id)
    .map((d) => d.target);
  const affects = dependencies
    .filter((d) => d && d.type === 'affects' && d.source === block.id)
    .map((d) => d.target);
  const enabledBy = prerequisites.filter(
    (p) => p && Array.isArray(p.enables) && p.enables.includes(block.id),
  );
  const triggeredCascades = cascades.filter((c) => c && c.trigger === block.id);

  if (requires.length > 0) {
    lines.push(`함께 따라오는 자리: ${joinBlockNames(requires, blockNameMap)}`);
  }
  if (affects.length > 0) {
    lines.push(`영향을 주는 자리: ${joinBlockNames(affects, blockNameMap)}`);
  }
  if (enabledBy.length > 0) {
    lines.push(`필요한 사전 준비: ${enabledBy.map((p) => p.name).join(', ')}`);
  }
  const cascadeQuestions = [];
  for (const c of triggeredCascades) {
    for (const q of Array.isArray(c.ask_questions) ? c.ask_questions : []) {
      if (q && q.question) cascadeQuestions.push(q.question);
    }
  }
  if (cascadeQuestions.length > 0) {
    lines.push('정해야 할 결정:');
    for (const q of cascadeQuestions) {
      lines.push(`- ${q}`);
    }
  }

  // 트레이드오프 한 단락. 데이터 무관성을 위해 구조 신호만 자연어로 풀어낸다.
  const tradeoff = buildTradeoffSummary({
    requiresCount: requires.length,
    affectsCount: affects.length,
    prereqCount: enabledBy.length,
    cascadeCount: cascadeQuestions.length,
    priority: block.priority,
  });
  lines.push('', `트레이드오프: ${tradeoff}`, '');
  return lines.join('\n');
}

// 트레이드오프 한 문장을 결정적으로 짓는다. 도메인 ID에 의존하지 않고 카운트로만 표현.
function buildTradeoffSummary({ requiresCount, affectsCount, prereqCount, cascadeCount, priority }) {
  const parts = [];
  if (requiresCount > 0) {
    parts.push(`이 블럭을 고르면 ${requiresCount}개 자리가 함께 따라옵니다`);
  }
  if (affectsCount > 0) {
    parts.push(`다른 ${affectsCount}개 자리의 동작 방식이 바뀝니다`);
  }
  if (cascadeCount > 0) {
    parts.push(`${cascadeCount}개 결정을 같이 정해야 합니다`);
  }
  if (prereqCount > 0) {
    parts.push(`코드 밖 사전 준비 ${prereqCount}개가 필요합니다`);
  }
  if (parts.length === 0) {
    return priority === 'optional'
      ? '독립적으로 동작하는 자리. 빼도 다른 블럭이 흔들리지 않습니다.'
      : '독립적으로 동작하는 자리.';
  }
  return parts.join('. ') + '.';
}

function buildBundleSection(bundle, blocksInBundle, ctx) {
  const lines = [`### ${bundle.title} (\`${bundle.id}\`)`, ''];
  if (bundle.description) {
    lines.push(bundle.description, '');
  }
  for (const block of blocksInBundle) {
    lines.push(buildBlockSection(block, ctx));
  }
  return lines.join('\n');
}

function buildWorldSection(world, bundlesInWorld, ctx) {
  const lines = [`## ${world.title} (\`${world.id}\`)`, ''];
  if (world.description) {
    lines.push(world.description, '');
  }
  for (const bundle of bundlesInWorld) {
    const blocks = (ctx.blocks || []).filter((b) => b.bundle_id === bundle.id);
    if (blocks.length === 0) continue;
    lines.push(buildBundleSection(bundle, blocks, ctx));
  }
  return lines.join('\n');
}

function generateDesignDoc({ catalog, intent, now }) {
  const createdAt = (now || new Date()).toISOString();
  const what = (intent && intent.extracted && intent.extracted.what) || '벼름 프로젝트';
  const userInput = (intent && intent.user_input) || '';

  const worlds = Array.isArray(catalog.worlds) ? [...catalog.worlds] : [];
  worlds.sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : 0;
    const bo = typeof b.order === 'number' ? b.order : 0;
    return ao - bo;
  });
  const bundles = Array.isArray(catalog.bundles) ? catalog.bundles : [];
  const blocks = Array.isArray(catalog.blocks) ? catalog.blocks : [];
  const dependencies = Array.isArray(catalog.dependencies) ? catalog.dependencies : [];
  const prerequisites = Array.isArray(catalog.prerequisites) ? catalog.prerequisites : [];
  const cascades = Array.isArray(catalog.cascades) ? catalog.cascades : [];
  const blockNameMap = new Map(blocks.map((b) => [b.id, b.name || b.id]));
  const ctx = { dependencies, prerequisites, cascades, blockNameMap, blocks };

  const header = [
    `# ${what} 설계`,
    '',
    '이 문서는 탐광이 발견한 도메인 카탈로그를 사람이 읽을 결로 펼친 거울입니다.',
    '다음 단계(smelt)에서 어떤 블럭을 고를지 정할 때 옆에 두고 보세요.',
    '',
    `생성 시각: ${createdAt}`,
    `사용자 입력: "${userInput}"`,
    '',
  ].join('\n');

  const worldSections = worlds
    .map((world) => {
      const bundlesInWorld = bundles.filter((b) => b.world_id === world.id);
      return buildWorldSection(world, bundlesInWorld, ctx);
    })
    .join('\n');

  // 어느 bundle에도 묶이지 않은 블럭(또는 bundle 자체가 없는 카탈로그)은 한 자리에 모은다.
  const orphanBlocks = blocks.filter(
    (b) =>
      !b.bundle_id ||
      !bundles.some((bundle) => bundle.id === b.bundle_id),
  );
  let orphanSection = '';
  if (orphanBlocks.length > 0) {
    const lines = ['## 묶이지 않은 자리', ''];
    for (const block of orphanBlocks) {
      lines.push(buildBlockSection(block, ctx));
    }
    orphanSection = lines.join('\n');
  }

  return [header, worldSections, orphanSection].filter(Boolean).join('\n');
}

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
    // ADR 0026, 0027. mock은 시드 카탈로그 구조를 그대로 보존하면서 name과 domain만
    // 사용자 입력에서 뽑은 값으로 갈아끼운다. 결정성 보장(섹션 4 5초 약속).
    // seedCatalog는 caller(prospect cli)가 항상 제공한다. null이면 한국어 안내 에러.
    async generateCatalog({ userInput, intent: _intent, seedCatalog }) {
      if (!seedCatalog || typeof seedCatalog !== 'object') {
        throw new Error(
          'mock generateCatalog는 seedCatalog가 필요합니다. ' +
            '시드 후보를 정한 뒤 다시 호출해주세요. ' +
            '새 도메인을 진짜로 빚으려면 BEOREUM_AI_ADAPTER=claude를 쓰세요',
        );
      }
      const catalog = structuredClone(seedCatalog);
      catalog.name = extractCatalogName(userInput);
      catalog.domain = extractCatalogDomain(userInput);
      return { catalog };
    },
    // ADR 0028. mock은 worlds → bundles → blocks 트리를 결정적 한국어 마크다운으로 펼친다.
    // 데이터 무관성(섹션 8): 시드의 특정 ID나 도메인 의미를 본문에 박지 않고 구조만 본다.
    async generateTradeOffDoc({ catalog, intent, now }) {
      const doc = generateDesignDoc({ catalog, intent, now });
      return { doc };
    },
  };
}
