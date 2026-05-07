// beoreum smelt import-review. ADR 0052의 외부 검토 응답 import 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 응답 마크다운 파일을 읽어
// "## 제안된 변경 사항" 섹션의 ```yaml changes를 파싱하고 인터랙티브 picker로 자리마다 적용한다.
// state는 안 건드리고 selected-blocks.yml과 decisions.yml만 다듬는다(ADR 0052 결정 3, 4).
// forge-import.js의 결을 따라간다(같은 picker 패턴, ADR 0045).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { select } from '@inquirer/prompts';
import { resolveAll } from '@beoreum/core';
import { parseReviewResponse, validateSmeltChange } from './review-response-parser.js';

function ensureFile(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${path}이(가) 없습니다. ${hint}`);
  }
}

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf8')) || {};
}

// 카탈로그에서 블럭을 찾는다.
function findBlockInCatalog(catalog, blockId) {
  const blocks = (catalog && catalog.blocks) || [];
  return blocks.find((b) => b && b.id === blockId) || null;
}

// 변경 객체와 selected/catalog를 받아 적용 가능한지 본다.
// 반환: { ok: true, block } 또는 { ok: false, reason }
function locateChange(change, selected, catalog) {
  const block = findBlockInCatalog(catalog, change.block_id);
  if (!block) {
    return {
      ok: false,
      reason: `block_id "${change.block_id}"를 catalog에서 못 찾았어요`,
    };
  }
  if (change.kind === 'block_add') {
    if (selected.includes(change.block_id)) {
      return {
        ok: false,
        reason: `${change.block_id}는 이미 selected에 있어요`,
      };
    }
    return { ok: true, block };
  }
  if (change.kind === 'block_remove') {
    if (!selected.includes(change.block_id)) {
      return {
        ok: false,
        reason: `${change.block_id}가 selected에 없어요(자동 추가된 블럭이거나 잘못된 자리)`,
      };
    }
    return { ok: true, block };
  }
  return { ok: false, reason: `알 수 없는 kind: ${change.kind}` };
}

// 한 변경을 selected 배열에 적용(in-place mutation).
function applyChange(change, selected) {
  if (change.kind === 'block_add') {
    selected.push(change.block_id);
    return;
  }
  if (change.kind === 'block_remove') {
    const idx = selected.indexOf(change.block_id);
    if (idx >= 0) selected.splice(idx, 1);
  }
}

// describeChange는 사용자에게 한 변경을 한 줄로 풀어쓴다.
function describeChange(change, block) {
  const name = (block && block.name) || change.block_id;
  if (change.kind === 'block_add') {
    return `+ ${name} (${change.block_id}) 추가`;
  }
  if (change.kind === 'block_remove') {
    return `- ${name} (${change.block_id}) 제거`;
  }
  return `${change.block_id}의 알 수 없는 변경(${change.kind})`;
}

// 기본 confirmChange. forge-import의 결과 같음.
async function defaultConfirmChange({ change, block, index, total, log = console.log } = {}) {
  log('');
  log(`[${index + 1}/${total}] ${describeChange(change, block)}`);
  if (block && block.user_desc) {
    log(`  설명: ${block.user_desc}`);
  }
  if (change.reason) {
    log(`  이유: ${change.reason}`);
  }
  log('');
  return select({
    message: '어떻게 할까요?',
    choices: [
      { name: '적용하기', value: 'apply' },
      { name: '건너뛰기', value: 'skip' },
      { name: '이번부터 모두 적용', value: 'apply_all_remaining' },
      { name: '이번부터 모두 건너뛰기', value: 'skip_all_remaining' },
      { name: '여기서 멈추기', value: 'stop' },
    ],
    default: 'apply',
  });
}

// 옛 decisions.yml의 사용자 답변을 trigger 단위로 보존하면서 새 decisions 목록과 머지한다.
// ADR 0052 결정 4.
function mergeDecisions(oldDecisionsDoc, newDecisions) {
  const oldDecisions = Array.isArray(oldDecisionsDoc.decisions) ? oldDecisionsDoc.decisions : [];
  const oldByTrigger = new Map();
  for (const d of oldDecisions) {
    if (d && d.trigger) oldByTrigger.set(d.trigger, d);
  }
  return newDecisions.map((d) => {
    const previous = oldByTrigger.get(d.trigger);
    if (previous && previous.answer) {
      return { ...d, answer: previous.answer };
    }
    return d;
  });
}

// applySmeltReview는 smelt import-review의 본체.
// 외부 AI 응답 파일을 읽고 selected-blocks.yml과 decisions.yml을 갱신한다.
// 모든 변경 적용 후 의존성 재해결을 한 번 호출(ADR 0052 결정 3).
//
// 입력:
//   cwd            - 프로젝트 루트 절대 경로
//   responsePath   - 외부 AI 응답 마크다운 파일 경로
//   confirmChange  - async ({ change, block, index, total, log }) => decision (선택)
//   log            - 콘솔 출력 함수(선택)
//   now            - 결정적 시각(선택, 테스트용)
//
// 반환: {
//   selectedBlocksFile, decisionsFile, responseFile,
//   hasStructuredSection, parseError,
//   proposedCount, invalidCount, appliedCount, skippedCount, stopped,
//   warnings,
// }
export async function applySmeltReview({
  cwd,
  responsePath,
  confirmChange = defaultConfirmChange,
  log = console.log,
  now,
} = {}) {
  if (!cwd) throw new Error('applySmeltReview({ cwd })가 필요합니다');
  if (!responsePath) {
    throw new Error(
      'applySmeltReview({ responsePath })가 필요합니다. 외부 AI 응답 파일 경로를 적어주세요',
    );
  }

  const beoreumDir = join(cwd, '.beoreum');
  const selectedBlocksFile = join(beoreumDir, 'project', 'selected-blocks.yml');
  const decisionsFile = join(beoreumDir, 'project', 'decisions.yml');
  const catalogFile = join(beoreumDir, 'project', 'catalog', 'catalog.yml');

  ensureFile(selectedBlocksFile, '먼저 beoreum smelt를 실행해주세요');
  ensureFile(catalogFile, '먼저 beoreum prospect를 실행해주세요');

  // 응답 파일 읽기.
  let responseText;
  try {
    responseText = readFileSync(responsePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`응답 파일을 찾지 못했어요: ${responsePath}`);
    }
    throw err;
  }

  const parseResult = parseReviewResponse(responseText);
  const warnings = [];

  if (!parseResult.hasStructuredSection || parseResult.parseError) {
    log('');
    log('응답에서 "## 제안된 변경 사항" 섹션을 못 알아봤어요.');
    if (parseResult.parseError) {
      log(`  사유: ${parseResult.parseError}`);
    }
    log('외부 AI가 자유 형식으로만 답했거나 형식이 어긋났을 수 있어요.');
    log(
      '응답을 직접 보시고 selected-blocks.yml을 손으로 다듬으시거나, 외부 AI에 형식대로 다시 답해달라고 부탁해주세요.',
    );
    return {
      selectedBlocksFile,
      decisionsFile,
      responseFile: responsePath,
      hasStructuredSection: parseResult.hasStructuredSection,
      parseError: parseResult.parseError,
      proposedCount: 0,
      invalidCount: 0,
      appliedCount: 0,
      skippedCount: 0,
      stopped: false,
      warnings,
    };
  }

  // selected-blocks.yml과 catalog 로드.
  const selectedBlocksDoc = loadYaml(selectedBlocksFile);
  const selected = Array.isArray(selectedBlocksDoc.selected) ? [...selectedBlocksDoc.selected] : [];
  const catalog = loadYaml(catalogFile);

  // 형식 + 위치 검증.
  const proposed = parseResult.changes;
  const validChanges = [];
  const invalidNotes = [];
  for (let i = 0; i < proposed.length; i += 1) {
    const change = proposed[i];
    const formatCheck = validateSmeltChange(change);
    if (!formatCheck.valid) {
      invalidNotes.push(`#${i + 1} 형식 어긋남: ${formatCheck.reason}`);
      continue;
    }
    // selected는 picker 진행 중에 변할 수 있어 매번 현재 상태로 검증.
    // 다만 첫 위치 검증은 원본 selected로(외부 AI가 처음 본 자리). picker 진행은 dryRun이라 위치 충돌 미세 차이는 허용.
    const located = locateChange(change, selected, catalog);
    if (!located.ok) {
      invalidNotes.push(`#${i + 1} ${describeChange(change, null)} - ${located.reason}`);
      continue;
    }
    validChanges.push({ change, block: located.block });
  }

  const proposedCount = proposed.length;
  const invalidCount = invalidNotes.length;

  log('');
  log(`응답을 읽었어요. 제안된 변경 ${proposedCount}개.`);
  if (invalidCount > 0) {
    log(`그 중 ${invalidCount}개는 형식이 맞지 않거나 자리를 못 찾아 건너뜁니다:`);
    for (const note of invalidNotes) {
      log(`  - ${note}`);
    }
  }
  if (validChanges.length === 0) {
    log('적용할 변경이 없어요. selected-blocks.yml과 decisions.yml은 그대로 둡니다.');
    return {
      selectedBlocksFile,
      decisionsFile,
      responseFile: responsePath,
      hasStructuredSection: true,
      parseError: null,
      proposedCount,
      invalidCount,
      appliedCount: 0,
      skippedCount: 0,
      stopped: false,
      warnings,
    };
  }
  log(`적용 가능한 변경 ${validChanges.length}개를 한 자리씩 같이 봐요.`);

  // batch picker (ADR 0045).
  let appliedCount = 0;
  let skippedCount = 0;
  let stopped = false;
  let mode = 'prompt';
  for (let i = 0; i < validChanges.length; i += 1) {
    const { change, block } = validChanges[i];
    let decision;
    if (mode === 'apply_all') decision = 'apply';
    else if (mode === 'skip_all') decision = 'skip';
    else
      decision = await confirmChange({
        change,
        block,
        index: i,
        total: validChanges.length,
        log,
      });

    if (decision === 'apply_all_remaining') {
      mode = 'apply_all';
      decision = 'apply';
    } else if (decision === 'skip_all_remaining') {
      mode = 'skip_all';
      decision = 'skip';
    }

    if (decision === 'apply') {
      applyChange(change, selected);
      appliedCount += 1;
    } else if (decision === 'skip') {
      skippedCount += 1;
    } else if (decision === 'stop') {
      stopped = true;
      break;
    }
  }

  // 변경이 한 번이라도 적용됐으면 의존성 재해결 + yml 갱신.
  if (appliedCount > 0) {
    const resolved = resolveAll(selected, catalog);
    const generatedAt = (now || new Date()).toISOString();

    selectedBlocksDoc.selected = selected;
    selectedBlocksDoc.auto_added = resolved.autoAdded;
    selectedBlocksDoc.affected = resolved.affected;
    selectedBlocksDoc.prerequisites = resolved.prerequisites;
    selectedBlocksDoc.generated_at = generatedAt;
    writeFileSync(selectedBlocksFile, yaml.dump(selectedBlocksDoc, { sortKeys: false }), 'utf8');

    // decisions.yml의 사용자 답변 보존하면서 머지.
    if (existsSync(decisionsFile)) {
      const oldDecisionsDoc = loadYaml(decisionsFile);
      oldDecisionsDoc.decisions = mergeDecisions(oldDecisionsDoc, resolved.decisions || []);
      oldDecisionsDoc.generated_at = generatedAt;
      writeFileSync(decisionsFile, yaml.dump(oldDecisionsDoc, { sortKeys: false }), 'utf8');
    }
  }

  log('');
  log(
    `정리. 적용 ${appliedCount}개, 건너뜀 ${skippedCount}개${
      stopped ? `, 멈춤(남은 ${validChanges.length - appliedCount - skippedCount}개)` : ''
    }.`,
  );
  if (appliedCount > 0) {
    log(`selected-blocks.yml과 decisions.yml이 갱신되었습니다(의존성 재해결 포함).`);
  }

  return {
    selectedBlocksFile,
    decisionsFile,
    responseFile: responsePath,
    hasStructuredSection: true,
    parseError: null,
    proposedCount,
    invalidCount,
    appliedCount,
    skippedCount,
    stopped,
    warnings,
  };
}
