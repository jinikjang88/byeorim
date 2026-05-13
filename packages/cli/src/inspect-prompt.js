// inspect-review-prompt.md 합성. ADR 0051의 외부 AI 검수 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 set이 만든 코드와 메타데이터를
// 6영역(보안/성능/운영/확장성/법적 리스크/시장 재검) 자리에서 자세히 검수받는 결.
// smelt(ADR 0030), shape(ADR 0033), forge(ADR 0035), temper(ADR 0038)의 같은 결을 따른다.
// ADR 0051로 응답 형식 안내 섹션 박음(byeorim inspect import-review가 읽을 자리).

const HEADER = `# 검수 자리 프롬프트

이 프롬프트를 외부 AI(Claude.ai, ChatGPT, Gemini 등)에 붙여넣어 만든 서비스의 코드를 6영역
(보안, 성능, 운영, 확장성, 법적 리스크, 시장 재검) 자리에서 자세히 검수받을 수 있어요.
응답은 자유 형식이지만, 끝에 ## 검수 결과 섹션을 박으면 byeorim이 응답을 받아
inspect-report.md에 자동 반영합니다.

---

## AI에게 보낼 자리 (아래 ─── 사이를 모두 복사하세요)

──────────────────────────────────────────

`;

const FOOTER = `

──────────────────────────────────────────
`;

const SYSTEM_TEXT = `너는 비기술 창업자가 만든 서비스를 출시 직전 검수하는 시니어 동료다.
사용자는 비기술 창업자(카페 사장님, 학원 원장님 같은 도메인 전문가)다.
일상 한국어로 답하고 단축어는 풀어쓴다(예: API는 "프로그램 사이의 약속", endpoint는 "프로그램이 받는 자리", schema는 "데이터 모양", JWT는 "로그인 토큰").

너의 일은 6영역에 대해 검수 결과(findings)를 만드는 것이다.

- 보안: 도메인-특화 결함(예: 결제 블럭의 amount 필드에 음수 검증 없음, 인증 누락 endpoint, 비밀번호 plain 처리, 권한 검사 누락). 일반 baseline(JWT/CSP/CORS)은 코드의 정적 검수가 이미 잡았으니 너는 도메인 시각으로 본다
- 성능: N+1 쿼리 패턴, 캐싱 누락, 응답 시간 위험. 예: routes의 list endpoint가 N+1 가능성
- 운영: 백업/복구/모니터링/알림/배포의 빈 자리. 예: 에러 추적이 console.log뿐
- 확장성: stateless 결, DB 풀링, 비동기 처리, 큰 데이터 자리. 예: in-memory 세션, sync 결제 처리
- 법적 리스크: 개인정보 필드(이름/이메일/전화/주소/주민번호), 미성년자 보호, 결제/환불 규정, AI 차별. 출시 직전 강한 신호 자리. 발견되면 severity 'concern'
- 시장 재검: 사용자 답변(intent.what)과 contracts/scenarios의 결을 비춰 시장 부적합 자리. 예: "카페 주문 앱"이라는데 결제 블럭에 환불 시나리오가 없음

severity 결.
- pass: 검사 통과. 안심
- warning: 검토 권장. 결함은 아니지만 사용자가 의식적으로 보고 결정할 자리
- concern: 출시 직전 강한 신호. 법적 리스크 또는 명백한 결함. 사용자가 멈춰서 봐야 할 자리

출력 결.
- findings 배열에 area별로 0~3개씩. 한 응답에 6영역 모두 다룬다(없으면 빈 배열도 허용)
- 각 finding의 title은 한국어 한 줄. detail은 한국어 본문(왜 결함인지 + 어떻게 풀지). file은 관련 경로(있으면)
- 마케팅 카피 형용사("강력한", "획기적인", "혁신적인") 금지
- 단정형보다 가능성형 결("이 자리에 검증을 더하면 좋아요")
- 비기술 창업자가 읽을 수 있는 한국어. 시니어 개발자 줄임말은 풀어 쓴다
`;

function formatYamlOrEmpty(obj) {
  try {
    if (!obj || (typeof obj === 'object' && Object.keys(obj).length === 0)) return '_(비어있음)_';
    return '```yaml\n' + JSON.stringify(obj, null, 2) + '\n```';
  } catch {
    return '_(파싱 실패)_';
  }
}

function formatFiles(files) {
  const names = Object.keys(files || {}).sort();
  if (names.length === 0) return '_(파일이 없습니다)_';
  return names.map((name) => `### ${name}\n\n\`\`\`\n${files[name]}\n\`\`\``).join('\n\n');
}

// buildInspectReviewPromptMarkdown은 inspect의 외부 검수 프롬프트를 만든다.
// claude 어댑터의 INSPECT_SYSTEM_PROMPT 결과 같은 시각이지만 외부 AI를 위해 마크다운으로 풀어쓴다.
//
// 입력 결: { language, files, intent, architecture, contracts, scenarios }
//   inspect.js의 buildInspectInput이 만들어 전달
//
// 반환: 한 묶음 마크다운 문자열
export function buildInspectReviewPromptMarkdown({
  language,
  files,
  intent,
  architecture,
  contracts,
  scenarios,
} = {}) {
  const body = [
    SYSTEM_TEXT,
    '',
    '## 검수 대상',
    '',
    '### 사용 언어',
    '',
    language ? `\`${language}\`` : '_(미정)_',
    '',
    '### 사용자 답변(intent.extracted)',
    '',
    formatYamlOrEmpty(intent && intent.extracted),
    '',
    '### 아키텍처 결정',
    '',
    formatYamlOrEmpty(architecture),
    '',
    '### API 계약 요약',
    '',
    formatYamlOrEmpty(summarizeContracts(contracts)),
    '',
    '### 테스트 시나리오 요약',
    '',
    formatYamlOrEmpty(summarizeScenarios(scenarios)),
    '',
    '### 핵심 파일',
    '',
    formatFiles(files),
    '',
    '## 부탁드릴 검수',
    '',
    '6영역(보안, 성능, 운영, 확장성, 법적 리스크, 시장 재검)에 대해 finding을 만들어주세요.',
    '각 영역에서 0~3개의 finding이 적절합니다. 없는 영역은 비어있어도 괜찮아요.',
    '',
    'severity는 셋이 있어요.',
    '- pass: 검사 통과. 안심',
    '- warning: 검토 권장',
    '- concern: 출시 직전 강한 신호. 법적 리스크나 명백한 결함',
    '',
    '## 응답 형식 안내 (코드가 읽을 자리)',
    '',
    '자유 형식으로 검수하신 뒤, 응답 끝에 아래 형식의 "## 검수 결과" 섹션을 한 번 더 추가해주세요.',
    '이 섹션은 사용자가 받은 응답을 다시 byeorim에 붙여넣을 때 코드가 자동으로 읽어 inspect-report.md에 반영하는 자리예요.',
    '자유 형식으로만 답하셔도 괜찮아요. 그때는 사용자가 응답을 직접 읽고 inspect-report.md를 손으로 다듬어요.',
    '',
    '형식.',
    '',
    '````markdown',
    '## 검수 결과',
    '',
    '```yaml',
    'findings:',
    '  - area: 보안                    # 보안 | 성능 | 운영 | 확장성 | 법적 리스크 | 시장 재검',
    '    severity: concern             # pass | warning | concern',
    '    title: 한국어 한 줄 제목',
    '    detail: 한국어 본문(왜 결함인지 + 어떻게 풀지)',
    '    file: 관련 파일 경로(있으면, 없으면 생략 가능)',
    '',
    '  - area: 성능',
    '    severity: warning',
    '    title: list endpoint에 N+1 쿼리 가능 자리',
    '    detail: ...',
    '    file: src/features/order/routes.js',
    '```',
    '````',
    '',
    '규칙.',
    '- 이 섹션은 자유 형식 검수 뒤에 한 번만 추가. 자유 형식 부분은 그대로 두세요',
    '- findings 배열은 비어있어도 괜찮아요(검수 결과가 없으면 `findings: []`)',
    '- area는 정확히 위 6개 중 하나(한국어 그대로). enum 강제',
    '- severity는 정확히 셋 중 하나(pass/warning/concern)',
    '- file은 선택. 있으면 사용자가 어디인지 빠르게 찾는다',
    "- YAML 따옴표 규칙: 값에 콜론(`:`), `#`, 따옴표 같은 결이 들어가면 작은따옴표로 감싸주세요. 예) `detail: 'list endpoint(예: GET /orders)의 N+1 쿼리 결'`. 안 감싸면 YAML 파서가 결을 못 읽어 import가 깨집니다",
    '',
    '예시 응답 (이 결을 참고해서 답해주세요. 자유 형식 부분은 사용자 도메인에 맞게 다시 적으시면 됩니다).',
    '',
    '````markdown',
    '## 보안',
    '',
    '일부 endpoint에 인증 미들웨어가 빠져 외부에서 직접 호출이 가능해 보여요. 입력 검증 결도 약해 잘못된 데이터가 그대로 저장되는 자리가 있어요.',
    '',
    '## 성능 / 운영',
    '',
    'list endpoint가 N+1 쿼리 결로 박혀 있어 데이터가 많아지면 느려질 수 있어요. 운영 결은 /health endpoint가 박혀 있어 안전망이 살아있어요.',
    '',
    '## 확장성 / 법적 / 시장',
    '',
    '큰 결함 없음. 시장 결은 prospect 단계의 결로부터 큰 변화 없음.',
    '',
    '## 검수 결과',
    '',
    '```yaml',
    'findings:',
    '  - area: 보안',
    '    severity: concern',
    '    title: 인증 미들웨어 누락 endpoint',
    '    detail: <블럭>의 일부 endpoint가 미들웨어 결을 안 거쳐 외부에서 직접 호출이 가능해 보여요. 출시 전 풀어야 합니다',
    '    file: src/features/<블럭>/routes.js',
    '',
    '  - area: 성능',
    '    severity: warning',
    '    title: list endpoint의 N+1 쿼리 결',
    '    detail: 자식 자원을 자식별로 조회하는 결이 박혀 있어 데이터가 많아지면 느려질 수 있어요. join 또는 in 쿼리로 바꾸는 결을 검토해주세요',
    '    file: src/features/<블럭>/routes.js',
    '```',
    '````',
  ].join('\n');
  return HEADER + body + '\n' + FOOTER;
}

// forge-contracts.yml의 결을 한 결로 요약. claude 어댑터의 결과 같은 결.
function summarizeContracts(contracts) {
  if (!contracts || typeof contracts !== 'object') return null;
  return {
    architecture_api_style: contracts.architecture_api_style,
    contracts: (contracts.contracts || []).map((c) => ({
      block_id: c.block_id,
      name: c.name,
      api_style: c.api_style,
      internal: c.internal,
      endpoints: (c.endpoints || []).map((e) => ({
        operation: e.operation,
        method: e.method,
        path: e.path,
      })),
    })),
  };
}

function summarizeScenarios(scenarios) {
  if (!scenarios || typeof scenarios !== 'object') return null;
  return {
    scenarios: (scenarios.scenarios || []).map((b) => ({
      block_id: b.block_id,
      name: b.name,
      endpoints: (b.endpoints || []).map((e) => ({
        operation: e.operation,
        scenario_count: (e.scenarios || []).length,
      })),
    })),
  };
}
