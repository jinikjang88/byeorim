// byeorim status. 현재 프로젝트의 단계와 산출물 상태를 보여준다.
// 단계 독립 명령어(answer와 같은 결). 부작용 없음: 파일을 만들지도 state를 바꾸지도 않는다.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

// 7단계 순서. ADR 0006이 박은 표준.
const STAGE_ORDER = ['prospect', 'smelt', 'shape', 'forge', 'temper', 'set', 'inspect'];

// 한국어 표시용 매핑. ADR 0002 결정 1과 ADR 0006의 7단계 한국어 이름.
const STAGE_KOREAN = {
  prospect: '탐광',
  smelt: '제련',
  shape: '빚다',
  forge: '단조',
  temper: '다듬',
  set: '세움',
  inspect: '비춤',
};

const DONE_MARKER = 'done';

function safeLoad(path) {
  if (!existsSync(path)) return null;
  try {
    return yaml.load(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function buildStageProgress(currentStage, completedStages) {
  const completed = new Set(completedStages);
  return STAGE_ORDER.map((id) => ({
    id,
    korean: STAGE_KOREAN[id],
    status: completed.has(id) ? 'completed' : currentStage === id ? 'current' : 'pending',
  }));
}

function readDecisionsCounts(decisionsFile) {
  const doc = safeLoad(decisionsFile);
  if (!doc) return null;
  const list = Array.isArray(doc.decisions) ? doc.decisions : [];
  const answered = list.filter((d) => d && d.answer).length;
  return {
    total: list.length,
    answered,
    pending: list.length - answered,
  };
}

function buildArtifacts(projectDir) {
  return {
    intent: existsSync(join(projectDir, 'prospect-intent.yml')),
    catalog: existsSync(join(projectDir, 'catalog', 'catalog.yml')),
    selected_blocks: existsSync(join(projectDir, 'smelt-selected-blocks.yml')),
    decisions: existsSync(join(projectDir, 'decisions.yml')),
    architecture: existsSync(join(projectDir, 'shape-architecture.yml')),
    contracts: existsSync(join(projectDir, 'forge-contracts.yml')),
    test_scenarios: existsSync(join(projectDir, 'temper-scenarios.yml')),
    generated_readme: existsSync(join(projectDir, 'generated', 'README.md')),
    inspect_report: existsSync(join(projectDir, 'inspect-report.md')),
    verify_report: existsSync(join(projectDir, 'verify-report.md')),
    reality_check: existsSync(join(projectDir, 'prospect-reality-check.md')),
    diary: existsSync(join(projectDir, 'diary.md')),
  };
}

// runStatus는 .byeorim/state.yml과 산출물을 읽어 status 객체를 돌려준다.
// bin/byeorim.js가 이 객체를 한국어 출력으로 풀어낸다.
//
// 입력:
//   cwd  - 프로젝트 루트 절대 경로
//
// 반환: {
//   initialized,         init 여부
//   byeorimDir,          .byeorim 절대 경로
//   schema_version,      state.yml의 schema_version (init 후)
//   created_at,          init 시각
//   current_stage,       'prospect'~'inspect' 또는 'done'
//   completed_stages,    완료된 단계 ID 배열
//   is_done,             current_stage === 'done'
//   next_stage,          done이면 null, 아니면 current_stage
//   stages,              [{ id, korean, status: 'completed'|'current'|'pending' }] 7개
//   decisions,           { total, answered, pending } 또는 null(파일 부재)
//   artifacts,           각 산출물 존재 여부 boolean 맵
// }
export function runStatus({ cwd } = {}) {
  if (!cwd) throw new Error('runStatus({ cwd })가 필요합니다');

  const byeorimDir = join(cwd, '.byeorim');
  const stateFile = join(byeorimDir, 'state.yml');

  if (!existsSync(stateFile)) {
    return {
      initialized: false,
      byeorimDir,
    };
  }

  const state = safeLoad(stateFile) || {};
  const completedStages = Array.isArray(state.completed_stages) ? state.completed_stages : [];
  const currentStage = state.current_stage || null;
  const isDone = currentStage === DONE_MARKER;

  const projectDir = join(byeorimDir, 'project');

  return {
    initialized: true,
    byeorimDir,
    schema_version: state.schema_version || null,
    created_at: state.created_at || null,
    current_stage: currentStage,
    completed_stages: completedStages,
    is_done: isDone,
    next_stage: isDone ? null : currentStage,
    stages: buildStageProgress(currentStage, completedStages),
    decisions: readDecisionsCounts(join(projectDir, 'decisions.yml')),
    artifacts: buildArtifacts(projectDir),
  };
}
