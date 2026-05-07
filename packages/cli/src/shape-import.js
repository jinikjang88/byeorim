// beoreum shape import-review. ADR 0053의 외부 검토 응답 import 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 응답 마크다운 파일을 읽어
// "## 제안된 변경 사항" 섹션의 ```yaml changes를 파싱하고 인터랙티브 picker로 자리마다 적용한다.
// state는 안 건드리고 architecture.yml만 다듬는다.
// forge-import.js의 결을 따라간다(같은 picker 패턴, ADR 0045).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { select } from '@inquirer/prompts';
import { parseReviewResponse, validateShapeChange } from './review-response-parser.js';
import { getValidArchitectureValues } from './shape.js';

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

// 기본 confirmChange. forge-import의 결과 같음.
async function defaultConfirmChange({ change, oldValue, index, total, log = console.log } = {}) {
  log('');
  log(`[${index + 1}/${total}] ${describeChange(change, oldValue)}`);
  if (change.reason) {
    log(`  이유: ${change.reason}`);
  }
  log('');
  return select({
    message: '어떻게 할까요?',
    choices: [
      { name: '적용하기', value: 'apply' },
      { name: '건너뛰기', value: 'skip' },
      { name: '이번부터 모두 적용', value: 'apply_all_remaining' },
      { name: '이번부터 모두 건너뛰기', value: 'skip_all_remaining' },
      { name: '여기서 멈추기', value: 'stop' },
    ],
    default: 'apply',
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

  // 응답 파일 읽기.
  let responseText;
  try {
    responseText = readFileSync(responsePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`응답 파일을 찾지 못했어요: ${responsePath}`);
    }
    throw err;
  }

  const parseResult = parseReviewResponse(responseText);
  const warnings = [];

  if (!parseResult.hasStructuredSection || parseResult.parseError) {
    log('');
    log('응답에서 "## 제안된 변경 사항" 섹션을 못 알아봤어요.');
    if (parseResult.parseError) {
      log(`  사유: ${parseResult.parseError}`);
    }
    log('외부 AI가 자유 형식으로만 답했거나 형식이 어긋났을 수 있어요.');
    log(
      '응답을 직접 보시고 architecture.yml을 손으로 다듬으시거나, 외부 AI에 형식대로 다시 답해달라고 부탁해주세요.',
    );
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

  // 형식 + 위치 검증.
  const proposed = parseResult.changes;
  const validChanges = [];
  const invalidNotes = [];
  for (let i = 0; i < proposed.length; i += 1) {
    const change = proposed[i];
    const formatCheck = validateShapeChange(change);
    if (!formatCheck.valid) {
      invalidNotes.push(`#${i + 1} 형식 어긋남: ${formatCheck.reason}`);
      continue;
    }
    const located = locateChange(change, architecture);
    if (!located.ok) {
      invalidNotes.push(`#${i + 1} ${change.target_key} → ${change.new_value} - ${located.reason}`);
      continue;
    }
    validChanges.push({ change, oldValue: located.oldValue });
  }

  const proposedCount = proposed.length;
  const invalidCount = invalidNotes.length;

  log('');
  log(`응답을 읽었어요. 제안된 변경 ${proposedCount}개.`);
  if (invalidCount > 0) {
    log(`그 중 ${invalidCount}개는 형식이 맞지 않거나 자리를 못 찾아 건너뜁니다:`);
    for (const note of invalidNotes) {
      log(`  - ${note}`);
    }
  }
  if (validChanges.length === 0) {
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
  log(`적용 가능한 변경 ${validChanges.length}개를 한 자리씩 같이 봐요.`);

  // batch picker (ADR 0045).
  let appliedCount = 0;
  let skippedCount = 0;
  let stopped = false;
  let mode = 'prompt';
  for (let i = 0; i < validChanges.length; i += 1) {
    const { change, oldValue } = validChanges[i];
    let decision;
    if (mode === 'apply_all') decision = 'apply';
    else if (mode === 'skip_all') decision = 'skip';
    else
      decision = await confirmChange({
        change,
        oldValue,
        index: i,
        total: validChanges.length,
        log,
      });

    if (decision === 'apply_all_remaining') {
      mode = 'apply_all';
      decision = 'apply';
    } else if (decision === 'skip_all_remaining') {
      mode = 'skip_all';
      decision = 'skip';
    }

    if (decision === 'apply') {
      applyChange(change, architecture);
      appliedCount += 1;
    } else if (decision === 'skip') {
      skippedCount += 1;
    } else if (decision === 'stop') {
      stopped = true;
      break;
    }
  }

  // 변경이 한 번이라도 적용됐으면 architecture.yml 갱신.
  if (appliedCount > 0) {
    writeFileSync(architectureFile, yaml.dump(architecture, { sortKeys: false }), 'utf8');
  }

  log('');
  log(
    `정리. 적용 ${appliedCount}개, 건너뜀 ${skippedCount}개${
      stopped ? `, 멈춤(남은 ${validChanges.length - appliedCount - skippedCount}개)` : ''
    }.`,
  );
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
