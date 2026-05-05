// shape picker 헬퍼들. 순수 함수 모음. I/O 없음, prompt 호출 없음.
// shape.js의 buildOptionsForKey/defaultAskArchitecture/defaultConfirmArchitecture가 사용한다.
// CLAUDE.md 섹션 8(파일당 책임)과 데이터 무관성 정신.

// 한 옵션의 picker description을 만든다.
//
// 우선순위.
// 1) AI 추천 user reason이 있으면 그것을 보여준다(추천 자리)
// 2) 추천 reason이 비었거나 없으면 옵션의 tradeoff를 보여준다
// 3) tradeoff도 없으면 빈 문자열(undefined로 inquirer가 description 자리 비움)
//
// 인자:
//   option        - { value, name, tradeoff? }
//   userReason    - AI 추천 user 시점 한 줄(선택). 없으면 빈 문자열
//
// 반환: 문자열 또는 빈 문자열
export function buildOptionDescription(option, userReason) {
  const reason = (userReason || '').trim();
  if (reason) return reason;
  const tradeoff = (option && option.tradeoff) || '';
  return tradeoff.trim();
}

// picker 시작에 보여줄 context 요약을 만든다. 사용자가 어디서 와서 무엇을 빚는지 한 단락으로 본다.
//
// 인자: context - { selectedCount, autoAddedCount, affectedCount, prerequisitesCount,
//                   decisionsTotal, decisionsAnswered, decisionsPending }
//
// 반환: 여러 줄 문자열(앞뒤 줄바꿈 없음)
export function formatContextSummary(context) {
  const c = context || {};
  const lines = [];
  lines.push('지금까지 빚은 자리');
  lines.push(
    `  블럭 ${c.selectedCount || 0}개 선택, 자동 추가 ${c.autoAddedCount || 0}개, 영향 ${c.affectedCount || 0}개`,
  );
  if ((c.prerequisitesCount || 0) > 0) {
    lines.push(`  외부 준비물 ${c.prerequisitesCount}개`);
  }
  const total = c.decisionsTotal || 0;
  if (total > 0) {
    lines.push(
      `  cascade 결정 ${total}개 중 ${c.decisionsAnswered || 0}개 답함, ${c.decisionsPending || 0}개 남음`,
    );
  }
  lines.push('');
  lines.push('이제 4개 자리를 차례로 골라요. 옵션을 선택할 때 한국어 풀이가 함께 보여요.');
  return lines.join('\n');
}

// 4개 결정 사용자 선택값을 한 화면 요약으로 풀어쓴다. confirm 단계에서 본다.
//
// 인자:
//   choices       - { language, database, api_style, architecture_pattern }
//   choicesTable  - { language: [{value, name, tradeoff}], ... }
//
// 반환: 여러 줄 문자열(앞뒤 줄바꿈 없음). 각 결정에 한국어 이름과 tradeoff 한 줄.
export function formatChoicesSummary(choices, choicesTable) {
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
    const value = c[key];
    const opts = Array.isArray(t[key]) ? t[key] : [];
    const opt = opts.find((o) => o.value === value);
    if (!opt) {
      lines.push(`  ${labels[key]}: ${value || '(비어있음)'}`);
      continue;
    }
    lines.push(`  ${labels[key]}: ${opt.name}`);
    const tradeoff = (opt.tradeoff || '').trim();
    if (tradeoff) lines.push(`    ${tradeoff}`);
  }
  return lines.join('\n');
}
