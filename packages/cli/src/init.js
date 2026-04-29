// beoreum init. 현재 디렉토리에 .beoreum/ 작업 공간을 만든다.
// ADR 0007의 결정을 그대로 따른다(루트 위치, project/ 자리, state.yml, gitignore 정책, 확장자).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const SCHEMA_VERSION = 1;
const INITIAL_STAGE = 'prospect';

const DIARY_TEMPLATE = `# 다이어리

답하지 못한 질문을 적어두는 자리입니다. 막히면 부끄러워하지 말고 적어두세요.
시간이 지나면 답이 자라 있을 겁니다.
`;

const GITIGNORE_TEMPLATE = `# 생성된 코드는 contracts.yml과 test-scenarios.yml에서 재현 가능하므로 git에 올리지 않는다
project/generated/
`;

function buildInitialState(now = new Date()) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: now.toISOString(),
    current_stage: INITIAL_STAGE,
    completed_stages: [],
  };
}

// 현재 디렉토리에 .beoreum/ 작업 공간을 만든다.
// 반환: { beoreumDir, stateFile, diaryFile, gitignoreFile } 생성된 자리들의 절대 경로
export function runInit({ cwd, now } = {}) {
  if (!cwd) {
    throw new Error('runInit({ cwd })가 필요합니다');
  }

  const beoreumDir = join(cwd, '.beoreum');
  const projectDir = join(beoreumDir, 'project');
  const stateFile = join(beoreumDir, 'state.yml');
  const diaryFile = join(projectDir, 'diary.md');
  const gitignoreFile = join(beoreumDir, '.gitignore');

  if (existsSync(beoreumDir)) {
    throw new Error(
      `.beoreum/ 작업 공간이 이미 있습니다: ${beoreumDir}\n` +
        `처음부터 다시 시작하려면 이 디렉토리를 직접 삭제한 뒤 다시 init을 실행해주세요.`,
    );
  }

  mkdirSync(projectDir, { recursive: true });

  const state = buildInitialState(now);
  writeFileSync(stateFile, yaml.dump(state, { sortKeys: false }), 'utf8');
  writeFileSync(diaryFile, DIARY_TEMPLATE, 'utf8');
  writeFileSync(gitignoreFile, GITIGNORE_TEMPLATE, 'utf8');

  return { beoreumDir, stateFile, diaryFile, gitignoreFile };
}
