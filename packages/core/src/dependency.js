// 의존성 그래프 순회. 선택된 블럭에서 출발해 requires 체인을 재귀적으로 펼치고,
// affects 관계로 영향받는 블럭과 World 0 준비물을 모은다.
// cascade 결정 수집은 별도 책임이라 decisions.js로 분리했다(CLAUDE.md 섹션 8 파일당 책임).

import { collectDecisions } from './decisions.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// 한 블럭의 requires 의존성을 직접+간접으로 모은다. visited 집합으로 순환을 끊는다.
function collectRequired(blockId, dependencies, visited) {
  if (visited.has(blockId)) return;
  visited.add(blockId);

  for (const dep of dependencies) {
    if (dep && dep.type === 'requires' && dep.source === blockId) {
      collectRequired(dep.target, dependencies, visited);
    }
  }
}

// 외부 호출용. blockId에서 도달 가능한 requires 타깃 ID를 중복 없이 돌려준다.
// 시작 ID 자신은 결과에 포함하지 않는다.
export function resolveRequired(blockId, dependencies) {
  const visited = new Set();
  collectRequired(blockId, asArray(dependencies), visited);
  visited.delete(blockId);
  return [...visited];
}

function resolveAffected(blockId, dependencies) {
  const result = [];
  for (const dep of dependencies) {
    if (dep && dep.type === 'affects' && dep.source === blockId) {
      result.push(dep.target);
    }
  }
  return result;
}

// 선택된 블럭들로부터 전체 의존성을 해결한다.
// 반환:
//   allBlocks      선택 + requires로 자동 추가된 블럭 ID 배열
//   autoAdded      자동 추가된 블럭 ID 배열
//   affected       영향받지만 자동 추가는 아닌 블럭 ID 배열
//   prerequisites  선택된 블럭 중 하나라도 enables하는 World 0 준비물 배열
//   decisions      선택된 블럭에 걸린 cascade 질문 배열 (collectDecisions 위임)
export function resolveAll(selectedBlockIds, catalog) {
  const dependencies = asArray(catalog && catalog.dependencies);
  const prerequisites = asArray(catalog && catalog.prerequisites);
  const selected = asArray(selectedBlockIds);

  // 선택 블럭과 그것들의 requires 체인을 모두 합친다. 입력 순서를 보존한다.
  const requiredSet = new Set();
  for (const blockId of selected) requiredSet.add(blockId);
  for (const blockId of selected) {
    for (const reqId of resolveRequired(blockId, dependencies)) {
      requiredSet.add(reqId);
    }
  }

  const allBlocks = [...requiredSet];
  const selectedSet = new Set(selected);
  const autoAdded = allBlocks.filter((id) => !selectedSet.has(id));

  // affects는 모은 뒤 이미 required에 들어간 블럭은 뺀다. 영향만 받고 추가는 안 되는 자리.
  const affectedSet = new Set();
  for (const blockId of allBlocks) {
    for (const affId of resolveAffected(blockId, dependencies)) {
      if (!requiredSet.has(affId)) affectedSet.add(affId);
    }
  }

  const neededPrereqs = prerequisites.filter(
    (p) => p && Array.isArray(p.enables) && p.enables.some((id) => requiredSet.has(id)),
  );

  return {
    allBlocks,
    autoAdded,
    affected: [...affectedSet],
    prerequisites: neededPrereqs,
    decisions: collectDecisions(allBlocks, catalog),
  };
}
