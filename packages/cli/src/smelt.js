// beoreum smelt. 사용자가 고른 블럭에서 의존성을 해결해 두 산출물을 만든다.
// ADR 0007의 자리, ADR 0010의 두 파일 형식, ADR 0003의 동행 톤(답하지 못한 질문 허용),
// ADR 0029의 블럭 추천 + 선택 검토를 따른다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { checkbox, select } from '@inquirer/prompts';
import { resolveAll } from '@beoreum/core';
import { loadCatalog } from '@beoreum/catalog';

const SCHEMA_VERSION = 1;
const STAGE = 'smelt';
const NEXT_STAGE = 'shape';
const EMPTY_RECOMMENDATION = { recommended: [], reasons: {} };

function ensureFile(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${path}이(가) 없습니다. ${hint}`);
  }
}

function loadState(stateFile) {
  ensureFile(stateFile, '먼저 beoreum init을 실행해주세요');
  return yaml.load(readFileSync(stateFile, 'utf8'));
}

function ensureStage(state, expected) {
  if (state.current_stage !== expected) {
    throw new Error(
      `현재 단계가 ${expected}가 아닙니다(현재: ${state.current_stage}). 단계 순서대로 진행해주세요`,
    );
  }
}

// intent.yml에서 사용자 답변(user_answers)을 읽는다(ADR 0026 schema_version 2).
// 옛 schema_version 1 파일은 user_answers가 없으므로 빈 객체로 폴백한다.
// recommendBlocks가 빈 객체로도 안전하게 도는 결을 따라간다(graceful degradation).
function readIntent(intentFile) {
  const intent = yaml.load(readFileSync(intentFile, 'utf8'));
  if (!intent || typeof intent !== 'object') return { user_answers: {} };
  const answers =
    intent.user_answers && typeof intent.user_answers === 'object' ? intent.user_answers : {};
  return { user_answers: answers, source: intent.source };
}

function ensureBlockIdsExist(blockIds, catalog) {
  const knownIds = new Set(catalog.blocks.map((b) => b.id));
  const unknown = blockIds.filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `카탈로그에 없는 블럭 ID가 있습니다: ${unknown.join(', ')}\n` +
        `사용 가능한 블럭 ID는 .beoreum/project/catalog/catalog.yml의 blocks 항목에서 볼 수 있습니다`,
    );
  }
}

function buildSelectedBlocks(blockIds, resolved, now) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    selected: [...blockIds],
    auto_added: resolved.autoAdded,
    affected: resolved.affected,
    prerequisites: resolved.prerequisites,
  };
}

// decisions.yml은 ADR 0010 결정 2를 따른다. 각 질문에 빈 answer와 null answered_at을
// 미리 만들어 두어 사용자가 어디에 답을 적는지 형식 자체로 안내한다.
function buildDecisions(resolved, now) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    decisions: resolved.decisions.map((d) => ({
      trigger: d.trigger,
      question: d.question,
      options: d.options,
      cascade_effects: d.cascade_effects,
      answer: '',
      answered_at: null,
    })),
  };
}

function advanceState(state, stage) {
  const completed = Array.isArray(state.completed_stages) ? state.completed_stages : [];
  return {
    ...state,
    current_stage: NEXT_STAGE,
    completed_stages: completed.includes(stage) ? completed : [...completed, stage],
  };
}

// 어댑터에서 추천을 얻는다. 어댑터가 없거나 recommendBlocks 미구현이면 빈 추천(ADR 0029 결정 4).
async function fetchRecommendation({ adapter, answers, catalog, log }) {
  if (!adapter || typeof adapter.recommendBlocks !== 'function') {
    log('이번 흐름은 AI 추천 없이 진행됩니다(어댑터가 추천을 지원하지 않음).');
    return EMPTY_RECOMMENDATION;
  }
  const result = await adapter.recommendBlocks({ answers, catalog });
  const recommended = Array.isArray(result?.recommended) ? result.recommended : [];
  const reasons = result?.reasons && typeof result.reasons === 'object' ? result.reasons : {};
  return { recommended, reasons };
}

// runSmelt는 smelt 단계의 본체. 사용자가 고른 블럭 ID 배열로 의존성 해결을 돌리고
// selected-blocks.yml과 decisions.yml을 만든다.
//
// 입력:
//   cwd       - 프로젝트 루트 절대 경로
//   blockIds  - 사용자가 명시적으로 고른 블럭 ID 배열(한 개 이상)
//   now       - 테스트용 결정적 시각(선택)
//
// 반환: {
//   selectedBlocksFile, decisionsFile,
//   selected, autoAdded, affected, prerequisites, decisions,
//   nextStage,
// }
export async function runSmelt({ cwd, blockIds, now } = {}) {
  if (!cwd) throw new Error('runSmelt({ cwd })가 필요합니다');
  if (!Array.isArray(blockIds) || blockIds.length === 0) {
    throw new Error('runSmelt({ blockIds })가 필요합니다. 한 개 이상의 블럭 ID를 골라주세요');
  }

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');
  const intentFile = join(beoreumDir, 'project', 'intent.yml');
  const catalogFile = join(beoreumDir, 'project', 'catalog', 'catalog.yml');
  const selectedBlocksFile = join(beoreumDir, 'project', 'selected-blocks.yml');
  const decisionsFile = join(beoreumDir, 'project', 'decisions.yml');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  ensureFile(intentFile, '먼저 beoreum prospect를 실행해주세요');
  ensureFile(catalogFile, '먼저 beoreum prospect를 실행해주세요');

  const catalog = loadCatalog(catalogFile);
  ensureBlockIdsExist(blockIds, catalog);

  const resolved = resolveAll(blockIds, catalog);

  const selectedBlocks = buildSelectedBlocks(blockIds, resolved, now);
  const decisions = buildDecisions(resolved, now);

  writeFileSync(selectedBlocksFile, yaml.dump(selectedBlocks, { sortKeys: false }), 'utf8');
  writeFileSync(decisionsFile, yaml.dump(decisions, { sortKeys: false }), 'utf8');
  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  return {
    selectedBlocksFile,
    decisionsFile,
    selected: blockIds,
    autoAdded: resolved.autoAdded,
    affected: resolved.affected,
    prerequisites: resolved.prerequisites,
    decisions: resolved.decisions,
    nextStage: NEXT_STAGE,
  };
}

// 기본 picker. @inquirer/prompts의 checkbox로 카탈로그 블럭을 ID + name으로 보여준다.
// 추천 블럭은 [추천] prefix와 한 줄 이유로 강조한다(ADR 0029 결정 2).
// 식별자(블럭 ID)를 보존해 다음 단계 메시지와 결을 맞춘다(ADR 0011 결정 4).
async function defaultPickBlocks({ catalog, recommendation = EMPTY_RECOMMENDATION } = {}) {
  const recommendedSet = new Set(recommendation.recommended || []);
  const reasons = recommendation.reasons || {};
  const choices = catalog.blocks.map((block) => {
    const isRec = recommendedSet.has(block.id);
    const reason = reasons[block.id];
    let label = `${block.id} — ${block.name}`;
    if (isRec) {
      label = reason ? `[추천] ${label} (이유: ${reason})` : `[추천] ${label}`;
    }
    return {
      name: label,
      value: block.id,
      description: block.user_desc,
    };
  });
  return checkbox({
    message: '어떤 블럭을 만들고 싶으세요? (스페이스로 선택, 엔터로 확정)',
    choices,
    required: true,
  });
}

// 기본 confirmSelection. 의존성 해결 결과를 표로 출력한 뒤 사용자에게 진행/다시 고르기를 묻는다.
// 'proceed'를 돌려주면 산출물 작성, 'redo'를 돌려주면 picker 다시 띄움(ADR 0029 결정 3).
async function defaultConfirmSelection({ resolved, blockIds, log = console.log } = {}) {
  log('');
  log('선택을 마쳤어요. 함께 들어갈 자리를 정리했어요.');
  log('');
  log(`  선택한 자리: ${blockIds.length}개 (${blockIds.join(', ') || '(없음)'})`);
  log(`  자동 추가: ${resolved.autoAdded.length}개 (${resolved.autoAdded.join(', ') || '(없음)'})`);
  log(
    `  영향받는 자리: ${resolved.affected.length}개 (${resolved.affected.join(', ') || '(없음)'})`,
  );
  const prereqNames = (resolved.prerequisites || []).map((p) => p.name || p.id || '?');
  log(`  필요한 준비물: ${prereqNames.length}개 (${prereqNames.join(', ') || '(없음)'})`);
  log('');
  return select({
    message: '이대로 다음 단계로 갈까요?',
    choices: [
      { name: '예, 진행', value: 'proceed' },
      { name: '아니오, 다시 고를게요', value: 'redo' },
    ],
    default: 'proceed',
  });
}

// interactiveSmelt는 인자 없이 들어온 사용자에게 블럭 picker를 띄우고 runSmelt로 위임한다.
// adapter가 주어지면 prospect 답변 기반 추천(ADR 0029)으로 picker를 강조한다.
// confirmSelection 단계가 'redo'를 돌려주면 picker로 돌아가 다시 고른다.
//
// 입력:
//   cwd               - 프로젝트 루트 절대 경로
//   adapter           - AiAdapter(선택). recommendBlocks를 부르는 자리
//   pickBlocks        - async ({ catalog, recommendation }) => string[]. 기본은 @inquirer checkbox
//   confirmSelection  - async ({ resolved, blockIds, log }) => 'proceed'|'redo'. 기본은 select
//   now               - 테스트용 결정적 시각(선택)
//   log               - 콘솔 출력 함수(선택)
//
// 반환: runSmelt와 같은 형태
export async function interactiveSmelt({
  cwd,
  adapter,
  pickBlocks = defaultPickBlocks,
  confirmSelection = defaultConfirmSelection,
  now,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('interactiveSmelt({ cwd })가 필요합니다');

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');
  const intentFile = join(beoreumDir, 'project', 'intent.yml');
  const catalogFile = join(beoreumDir, 'project', 'catalog', 'catalog.yml');

  // picker를 띄우기 전에 단계와 파일 자리를 먼저 검증한다. 사용자가 블럭을 고른 뒤에야
  // 거부당하는 일이 없도록.
  const state = loadState(stateFile);
  ensureStage(state, STAGE);
  ensureFile(intentFile, '먼저 beoreum prospect를 실행해주세요');
  ensureFile(catalogFile, '먼저 beoreum prospect를 실행해주세요');

  const catalog = loadCatalog(catalogFile);
  const { user_answers: answers } = readIntent(intentFile);
  const recommendation = await fetchRecommendation({ adapter, answers, catalog, log });

  // picker → resolveAll → confirm 루프. confirm이 'redo'면 다시.
  // 사용자 의지로 무한 루프 가능(차단 자리 없음, 동행 톤).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const blockIds = await pickBlocks({ catalog, recommendation });
    if (!Array.isArray(blockIds) || blockIds.length === 0) {
      throw new Error('한 개 이상의 블럭을 골라주세요');
    }
    const resolved = resolveAll(blockIds, catalog);
    const decision = await confirmSelection({ resolved, blockIds, log });
    if (decision === 'proceed') {
      return runSmelt({ cwd, blockIds, now });
    }
    log('알겠어요. 다시 골라볼게요.');
  }
}
