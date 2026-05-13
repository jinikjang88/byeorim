// contracts-review-prompt.md 합성. ADR 0035의 외부 AI 계약 검토 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 endpoint 누락/과다,
// schema 도메인 적합성, 시작 무게를 자세히 검토받는 결.
// smelt의 block-review-prompt.md(ADR 0030), shape의 architecture-review-prompt.md(ADR 0033)와 같은 결을 따른다.
// ADR 0039로 응답 형식 안내 섹션을 박음(byeorim forge import-review가 읽을 자리).

import yaml from 'js-yaml';

const HEADER = `# 계약 검토 프롬프트

이 프롬프트를 외부 AI(Claude.ai, ChatGPT, Gemini 등)에 붙여넣어 지금 만든 endpoint와
schema가 도메인에 어울리는지, 누락되거나 과다한 자리가 있는지, 시작 무게가 맞는지를
자세히 검토받을 수 있어요. 응답은 자유 형식이라 사용자가 읽고 forge-contracts.yml을 수동으로
다듬으시거나 byeorim forge를 다시 돌릴 수 있어요.

---

## AI에게 보낼 자리 (아래 ─── 사이를 모두 복사하세요)

──────────────────────────────────────────

`;

const FOOTER = `

──────────────────────────────────────────
`;

const SYSTEM_TEXT = `너는 사용자가 만들고 싶은 서비스의 API 계약을 검토하는 도우미다.
사용자는 비기술 창업자(카페 사장님, 학원 원장님 같은 도메인 전문가)다.
일상 한국어로 답하고 단축어는 풀어쓴다(예: API는 "프로그램 사이의 약속", REST는 "웹 표준 방식", endpoint는 "프로그램이 받는 자리", CRUD는 "만들고 보고 고치고 지우는 자리", schema는 "데이터 모양", PG는 "결제대행사", JSON은 "데이터 표현 형식").

입력으로 다음 자리를 받는다.
- 사용자 7항목 답변(answers): 사용자 도메인을 그린 자리(prospect 단계)
- 카탈로그 전체 blocks: 도메인의 모든 블럭 후보
- 사용자가 고른 블럭(selected_blocks): 사용자가 smelt에서 직접 고른 자리와 자동 추가된 자리
- 4개 아키텍처 결정(architecture): 언어, 저장소, API 형태, 코드 구조
- API 계약(contracts): 블럭별로 자동 생성된 endpoint와 schema. 표준 매핑은 resource=5개(만들기/목록/한 건/고치기/지우기), query=1개(검색), internal=0개

너의 일은 다음 셋이다.

1) endpoint 누락/과다. 자동 생성된 매핑이 사용자 도메인에 어울리는지 한두 줄로. 평균에서 벗어난 블럭(예: 읽기 전용 자원이 5개 다 있을 필요는 없어요, 또는 write가 더 필요한 자리)을 짚어주세요.
2) schema 도메인 적합성. 각 endpoint의 request/response schema가 사용자 도메인 의미에 잘 맞는지. 누락된 핵심 필드, 과다한 필드, 타입이 어울리지 않는 자리(예: 결제 amount는 정수보다 정밀 숫자가 안전)를 일상어로 안내해주세요.
3) 시작 무게. 지금 endpoint 개수와 schema 깊이가 너무 무거우면 줄일 자리, 너무 가벼우면 키울 자리. MVP에서 다 필요하지 않은 자리도 있을 수 있어요.

규칙.
- 차단하지 않는다. 사용자가 자유롭게 결정. 너는 시각만 추가
- 표준 매핑(resource=5/query=1/internal=0) 자체는 바꾸지 않는다. 가감 추천만
- 마케팅 카피 형용사("강력한", "획기적인", "본질적인") 금지
- 단정형보다 가능성형 결("이 자리도 어울릴 수 있어요", "다음에 같이 보면 좋아요")
- 사용자 답변과 블럭 이름의 단어를 인용하면 친근

답하지 못한 자리는 솔직히 비운다("이 영역은 도메인 정보가 부족해요" 같이).`;

function formatAnswers(answers) {
  const a = answers || {};
  const fields = ['what', 'who', 'when', 'where', 'why', 'how_use', 'how_manage'];
  const lines = [];
  for (const key of fields) {
    const value = (a[key] || '').toString().trim();
    lines.push(`- ${key}: ${value || '(비어있음)'}`);
  }
  return lines.join('\n');
}

function formatBlocks(blocks) {
  return (blocks || [])
    .map((b) => {
      const id = b?.id || '?';
      const name = b?.name || '?';
      const userDesc = b?.user_desc || '';
      const priority = b?.priority ? ` [${b.priority}]` : '';
      return `- ${id}${priority} (${name}): ${userDesc}`;
    })
    .join('\n');
}

function formatSelectedSection(selectedBlocks) {
  const sb = selectedBlocks || {};
  const selected = Array.isArray(sb.selected) ? sb.selected : [];
  const autoAdded = Array.isArray(sb.auto_added) ? sb.auto_added : [];
  const lines = [];
  lines.push(`사용자가 직접 고른 블럭: ${selected.length}개`);
  lines.push(selected.length ? selected.map((id) => `- ${id}`).join('\n') : '- (없음)');
  lines.push('');
  lines.push(`의존성으로 자동 추가된 블럭: ${autoAdded.length}개`);
  lines.push(autoAdded.length ? autoAdded.map((id) => `- ${id}`).join('\n') : '- (없음)');
  return lines.join('\n');
}

function formatArchitecture(architecture) {
  const a = architecture || {};
  const labels = {
    language: '언어',
    database: '저장소',
    api_style: 'API 형태',
    architecture_pattern: '코드 구조',
  };
  const lines = [];
  for (const key of ['language', 'database', 'api_style', 'architecture_pattern']) {
    lines.push(`- ${labels[key]}: ${a[key] || '(비어있음)'}`);
  }
  return lines.join('\n');
}

// schema 자리를 마크다운에 풀어쓴다. JSON Schema 객체는 YAML 들여쓰기, TODO는 한 줄 안내(ADR 0035 결정 4).
// 들여쓰기 깊이는 3 자리 indent(endpoint 안에서 보이도록).
function formatSchemaValue(schema) {
  if (schema === undefined || schema === null) return '      (없음)';
  if (schema === 'TODO') return '      (TODO — 아직 채워지지 않음)';
  if (typeof schema === 'string') return `      ${schema}`;
  // 객체: YAML 들여쓰기 6칸으로 풀어쓰기
  const dumped = yaml.dump(schema, { sortKeys: false }).trimEnd();
  return dumped
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
}

// 한 endpoint를 마크다운으로 풀어쓴다.
function formatEndpoint(endpoint) {
  const ep = endpoint || {};
  const method = ep.method || '?';
  const path = ep.path || '?';
  const operation = ep.operation || '?';
  const description = (ep.description || '').trim();
  const lines = [];
  lines.push(`  - ${method} ${path}  (${operation})`);
  if (description) lines.push(`    설명: ${description}`);
  lines.push('    request_schema:');
  lines.push(formatSchemaValue(ep.request_schema));
  lines.push('    response_schema:');
  lines.push(formatSchemaValue(ep.response_schema));
  return lines.join('\n');
}

// 한 contract(블럭 단위)를 마크다운으로 풀어쓴다.
function formatContract(contract) {
  const c = contract || {};
  const name = c.name || c.block_id || '(이름 없음)';
  const blockId = c.block_id || '?';
  const apiStyle = c.api_style || 'resource';
  const lines = [];

  if (c.internal === true) {
    lines.push(`### ${name} (${blockId}, internal — 공개 API 없음)`);
    return lines.join('\n');
  }

  const endpoints = Array.isArray(c.endpoints) ? c.endpoints : [];
  lines.push(`### ${name} (${blockId}, ${apiStyle}, endpoint ${endpoints.length}개)`);
  if (endpoints.length === 0) {
    lines.push('- (endpoint 없음)');
    return lines.join('\n');
  }
  for (const ep of endpoints) {
    lines.push(formatEndpoint(ep));
  }
  return lines.join('\n');
}

function formatContractsSection(contracts) {
  const list = Array.isArray(contracts) ? contracts : [];
  if (list.length === 0) return '(계약이 비어있어요)';
  return list.map((c) => formatContract(c)).join('\n\n');
}

// contracts-review-prompt.md 본문을 합성한다.
//
// 입력:
//   answers        - ProspectAnswers (7항목 답변)
//   catalog        - 전체 카탈로그(blocks를 모두 보낸다)
//   selectedBlocks - SelectedBlocks (smelt 산출물)
//   architecture   - { language, database, api_style, architecture_pattern } (shape 산출물)
//   contracts      - 블럭별 contract 배열(forge 산출물). 각 contract는 endpoints 배열을 가짐
//
// 반환: 마크다운 문자열
export function buildContractsReviewPromptMarkdown({
  answers,
  catalog,
  selectedBlocks,
  architecture,
  contracts,
} = {}) {
  const blocks = catalog && Array.isArray(catalog.blocks) ? catalog.blocks : [];
  const body = [
    SYSTEM_TEXT,
    '',
    '## 사용자 7항목 답변',
    '',
    formatAnswers(answers),
    '',
    '## 카탈로그 전체 블럭 (사용자 도메인의 모든 후보)',
    '',
    `총 ${blocks.length}개 블럭. priority가 표시된 자리는 카탈로그가 핵심으로 본 블럭이에요.`,
    '',
    formatBlocks(blocks),
    '',
    '## 사용자가 고른 블럭 (smelt 결과)',
    '',
    formatSelectedSection(selectedBlocks),
    '',
    '## 4개 아키텍처 결정 (shape 결과)',
    '',
    formatArchitecture(architecture),
    '',
    '## 자동 생성된 API 계약 (forge 결과)',
    '',
    '표준 매핑: resource=5개(만들기/목록/한 건/고치기/지우기), query=1개(검색), internal=0개. schema는 AI 어댑터가 채운 자리(없으면 TODO).',
    '',
    formatContractsSection(contracts),
    '',
    '## 부탁드릴 검토',
    '',
    '1. endpoint 누락/과다: 자동 생성된 endpoint가 사용자 도메인에 어울리나요? 어떤 블럭은 5개가 너무 많고, 어떤 블럭은 자리가 더 필요할 수 있어요. 평균에서 벗어난 자리를 일상어로 짚어주세요.',
    '2. schema 도메인 적합성: 각 endpoint의 request/response 데이터 모양이 도메인 의미에 잘 맞나요? 누락된 핵심 필드, 과다한 필드, 타입이 어울리지 않는 자리(예: 결제 금액은 정수보다 정밀 숫자가 안전)를 안내해주세요.',
    '3. 시작 무게: 지금 endpoint 개수와 schema 깊이가 너무 무거운지/가벼운지. MVP에서 줄일 자리나 키울 자리를 표준 매핑 안에서 안내해주세요.',
    '',
    '단정형보다 가능성형 결("어울릴 수 있어요")로 답하고, 표준 매핑 자체는 바꾸지 마세요(가감 추천만 부탁드려요).',
    '',
    '## 응답 형식 안내 (코드가 읽을 자리)',
    '',
    '자유 형식으로 검토하신 뒤, 응답 끝에 아래 형식의 "## 제안된 변경 사항" 섹션을 한 번 더 추가해주세요.',
    '이 섹션은 사용자가 받은 응답을 다시 byeorim에 붙여넣을 때 코드가 자동으로 읽어 forge-contracts.yml에 반영하는 자리예요.',
    '자유 형식으로만 답하셔도 괜찮아요. 그때는 사용자가 응답을 직접 읽고 forge-contracts.yml을 손으로 다듬어요.',
    '',
    '형식.',
    '',
    '````markdown',
    '## 제안된 변경 사항',
    '',
    '```yaml',
    'changes:',
    '  - kind: endpoint_add        # endpoint 추가',
    '    block_id: <블럭 id>',
    '    new_endpoint:',
    '      method: <GET|POST|PUT|DELETE>',
    '      path: <경로, 예: /orders/by-customer/{customerId}>',
    '      operation: <create|list|get|update|delete|search|기타 명사구>',
    '      description: <한 줄 설명>',
    '    reason: <한 두 줄 이유>',
    '',
    '  - kind: endpoint_remove     # endpoint 삭제',
    '    block_id: <블럭 id>',
    '    target_endpoint:',
    '      method: <기존 method>',
    '      path: <기존 path>',
    '    reason: <한 두 줄 이유>',
    '',
    '  - kind: schema_modify       # request_schema 또는 response_schema 수정',
    '    block_id: <블럭 id>',
    '    target_endpoint:',
    '      method: <기존 method>',
    '      path: <기존 path>',
    '    target_field: request_schema   # 또는 response_schema',
    '    new_value:',
    '      type: object',
    '      properties:',
    '        ...',
    '    reason: <한 두 줄 이유>',
    '',
    '  - kind: description_modify  # endpoint description 수정',
    '    block_id: <블럭 id>',
    '    target_endpoint:',
    '      method: <기존 method>',
    '      path: <기존 path>',
    '    new_value: <새 설명 텍스트 한 줄>',
    '    reason: <한 두 줄 이유>',
    '```',
    '````',
    '',
    '규칙.',
    '- 이 섹션은 자유 형식 검토 뒤에 한 번만 추가. 자유 형식 부분은 그대로 두세요',
    '- changes 배열은 비어있어도 괜찮아요(변경 제안이 없으면 `changes: []`)',
    '- block_id는 위 "사용자가 고른 블럭" 또는 "자동 생성된 API 계약" 섹션에서 보신 자리만 사용',
    '- 표준 매핑(resource=5/query=1/internal=0) 자체는 바꾸지 마세요. 가감 추천만',
    "- YAML 따옴표 규칙: 값에 콜론(`:`), `#`, 따옴표 같은 결이 들어가면 작은따옴표로 감싸주세요. 예) `reason: '주문 자리(예: POST /orders)로 다루는 결'`. 안 감싸면 YAML 파서가 결을 못 읽어 import가 깨집니다",
    '',
    '예시 응답 (이 결을 참고해서 답해주세요. 자유 형식 부분은 사용자 도메인에 맞게 다시 적으시면 됩니다).',
    '',
    '````markdown',
    '## 도메인 적합성',
    '',
    '생성된 API 계약이 표준 매핑(resource=5/query=1/internal=0) 결로 잘 박혀있어요. 다만 사용자 답변에 "고객별 묶음 보기"가 자주 등장하는 결이라 list만으로는 좁아 보여요.',
    '',
    '## 누락 또는 어색 자리',
    '',
    '한 endpoint의 description이 영어 한 줄이라 한국어로 풀면 비기술 사용자에게 더 친근해요.',
    '',
    '## 시작 무게',
    '',
    '표준 매핑 결로 충분히 가벼워요. endpoint 한 자리 추가와 description 한 줄 손보는 결로 마무리.',
    '',
    '## 제안된 변경 사항',
    '',
    '```yaml',
    'changes:',
    '  - kind: endpoint_add',
    '    block_id: <블럭_id>',
    '    new_endpoint:',
    '      method: GET',
    '      path: /<resource>/by-customer/{customerId}',
    '      operation: list_by_customer',
    '      description: 한 고객이 만든 자리만 묶어서 봐요',
    '    reason: 사용자 답변에 "고객별 묶음 보기"가 자주 등장해 한 자리 추가가 어울릴 수 있어요',
    '',
    '  - kind: description_modify',
    '    block_id: <블럭_id>',
    '    target_endpoint:',
    '      method: GET',
    '      path: /<resource>',
    '    new_value: 전체 자리를 한 번에 모아 봐요',
    '    reason: 영어 description을 한국어로 풀면 비기술 사용자에게 친근해요',
    '```',
    '````',
  ].join('\n');
  return HEADER + body + '\n' + FOOTER;
}
