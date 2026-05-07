// beoreum shape import-review. ADR 0053의 외부 검토 응답 import 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 응답 마크다운 파일을 읽어
// "## 제안된 변경 사항" 섹션의 ```yaml changes를 파싱하고 인터랙티브 picker로 자리마다 적용한다.
// state는 안 건드리고 architecture.yml만 다듬는다.
// forge-import.js의 결을 따라간다(같은 picker 패턴, ADR 0045).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { parseReviewResponse, validateShapeChange } from './review-response-parser.js';
import { getValidArchitectureValues } from './shape.js';
import {
  readResponseFile,
  runValidationLoop,
  runChangePicker,
  logGracefulDegrade,
  logSummary,
  batchPickerSelect,
} from './import-helpers.js';

function ensureFile(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${path}이(가) 없습니다. ${hint}`);
  }
}

function loadYaml(path) {
  return yaml.load(readFileSync(path, 'utf8')) || {};
}

// 변경 객체와 architecture.yml을 받아 적용 가능한지 본다.
// 반환: { ok: true, oldValue } 또는 { ok: false, reason }
function locateChange(change, architecture) {
  const validValues = getValidArchitectureValues(change.target_key);
  if (!validValues.includes(change.new_value)) {
    return {
      ok: false,
      reason: `${change.target_key}의 값으로 "${change.new_value}"는 ADR 0012 표준 옵션이 아니에요(허용: ${validValues.join(', ')})`,
    };
  }
  const oldValue = architecture[change.target_key];
  if (oldValue === change.new_value) {
    return {
      ok: false,
      reason: `${change.target_key}는 이미 ${change.new_value}로 박혀있어요`,
    };
  }
  return { ok: true, oldValue };
}

// 한 변경을 architecture.yml에 적용(in-place mutation).
function applyChange(change, architecture) {
  architecture[change.target_key] = change.new_value;
}

// 한 변경을 사용자에게 한 줄로 풀어쓴다.
function describeChange(change, oldValue) {
  const before = oldValue !== undefined ? `${oldValue} → ` : '';
  return `${change.target_key}: ${before}${change.new_value}`;
}

// 기본 confirmChange. forge-import의 결과 같음. helper picker는 { change, located } 결로 호출.
async function defaultConfirmChange({ change, located, index, total, log = console.log } = {}) {
  const oldValue = located && located.oldValue;
  return batchPickerSelect({
    description: `[${index + 1}/${total}] ${describeChange(change, oldValue)}`,
    reason: change.reason,
    log,
  });
}

// applyShapeReview는 shape import-review의 본체.
// 외부 AI 응답 파일을 읽고 architecture.yml에 인터랙티브 picker로 변경을 반영한다.
//
// 입력:
//   cwd            - 프로젝트 루트 절대 경로
//   responsePath   - 외부 AI 응답 마크다운 파일 경로
//   confirmChange  - async ({ change, oldValue, index, total, log }) => decision (선택)
//   log            - 콘솔 출력 함수(선택)
//
// 반환: {
//   architectureFile, responseFile,
//   hasStructuredSection, parseError,
//   proposedCount, invalidCount, appliedCount, skippedCount, stopped,
//   warnings,
// }
export async function applyShapeReview({
  cwd,
  responsePath,
  confirmChange = defaultConfirmChange,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('applyShapeReview({ cwd })가 필요합니다');
  if (!responsePath) {
    throw new Error(
      'applyShapeReview({ responsePath })가 필요합니다. 외부 AI 응답 파일 경로를 적어주세요',
    );
  }

  const beoreumDir = join(cwd, '.beoreum');
  const architectureFile = join(beoreumDir, 'project', 'architecture.yml');

  ensureFile(architectureFile, '먼저 beoreum shape를 실행해주세요');

  // 응답 파일 읽기 (ADR 0054 helpers).
  const responseText = readResponseFile(responsePath);

  const parseResult = parseReviewResponse(responseText);
  const warnings = [];

  if (!parseResult.hasStructuredSection || parseResult.parseError) {
    logGracefulDegrade({ log, parseResult, ymlName: 'architecture.yml' });
    return {
      architectureFile,
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

  // architecture.yml 로드(in-memory copy).
  const architecture = loadYaml(architectureFile);

  // 형식 + 위치 검증 (ADR 0054 helpers).
  const { validItems, invalidNotes } = runValidationLoop({
    proposed: parseResult.changes,
    validate: validateShapeChange,
    locate: (change) => locateChange(change, architecture),
    describe: (change) => `${change.target_key} → ${change.new_value}`,
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
    log('적용할 변경이 없어요. architecture.yml은 그대로 둡니다.');
    return {
      architectureFile,
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
    applyOne: ({ change }) => applyChange(change, architecture),
    confirmChange,
    log,
  });

  // 변경이 한 번이라도 적용됐으면 architecture.yml 갱신.
  if (appliedCount > 0) {
    writeFileSync(architectureFile, yaml.dump(architecture, { sortKeys: false }), 'utf8');
  }

  logSummary({ log, appliedCount, skippedCount, stopped, total: validItems.length });
  if (appliedCount > 0) {
    log(`architecture.yml이 갱신되었습니다: ${architectureFile}`);
  }

  return {
    architectureFile,
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
