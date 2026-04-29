// beoreum temper. contracts.yml의 endpoint별로 happy_path Given-When-Then 시나리오를 만든다.
// ADR 0007의 자리, ADR 0014의 형식과 operation별 한국어 템플릿 표를 따른다.
// 사용자 입력이 없는 변환 단계라 인터랙티브 picker가 없다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const SCHEMA_VERSION = 1;
const STAGE = 'temper';
const NEXT_STAGE = 'set';

const TODO = 'TODO';

// operation별 Given-When-Then 한국어 템플릿. ADR 0014 결정 3의 표.
// {name}은 block.name(한국어), {path}는 endpoint.path로 치환된다.
// 다른 api_style(GraphQL/RPC)이 들어오면 별도 템플릿 표가 필요하고 별도 ADR로 결정한다.
const OPERATION_TEMPLATES = {
  create: {
    given: '유효한 {name} 입력 데이터가 준비되어 있다',
    when: 'POST {path}로 {name} 생성을 요청한다',
    then: '201 응답과 함께 새 식별자가 돌아온다',
  },
  list: {
    given: '{name}이 0개 이상 저장되어 있다',
    when: 'GET {path}로 목록을 조회한다',
    then: '200 응답과 함께 {name} 목록이 돌아온다',
  },
  get: {
    given: '주어진 식별자의 {name}이 존재한다',
    when: 'GET {path}로 한 건을 조회한다',
    then: '200 응답과 함께 해당 {name}이 돌아온다',
  },
  update: {
    given: '수정할 {name}과 유효한 입력이 준비되어 있다',
    when: 'PUT {path}로 수정을 요청한다',
    then: '200 응답과 함께 수정된 {name}이 돌아온다',
  },
  delete: {
    given: '삭제할 {name}이 존재한다',
    when: 'DELETE {path}로 삭제를 요청한다',
    then: '204 응답',
  },
  search: {
    given: '검색 조건이 준비되어 있다',
    when: 'GET {path}로 검색을 요청한다',
    then: '200 응답과 함께 결과 목록이 돌아온다',
  },
};

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

function fillTemplate(text, blockName, path) {
  return text.replaceAll('{name}', blockName).replaceAll('{path}', path);
}

// 한 endpoint에 대한 happy_path 시나리오를 만든다.
// 알 수 없는 operation이면 빈 텍스트로 두고 사용자가 직접 채우게 한다(가짜 텍스트 회피).
function buildScenarioForEndpoint(blockName, endpoint) {
  const template = OPERATION_TEMPLATES[endpoint.operation];
  if (!template) {
    return {
      kind: 'happy_path',
      given: TODO,
      when: TODO,
      then: TODO,
      test_code: TODO,
    };
  }
  return {
    kind: 'happy_path',
    given: fillTemplate(template.given, blockName, endpoint.path),
    when: fillTemplate(template.when, blockName, endpoint.path),
    then: fillTemplate(template.then, blockName, endpoint.path),
    test_code: TODO,
  };
}

// 한 블럭의 contract를 시나리오 묶음으로 변환한다. internal 블럭은 endpoints가 빈 배열인 채 그대로.
function buildBlockScenarios(contract) {
  const endpointScenarios = (contract.endpoints || []).map((ep) => ({
    operation: ep.operation,
    method: ep.method,
    path: ep.path,
    scenarios: [buildScenarioForEndpoint(contract.name, ep)],
  }));

  return {
    block_id: contract.block_id,
    name: contract.name,
    api_style: contract.api_style,
    endpoints: endpointScenarios,
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

// runTemper는 temper 단계의 본체. contracts.yml을 읽어 test-scenarios.yml을 만든다.
//
// 입력:
//   cwd  - 프로젝트 루트 절대 경로
//   now  - 테스트용 결정적 시각(선택)
//
// 반환: { scenariosFile, scenarios, blockCount, scenarioCount, nextStage }
export async function runTemper({ cwd, now } = {}) {
  if (!cwd) throw new Error('runTemper({ cwd })가 필요합니다');

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');
  const contractsFile = join(beoreumDir, 'project', 'contracts.yml');
  const scenariosFile = join(beoreumDir, 'project', 'test-scenarios.yml');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  ensureFile(contractsFile, '먼저 beoreum forge를 실행해주세요');

  const contractsDoc = yaml.load(readFileSync(contractsFile, 'utf8')) || {};
  const contracts = Array.isArray(contractsDoc.contracts) ? contractsDoc.contracts : [];

  const scenarios = contracts.map((c) => buildBlockScenarios(c));
  const scenarioCount = scenarios.reduce(
    (sum, b) => sum + (b.endpoints || []).reduce((s, ep) => s + (ep.scenarios || []).length, 0),
    0,
  );

  const doc = {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    architecture_api_style: contractsDoc.architecture_api_style,
    scenarios,
  };

  writeFileSync(scenariosFile, yaml.dump(doc, { sortKeys: false }), 'utf8');
  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  return {
    scenariosFile,
    scenarios,
    blockCount: scenarios.length,
    scenarioCount,
    nextStage: NEXT_STAGE,
  };
}
