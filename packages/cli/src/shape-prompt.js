// architecture-review-prompt.md 합성. ADR 0033의 외부 AI 아키텍처 검토 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 4개 결정의 도메인 적합성,
// 트레이드오프, 시작 무게를 자세히 검토받는 결.
// smelt의 block-review-prompt.md(ADR 0030)와 같은 결을 따른다.
//
// 카탈로그 전체 blocks와 12개 표준 옵션 표를 담는다(ADR 0033 결정 2).
// 외부 AI가 다른 옵션과 비교한 검토를 줄 수 있어야 가치가 있다.

const HEADER = `# 아키텍처 검토 프롬프트

이 프롬프트를 외부 AI(Claude.ai, ChatGPT, Gemini 등)에 붙여넣어 지금 정한 4개 결정이
도메인에 어울리는지, 결정 사이 트레이드오프는 무엇인지, 더 가벼운/무거운 결이 있는지
자세히 검토받을 수 있어요. 응답은 자유 형식이라 사용자가 읽고 architecture.yml을 수동으로
다듬으시거나 beoreum shape를 다시 돌려 다른 자리로 고를 수 있어요.

---

## AI에게 보낼 자리 (아래 ─── 사이를 모두 복사하세요)

──────────────────────────────────────────
`;

const FOOTER = `──────────────────────────────────────────
`;

const SYSTEM_TEXT = `너는 사용자가 만들고 싶은 서비스의 아키텍처 결정을 검토하는 도우미다.
사용자는 비기술 창업자(카페 사장님, 학원 원장님 같은 도메인 전문가)다.
일상 한국어로 답하고 단축어는 풀어쓴다(예: PG는 "결제대행사", DTO는 "데이터 모양", API는 "프로그램 사이의 약속", REST는 "웹 표준 방식", CRUD는 "만들고 보고 고치고 지우는 자리", SDK는 "도구 묶음", JWT는 "로그인 증명", OAuth는 "다른 서비스 계정으로 로그인").

입력으로 다음 자리를 받는다.
- 사용자 7항목 답변(answers): 사용자 도메인을 그린 자리(prospect 단계)
- 카탈로그 전체 blocks: 도메인의 모든 블럭 후보
- 사용자가 고른 블럭(selected_blocks): 사용자가 smelt에서 직접 고른 자리와 자동 추가된 자리
- 4개 아키텍처 결정(architecture_choices): 사용자가 shape에서 고른 언어/저장소/API 형태/코드 구조
- 표준 옵션 표(standard_options): 4개 결정 각각의 모든 가능한 옵션
- AI 추천(ai_recommendation): 자동 추천과 두 시점 이유(user/dev)

너의 일은 다음 셋이다.

1) 도메인 적합성. 4개 결정이 사용자 도메인(answers와 selected_blocks)에 잘 맞는지 한두 줄로. 어울리면 어울린다고, 어색하면 어디가 어색한지.
2) 결정 사이 트레이드오프. 4개 결정이 서로 어떻게 영향을 주는지. 예: 한 덩어리 코드 구조와 마이크로서비스 API 형태가 같이 가면 무거워질 수 있어요.
3) 시작 무게. 지금 4개가 너무 무거우면 줄일 자리, 너무 가벼우면 키울 자리. 표준 옵션 표 안에서 어느 자리로 옮길지 일상어로 안내.

규칙.
- 차단하지 않는다. 사용자가 자유롭게 결정. 너는 시각만 추가
- 표준 옵션 표 밖의 값은 추천하지 않는다(예: kotlin, redis 같은 자리는 표 밖이라 안 됨)
- 마케팅 카피 형용사("강력한", "획기적인", "본질적인") 금지
- 단정형보다 가능성형 결("이 자리도 어울릴 수 있어요", "다음에 같이 보면 좋아요")
- 사용자 답변의 단어를 인용하면 친근

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

// 4개 결정과 사용자 선택값을 보여준다. choicesTable에서 옵션의 한국어 이름을 풀어쓴다.
function formatChoices(choices, choicesTable) {
  const c = choices || {};
  const t = choicesTable || {};
  const labels = {
    language: '언어',
    database: '저장소',
    api_style: 'API 형태',
    architecture_pattern: '코드 구조',
  };
  const lines = [];
  for (const key of ['language', 'database', 'api_style', 'architecture_pattern']) {
    const value = c[key] || '(비어있음)';
    const opts = Array.isArray(t[key]) ? t[key] : [];
    const opt = opts.find((o) => o.value === value);
    const display = opt ? `${opt.value} (${opt.name})` : value;
    lines.push(`- ${labels[key]}: ${display}`);
  }
  return lines.join('\n');
}

// 12개 표준 옵션 표를 풀어쓴다. 외부 AI가 다른 자리로 옮길 후보를 보고 검토할 수 있게 함.
function formatOptionsTable(choicesTable) {
  const t = choicesTable || {};
  const sections = [];
  const labels = {
    language: '언어 (language)',
    database: '저장소 (database)',
    api_style: 'API 형태 (api_style)',
    architecture_pattern: '코드 구조 (architecture_pattern)',
  };
  for (const key of ['language', 'database', 'api_style', 'architecture_pattern']) {
    const opts = Array.isArray(t[key]) ? t[key] : [];
    const lines = [`### ${labels[key]}`];
    for (const opt of opts) {
      lines.push(`- ${opt.value}: ${opt.name}`);
    }
    sections.push(lines.join('\n'));
  }
  return sections.join('\n\n');
}

// 추천 결과를 두 시점({user, dev})으로 풀어쓴다. ADR 0033 결정 4.
function formatRecommendation(recommendation) {
  const rec = recommendation || {};
  const recommended = rec.recommended && typeof rec.recommended === 'object' ? rec.recommended : {};
  const reasons = rec.reasons && typeof rec.reasons === 'object' ? rec.reasons : {};
  const keys = ['language', 'database', 'api_style', 'architecture_pattern'];
  const recommendedKeys = keys.filter((k) => typeof recommended[k] === 'string');
  if (!recommendedKeys.length) return '(이번 흐름은 추천이 비어있어요)';
  const lines = [];
  for (const key of recommendedKeys) {
    lines.push(`- ${key}: ${recommended[key]}`);
    const r = reasons[key] || {};
    const userR = (r.user || '').trim();
    const devR = (r.dev || '').trim();
    if (userR) lines.push(`  - 일반 사용자 시점: ${userR}`);
    if (devR) lines.push(`  - 개발자 시점: ${devR}`);
    if (!userR && !devR) lines.push('  - (이유 없음)');
  }
  return lines.join('\n');
}

// architecture-review-prompt.md 본문을 합성한다.
//
// 입력:
//   answers        - ProspectAnswers (7항목 답변)
//   catalog        - 전체 카탈로그(blocks를 모두 보낸다)
//   selectedBlocks - SelectedBlocks (smelt 산출물)
//   choices        - ArchitectureChoices (사용자가 고른 4개 결정)
//   choicesTable   - { language, database, api_style, architecture_pattern: [{value, name}] }
//                    ADR 0012의 12개 표준 옵션 표. shape.js의 ARCHITECTURE_CHOICES.
//   recommendation - ArchitectureRecommendation { recommended, reasons } (선택)
//
// 반환: 마크다운 문자열
export function buildArchitectureReviewPromptMarkdown({
  answers,
  catalog,
  selectedBlocks,
  choices,
  choicesTable,
  recommendation,
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
    '## 4개 아키텍처 결정 (사용자가 shape에서 고른 자리)',
    '',
    formatChoices(choices, choicesTable),
    '',
    '## 표준 옵션 표 (4개 결정의 모든 가능한 자리)',
    '',
    '아래 12개 자리 외의 값은 추천하지 마세요. 사용자가 표 안에서 다른 자리로 옮길 수 있어요.',
    '',
    formatOptionsTable(choicesTable),
    '',
    '## AI 추천 (참고용)',
    '',
    formatRecommendation(recommendation),
    '',
    '## 부탁드릴 검토',
    '',
    '1. 도메인 적합성: 위 4개 결정이 사용자 도메인(7항목 답변과 고른 블럭)에 잘 맞나요? 어울리는 자리와 어색한 자리를 일상어로 짚어주세요.',
    '2. 결정 사이 트레이드오프: 4개 결정이 서로 어떻게 영향을 주나요? 예를 들어 데이터베이스 선택과 코드 구조 선택이 어떻게 맞물리는지 일상어로 안내해주세요.',
    '3. 시작 무게: 지금 4개가 너무 무거우면 줄일 자리, 너무 가벼우면 키울 자리. 표준 옵션 표 안에서 다른 자리로 옮긴다면 어디로 가면 좋을지 짚어주세요.',
    '',
    '표준 옵션 표 밖의 값은 추천하지 마시고, 단정형보다 가능성형 결("어울릴 수 있어요")로 답해주세요.',
    '',
    '## 응답 형식 안내 (코드가 읽을 자리)',
    '',
    '자유 형식으로 검토하신 뒤, 응답 끝에 아래 형식의 "## 제안된 변경 사항" 섹션을 한 번 더 추가해주세요.',
    '이 섹션은 사용자가 받은 응답을 다시 beoreum에 붙여넣을 때 코드가 자동으로 읽어 architecture.yml에 반영하는 자리예요.',
    '자유 형식으로만 답하셔도 괜찮아요. 그때는 사용자가 응답을 직접 읽고 architecture.yml을 손으로 다듬어요.',
    '',
    '형식.',
    '',
    '````markdown',
    '## 제안된 변경 사항',
    '',
    '```yaml',
    'changes:',
    '  - kind: decision_modify',
    '    target_key: language          # 4개 키 중 하나(language/database/api_style/architecture_pattern)',
    '    new_value: python             # 표준 옵션 표 안의 값(위 표 참고)',
    '    reason: <한 두 줄 이유>',
    '```',
    '````',
    '',
    '규칙.',
    '- 이 섹션은 자유 형식 검토 뒤에 한 번만 추가. 자유 형식 부분은 그대로 두세요',
    '- changes 배열은 비어있어도 괜찮아요(변경 제안이 없으면 `changes: []`)',
    '- target_key는 정확히 4개(language/database/api_style/architecture_pattern) 중 하나',
    '- new_value는 위 "표준 옵션 표"에 있는 값만(다른 값은 거부됨)',
    '- 같은 target_key에 여러 변경을 박지 마세요(나중 결정이 이전 결정을 덮어씀)',
  ].join('\n');
  return HEADER + body + '\n' + FOOTER;
}
