// test-scenarios-review-prompt.md 합성. ADR 0038의 외부 AI 테스트 시나리오 검토 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 시나리오 종류 누락,
// test_code 도메인 적합성, 시작 무게를 자세히 검토받는 결.
// smelt(ADR 0030), shape(ADR 0033), forge(ADR 0035)의 같은 결을 따른다.
// ADR 0040으로 응답 형식 안내 섹션을 박음(byeorim temper import-review가 읽을 자리).

import yaml from 'js-yaml';

const HEADER = `# 테스트 시나리오 검토 프롬프트

이 프롬프트를 외부 AI(Claude.ai, ChatGPT, Gemini 등)에 붙여넣어 지금 만든 테스트 시나리오와
test_code가 도메인에 어울리는지, 누락된 시나리오 종류가 있는지, 시작 무게가 맞는지를
자세히 검토받을 수 있어요. 응답은 자유 형식이라 사용자가 읽고 temper-scenarios.yml을 수동으로
다듬으시거나 byeorim temper를 다시 돌릴 수 있어요.

---

## AI에게 보낼 자리 (아래 ─── 사이를 모두 복사하세요)

──────────────────────────────────────────

`;

const FOOTER = `

──────────────────────────────────────────
`;

const SYSTEM_TEXT = `너는 사용자가 만들고 싶은 서비스의 테스트 시나리오를 검토하는 도우미다.
사용자는 비기술 창업자(카페 사장님, 학원 원장님 같은 도메인 전문가)다.
일상 한국어로 답하고 단축어는 풀어쓴다(예: API는 "프로그램 사이의 약속", REST는 "웹 표준 방식", endpoint는 "프로그램이 받는 자리", schema는 "데이터 모양", happy_path는 "정상 흐름", test_code는 "테스트 코드", GWT는 "Given-When-Then 세 단계").

입력으로 다음 자리를 받는다.
- 사용자 7항목 답변(answers): 사용자 도메인을 그린 자리(prospect 단계)
- 카탈로그 전체 blocks: 도메인의 모든 블럭 후보
- 사용자가 고른 블럭(selected_blocks): 사용자가 smelt에서 직접 고른 자리와 자동 추가된 자리
- 4개 아키텍처 결정(architecture): 언어, 저장소, API 형태, 코드 구조
- API 계약 요약(contracts): 블럭별 endpoint와 schema(forge 결과). schema는 시나리오의 입출력 데이터 모양을 푸는 자리
- 테스트 시나리오(scenarios): 블럭별 endpoint별 GWT 텍스트와 test_code. 표준 매핑은 endpoint당 happy_path 한 개

너의 일은 다음 셋이다.

1) 시나리오 종류 누락. happy_path 한 가지만 자동 생성됐는데 사용자 도메인에서 에러 시나리오(잘못된 입력, 권한 부족, 동시성 충돌)나 엣지 시나리오(빈 결과, 큰 결과, 경계값)가 핵심인 자리를 짚어주세요. 평균에서 벗어난 블럭(예: 결제는 동시성 충돌이 핵심, 검색은 빈 결과 검증이 필요)을 일상어로 안내.
2) test_code 도메인 적합성. 각 시나리오의 test_code가 사용자 도메인 의미에 잘 맞는지. 누락된 검증, 과다한 자리, 권한/동시성/경계 처리가 빠진 자리를 일상어로 안내해주세요. test_code가 TODO인 자리는 어떤 결로 채워야 어울리는지도 함께.
3) 시작 무게. 지금 시나리오 개수가 너무 적어 위험한 자리, 너무 많아 MVP에 무거운 자리. 표준 매핑(endpoint당 happy_path 한 개) 안에서 추가/축소 자리를 일상어로 안내.

규칙.
- 차단하지 않는다. 사용자가 자유롭게 결정. 너는 시각만 추가
- 표준 매핑(endpoint당 happy_path 한 개) 자체는 바꾸지 않는다. 추가 추천만
- 마케팅 카피 형용사("강력한", "획기적인", "본질적인") 금지
- 단정형보다 가능성형 결("이 시나리오도 어울릴 수 있어요", "다음에 같이 보면 좋아요")
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

// schema 자리를 마크다운에 풀어쓴다. JSON Schema 객체는 YAML 들여쓰기, TODO/누락은 한 줄 안내.
// 들여쓰기 깊이는 6칸(endpoint 안에서 보이도록).
function formatSchemaValue(schema) {
  if (schema === undefined || schema === null) return '      (없음)';
  if (schema === 'TODO') return '      (TODO — 아직 채워지지 않음)';
  if (typeof schema === 'string') return `      ${schema}`;
  const dumped = yaml.dump(schema, { sortKeys: false }).trimEnd();
  return dumped
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
}

// 한 contract endpoint를 마크다운으로 풀어쓴다. schema는 짧게(시나리오 자리에서 자세히 보임).
function formatContractEndpoint(endpoint) {
  const ep = endpoint || {};
  const method = ep.method || '?';
  const path = ep.path || '?';
  const operation = ep.operation || '?';
  const lines = [];
  lines.push(`  - ${method} ${path}  (${operation})`);
  lines.push('    request_schema:');
  lines.push(formatSchemaValue(ep.request_schema));
  lines.push('    response_schema:');
  lines.push(formatSchemaValue(ep.response_schema));
  return lines.join('\n');
}

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
    lines.push(formatContractEndpoint(ep));
  }
  return lines.join('\n');
}

function formatContractsSection(contracts) {
  const list = Array.isArray(contracts) ? contracts : [];
  if (list.length === 0) return '(계약이 비어있어요)';
  return list.map((c) => formatContract(c)).join('\n\n');
}

// language 힌트(architecture.language)를 코드 블록 펜스에 박는 라벨로 푼다.
// 표준 옵션이 아니면 빈 문자열(라벨 없는 펜스)로 폴백.
function languageFenceLabel(language) {
  const known = { node: 'js', java: 'java', python: 'python' };
  return known[language] || '';
}

// 한 시나리오의 test_code 자리를 마크다운으로 풀어쓴다(ADR 0038 결정 4).
// - TODO 또는 빈 문자열: 한 줄 안내
// - 그 외 문자열: 코드 블록(```<lang>) 안에 그대로
function formatTestCodeBlock(testCode, language) {
  if (testCode === undefined || testCode === null || testCode === 'TODO' || testCode === '') {
    return '    (TODO — 아직 채워지지 않음)';
  }
  const fence = languageFenceLabel(language);
  const lines = [];
  lines.push(`    \`\`\`${fence}`);
  for (const line of String(testCode).split('\n')) {
    lines.push(`    ${line}`);
  }
  lines.push('    ```');
  return lines.join('\n');
}

// 한 시나리오를 마크다운으로 풀어쓴다. given/when/then 한 줄씩 + test_code 코드 블록.
function formatScenario(scenario, language) {
  const s = scenario || {};
  const kind = s.kind || 'happy_path';
  const lines = [];
  lines.push(`  - ${kind}`);
  lines.push(`    - given: ${s.given || '(비어있음)'}`);
  lines.push(`    - when: ${s.when || '(비어있음)'}`);
  lines.push(`    - then: ${s.then || '(비어있음)'}`);
  lines.push('    - test_code:');
  lines.push(formatTestCodeBlock(s.test_code, language));
  return lines.join('\n');
}

function formatScenarioEndpoint(endpoint, language) {
  const ep = endpoint || {};
  const method = ep.method || '?';
  const path = ep.path || '?';
  const operation = ep.operation || '?';
  const lines = [];
  lines.push(`- ${method} ${path}  (${operation})`);
  const scenarios = Array.isArray(ep.scenarios) ? ep.scenarios : [];
  if (scenarios.length === 0) {
    lines.push('  - (시나리오 없음)');
    return lines.join('\n');
  }
  for (const s of scenarios) {
    lines.push(formatScenario(s, language));
  }
  return lines.join('\n');
}

function formatScenarioBlock(scenarioBlock, language) {
  const b = scenarioBlock || {};
  const name = b.name || b.block_id || '(이름 없음)';
  const blockId = b.block_id || '?';
  const apiStyle = b.api_style || 'resource';
  const lines = [];

  if (apiStyle === 'internal') {
    lines.push(`### ${name} (${blockId}, internal — 시나리오 없음)`);
    return lines.join('\n');
  }

  const endpoints = Array.isArray(b.endpoints) ? b.endpoints : [];
  const scenarioCount = endpoints.reduce(
    (sum, ep) => sum + (Array.isArray(ep.scenarios) ? ep.scenarios.length : 0),
    0,
  );
  lines.push(`### ${name} (${blockId}, ${apiStyle}, 시나리오 ${scenarioCount}개)`);
  if (endpoints.length === 0) {
    lines.push('- (endpoint 없음)');
    return lines.join('\n');
  }
  for (const ep of endpoints) {
    lines.push(formatScenarioEndpoint(ep, language));
  }
  return lines.join('\n');
}

function formatScenariosSection(scenarios, language) {
  const list = Array.isArray(scenarios) ? scenarios : [];
  if (list.length === 0) return '(시나리오가 비어있어요)';
  return list.map((b) => formatScenarioBlock(b, language)).join('\n\n');
}

// test-scenarios-review-prompt.md 본문을 합성한다.
//
// 입력:
//   answers        - ProspectAnswers (7항목 답변)
//   catalog        - 전체 카탈로그(blocks를 모두 보낸다)
//   selectedBlocks - SelectedBlocks (smelt 산출물)
//   architecture   - { language, database, api_style, architecture_pattern } (shape 산출물)
//   contracts      - 블럭별 contract 배열(forge 산출물). schema 정보가 test_code 검토에 보조
//   scenarios      - 블럭별 시나리오 묶음 배열(temper 산출물). 각 묶음은 endpoints/scenarios를 가짐
//
// 반환: 마크다운 문자열
export function buildScenariosReviewPromptMarkdown({
  answers,
  catalog,
  selectedBlocks,
  architecture,
  contracts,
  scenarios,
} = {}) {
  const blocks = catalog && Array.isArray(catalog.blocks) ? catalog.blocks : [];
  const language = architecture && architecture.language ? architecture.language : '';
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
    '## API 계약 요약 (forge 결과)',
    '',
    'schema는 시나리오의 입출력 데이터 모양을 푸는 자리. test_code 검토에 함께 보세요.',
    '',
    formatContractsSection(contracts),
    '',
    '## 테스트 시나리오 (temper 결과)',
    '',
    '표준 매핑: endpoint당 happy_path 한 개. test_code는 AI 어댑터가 채운 자리(없으면 TODO).',
    '',
    formatScenariosSection(scenarios, language),
    '',
    '## 부탁드릴 검토',
    '',
    '1. 시나리오 종류 누락: happy_path만 자동 생성됐는데 사용자 도메인에서 에러 시나리오(잘못된 입력, 권한 부족, 동시성 충돌)나 엣지 시나리오(빈 결과, 큰 결과, 경계값)가 핵심인 자리를 짚어주세요. 평균에서 벗어난 블럭을 일상어로 안내.',
    '2. test_code 도메인 적합성: 각 시나리오의 test_code가 도메인 의미에 잘 맞나요? 누락된 검증, 과다한 자리, 권한/동시성/경계 처리가 빠진 자리(예: 결제 동시성 충돌, 주문 quantity가 0인 자리)를 안내해주세요. test_code가 TODO인 자리는 어떤 결로 채워야 어울리는지도 함께.',
    '3. 시작 무게: 지금 시나리오 개수가 너무 적어 위험한 자리, 너무 많아 MVP에 무거운 자리. MVP에서 추가할 자리나 미룰 자리를 표준 매핑 안에서 안내해주세요.',
    '',
    '단정형보다 가능성형 결("어울릴 수 있어요")로 답하고, 표준 매핑 자체는 바꾸지 마세요(추가 추천만 부탁드려요).',
    '',
    '## 응답 형식 안내 (코드가 읽을 자리)',
    '',
    '자유 형식으로 검토하신 뒤, 응답 끝에 아래 형식의 "## 제안된 변경 사항" 섹션을 한 번 더 추가해주세요.',
    '이 섹션은 사용자가 받은 응답을 다시 byeorim에 붙여넣을 때 코드가 자동으로 읽어 temper-scenarios.yml에 반영하는 자리예요.',
    '자유 형식으로만 답하셔도 괜찮아요. 그때는 사용자가 응답을 직접 읽고 temper-scenarios.yml을 손으로 다듬어요.',
    '',
    '형식.',
    '',
    '````markdown',
    '## 제안된 변경 사항',
    '',
    '```yaml',
    'changes:',
    '  - kind: scenario_add        # 시나리오 추가(예: 에러/엣지 시나리오)',
    '    block_id: <블럭 id>',
    '    target_endpoint:',
    '      method: <기존 method>',
    '      path: <기존 path>',
    '    new_scenario:',
    '      kind: <happy_path 외 자리. 예: error_invalid_input, edge_empty_result>',
    '      given: <given 텍스트>',
    '      when: <when 텍스트>',
    '      then: <then 텍스트>',
    '      test_code: <코드 또는 TODO>',
    '    reason: <한 두 줄 이유>',
    '',
    '  - kind: scenario_remove     # 시나리오 삭제',
    '    block_id: <블럭 id>',
    '    target_endpoint:',
    '      method: <기존 method>',
    '      path: <기존 path>',
    '    target_scenario_kind: <삭제할 시나리오 kind. 예: happy_path>',
    '    reason: <한 두 줄 이유>',
    '',
    '  - kind: gwt_modify          # given/when/then 텍스트 수정',
    '    block_id: <블럭 id>',
    '    target_endpoint:',
    '      method: <기존 method>',
    '      path: <기존 path>',
    '    target_scenario_kind: <수정할 시나리오 kind>',
    '    new_value:',
    '      given: <새 given 텍스트>      # given/when/then 중 일부만 박아도 됨',
    '      when: <새 when 텍스트>',
    '      then: <새 then 텍스트>',
    '    reason: <한 두 줄 이유>',
    '',
    '  - kind: test_code_modify    # test_code 수정',
    '    block_id: <블럭 id>',
    '    target_endpoint:',
    '      method: <기존 method>',
    '      path: <기존 path>',
    '    target_scenario_kind: <수정할 시나리오 kind>',
    '    new_value: |',
    '      <새 test_code 코드 한 덩어리>',
    '    reason: <한 두 줄 이유>',
    '```',
    '````',
    '',
    '규칙.',
    '- 이 섹션은 자유 형식 검토 뒤에 한 번만 추가. 자유 형식 부분은 그대로 두세요',
    '- changes 배열은 비어있어도 괜찮아요(변경 제안이 없으면 `changes: []`)',
    '- block_id와 target_endpoint는 위 "테스트 시나리오" 섹션에서 보신 자리만 사용',
    '- target_scenario_kind는 같은 endpoint 안에서 unique한 자리(예: happy_path)',
    '- scenario_add의 new_scenario.kind는 같은 endpoint에서 unique해야 함(중복은 거부)',
    '- YAML 따옴표 규칙: 값에 콜론(`:`), `#`, 따옴표 같은 결이 들어가면 작은따옴표로 감싸주세요. 예) `reason: \'"받침"처럼 어색한 결을 다듬어요\'`. 안 감싸면 YAML 파서가 결을 못 읽어 import가 깨집니다',
    '',
    '예시 응답 (이 결을 참고해서 답해주세요. 자유 형식 부분은 사용자 도메인에 맞게 다시 적으시면 됩니다).',
    '',
    '````markdown',
    '## 도메인 위험 vs 시나리오 매칭',
    '',
    'create endpoint에 happy_path만 박혀 있어 잘못된 입력 결이 미정인 자리예요. 첫 운영 직후 한 결만 추가하면 안전해요.',
    '',
    '## 표준 매핑 외 누락 자리',
    '',
    'list endpoint에 edge_empty_result가 없으면 "데이터가 없을 때 어떻게 보일까"가 비어 있어요.',
    '',
    '## 시작 무게',
    '',
    '시나리오 결이 가벼워서 한두 자리 추가가 어울려요.',
    '',
    '## 제안된 변경 사항',
    '',
    '```yaml',
    'changes:',
    '  - kind: scenario_add',
    '    block_id: <블럭_id>',
    '    target_endpoint:',
    '      method: POST',
    '      path: /<resource>',
    '    new_scenario:',
    '      kind: error_invalid_input',
    '      given: 잘못된 결의 입력값(필수 필드 누락)이 들어온다',
    '      when: create endpoint를 호출한다',
    '      then: 400 응답과 어떤 필드가 빠졌는지 메시지가 돌아온다',
    '      test_code: TODO',
    '    reason: happy_path만 박혀 있어 사용자가 잘못된 입력을 보냈을 때 결이 미정이에요',
    '```',
    '````',
  ].join('\n');
  return HEADER + body + '\n' + FOOTER;
}
