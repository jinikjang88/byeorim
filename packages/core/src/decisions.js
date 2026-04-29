// Cascade 결정 수집. 사용자가 선택한 블럭에 걸린 cascade 질문을 모은다.
// 의존성 그래프 순회와는 다른 책임이라 별도 파일에 둔다(CLAUDE.md 섹션 8 파일당 책임).

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// 카탈로그의 cascades에서 사용자가 선택한 블럭에 걸린 결정들을 수집한다.
// 옵션 배열, cascade_effects 값은 그대로 보존한다(형식 패스스루).
export function collectDecisions(selectedBlockIds, catalog) {
  const cascades = asArray(catalog && catalog.cascades);
  const selected = new Set(selectedBlockIds);
  const decisions = [];

  for (const cascade of cascades) {
    if (!cascade || !selected.has(cascade.trigger)) continue;
    for (const question of asArray(cascade.ask_questions)) {
      decisions.push({
        trigger: cascade.trigger,
        question: question.question,
        options: question.options,
        cascade_effects: question.cascade_effects,
      });
    }
  }

  return decisions;
}
