// beoreum temper. contracts.yml의 endpoint별로 happy_path Given-When-Then 시나리오를 만든다.
// ADR 0007의 자리, ADR 0014의 형식과 operation별 한국어 템플릿 표를 따른다.
// ADR 0036의 옵셔널 어댑터로 test_code를 채운다(어댑터가 없으면 TODO 그대로).
// ADR 0037의 인터랙티브 검토 흐름을 interactiveTemper로 박는다.
// ADR 0038의 외부 검토 프롬프트 부산물(test-scenarios-review-prompt.md)을 자동 생성한다.
// runTemper는 비대화 호환 자리로 그대로 유지(테스트와 자동화에서 사용).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { select } from '@inquirer/prompts';
import { formatScenariosSummary } from './temper-picker-helpers.js';
import { buildScenariosReviewPromptMarkdown } from './temper-prompt.js';

const SCHEMA_VERSION = 1;
const STAGE = 'temper';
const NEXT_STAGE = 'set';

const TODO = 'TODO';

// 결정적 어댑터의 이름 집합. ADR 0037 결정 3의 안내 문구 표시 자리에서 사용.
// mock 어댑터는 같은 입력에 같은 출력이라 redo가 같은 결과를 만든다.
const DETERMINISTIC_ADAPTER_NAMES = new Set(['mock']);

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

// adapter가 주어지면 각 시나리오의 test_code TODO를 어댑터의 fillTestCode로 채운다(ADR 0036).
// architecture는 architecture.yml에서 읽은 객체. 어댑터에 그대로 넘긴다.
// blockMap은 contract.block_id → 카탈로그 블럭 객체. 시나리오 호출 시 어댑터에 도메인 정보 전달.
async function fillTestCodesWithAdapter(scenarios, blockMap, architecture, adapter) {
  for (const scenarioGroup of scenarios) {
    const block = blockMap.get(scenarioGroup.block_id);
    const blockArg = block || {
      id: scenarioGroup.block_id,
      name: scenarioGroup.name,
    };
    for (const ep of scenarioGroup.endpoints || []) {
      const endpoint = {
        operation: ep.operation,
        method: ep.method,
        path: ep.path,
      };
      for (const scenario of ep.scenarios || []) {
        const filled = await adapter.fillTestCode({
          block: blockArg,
          endpoint,
          scenario,
          architecture,
        });
        if (typeof filled === 'string' && filled.length > 0) {
          scenario.test_code = filled;
        }
      }
    }
  }
}

// temper의 입력 자리들을 한 번에 읽고 검증한다. ADR 0014의 입력 의존성과 단계 검증을 한 자리에 모은다.
// intent/selected는 contracts.yml에서 시나리오 만드는 데는 안 쓰이지만 외부 검토 프롬프트(ADR 0038)에 함께 담는다.
// 반환: { state, contractsDoc, contracts, architecture, catalog, blockMap, answers, selectedBlocks, paths }
function loadTemperInputs(cwd) {
  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');
  const intentFile = join(beoreumDir, 'project', 'intent.yml');
  const selectedFile = join(beoreumDir, 'project', 'selected-blocks.yml');
  const contractsFile = join(beoreumDir, 'project', 'contracts.yml');
  const archFile = join(beoreumDir, 'project', 'architecture.yml');
  const catalogFile = join(beoreumDir, 'project', 'catalog', 'catalog.yml');
  const scenariosFile = join(beoreumDir, 'project', 'test-scenarios.yml');
  const promptsDir = join(beoreumDir, 'project', 'prompts');
  const scenariosReviewPromptFile = join(promptsDir, 'test-scenarios-review-prompt.md');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  ensureFile(contractsFile, '먼저 beoreum forge를 실행해주세요');

  const contractsDoc = yaml.load(readFileSync(contractsFile, 'utf8')) || {};
  const contracts = Array.isArray(contractsDoc.contracts) ? contractsDoc.contracts : [];

  // architecture.yml과 catalog.yml은 어댑터에 도메인 정보를 전달하는 자리. 없어도 안전.
  let architecture = null;
  if (existsSync(archFile)) {
    architecture = yaml.load(readFileSync(archFile, 'utf8')) || {};
  }
  let catalog = { blocks: [] };
  const blockMap = new Map();
  if (existsSync(catalogFile)) {
    const catalogDoc = yaml.load(readFileSync(catalogFile, 'utf8')) || {};
    const blocks = Array.isArray(catalogDoc.blocks) ? catalogDoc.blocks : [];
    catalog = { ...catalogDoc, blocks };
    for (const b of blocks) {
      if (b && typeof b.id === 'string') blockMap.set(b.id, b);
    }
  }

  // intent.yml과 selected-blocks.yml은 부산물(외부 검토 프롬프트)에만 쓰인다. 없으면 빈 객체로 폴백.
  let answers = {};
  if (existsSync(intentFile)) {
    const intent = yaml.load(readFileSync(intentFile, 'utf8')) || {};
    answers =
      intent.user_answers && typeof intent.user_answers === 'object' ? intent.user_answers : {};
  }
  let selectedBlocks = {};
  if (existsSync(selectedFile)) {
    selectedBlocks = yaml.load(readFileSync(selectedFile, 'utf8')) || {};
  }

  return {
    state,
    contractsDoc,
    contracts,
    architecture,
    catalog,
    blockMap,
    answers,
    selectedBlocks,
    paths: { stateFile, scenariosFile, promptsDir, scenariosReviewPromptFile },
  };
}

// scenarios 배열을 만든다(adapter가 있으면 test_code 채움까지). 디스크에는 안 쓴다.
// 반환: { scenarios, scenarioCount, testCodeFilled }
async function buildScenarios({ contracts, architecture, blockMap, adapter }) {
  const scenarios = contracts.map((c) => buildBlockScenarios(c));
  const scenarioCount = scenarios.reduce(
    (sum, b) => sum + (b.endpoints || []).reduce((s, ep) => s + (ep.scenarios || []).length, 0),
    0,
  );

  let testCodeFilled = false;
  if (adapter && typeof adapter.fillTestCode === 'function' && architecture) {
    await fillTestCodesWithAdapter(scenarios, blockMap, architecture, adapter);
    testCodeFilled = true;
  }
  return { scenarios, scenarioCount, testCodeFilled };
}

function buildScenariosDoc({ contractsDoc, scenarios, now }) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    architecture_api_style: contractsDoc.architecture_api_style,
    scenarios,
  };
}

function writeScenariosAndAdvance({ paths, state, doc }) {
  writeFileSync(paths.scenariosFile, yaml.dump(doc, { sortKeys: false }), 'utf8');
  writeFileSync(
    paths.stateFile,
    yaml.dump(advanceState(state, STAGE), { sortKeys: false }),
    'utf8',
  );
}

// runTemper는 temper 단계의 비대화 본체. contracts.yml을 읽어 test-scenarios.yml을 만든다.
// adapter가 주어지면 architecture.yml을 함께 읽어 각 시나리오의 test_code를 어댑터로 채운다(ADR 0036).
// 후행 호환을 위해 시그니처와 동작을 ADR 0036 시점 그대로 유지한다(ADR 0037 결정 4).
//
// 입력:
//   cwd      - 프로젝트 루트 절대 경로
//   adapter  - AI 어댑터(옵셔널). fillTestCode를 구현하면 test_code 채움. 없거나 메서드 없으면 TODO 그대로
//   now      - 테스트용 결정적 시각(선택)
//
// 반환: { scenariosFile, scenarios, blockCount, scenarioCount, testCodeFilled, nextStage }
export async function runTemper({ cwd, adapter = null, now } = {}) {
  if (!cwd) throw new Error('runTemper({ cwd })가 필요합니다');

  const inputs = loadTemperInputs(cwd);
  const { scenarios, scenarioCount, testCodeFilled } = await buildScenarios({
    contracts: inputs.contracts,
    architecture: inputs.architecture,
    blockMap: inputs.blockMap,
    adapter,
  });

  const doc = buildScenariosDoc({
    contractsDoc: inputs.contractsDoc,
    scenarios,
    now,
  });
  writeScenariosAndAdvance({ paths: inputs.paths, state: inputs.state, doc });

  return {
    scenariosFile: inputs.paths.scenariosFile,
    scenarios,
    blockCount: scenarios.length,
    scenarioCount,
    testCodeFilled,
    nextStage: NEXT_STAGE,
  };
}

// 기본 confirmScenarios. 검토 화면을 보여주고 진행/다시 select(ADR 0037 결정 1, 3).
async function defaultConfirmScenarios({
  scenarios,
  blockCount,
  scenarioCount,
  adapter,
  testCodeFilled,
  adapterIsDeterministic,
  log = console.log,
} = {}) {
  log('');
  log(
    formatScenariosSummary({
      scenarios,
      blockCount,
      scenarioCount,
      adapter,
      testCodeFilled,
      adapterIsDeterministic,
    }),
  );
  log('');
  return select({
    message: '이대로 가실래요?',
    choices: [
      { name: '예, 다음 단계로', value: 'proceed' },
      { name: '아니오, 다시 만들게요', value: 'redo' },
    ],
    default: 'proceed',
  });
}

// interactiveTemper는 temper 단계의 인터랙티브 본체(ADR 0037).
// build → confirm 루프. confirm이 'redo'면 build를 다시(adapter 재호출 포함).
// confirmScenarios는 의존성 주입(ADR 0011 결정 5).
//
// 입력:
//   cwd               - 프로젝트 루트 절대 경로
//   adapter           - AiAdapter(선택). test_code 채움 자리
//   confirmScenarios  - async ({ scenarios, blockCount, scenarioCount, adapter, testCodeFilled, adapterIsDeterministic, log })
//                       => 'proceed'|'redo'. 기본은 select
//   now               - 테스트용 결정적 시각(선택)
//   log               - 콘솔 출력 함수(선택)
//
// 반환: { scenariosFile, scenariosReviewPromptFile, scenarios, blockCount, scenarioCount, testCodeFilled, nextStage }
// runTemper와 비교해 scenariosReviewPromptFile이 추가된다(ADR 0038 부산물 자리).
export async function interactiveTemper({
  cwd,
  adapter = null,
  confirmScenarios = defaultConfirmScenarios,
  now,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('interactiveTemper({ cwd })가 필요합니다');

  const inputs = loadTemperInputs(cwd);
  const adapterIsDeterministic = !!(adapter && DETERMINISTIC_ADAPTER_NAMES.has(adapter.name));

  // 어댑터 미구현 시 안내 한 줄(ADR 0037 결정 4). 검토 화면 헤더에서도 같은 결로 안내.
  if (!adapter || typeof adapter.fillTestCode !== 'function' || !inputs.architecture) {
    log(
      '이번 흐름은 test_code 자동 채움 없이 진행됩니다(어댑터가 test_code 채움을 지원하지 않음).',
    );
  }

  // build → confirm 루프. 사용자 의지로 무한 루프 가능(차단 자리 없음, 동행 톤).
  while (true) {
    const { scenarios, scenarioCount, testCodeFilled } = await buildScenarios({
      contracts: inputs.contracts,
      architecture: inputs.architecture,
      blockMap: inputs.blockMap,
      adapter,
    });
    const blockCount = scenarios.length;

    const decision = await confirmScenarios({
      scenarios,
      blockCount,
      scenarioCount,
      adapter,
      testCodeFilled,
      adapterIsDeterministic,
      log,
    });

    if (decision === 'proceed') {
      const doc = buildScenariosDoc({
        contractsDoc: inputs.contractsDoc,
        scenarios,
        now,
      });
      writeScenariosAndAdvance({ paths: inputs.paths, state: inputs.state, doc });

      // 외부 AI 검토 프롬프트 부산물(ADR 0038 결정 1). 사용자가 외부 AI에 붙여넣어 자세히 검토받는 자리.
      mkdirSync(inputs.paths.promptsDir, { recursive: true });
      writeFileSync(
        inputs.paths.scenariosReviewPromptFile,
        buildScenariosReviewPromptMarkdown({
          answers: inputs.answers,
          catalog: inputs.catalog,
          selectedBlocks: inputs.selectedBlocks,
          architecture: inputs.architecture,
          contracts: inputs.contracts,
          scenarios,
        }),
        'utf8',
      );

      return {
        scenariosFile: inputs.paths.scenariosFile,
        scenariosReviewPromptFile: inputs.paths.scenariosReviewPromptFile,
        scenarios,
        blockCount,
        scenarioCount,
        testCodeFilled,
        nextStage: NEXT_STAGE,
      };
    }
    log('알겠어요. 다시 만들어볼게요.');
  }
}
