// byeorim temper import-review. ADR 0040의 외부 검토 응답 import 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 응답 마크다운 파일을 읽어
// "## 제안된 변경 사항" 섹션의 ```yaml changes를 파싱하고 인터랙티브 picker로 자리마다 적용한다.
// state는 안 건드리고 temper-scenarios.yml만 다듬는다(ADR 0040 결정 7).
// 응답 형식이 어긋날 때는 graceful degrade(ADR 0040 결정 6).
// forge-import.js와 결이 평행. 4종 kind만 다르다(temper의 시나리오 자리).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { parseReviewResponse, validateTemperChange } from './review-response-parser.js';
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

// 변경 객체와 scenarios(블럭별 시나리오 묶음 배열)를 받아 적용 가능한지 본다.
// 반환: { ok: true, scenarioBlock, endpoint, scenarioIndex } 또는 { ok: false, reason }
function locateChange(change, scenarios) {
  const scenarioBlock = scenarios.find((b) => b && b.block_id === change.block_id);
  if (!scenarioBlock) {
    return {
      ok: false,
      reason: `block_id "${change.block_id}"를 test-scenarios에서 못 찾았어요`,
    };
  }
  if (scenarioBlock.api_style === 'internal') {
    return {
      ok: false,
      reason: `${change.block_id}는 internal 블럭이라 시나리오 자리가 없어요`,
    };
  }
  if (!Array.isArray(scenarioBlock.endpoints)) {
    return { ok: false, reason: `${change.block_id}의 endpoints가 배열이 아니에요` };
  }
  const tgt = change.target_endpoint;
  const endpoint = scenarioBlock.endpoints.find(
    (ep) => ep.method === tgt.method && ep.path === tgt.path,
  );
  if (!endpoint) {
    return {
      ok: false,
      reason: `${tgt.method} ${tgt.path}를 ${change.block_id}에서 못 찾았어요`,
    };
  }
  if (!Array.isArray(endpoint.scenarios)) endpoint.scenarios = [];

  if (change.kind === 'scenario_add') {
    const dup = endpoint.scenarios.findIndex((s) => s.kind === change.new_scenario.kind);
    if (dup >= 0) {
      return {
        ok: false,
        reason: `${change.new_scenario.kind} 시나리오가 이미 있어요`,
      };
    }
    return { ok: true, scenarioBlock, endpoint, scenarioIndex: -1 };
  }

  // 그 외 kind는 target_scenario_kind를 찾는다.
  const idx = endpoint.scenarios.findIndex((s) => s.kind === change.target_scenario_kind);
  if (idx < 0) {
    return {
      ok: false,
      reason: `${change.target_scenario_kind} 시나리오를 ${tgt.method} ${tgt.path}에서 못 찾았어요`,
    };
  }
  return { ok: true, scenarioBlock, endpoint, scenarioIndex: idx };
}

// 한 변경을 시나리오 묶음에 적용한다(in-place mutation).
function applyChange(change, located) {
  const { endpoint, scenarioIndex } = located;
  switch (change.kind) {
    case 'scenario_add': {
      const ns = change.new_scenario;
      endpoint.scenarios.push({
        kind: ns.kind,
        given: typeof ns.given === 'string' ? ns.given : TODO,
        when: typeof ns.when === 'string' ? ns.when : TODO,
        then: typeof ns.then === 'string' ? ns.then : TODO,
        test_code: typeof ns.test_code === 'string' ? ns.test_code : TODO,
      });
      return;
    }
    case 'scenario_remove': {
      endpoint.scenarios.splice(scenarioIndex, 1);
      return;
    }
    case 'gwt_modify': {
      const target = endpoint.scenarios[scenarioIndex];
      const v = change.new_value;
      if (typeof v.given === 'string') target.given = v.given;
      if (typeof v.when === 'string') target.when = v.when;
      if (typeof v.then === 'string') target.then = v.then;
      return;
    }
    case 'test_code_modify': {
      endpoint.scenarios[scenarioIndex].test_code = change.new_value;
      return;
    }
    default:
      throw new Error(`알 수 없는 kind: ${change.kind}`);
  }
}

// 한 변경을 사용자에게 보여줄 한국어 요약을 만든다.
function describeChange(change) {
  const blockId = change.block_id;
  const ep = change.target_endpoint || {};
  const epStr = `${ep.method} ${ep.path}`;
  switch (change.kind) {
    case 'scenario_add': {
      const ns = change.new_scenario || {};
      return `${blockId} ${epStr}에 시나리오 추가: ${ns.kind || '?'}`;
    }
    case 'scenario_remove':
      return `${blockId} ${epStr}의 시나리오 삭제: ${change.target_scenario_kind}`;
    case 'gwt_modify':
      return `${blockId} ${epStr}의 GWT 수정: ${change.target_scenario_kind}`;
    case 'test_code_modify':
      return `${blockId} ${epStr}의 test_code 수정: ${change.target_scenario_kind}`;
    default:
      return `${blockId} ${epStr}의 알 수 없는 변경(${change.kind})`;
  }
}

// new_value를 사용자에게 보여줄 한국어 텍스트로 만든다.
function describeNewValue(change) {
  if (change.kind === 'scenario_add') {
    const ns = change.new_scenario || {};
    const lines = [];
    if (ns.given) lines.push(`  given: ${ns.given}`);
    if (ns.when) lines.push(`  when: ${ns.when}`);
    if (ns.then) lines.push(`  then: ${ns.then}`);
    if (typeof ns.test_code === 'string' && ns.test_code !== '' && ns.test_code !== 'TODO') {
      lines.push('  test_code: (코드 박힘)');
    }
    return lines.join('\n');
  }
  if (change.kind === 'gwt_modify') {
    const v = change.new_value || {};
    const lines = [];
    if (typeof v.given === 'string') lines.push(`  given: ${v.given}`);
    if (typeof v.when === 'string') lines.push(`  when: ${v.when}`);
    if (typeof v.then === 'string') lines.push(`  then: ${v.then}`);
    return lines.join('\n');
  }
  if (change.kind === 'test_code_modify') {
    const code = String(change.new_value || '').trim();
    if (code.length === 0) return '  새 값: (빈 자리)';
    const firstLine = code.split('\n')[0];
    return `  새 test_code 첫 줄: ${firstLine}`;
  }
  return '';
}

// 기본 confirmChange. 사용자에게 한 변경을 보여주고 select로 결정 묻는다.
// scenario_add는 multi-line 새 값이 있어 batchPickerSelect 호출 전 사전 출력(forge와 같은 결).
async function defaultConfirmChange({ change, index, total, log = console.log } = {}) {
  log('');
  log(`[${index + 1}/${total}] ${describeChange(change)}`);
  const value = describeNewValue(change);
  if (value) {
    for (const line of value.split('\n')) {
      log(line);
    }
  }
  return batchPickerSelect({ description: null, reason: change.reason, log });
}

// applyTemperReview는 temper import-review의 본체.
// 외부 AI 응답 파일을 읽고 temper-scenarios.yml에 인터랙티브 picker로 변경을 반영한다.
//
// 입력:
//   cwd            - 프로젝트 루트 절대 경로
//   responsePath   - 외부 AI 응답 마크다운 파일 경로(절대 또는 상대)
//   confirmChange  - async ({ change, index, total, log }) => 'apply'|'skip'|'stop' (선택)
//   log            - 콘솔 출력 함수(선택)
//
// 반환:
//   {
//     scenariosFile, responseFile,
//     hasStructuredSection: boolean,
//     parseError: string | null,
//     proposedCount, invalidCount, appliedCount, skippedCount, stopped: boolean,
//     warnings: string[]
//   }
export async function applyTemperReview({
  cwd,
  responsePath,
  confirmChange = defaultConfirmChange,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('applyTemperReview({ cwd })가 필요합니다');
  if (!responsePath) {
    throw new Error(
      'applyTemperReview({ responsePath })가 필요합니다. 외부 AI 응답 파일 경로를 적어주세요',
    );
  }

  const byeorimDir = join(cwd, '.byeorim');
  const scenariosFile = join(byeorimDir, 'project', 'temper-scenarios.yml');

  ensureFile(scenariosFile, '먼저 byeorim temper를 실행해주세요');

  // 응답 파일 읽기 (ADR 0054 helpers).
  const responseText = readResponseFile(responsePath);

  // 파싱(graceful, ADR 0040 결정 6)
  const parseResult = parseReviewResponse(responseText);
  const warnings = [];

  if (!parseResult.hasStructuredSection || parseResult.parseError) {
    logGracefulDegrade({ log, parseResult, ymlName: 'temper-scenarios.yml' });
    return {
      scenariosFile,
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

  // temper-scenarios.yml 로드
  const scenariosDoc = yaml.load(readFileSync(scenariosFile, 'utf8')) || {};
  const scenarios = Array.isArray(scenariosDoc.scenarios) ? scenariosDoc.scenarios : [];

  // 형식 + 위치 검증 (ADR 0054 helpers).
  const { validItems, invalidNotes } = runValidationLoop({
    proposed: parseResult.changes,
    validate: validateTemperChange,
    locate: (change) => locateChange(change, scenarios),
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
    log('적용할 변경이 없어요. temper-scenarios.yml은 그대로 둡니다.');
    return {
      scenariosFile,
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

  // 변경이 한 번이라도 적용됐으면 temper-scenarios.yml 갱신
  if (appliedCount > 0) {
    scenariosDoc.scenarios = scenarios;
    writeFileSync(scenariosFile, yaml.dump(scenariosDoc, { sortKeys: false }), 'utf8');
  }

  logSummary({ log, appliedCount, skippedCount, stopped, total: validItems.length });
  if (appliedCount > 0) {
    log(`temper-scenarios.yml을 갱신했어요: ${scenariosFile}`);
  } else {
    log('적용된 변경이 없어 temper-scenarios.yml은 그대로 둡니다.');
  }

  return {
    scenariosFile,
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
