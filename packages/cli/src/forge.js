// beoreum forge. architecture.yml + selected-blocks.yml + catalog.yml을 입력으로
// contracts.yml(API 계약)을 만든다. ADR 0007의 자리, ADR 0013의 형식과 매핑 정책을 따른다.
// 사용자 입력이 없는 변환 단계라 인터랙티브 picker가 없다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { loadCatalog } from '@beoreum/catalog';

const SCHEMA_VERSION = 1;
const STAGE = 'forge';
const NEXT_STAGE = 'temper';

// MVP forge가 받는 architecture.api_style. ADR 0013 결정 1.
const SUPPORTED_ARCH_API_STYLES = new Set(['rest']);

// block.api_style의 default. ADR 0013 결정 3(api_style이 없으면 resource로 본다).
const DEFAULT_BLOCK_API_STYLE = 'resource';

const TODO = 'TODO';

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

// block ID에서 path 세그먼트를 만든다. 언더스코어를 하이픈으로 바꿔 REST 관례를 따른다(ADR 0013 결정 3).
function pathFromBlockId(blockId) {
  return `/${blockId.replace(/_/g, '-')}`;
}

// resource 블럭의 5개 CRUD endpoint를 만든다. ADR 0013 결정 3 매핑 표.
function buildResourceEndpoints(block) {
  const path = pathFromBlockId(block.id);
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
      path: pathFromBlockId(block.id),
      description: `${block.name} 검색`,
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

// runForge는 forge 단계의 본체. 입력 파일을 읽어 contracts.yml을 만든다.
//
// 입력:
//   cwd      - 프로젝트 루트 절대 경로
//   adapter  - AI 어댑터(옵셔널). 주어지면 각 endpoint의 schema를 extractSchema로 채움.
//              없으면 모든 schema가 TODO 문자열로 남는다(기존 동작 유지).
//   now      - 테스트용 결정적 시각(선택)
//
// 반환: { contractsFile, contracts, blockCount, endpointCount, schemaFilled, nextStage }
export async function runForge({ cwd, adapter = null, now } = {}) {
  if (!cwd) throw new Error('runForge({ cwd })가 필요합니다');

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');
  const archFile = join(beoreumDir, 'project', 'architecture.yml');
  const selectedFile = join(beoreumDir, 'project', 'selected-blocks.yml');
  const catalogFile = join(beoreumDir, 'project', 'catalog', 'catalog.yml');
  const contractsFile = join(beoreumDir, 'project', 'contracts.yml');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  ensureFile(archFile, '먼저 beoreum shape를 실행해주세요');
  ensureFile(selectedFile, '먼저 beoreum smelt를 실행해주세요');
  ensureFile(catalogFile, '먼저 beoreum prospect를 실행해주세요');

  const arch = yaml.load(readFileSync(archFile, 'utf8')) || {};
  const archApiStyle = arch.api_style;
  if (!SUPPORTED_ARCH_API_STYLES.has(archApiStyle)) {
    throw new Error(
      `architecture.yml의 api_style이 "${archApiStyle}"입니다. 지금 출시의 forge는 REST만 지원합니다.\n` +
        `shape를 다시 돌려 api_style을 rest로 바꾸거나, 다음 출시를 기다려주세요`,
    );
  }

  const selected = yaml.load(readFileSync(selectedFile, 'utf8')) || {};
  const builtIds = [...(selected.selected || []), ...(selected.auto_added || [])];

  const catalog = loadCatalog(catalogFile);
  const blockMap = new Map(catalog.blocks.map((b) => [b.id, b]));

  // ADR 0013 결정 5: selected를 먼저, auto_added를 그 다음 순서로
  const contracts = builtIds
    .map((id) => blockMap.get(id))
    .filter(Boolean)
    .map((block) => buildBlockContract(block));

  // adapter가 주어지면 schema TODO를 실제 schema로 채운다(ADR 0023).
  let schemaFilled = false;
  if (adapter && typeof adapter.extractSchema === 'function') {
    await fillSchemasWithAdapter(contracts, blockMap, adapter);
    schemaFilled = true;
  }

  const doc = {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    architecture_api_style: archApiStyle,
    contracts,
  };

  writeFileSync(contractsFile, yaml.dump(doc, { sortKeys: false }), 'utf8');
  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  const endpointCount = contracts.reduce(
    (sum, c) => sum + (Array.isArray(c.endpoints) ? c.endpoints.length : 0),
    0,
  );

  return {
    contractsFile,
    contracts,
    blockCount: contracts.length,
    endpointCount,
    schemaFilled,
    nextStage: NEXT_STAGE,
  };
}
