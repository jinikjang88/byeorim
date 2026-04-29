// beoreum smelt. 사용자가 고른 블럭에서 의존성을 해결해 두 산출물을 만든다.
// ADR 0007의 자리, ADR 0010의 두 파일 형식, ADR 0003의 동행 톤(답하지 못한 질문 허용)을 따른다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { checkbox } from '@inquirer/prompts';
import { resolveAll } from '@beoreum/core';
import { loadCatalog } from '@beoreum/catalog';

const SCHEMA_VERSION = 1;
const STAGE = 'smelt';
const NEXT_STAGE = 'shape';

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
// 식별자(블럭 ID)를 보존해 다음 단계 메시지와 결을 맞춘다(ADR 0011 결정 4).
async function defaultPickBlocks(catalog) {
  const choices = catalog.blocks.map((block) => ({
    name: `${block.id} — ${block.name}`,
    value: block.id,
    description: block.user_desc,
  }));
  return checkbox({
    message: '어떤 블럭을 만들고 싶으세요? (스페이스로 선택, 엔터로 확정)',
    choices,
    required: true,
  });
}

// interactiveSmelt는 인자 없이 들어온 사용자에게 블럭 picker를 띄우고 runSmelt로 위임한다.
// picker는 의존성 주입(ADR 0011 결정 5)이라 단위 테스트가 결정적이다.
//
// 입력:
//   cwd         - 프로젝트 루트 절대 경로
//   pickBlocks  - async (catalog) => string[] 반환하는 함수. 기본은 @inquirer checkbox
//   now         - 테스트용 결정적 시각(선택)
//
// 반환: runSmelt와 같은 형태
export async function interactiveSmelt({ cwd, pickBlocks = defaultPickBlocks, now } = {}) {
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
  const blockIds = await pickBlocks(catalog);

  if (!Array.isArray(blockIds) || blockIds.length === 0) {
    throw new Error('한 개 이상의 블럭을 골라주세요');
  }

  return runSmelt({ cwd, blockIds, now });
}
