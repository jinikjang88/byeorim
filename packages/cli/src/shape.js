// beoreum shape. 직전 단계의 산출물을 입력으로 받아 4개 핵심 아키텍처 결정을 만든다.
// ADR 0007의 자리, ADR 0012의 architecture.yml 형식, ADR 0011의 인터랙티브 prompt 정책을 따른다.
// cascade 답안은 맥락으로만 보여주고 직접 참조하지 않는다(ADR 0012 결정 3).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { select } from '@inquirer/prompts';

const SCHEMA_VERSION = 1;
const STAGE = 'shape';
const NEXT_STAGE = 'forge';

// 4개 핵심 결정의 옵션 표. ADR 0012 결정 1에 박힌 표준 키와 식별자.
// 새 옵션 추가나 키 변경은 별도 ADR로 결정한다.
const ARCHITECTURE_CHOICES = {
  language: [
    { value: 'node', name: 'Node.js (JavaScript/TypeScript)' },
    { value: 'java', name: 'Java (Spring Boot)' },
    { value: 'python', name: 'Python (FastAPI/Django)' },
  ],
  database: [
    { value: 'postgresql', name: 'PostgreSQL (관계형, 가장 보편)' },
    { value: 'mysql', name: 'MySQL (관계형, 호스팅 풍부)' },
    { value: 'sqlite', name: 'SQLite (파일 기반, 작은 규모)' },
    { value: 'mongodb', name: 'MongoDB (문서형, 유연한 스키마)' },
  ],
  api_style: [
    { value: 'rest', name: 'REST (HTTP 자원 중심)' },
    { value: 'graphql', name: 'GraphQL (쿼리 중심)' },
    { value: 'rpc', name: 'RPC (메서드 호출 중심)' },
  ],
  architecture_pattern: [
    { value: 'monolith', name: '한 덩어리(Monolith) — 가장 단순' },
    { value: 'modular-monolith', name: '모듈형 한 덩어리(Modular Monolith) — 균형' },
    { value: 'microservices', name: '마이크로서비스(Microservices) — 분산' },
  ],
};

const VALID_VALUES = Object.fromEntries(
  Object.entries(ARCHITECTURE_CHOICES).map(([key, opts]) => [
    key,
    new Set(opts.map((o) => o.value)),
  ]),
);

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

function buildContext(beoreumDir) {
  const intentFile = join(beoreumDir, 'project', 'intent.yml');
  const selectedFile = join(beoreumDir, 'project', 'selected-blocks.yml');
  const decisionsFile = join(beoreumDir, 'project', 'decisions.yml');

  ensureFile(selectedFile, '먼저 beoreum smelt를 실행해주세요');
  ensureFile(intentFile, '먼저 beoreum prospect를 실행해주세요');
  ensureFile(decisionsFile, '먼저 beoreum smelt를 실행해주세요');

  const intent = yaml.load(readFileSync(intentFile, 'utf8')) || {};
  const selected = yaml.load(readFileSync(selectedFile, 'utf8')) || {};
  const decisionsDoc = yaml.load(readFileSync(decisionsFile, 'utf8')) || {};
  const decisions = Array.isArray(decisionsDoc.decisions) ? decisionsDoc.decisions : [];
  const answeredCount = decisions.filter((d) => d && d.answer).length;

  return {
    intent,
    selectedCount: (selected.selected || []).length,
    autoAddedCount: (selected.auto_added || []).length,
    affectedCount: (selected.affected || []).length,
    prerequisitesCount: (selected.prerequisites || []).length,
    decisionsTotal: decisions.length,
    decisionsAnswered: answeredCount,
    decisionsPending: decisions.length - answeredCount,
  };
}

function ensureChoicesValid(choices) {
  const errors = [];
  for (const key of Object.keys(ARCHITECTURE_CHOICES)) {
    const value = choices && choices[key];
    if (!value) {
      errors.push(`${key} 결정이 비어있습니다`);
      continue;
    }
    if (!VALID_VALUES[key].has(value)) {
      errors.push(
        `${key}의 값 "${value}"는 표준 옵션이 아닙니다(허용: ${[...VALID_VALUES[key]].join(', ')})`,
      );
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `아키텍처 결정이 ADR 0012의 표준을 따르지 않습니다:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}

function buildArchitectureDoc(choices, now) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    language: choices.language,
    database: choices.database,
    api_style: choices.api_style,
    architecture_pattern: choices.architecture_pattern,
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

// 기본 askArchitecture. ADR 0012 결정 1의 4개 옵션을 차례로 묻는다.
// context는 prompt에 직접 사용하지 않고 호출자(bin)가 사용자에게 안내할 때 쓸 수 있다.
async function defaultAskArchitecture() {
  const language = await select({
    message: '어떤 언어로 만들 것인가요?',
    choices: ARCHITECTURE_CHOICES.language,
  });
  const database = await select({
    message: '데이터를 어디에 저장할 것인가요?',
    choices: ARCHITECTURE_CHOICES.database,
  });
  const api_style = await select({
    message: 'API는 어떤 형태인가요?',
    choices: ARCHITECTURE_CHOICES.api_style,
  });
  const architecture_pattern = await select({
    message: '코드 구조는 어떻게 잡을까요?',
    choices: ARCHITECTURE_CHOICES.architecture_pattern,
  });
  return { language, database, api_style, architecture_pattern };
}

// interactiveShape는 shape 단계의 본체. askArchitecture는 의존성 주입(ADR 0011 결정 5).
//
// 입력:
//   cwd               - 프로젝트 루트 절대 경로
//   askArchitecture   - async (context) => choices. 기본은 @inquirer select 4번
//   now               - 테스트용 결정적 시각(선택)
//
// 반환: {
//   architectureFile, choices, context, nextStage,
// }
export async function interactiveShape({
  cwd,
  askArchitecture = defaultAskArchitecture,
  now,
} = {}) {
  if (!cwd) throw new Error('interactiveShape({ cwd })가 필요합니다');

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');
  const architectureFile = join(beoreumDir, 'project', 'architecture.yml');

  // 단계 검증을 prompt 호출 전에 둔다(사용자가 4개 결정을 다 고른 뒤 거부당하는 일을 막음).
  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const context = buildContext(beoreumDir);
  const choices = await askArchitecture(context);

  ensureChoicesValid(choices);

  const doc = buildArchitectureDoc(choices, now);
  writeFileSync(architectureFile, yaml.dump(doc, { sortKeys: false }), 'utf8');
  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  return {
    architectureFile,
    choices,
    context,
    nextStage: NEXT_STAGE,
  };
}
