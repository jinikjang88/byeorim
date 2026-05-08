// byeorim forge. architecture.yml + selected-blocks.yml + catalog.yml을 입력으로
// contracts.yml(API 계약)을 만든다. ADR 0007의 자리, ADR 0013의 형식과 매핑 정책을 따른다.
// ADR 0023의 옵셔널 어댑터로 schema를 채운다.
// ADR 0034의 인터랙티브 검토 흐름을 interactiveForge로 박는다.
// ADR 0035의 외부 검토 프롬프트 부산물(contracts-review-prompt.md)을 자동 생성한다.
// ADR 0041로 path 결을 복수형 default로 갱신(pluralize 라이브러리, 마지막 단어 복수화).
// ADR 0042로 block.path 옵셔널 override를 추가(카탈로그 작성자가 정밀 조정 가능).
// ADR 0044로 'singleton' api_style 추가(/me, /account 같은 한 자리 자원, GET/PATCH/DELETE).
// runForge는 비대화 호환 자리로 그대로 유지(테스트와 자동화에서 사용).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import pluralize from 'pluralize';
import { select } from '@inquirer/prompts';
import { loadCatalog } from '@byeorim/catalog';
import { formatContractsSummary } from './forge-picker-helpers.js';
import { buildContractsReviewPromptMarkdown } from './forge-prompt.js';

const SCHEMA_VERSION = 1;
const STAGE = 'forge';
const NEXT_STAGE = 'temper';

// MVP forge가 받는 architecture.api_style. ADR 0013 결정 1.
const SUPPORTED_ARCH_API_STYLES = new Set(['rest']);

// block.api_style의 default. ADR 0013 결정 3(api_style이 없으면 resource로 본다).
const DEFAULT_BLOCK_API_STYLE = 'resource';

// 결정적 어댑터의 이름 집합. ADR 0034 결정 3의 안내 문구 표시 자리에서 사용.
// mock 어댑터는 같은 입력에 같은 출력이라 redo가 같은 결과를 만든다.
const DETERMINISTIC_ADAPTER_NAMES = new Set(['mock']);

const TODO = 'TODO';

function ensureFile(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${path}이(가) 없습니다. ${hint}`);
  }
}

function loadState(stateFile) {
  ensureFile(stateFile, '먼저 byeorim init을 실행해주세요');
  return yaml.load(readFileSync(stateFile, 'utf8'));
}

function ensureStage(state, expected) {
  if (state.current_stage !== expected) {
    throw new Error(
      `현재 단계가 ${expected}가 아닙니다(현재: ${state.current_stage}). 단계 순서대로 진행해주세요`,
    );
  }
}

// ASCII 영문 segment(하이픈 분리 가능)인지 본다. 비ASCII(한국어 등)는 복수화 폴백 자리(ADR 0041 결정 3).
const ASCII_SEGMENT_REGEX = /^[a-z][a-z0-9-]*$/;

// 하이픈으로 분리된 segment의 마지막 단어를 복수화한다(ADR 0041 결정 2).
// 예: order → orders, cancel-return → cancel-returns, product-search → product-searches.
function pluralizeSegment(segment) {
  const parts = segment.split('-');
  parts[parts.length - 1] = pluralize(parts[parts.length - 1]);
  return parts.join('-');
}

// block ID에서 path 세그먼트를 만든다. 언더스코어를 하이픈으로 바꿔 REST 관례를 따른다(ADR 0013 결정 3).
// ASCII 영문이면 마지막 단어를 복수화(ADR 0041), 그 외(한국어 등)는 단수형 그대로 폴백.
function pathFromBlockId(blockId) {
  const segment = blockId.replace(/_/g, '-');
  if (!ASCII_SEGMENT_REGEX.test(segment)) {
    return `/${segment}`;
  }
  return `/${pluralizeSegment(segment)}`;
}

// 한 블럭의 base path를 결정한다(ADR 0042).
// block.path가 있으면 그대로 사용(카탈로그 작성자가 정밀 조정한 자리).
// 없으면 block.id에서 자동 복수화(ADR 0041 default).
// 단 singleton은 자동 복수화 안 함(ADR 0044 결정 4). 단수형 default.
function pathForBlock(block) {
  if (typeof block.path === 'string' && block.path.length > 0) {
    return block.path;
  }
  if (block.api_style === 'singleton') {
    return `/${block.id.replace(/_/g, '-')}`;
  }
  return pathFromBlockId(block.id);
}

// resource 블럭의 5개 CRUD endpoint를 만든다. ADR 0013 결정 3 매핑 표.
function buildResourceEndpoints(block) {
  const path = pathForBlock(block);
  const itemPath = `${path}/{id}`;
  const name = block.name;
  return [
    {
      operation: 'create',
      method: 'POST',
      path,
      description: `${name} 생성`,
      request_schema: TODO,
      response_schema: TODO,
    },
    {
      operation: 'list',
      method: 'GET',
      path,
      description: `${name} 목록 조회`,
      request_schema: TODO,
      response_schema: TODO,
    },
    {
      operation: 'get',
      method: 'GET',
      path: itemPath,
      description: `${name} 한 건 조회`,
      request_schema: TODO,
      response_schema: TODO,
    },
    {
      operation: 'update',
      method: 'PUT',
      path: itemPath,
      description: `${name} 수정`,
      request_schema: TODO,
      response_schema: TODO,
    },
    {
      operation: 'delete',
      method: 'DELETE',
      path: itemPath,
      description: `${name} 삭제`,
      request_schema: TODO,
      response_schema: TODO,
    },
  ];
}

// query 블럭의 검색 endpoint 한 개를 만든다. ADR 0013 결정 3.
function buildQueryEndpoints(block) {
  return [
    {
      operation: 'search',
      method: 'GET',
      path: pathForBlock(block),
      description: `${block.name} 검색`,
      request_schema: TODO,
      response_schema: TODO,
    },
  ];
}

// singleton 블럭의 3개 endpoint(GET/PATCH/DELETE)를 만든다. ADR 0044 결정 2.
// path는 단수형(/me 같은 자리). {id} 자리 없음.
function buildSingletonEndpoints(block) {
  const path = pathForBlock(block);
  const name = block.name;
  return [
    {
      operation: 'get',
      method: 'GET',
      path,
      description: `${name} 조회`,
      request_schema: TODO,
      response_schema: TODO,
    },
    {
      operation: 'update',
      method: 'PATCH',
      path,
      description: `${name} 수정`,
      request_schema: TODO,
      response_schema: TODO,
    },
    {
      operation: 'delete',
      method: 'DELETE',
      path,
      description: `${name} 삭제`,
      request_schema: TODO,
      response_schema: TODO,
    },
  ];
}

// 한 블럭의 contract 객체를 만든다. internal은 endpoints 없이 internal: true 표시.
function buildBlockContract(block) {
  const apiStyle = block.api_style || DEFAULT_BLOCK_API_STYLE;
  const base = {
    block_id: block.id,
    name: block.name,
    api_style: apiStyle,
  };
  if (apiStyle === 'internal') {
    return { ...base, endpoints: [], internal: true };
  }
  if (apiStyle === 'query') {
    return { ...base, endpoints: buildQueryEndpoints(block) };
  }
  if (apiStyle === 'singleton') {
    return { ...base, endpoints: buildSingletonEndpoints(block) };
  }
  // resource (default)
  return { ...base, endpoints: buildResourceEndpoints(block) };
}

function advanceState(state, stage) {
  const completed = Array.isArray(state.completed_stages) ? state.completed_stages : [];
  return {
    ...state,
    current_stage: NEXT_STAGE,
    completed_stages: completed.includes(stage) ? completed : [...completed, stage],
  };
}

// adapter가 주어지면 각 endpoint의 schema TODO를 실제 schema로 채운다(ADR 0023).
async function fillSchemasWithAdapter(contracts, blockMap, adapter) {
  for (const contract of contracts) {
    if (!Array.isArray(contract.endpoints) || contract.endpoints.length === 0) continue;
    const block = blockMap.get(contract.block_id);
    if (!block) continue;
    for (const endpoint of contract.endpoints) {
      const filled = await adapter.extractSchema({ block, operation: endpoint.operation });
      if (filled.request !== undefined) {
        endpoint.request_schema = filled.request === null ? null : filled.request;
      }
      if (filled.response !== undefined) {
        endpoint.response_schema = filled.response === null ? null : filled.response;
      }
    }
  }
}

// forge의 입력 자리들을 한 번에 읽고 검증한다. ADR 0013의 입력 의존성과 단계 검증을 한 자리에 모은다.
// intent.yml과 architecture.yml은 contracts.yml 작성에는 직접 안 쓰이지만 외부 검토 프롬프트(ADR 0035)에 함께 담는다.
// 반환: { architecture, archApiStyle, answers, selectedBlocks, builtIds, catalog, blockMap, state, paths }
function loadForgeInputs(cwd) {
  const byeorimDir = join(cwd, '.byeorim');
  const stateFile = join(byeorimDir, 'state.yml');
  const intentFile = join(byeorimDir, 'project', 'intent.yml');
  const archFile = join(byeorimDir, 'project', 'architecture.yml');
  const selectedFile = join(byeorimDir, 'project', 'selected-blocks.yml');
  const catalogFile = join(byeorimDir, 'project', 'catalog', 'catalog.yml');
  const contractsFile = join(byeorimDir, 'project', 'contracts.yml');
  const promptsDir = join(byeorimDir, 'project', 'prompts');
  const contractsReviewPromptFile = join(promptsDir, 'contracts-review-prompt.md');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  ensureFile(archFile, '먼저 byeorim shape를 실행해주세요');
  ensureFile(selectedFile, '먼저 byeorim smelt를 실행해주세요');
  ensureFile(catalogFile, '먼저 byeorim prospect를 실행해주세요');

  const architecture = yaml.load(readFileSync(archFile, 'utf8')) || {};
  const archApiStyle = architecture.api_style;
  if (!SUPPORTED_ARCH_API_STYLES.has(archApiStyle)) {
    throw new Error(
      `architecture.yml의 api_style이 "${archApiStyle}"입니다. 지금 출시의 forge는 REST만 지원합니다.\n` +
        `shape를 다시 돌려 api_style을 rest로 바꾸거나, 다음 출시를 기다려주세요`,
    );
  }

  const selectedBlocks = yaml.load(readFileSync(selectedFile, 'utf8')) || {};
  // ADR 0013 결정 5: selected를 먼저, auto_added를 그 다음 순서로
  const builtIds = [...(selectedBlocks.selected || []), ...(selectedBlocks.auto_added || [])];

  const catalog = loadCatalog(catalogFile);
  const blockMap = new Map(catalog.blocks.map((b) => [b.id, b]));

  // intent.yml은 부산물(외부 검토 프롬프트)에만 쓰인다. 없거나 user_answers가 비어있으면 빈 객체로 폴백.
  let answers = {};
  if (existsSync(intentFile)) {
    const intent = yaml.load(readFileSync(intentFile, 'utf8')) || {};
    answers =
      intent.user_answers && typeof intent.user_answers === 'object' ? intent.user_answers : {};
  }

  return {
    architecture,
    archApiStyle,
    answers,
    selectedBlocks,
    builtIds,
    catalog,
    blockMap,
    state,
    paths: { stateFile, contractsFile, promptsDir, contractsReviewPromptFile },
  };
}

// contracts 배열을 만든다(adapter가 있으면 schema 채움까지). 디스크에는 안 쓴다.
// 반환: { contracts, schemaFilled }
async function buildContracts({ builtIds, blockMap, adapter }) {
  const contracts = builtIds
    .map((id) => blockMap.get(id))
    .filter(Boolean)
    .map((block) => buildBlockContract(block));

  let schemaFilled = false;
  if (adapter && typeof adapter.extractSchema === 'function') {
    await fillSchemasWithAdapter(contracts, blockMap, adapter);
    schemaFilled = true;
  }
  return { contracts, schemaFilled };
}

function buildContractsDoc({ archApiStyle, contracts, now }) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    architecture_api_style: archApiStyle,
    contracts,
  };
}

function writeContractsAndAdvance({ paths, state, doc }) {
  writeFileSync(paths.contractsFile, yaml.dump(doc, { sortKeys: false }), 'utf8');
  writeFileSync(
    paths.stateFile,
    yaml.dump(advanceState(state, STAGE), { sortKeys: false }),
    'utf8',
  );
}

function countEndpoints(contracts) {
  return contracts.reduce(
    (sum, c) => sum + (Array.isArray(c.endpoints) ? c.endpoints.length : 0),
    0,
  );
}

// runForge는 forge 단계의 비대화 본체. 입력 파일을 읽어 contracts.yml을 만든다.
// 후행 호환을 위해 시그니처와 동작을 ADR 0023 시점 그대로 유지한다(ADR 0034 결정 4).
//
// 입력:
//   cwd      - 프로젝트 루트 절대 경로
//   adapter  - AI 어댑터(옵셔널). 주어지면 각 endpoint의 schema를 extractSchema로 채움.
//              없으면 모든 schema가 TODO 문자열로 남는다.
//   now      - 테스트용 결정적 시각(선택)
//
// 반환: { contractsFile, contracts, blockCount, endpointCount, schemaFilled, nextStage }
export async function runForge({ cwd, adapter = null, now } = {}) {
  if (!cwd) throw new Error('runForge({ cwd })가 필요합니다');

  const inputs = loadForgeInputs(cwd);
  const { contracts, schemaFilled } = await buildContracts({
    builtIds: inputs.builtIds,
    blockMap: inputs.blockMap,
    adapter,
  });
  const doc = buildContractsDoc({
    archApiStyle: inputs.archApiStyle,
    contracts,
    now,
  });
  writeContractsAndAdvance({ paths: inputs.paths, state: inputs.state, doc });

  return {
    contractsFile: inputs.paths.contractsFile,
    contracts,
    blockCount: contracts.length,
    endpointCount: countEndpoints(contracts),
    schemaFilled,
    nextStage: NEXT_STAGE,
  };
}

// 기본 confirmContracts. 검토 화면을 보여주고 진행/다시 select(ADR 0034 결정 1, 3).
async function defaultConfirmContracts({
  contracts,
  blockCount,
  endpointCount,
  adapter,
  schemaFilled,
  adapterIsDeterministic,
  log = console.log,
} = {}) {
  log('');
  log(
    formatContractsSummary({
      contracts,
      blockCount,
      endpointCount,
      adapter,
      schemaFilled,
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

// interactiveForge는 forge 단계의 인터랙티브 본체(ADR 0034).
// build → confirm 루프. confirm이 'redo'면 build를 다시(adapter 재호출 포함).
// confirmContracts는 의존성 주입(ADR 0011 결정 5).
//
// 입력:
//   cwd              - 프로젝트 루트 절대 경로
//   adapter          - AiAdapter(선택). schema 채움 자리
//   confirmContracts - async ({ contracts, blockCount, endpointCount, adapter, schemaFilled, adapterIsDeterministic, log })
//                      => 'proceed'|'redo'. 기본은 select
//   now              - 테스트용 결정적 시각(선택)
//   log              - 콘솔 출력 함수(선택)
//
// 반환: { contractsFile, contractsReviewPromptFile, contracts, blockCount, endpointCount, schemaFilled, nextStage }
// runForge와 비교해 contractsReviewPromptFile이 추가된다(ADR 0035 부산물 자리).
export async function interactiveForge({
  cwd,
  adapter = null,
  confirmContracts = defaultConfirmContracts,
  now,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('interactiveForge({ cwd })가 필요합니다');

  const inputs = loadForgeInputs(cwd);
  const adapterIsDeterministic = !!(adapter && DETERMINISTIC_ADAPTER_NAMES.has(adapter.name));

  // 어댑터 미구현 시 안내 한 줄(ADR 0034 결정 4). 검토 화면 헤더에서도 같은 결로 안내.
  if (!adapter || typeof adapter.extractSchema !== 'function') {
    log('이번 흐름은 schema 자동 채움 없이 진행됩니다(어댑터가 schema 채움을 지원하지 않음).');
  }

  // build → confirm 루프. 사용자 의지로 무한 루프 가능(차단 자리 없음, 동행 톤).
  while (true) {
    const { contracts, schemaFilled } = await buildContracts({
      builtIds: inputs.builtIds,
      blockMap: inputs.blockMap,
      adapter,
    });
    const blockCount = contracts.length;
    const endpointCount = countEndpoints(contracts);

    const decision = await confirmContracts({
      contracts,
      blockCount,
      endpointCount,
      adapter,
      schemaFilled,
      adapterIsDeterministic,
      log,
    });

    if (decision === 'proceed') {
      const doc = buildContractsDoc({
        archApiStyle: inputs.archApiStyle,
        contracts,
        now,
      });
      writeContractsAndAdvance({ paths: inputs.paths, state: inputs.state, doc });

      // 외부 AI 검토 프롬프트 부산물(ADR 0035 결정 1). 사용자가 외부 AI에 붙여넣어 자세히 검토받는 자리.
      mkdirSync(inputs.paths.promptsDir, { recursive: true });
      writeFileSync(
        inputs.paths.contractsReviewPromptFile,
        buildContractsReviewPromptMarkdown({
          answers: inputs.answers,
          catalog: inputs.catalog,
          selectedBlocks: inputs.selectedBlocks,
          architecture: inputs.architecture,
          contracts,
        }),
        'utf8',
      );

      return {
        contractsFile: inputs.paths.contractsFile,
        contractsReviewPromptFile: inputs.paths.contractsReviewPromptFile,
        contracts,
        blockCount,
        endpointCount,
        schemaFilled,
        nextStage: NEXT_STAGE,
      };
    }
    log('알겠어요. 다시 만들어볼게요.');
  }
}
