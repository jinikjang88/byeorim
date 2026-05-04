// block-review-prompt.md 합성. ADR 0030의 외부 AI 블럭 검토 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 추천 블럭과 도메인을 자세히 검토받는 결.
// prospect의 catalog-prompt.md와 같은 결을 따른다(ADR 0028).
//
// 카탈로그 전체 blocks를 담는다(ADR 0030 결정 4). 비개발자 1순위 사용자 정신.
// 외부 AI가 "다른 블럭 X도 같이 고려해보세요" 안내를 줄 수 있어야 검토가 가치 있다.

const HEADER = `# 블럭 검토 프롬프트

이 프롬프트를 외부 AI(Claude.ai, ChatGPT, Gemini 등)에 붙여넣어 지금 고른 블럭이 도메인에
잘 맞는지, 빠진 자리는 없는지, 더 깔끔한 결이 있는지 자세히 검토받을 수 있어요.
응답은 자유 형식이라 사용자가 읽고 selected-blocks.yml을 수동으로 다듬으시거나
beoreum smelt를 다시 돌려 다른 블럭으로 고를 수 있어요.

---

## AI에게 보낼 자리 (아래 ─── 사이를 모두 복사하세요)

──────────────────────────────────────────
`;

const FOOTER = `──────────────────────────────────────────
`;

const SYSTEM_TEXT = `너는 사용자가 만들고 싶은 서비스의 블럭 선택을 검토하는 도우미다.
사용자는 비기술 창업자(카페 사장님, 학원 원장님 같은 도메인 전문가)다.
일상 한국어로 답하고 단축어는 풀어쓴다(예: PG는 "결제대행사", DTO는 "데이터 모양", API는 "프로그램 사이의 약속").

입력으로 다음 자리를 받는다.
- 사용자 7항목 답변(answers): 사용자 도메인을 그린 자리(prospect 단계)
- 카탈로그 전체 blocks: 도메인의 모든 블럭 후보. 비개발자가 골라볼 수 있는 자리들
- 사용자가 고른 블럭(selected_blocks): 사용자가 picker에서 직접 고른 자리
- 의존성 해결 결과(dependency_resolution): 자동으로 함께 들어갈 블럭, 영향받는 블럭, 외부 준비물
- AI 추천(ai_recommendation): 자동 추천 블럭과 두 시점 이유(user/dev)

너의 일은 다음 셋이다.

1) 잘 맞는 부분 짚기. 사용자 도메인과 선택이 자연스럽게 맞물리는 자리를 한두 줄로.
2) 비어있는 자리 짚기. 카탈로그에 있는데 사용자가 안 고른 블럭 중 도메인에 어울릴 수 있는 자리. 이유를 일상어로.
3) 더 가벼운 시작 자리 제안. 지금 선택이 너무 무거우면 줄일 자리를 짚어준다. 가벼우면 그대로 좋다고 말한다.

규칙.
- 차단하지 않는다. 사용자가 자유롭게 결정. 너는 시각만 추가
- 카탈로그에 없는 블럭은 만들지 않는다(상상 금지). 카탈로그 안에서만 안내
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

function formatPrerequisites(prereqs) {
  return (prereqs || [])
    .map((p) => {
      const name = p?.name || p?.id || '?';
      const enables = Array.isArray(p?.enables) ? p.enables.join(', ') : '';
      return `- ${name} (해당 자리: ${enables || '없음'})`;
    })
    .join('\n');
}

function formatRecommendation(rec) {
  const recommended = rec && Array.isArray(rec.recommended) ? rec.recommended : [];
  const reasons = (rec && rec.reasons) || {};
  if (!recommended.length) return '(이번 흐름은 추천이 비어있어요)';
  const lines = [];
  for (const id of recommended) {
    const r = reasons[id] || {};
    const userR = (r.user || '').trim();
    const devR = (r.dev || '').trim();
    lines.push(`- ${id}`);
    if (userR) lines.push(`  - 일반 사용자 시점: ${userR}`);
    if (devR) lines.push(`  - 개발자 시점: ${devR}`);
    if (!userR && !devR) lines.push('  - (이유 없음)');
  }
  return lines.join('\n');
}

// block-review-prompt.md 본문을 합성한다.
//
// 입력:
//   answers         - ProspectAnswers (7항목 답변)
//   catalog         - 전체 카탈로그(blocks를 모두 보낸다, ADR 0030 결정 4)
//   selectedBlocks  - 사용자가 고른 블럭 ID 배열
//   resolved        - resolveAll 결과 { autoAdded, affected, prerequisites }
//   recommendation  - BlockRecommendation { recommended, reasons }
//
// 반환: 마크다운 문자열
export function buildBlockReviewPromptMarkdown({
  answers,
  catalog,
  selectedBlocks,
  resolved,
  recommendation,
} = {}) {
  const blocks = catalog && Array.isArray(catalog.blocks) ? catalog.blocks : [];
  const autoAdded = resolved?.autoAdded || [];
  const affected = resolved?.affected || [];
  const prereqs = resolved?.prerequisites || [];
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
    '## 사용자가 고른 블럭',
    '',
    selectedBlocks && selectedBlocks.length
      ? selectedBlocks.map((id) => `- ${id}`).join('\n')
      : '(아직 선택 없음)',
    '',
    '## 의존성 해결 결과',
    '',
    `자동 추가(requires로 함께 들어가는 자리): ${autoAdded.length}개`,
    autoAdded.length ? autoAdded.map((id) => `- ${id}`).join('\n') : '- (없음)',
    '',
    `영향받는 자리(affects): ${affected.length}개`,
    affected.length ? affected.map((id) => `- ${id}`).join('\n') : '- (없음)',
    '',
    `필요한 외부 준비물: ${prereqs.length}개`,
    prereqs.length ? formatPrerequisites(prereqs) : '- (없음)',
    '',
    '## AI 추천 (참고용)',
    '',
    formatRecommendation(recommendation),
    '',
    '## 부탁드릴 검토',
    '',
    '1. 잘 맞는 부분: 사용자 도메인과 지금 선택이 어디서 자연스럽게 맞물려요?',
    '2. 비어있는 자리: 카탈로그에 있는데 안 고른 블럭 중 함께 보면 좋을 자리가 있나요? 일상어로 이유를 부탁해요.',
    '3. 시작 무게: 지금 선택이 무거우면 줄일 자리, 가벼우면 그대로 좋은지 짚어주세요.',
    '',
    '카탈로그에 없는 블럭은 만들지 마시고, 단정형보다 가능성형 결("어울릴 수 있어요")로 답해주세요.',
  ].join('\n');
  return HEADER + body + '\n' + FOOTER;
}
