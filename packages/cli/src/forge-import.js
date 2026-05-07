// beoreum forge import-review. ADR 0039의 외부 검토 응답 import 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 응답 마크다운 파일을 읽어
// "## 제안된 변경 사항" 섹션의 ```yaml changes를 파싱하고 인터랙티브 picker로 자리마다 적용한다.
// state는 안 건드리고 contracts.yml만 다듬는다(ADR 0039 결정 7).
// 응답 형식이 어긋날 때는 graceful degrade(ADR 0039 결정 6).
// ADR 0054: import-helpers.js의 공통 결을 사용한다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { parseReviewResponse, validateForgeChange } from './review-response-parser.js';
import {
  readResponseFile,
  runValidationLoop,
  runChangePicker,
  logGracefulDegrade,
  logSummary,
  batchPickerSelect,
} from './import-helpers.js';

const TODO = 'TODO';

function ensureFile(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${path}이(가) 없습니다. ${hint}`);
  }
}

// 변경 객체와 contracts(블럭별 contract 배열)를 받아 적용 가능한지 본다.
// 적용 가능 자리에서는 어떤 contract와 어떤 endpoint를 건드릴지 미리 본다.
// 반환: { ok: true, contract, endpointIndex } 또는 { ok: false, reason }
function locateChange(change, contracts) {
  const contract = contracts.find((c) => c && c.block_id === change.block_id);
  if (!contract) {
    return { ok: false, reason: `block_id "${change.block_id}"를 contracts에서 못 찾았어요` };
  }
  if (contract.internal === true) {
    return {
      ok: false,
      reason: `${change.block_id}는 internal 블럭이라 endpoint 자리가 없어요`,
    };
  }
  if (!Array.isArray(contract.endpoints)) {
    return { ok: false, reason: `${change.block_id}의 endpoints가 배열이 아니에요` };
  }

  if (change.kind === 'endpoint_add') {
    const dup = contract.endpoints.findIndex(
      (ep) => ep.method === change.new_endpoint.method && ep.path === change.new_endpoint.path,
    );
    if (dup >= 0) {
      return {
        ok: false,
        reason: `${change.new_endpoint.method} ${change.new_endpoint.path}는 이미 있어요`,
      };
    }
    return { ok: true, contract, endpointIndex: -1 };
  }

  // 그 외 kind는 target_endpoint를 찾는다.
  const tgt = change.target_endpoint;
  const idx = contract.endpoints.findIndex(
    (ep) => ep.method === tgt.method && ep.path === tgt.path,
  );
  if (idx < 0) {
    return {
      ok: false,
      reason: `${tgt.method} ${tgt.path}를 ${change.block_id}에서 못 찾았어요`,
    };
  }
  return { ok: true, contract, endpointIndex: idx };
}

// 한 변경을 contract에 적용한다(in-place mutation).
function applyChange(change, located) {
  const { contract, endpointIndex } = located;
  switch (change.kind) {
    case 'endpoint_add': {
      const ep = change.new_endpoint;
      contract.endpoints.push({
        operation: ep.operation || 'unknown',
        method: ep.method,
        path: ep.path,
        description: ep.description || '',
        request_schema: TODO,
        response_schema: TODO,
      });
      return;
    }
    case 'endpoint_remove': {
      contract.endpoints.splice(endpointIndex, 1);
      return;
    }
    case 'schema_modify': {
      contract.endpoints[endpointIndex][change.target_field] = change.new_value;
      return;
    }
    case 'description_modify': {
      contract.endpoints[endpointIndex].description = change.new_value;
      return;
    }
    default:
      throw new Error(`알 수 없는 kind: ${change.kind}`);
  }
}

// 한 변경을 사용자에게 보여줄 한국어 요약을 만든다.
function describeChange(change) {
  const blockId = change.block_id;
  switch (change.kind) {
    case 'endpoint_add': {
      const ep = change.new_endpoint;
      const op = ep.operation ? ` (${ep.operation})` : '';
      return `${blockId}의 endpoint 추가: ${ep.method} ${ep.path}${op}`;
    }
    case 'endpoint_remove': {
      const ep = change.target_endpoint;
      return `${blockId}의 endpoint 삭제: ${ep.method} ${ep.path}`;
    }
    case 'schema_modify': {
      const ep = change.target_endpoint;
      return `${blockId}의 ${change.target_field} 수정: ${ep.method} ${ep.path}`;
    }
    case 'description_modify': {
      const ep = change.target_endpoint;
      return `${blockId}의 description 수정: ${ep.method} ${ep.path}`;
    }
    default:
      return `${blockId}의 알 수 없는 변경(${change.kind})`;
  }
}

// new_value(JSON Schema 객체 또는 문자열)를 사용자에게 보여줄 한국어 텍스트로 만든다.
function describeNewValue(change) {
  if (change.kind === 'description_modify') {
    return change.new_value;
  }
  if (change.kind === 'schema_modify') {
    if (change.new_value === null) return '(null)';
    if (typeof change.new_value === 'string') return change.new_value;
    return yaml.dump(change.new_value, { sortKeys: false }).trimEnd();
  }
  if (change.kind === 'endpoint_add') {
    const ep = change.new_endpoint;
    const desc = ep.description ? `\n  설명: ${ep.description}` : '';
    return `  ${ep.method} ${ep.path}  (${ep.operation || 'unknown'})${desc}`;
  }
  return '';
}

// 기본 confirmChange. 사용자에게 한 변경을 보여주고 select로 결정 묻는다.
// schema/endpoint/description 자리마다 다른 형식이라 batchPickerSelect 호출 전에 상세 정보를 미리 출력.
async function defaultConfirmChange({ change, index, total, log = console.log } = {}) {
  // forge는 변경 종류마다 표시 결이 달라 별도 사전 출력. 그 외는 batchPickerSelect의 description으로 충분.
  log('');
  log(`[${index + 1}/${total}] ${describeChange(change)}`);
  const value = describeNewValue(change);
  if (value) {
    if (change.kind === 'schema_modify') {
      log('  새 schema:');
      for (const line of value.split('\n')) {
        log(`    ${line}`);
      }
    } else if (change.kind === 'endpoint_add') {
      log(value);
    } else {
      log(`  새 값: ${value}`);
    }
  }
  // batchPickerSelect는 description 없이 호출(이미 위에서 출력했음). reason만 전달.
  return batchPickerSelect({ description: null, reason: change.reason, log });
}

// applyForgeReview는 forge import-review의 본체.
// 외부 AI 응답 파일을 읽고 contracts.yml에 인터랙티브 picker로 변경을 반영한다.
//
// 입력:
//   cwd            - 프로젝트 루트 절대 경로
//   responsePath   - 외부 AI 응답 마크다운 파일 경로(절대 또는 상대)
//   confirmChange  - async ({ change, index, total, log }) => 'apply'|'skip'|'stop' (선택)
//   log            - 콘솔 출력 함수(선택)
//
// 반환:
//   {
//     contractsFile, responseFile,
//     hasStructuredSection: boolean,
//     parseError: string | null,
//     proposedCount, invalidCount, appliedCount, skippedCount, stopped: boolean,
//     warnings: string[]   // 사용자에게 띄울 한국어 안내(예: 형식 어긋남, test-scenarios.yml 안내)
//   }
export async function applyForgeReview({
  cwd,
  responsePath,
  confirmChange = defaultConfirmChange,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('applyForgeReview({ cwd })가 필요합니다');
  if (!responsePath) {
    throw new Error(
      'applyForgeReview({ responsePath })가 필요합니다. 외부 AI 응답 파일 경로를 적어주세요',
    );
  }

  const beoreumDir = join(cwd, '.beoreum');
  const contractsFile = join(beoreumDir, 'project', 'contracts.yml');
  const scenariosFile = join(beoreumDir, 'project', 'test-scenarios.yml');

  ensureFile(contractsFile, '먼저 beoreum forge를 실행해주세요');

  // 응답 파일 읽기 (ADR 0054 helpers).
  const responseText = readResponseFile(responsePath);

  // 파싱(graceful, ADR 0039 결정 6).
  const parseResult = parseReviewResponse(responseText);
  const warnings = [];

  if (!parseResult.hasStructuredSection || parseResult.parseError) {
    logGracefulDegrade({ log, parseResult, ymlName: 'contracts.yml' });
    return {
      contractsFile,
      responseFile: responsePath,
      hasStructuredSection: parseResult.hasStructuredSection,
      parseError: parseResult.parseError,
      proposedCount: 0,
      invalidCount: 0,
      appliedCount: 0,
      skippedCount: 0,
      stopped: false,
      warnings,
    };
  }

  // contracts.yml 로드.
  const contractsDoc = yaml.load(readFileSync(contractsFile, 'utf8')) || {};
  const contracts = Array.isArray(contractsDoc.contracts) ? contractsDoc.contracts : [];

  // 형식 + 위치 검증 (ADR 0054 helpers).
  const { validItems, invalidNotes } = runValidationLoop({
    proposed: parseResult.changes,
    validate: validateForgeChange,
    locate: (change) => locateChange(change, contracts),
    describe: (change) => describeChange(change),
  });

  const proposedCount = parseResult.changes.length;
  const invalidCount = invalidNotes.length;

  log('');
  log(`응답을 읽었어요. 제안된 변경 ${proposedCount}개.`);
  if (invalidCount > 0) {
    log(`그 중 ${invalidCount}개는 형식이 맞지 않거나 자리를 못 찾아 건너뜁니다:`);
    for (const note of invalidNotes) {
      log(`  - ${note}`);
    }
  }
  if (validItems.length === 0) {
    log('적용할 변경이 없어요. contracts.yml은 그대로 둡니다.');
    return {
      contractsFile,
      responseFile: responsePath,
      hasStructuredSection: true,
      parseError: null,
      proposedCount,
      invalidCount,
      appliedCount: 0,
      skippedCount: 0,
      stopped: false,
      warnings,
    };
  }
  log(`적용 가능한 변경 ${validItems.length}개를 한 자리씩 같이 봐요.`);

  // batch picker (ADR 0045 + ADR 0054 helpers).
  const { appliedCount, skippedCount, stopped } = await runChangePicker({
    items: validItems,
    applyOne: ({ change, located }) => applyChange(change, located),
    confirmChange,
    log,
  });

  // 변경이 한 번이라도 적용됐으면 contracts.yml 갱신.
  if (appliedCount > 0) {
    contractsDoc.contracts = contracts;
    writeFileSync(contractsFile, yaml.dump(contractsDoc, { sortKeys: false }), 'utf8');
  }

  logSummary({ log, appliedCount, skippedCount, stopped, total: validItems.length });
  if (appliedCount > 0) {
    log(`contracts.yml을 갱신했어요: ${contractsFile}`);
  } else {
    log('적용된 변경이 없어 contracts.yml은 그대로 둡니다.');
  }

  // test-scenarios.yml이 있으면 안내(ADR 0039 결정 7).
  if (appliedCount > 0 && existsSync(scenariosFile)) {
    const msg =
      'test-scenarios.yml이 이미 있어요. contracts가 바뀌었으니 beoreum temper를 다시 돌리는 결을 검토해주세요.';
    warnings.push(msg);
    log('');
    log(msg);
  }

  return {
    contractsFile,
    responseFile: responsePath,
    hasStructuredSection: true,
    parseError: null,
    proposedCount,
    invalidCount,
    appliedCount,
    skippedCount,
    stopped,
    warnings,
  };
}
