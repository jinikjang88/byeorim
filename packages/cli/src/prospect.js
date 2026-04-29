// beoreum prospect. 사용자 자연어에서 의도를 추출하고 빌트인 템플릿 카탈로그를 가져온다.
// ADR 0007의 자리, ADR 0008의 intent.yml 형식, ADR 0009의 AI 어댑터 인터페이스를 따른다.
// Reality Check 6영역 리포트(ADR 0003)는 다음 출시 자리. 이번 출시는 placeholder만 남긴다.

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { input } from '@inquirer/prompts';
import { templates, templatePath } from '@beoreum/templates';

const SCHEMA_VERSION = 1;
const STAGE = 'prospect';
const NEXT_STAGE = 'smelt';

const REALITY_CHECK_PLACEHOLDER = `# Reality Check

이 자리는 다음 출시에서 채워집니다.

ADR 0003에서 정한 6영역(시장 포화, 진입 비용, 양면 시장, 법적 리스크, 수익 모델, 묘지)이 이 파일을 채울 예정입니다. 지금은 prospect 단계가 자리만 잡아두고 다음 단계로 넘어갑니다.

답하지 못한 질문은 .beoreum/project/diary.md에 적어두세요. 다이어리는 여러분이 만들고 여러분이 봅니다.
`;

function listAvailableTemplates() {
  return Object.keys(templates).join(', ');
}

function loadState(stateFile) {
  if (!existsSync(stateFile)) {
    throw new Error('.beoreum/state.yml이 없습니다. 먼저 beoreum init을 실행해주세요');
  }
  return yaml.load(readFileSync(stateFile, 'utf8'));
}

function ensureStage(state, expected) {
  if (state.current_stage !== expected) {
    throw new Error(
      `현재 단계가 ${expected}가 아닙니다(현재: ${state.current_stage}). 단계 순서대로 진행해주세요`,
    );
  }
}

function buildIntent(userInput, extracted, now) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    user_input: userInput,
    source: `template:${extracted.suggested_template}`,
    extracted: {
      what: extracted.what,
      who: extracted.who,
      why: extracted.why,
    },
    reality_check_status: 'pending',
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

// runProspect는 prospect 단계의 본체다. 어댑터 의존성 주입(ADR 0009 결정 4)으로
// LLM 호출 없는 단위 테스트가 가능하다.
//
// 입력:
//   cwd        - 프로젝트 루트 절대 경로
//   userInput  - 사용자가 입력한 자연어 한 마디
//   adapter    - AiAdapter 구현(mock, claude 등). extractIntent 메서드를 가진다
//   now        - 테스트용 결정적 시각(선택)
//
// 반환: { intentFile, catalogFile, realityCheckFile, suggestedTemplate, nextStage }
export async function runProspect({ cwd, userInput, adapter, now } = {}) {
  if (!cwd) throw new Error('runProspect({ cwd })가 필요합니다');
  if (!userInput || !userInput.trim()) {
    throw new Error(
      'runProspect({ userInput })이 필요합니다. 무엇을 만들고 싶은지 한 마디로 적어주세요',
    );
  }
  if (!adapter || typeof adapter.extractIntent !== 'function') {
    throw new Error(
      'runProspect({ adapter })가 필요합니다. AiAdapter 인터페이스(extractIntent)를 구현한 객체여야 합니다',
    );
  }

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const extracted = await adapter.extractIntent(userInput);
  if (!extracted.suggested_template) {
    throw new Error(
      `사용자 입력에서 적합한 빌트인 템플릿을 추천하지 못했습니다: "${userInput}"\n` +
        `지금 지원하는 도메인: ${listAvailableTemplates()}`,
    );
  }

  const sourcePath = templatePath(extracted.suggested_template);
  const catalogDir = join(beoreumDir, 'project', 'catalog');
  mkdirSync(catalogDir, { recursive: true });
  const catalogFile = join(catalogDir, 'catalog.yml');
  copyFileSync(sourcePath, catalogFile);

  const intentFile = join(beoreumDir, 'project', 'intent.yml');
  const intentDoc = buildIntent(userInput, extracted, now);
  writeFileSync(intentFile, yaml.dump(intentDoc, { sortKeys: false }), 'utf8');

  const realityCheckFile = join(beoreumDir, 'project', 'reality-check.md');
  writeFileSync(realityCheckFile, REALITY_CHECK_PLACEHOLDER, 'utf8');

  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  return {
    intentFile,
    catalogFile,
    realityCheckFile,
    suggestedTemplate: extracted.suggested_template,
    nextStage: NEXT_STAGE,
  };
}

// 기본 askInput. @inquirer/prompts의 input으로 자유 텍스트 한 줄을 받는다.
// 빈 입력은 다시 묻는다(사용자에게 "한 글자 이상" 안내).
async function defaultAskInput() {
  return input({
    message: '무엇을 만들고 싶으세요? 한 마디로 적어주세요',
    validate: (value) => (value && value.trim().length > 0 ? true : '한 글자 이상 적어주세요'),
  });
}

// interactiveProspect는 인자 없이 들어온 사용자에게 자유 텍스트 prompt를 띄우고 runProspect로 위임한다.
// askInput은 의존성 주입(ADR 0011 결정 5)이라 단위 테스트가 결정적이다.
//
// 입력:
//   cwd        - 프로젝트 루트 절대 경로
//   adapter    - AiAdapter 구현(mock, claude 등)
//   askInput   - async () => string 반환하는 함수. 기본은 @inquirer input
//   now        - 테스트용 결정적 시각(선택)
//
// 반환: runProspect와 같은 형태
export async function interactiveProspect({ cwd, adapter, askInput = defaultAskInput, now } = {}) {
  if (!cwd) throw new Error('interactiveProspect({ cwd })가 필요합니다');
  if (!adapter || typeof adapter.extractIntent !== 'function') {
    throw new Error(
      'interactiveProspect({ adapter })가 필요합니다. AiAdapter 인터페이스(extractIntent)를 구현한 객체여야 합니다',
    );
  }

  // askInput을 띄우기 전에 단계를 먼저 검증한다. 사용자가 자유 텍스트를 입력한 뒤
  // 단계 불일치로 거부당하는 일을 막는 자리(ADR 0011 결정 5의 정신을 따른다).
  const stateFile = join(cwd, '.beoreum', 'state.yml');
  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const userInput = await askInput();
  return runProspect({ cwd, userInput, adapter, now });
}
