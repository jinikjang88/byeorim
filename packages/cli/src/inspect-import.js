// beoreum inspect import-review. ADR 0051의 외부 검토 응답 import 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 응답 마크다운 파일을 읽어
// "## 검수 결과" 섹션의 ```yaml findings를 파싱하고 인터랙티브 picker로 자리마다 적용한다.
// state는 안 건드리고 inspect-findings.yml의 external 섹션과 inspect-report.md만 다듬는다.
// 응답 형식이 어긋날 때는 graceful degrade(ADR 0051 결정 8).
// forge-import.js의 결을 그대로 따라간다(같은 picker 패턴).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { select } from '@inquirer/prompts';
import { parseFindingsResponse, validateInspectFinding } from './review-response-parser.js';
import { rebuildInspectReport } from './inspect.js';

const SEVERITY_LABEL = {
  pass: '✓ pass',
  warning: '⚠ warning',
  concern: '✗ concern',
};

function describeFinding(finding) {
  const sev = SEVERITY_LABEL[finding.severity] || finding.severity;
  const fileSuffix = finding.file ? `  (${finding.file})` : '';
  return `[${finding.area}] ${sev}: ${finding.title}${fileSuffix}`;
}

// 기본 confirmFinding. 사용자에게 한 finding을 보여주고 select로 결정 묻는다.
async function defaultConfirmFinding({ finding, index, total, log = console.log } = {}) {
  log('');
  log(`[${index + 1}/${total}] ${describeFinding(finding)}`);
  log(`  ${finding.detail}`);
  log('');
  return select({
    message: '어떻게 할까요?',
    choices: [
      { name: '적용하기 (external에 추가)', value: 'apply' },
      { name: '건너뛰기', value: 'skip' },
      { name: '이번부터 모두 적용', value: 'apply_all_remaining' },
      { name: '이번부터 모두 건너뛰기', value: 'skip_all_remaining' },
      { name: '여기서 멈추기', value: 'stop' },
    ],
    default: 'apply',
  });
}

// applyInspectReview는 inspect import-review의 본체.
// 외부 AI 응답 파일을 읽고 inspect-findings.yml의 external 섹션을 인터랙티브 picker로 갱신,
// inspect-report.md를 재렌더한다.
//
// 입력:
//   cwd            - 프로젝트 루트 절대 경로
//   responsePath   - 외부 AI 응답 마크다운 파일 경로(절대 또는 상대)
//   confirmFinding - async ({ finding, index, total, log }) => 'apply'|'skip'|'apply_all_remaining'|'skip_all_remaining'|'stop' (선택)
//   log            - 콘솔 출력 함수(선택)
//   now            - 결정적 시각(선택, 테스트용)
//
// 반환:
//   {
//     findingsFile, reportFile, responseFile,
//     hasStructuredSection: boolean,
//     parseError: string | null,
//     proposedCount, invalidCount, appliedCount, skippedCount, stopped: boolean,
//     warnings: string[],
//   }
export async function applyInspectReview({
  cwd,
  responsePath,
  confirmFinding = defaultConfirmFinding,
  log = console.log,
  now,
} = {}) {
  if (!cwd) throw new Error('applyInspectReview({ cwd })가 필요합니다');
  if (!responsePath) {
    throw new Error(
      'applyInspectReview({ responsePath })가 필요합니다. 외부 AI 응답 파일 경로를 적어주세요',
    );
  }

  const beoreumDir = join(cwd, '.beoreum');
  const findingsFile = join(beoreumDir, 'project', 'inspect-findings.yml');
  const reportFile = join(beoreumDir, 'project', 'inspect-report.md');

  if (!existsSync(findingsFile)) {
    throw new Error(
      'inspect-findings.yml이 없습니다. 먼저 beoreum inspect를 실행해 단일 진실 소스를 만들어주세요',
    );
  }

  // 응답 파일 읽기. ENOENT는 한국어 메시지로 풀어준다.
  let responseText;
  try {
    responseText = readFileSync(responsePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`응답 파일을 찾지 못했어요: ${responsePath}`);
    }
    throw err;
  }

  // 파싱(graceful, ADR 0051 결정 8).
  const parseResult = parseFindingsResponse(responseText);
  const warnings = [];

  if (!parseResult.hasStructuredSection || parseResult.parseError) {
    log('');
    log('응답에서 "## 검수 결과" 섹션을 못 알아봤어요.');
    if (parseResult.parseError) {
      log(`  사유: ${parseResult.parseError}`);
    }
    log('외부 AI가 자유 형식으로만 답했거나 형식이 어긋났을 수 있어요.');
    log(
      '응답을 직접 보시고 inspect-report.md를 손으로 다듬으시거나, 외부 AI에 형식대로 다시 답해달라고 부탁해주세요.',
    );
    return {
      findingsFile,
      reportFile,
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

  // 형식 검증.
  const proposed = parseResult.findings;
  const validFindings = [];
  const invalidNotes = [];
  for (let i = 0; i < proposed.length; i += 1) {
    const finding = proposed[i];
    const check = validateInspectFinding(finding);
    if (!check.valid) {
      invalidNotes.push(`#${i + 1} 형식 어긋남: ${check.reason}`);
      continue;
    }
    validFindings.push(finding);
  }

  const proposedCount = proposed.length;
  const invalidCount = invalidNotes.length;

  log('');
  log(`응답을 읽었어요. 제안된 검수 결과 ${proposedCount}개.`);
  if (invalidCount > 0) {
    log(`그 중 ${invalidCount}개는 형식이 맞지 않아 건너뜁니다:`);
    for (const note of invalidNotes) {
      log(`  - ${note}`);
    }
  }
  if (validFindings.length === 0) {
    log('적용할 검수 결과가 없어요. inspect-findings.yml의 external 섹션은 그대로 둡니다.');
    return {
      findingsFile,
      reportFile,
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
  log(`적용 가능한 검수 결과 ${validFindings.length}개를 한 자리씩 같이 봐요.`);

  // 인터랙티브 picker. ADR 0045 batch 모드 결.
  const accepted = [];
  let skippedCount = 0;
  let stopped = false;
  let mode = 'prompt';
  for (let i = 0; i < validFindings.length; i += 1) {
    const finding = validFindings[i];
    let decision;
    if (mode === 'apply_all') decision = 'apply';
    else if (mode === 'skip_all') decision = 'skip';
    else
      decision = await confirmFinding({
        finding,
        index: i,
        total: validFindings.length,
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
      accepted.push(finding);
    } else if (decision === 'skip') {
      skippedCount += 1;
    } else if (decision === 'stop') {
      stopped = true;
      break;
    }
  }

  // ADR 0051 결정 6: external 섹션 교체. 매 import-review가 fresh take.
  // 단 사용자가 한 개도 적용 안 했고 stopped 했어도 yml은 안 건드림(부분 상태 박지 않음).
  let appliedCount = 0;
  if (accepted.length > 0) {
    const doc = yaml.load(readFileSync(findingsFile, 'utf8')) || {};
    if (!doc.findings || typeof doc.findings !== 'object') doc.findings = {};
    doc.findings.external = accepted.map((f) => stripSourceField(f));
    doc.generated_at = (now || new Date()).toISOString();
    writeFileSync(findingsFile, yaml.dump(doc, { sortKeys: false }), 'utf8');
    appliedCount = accepted.length;
    // inspect-report.md 재렌더
    rebuildInspectReport({ cwd, now });
  }

  log('');
  log(
    `정리. 적용 ${appliedCount}개, 건너뜀 ${skippedCount}개${
      stopped ? `, 멈춤(남은 ${validFindings.length - appliedCount - skippedCount}개)` : ''
    }.`,
  );
  if (appliedCount > 0) {
    log(`inspect-findings.yml의 external 섹션이 갱신되었습니다.`);
    log(`inspect-report.md가 재렌더됐어요: ${reportFile}`);
  }

  return {
    findingsFile,
    reportFile,
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

function stripSourceField(finding) {
  const { source: _source, ...rest } = finding;
  return rest;
}
