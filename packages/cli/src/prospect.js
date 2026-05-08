// byeorim prospect. 사용자에게 7항목을 차례로 묻고 답변에서 의도를 정리한다.
// 같은 단계에서 카탈로그 출처를 고르고 Reality Check 6영역 리포트를 만든다.
// 따르는 ADR: 0007(디렉토리), 0008(intent.yml), 0009(AI 어댑터),
//             0026(7항목 동행 질문), 0027(카탈로그 출처와 AI 생성),
//             0003(Reality Check 6영역과 동행 톤).
// 명세: docs/specs/reality-check.md.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { input, select } from '@inquirer/prompts';
import { templates, templatePath } from '@byeorim/templates';
import { validateCatalog, loadCatalog } from '@byeorim/catalog';
import { REALITY_CHECK_AREAS, REALITY_CHECK_AREA_TITLES } from '@byeorim/core';
import { FIELDS, QUESTIONS } from './prospect-questions.js';
import { buildCatalogPromptMarkdown } from './prospect-prompt.js';

const SCHEMA_VERSION = 2;
const STAGE = 'prospect';
const NEXT_STAGE = 'smelt';

const REALITY_CHECK_INTRO = `# Reality Check

7항목 동행 질문에서 그린 서비스를 두 번째 시각으로 본다. 광맥의 가치를 보는 자리(ADR 0003).
답을 강요하지 않는다. 답할 수 없는 질문은 다이어리에 남겨두고 다음 단계로 같이 간다.

`;

function listAvailableTemplates() {
  return Object.keys(templates).join(', ');
}

function loadState(stateFile) {
  if (!existsSync(stateFile)) {
    throw new Error('.byeorim/state.yml이 없습니다. 먼저 byeorim init을 실행해주세요');
  }
  return yaml.load(readFileSync(stateFile, 'utf8'));
}

function ensureStage(state, expected) {
  if (state.current_stage !== expected) {
    throw new Error(
      `현재 단계가 ${expected}가 아닙니다(현재: ${state.current_stage}). 단계 순서대로 진행해주세요`,
    );
  }
}

function normalizeAnswers(answers) {
  const a = answers || {};
  const result = {};
  for (const key of FIELDS) {
    result[key] = typeof a[key] === 'string' ? a[key].trim() : '';
  }
  return result;
}

function isAllEmpty(answers) {
  return FIELDS.every((k) => !answers[k]);
}

function buildIntent(answers, extracted, sourceField, realityCheckStatus, now) {
  const unanswered = FIELDS.filter((k) => !extracted[k] || !extracted[k].trim());
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    user_answers: { ...answers },
    source: sourceField,
    extracted: FIELDS.reduce((acc, k) => {
      acc[k] = typeof extracted[k] === 'string' ? extracted[k] : '';
      return acc;
    }, {}),
    unanswered,
    reality_check_status: realityCheckStatus,
  };
}

// 빈 prospect 7항목을 다이어리에 한 단락으로 append한다(ADR 0026 결정 3).
// 머리는 "prospect 의도에서 미뤄둔 질문"으로 분리. Reality Check 머리와 자리가 다르다.
function appendIntentDiary(diaryFile, unanswered, now) {
  if (!unanswered.length) return;
  const date = (now || new Date()).toISOString().slice(0, 10);
  const lines = [`\n## ${date} prospect 의도에서 미뤄둔 질문`, ''];
  for (const key of unanswered) {
    const q = QUESTIONS[key];
    lines.push(`- ${q ? q.diary : key}`);
  }
  appendFileSync(diaryFile, lines.join('\n') + '\n', 'utf8');
}

// Reality Check 6영역 질문을 다이어리에 한 단락으로 append한다(docs/specs/reality-check.md).
// 머리는 "Reality Check에서 미뤄둔 질문"으로 분리(intent 머리와 다른 자리).
// prospect 단계에서는 사용자가 RC 질문에 인터랙티브로 답하지 않으므로 모든 질문이 다이어리로 흘러간다.
function appendRealityCheckDiary(diaryFile, report, now) {
  if (!report || !report.areas) return;
  const date = (now || new Date()).toISOString().slice(0, 10);
  const lines = [`\n## ${date} Reality Check에서 미뤄둔 질문`, ''];
  let any = false;
  for (const area of REALITY_CHECK_AREAS) {
    const block = report.areas[area];
    const title = REALITY_CHECK_AREA_TITLES[area] || area;
    const questions = Array.isArray(block?.questions) ? block.questions : [];
    for (const q of questions) {
      lines.push(`- ${title}: ${q}`);
      any = true;
    }
  }
  if (!any) return;
  appendFileSync(diaryFile, lines.join('\n') + '\n', 'utf8');
}

// Reality Check 6영역 리포트를 사용자가 읽는 마크다운으로 합성한다.
// docs/specs/reality-check.md의 형식을 따른다. legal_warnings는 비어있으면 절을 생략.
function renderRealityCheckMarkdown(report) {
  const lines = [REALITY_CHECK_INTRO];
  for (const area of REALITY_CHECK_AREAS) {
    const block = (report && report.areas && report.areas[area]) || {};
    const title = REALITY_CHECK_AREA_TITLES[area] || area;
    lines.push(`## ${title}`, '');
    const obs = typeof block.observation === 'string' ? block.observation.trim() : '';
    if (obs) {
      lines.push(obs, '');
    }
    const questions = Array.isArray(block.questions) ? block.questions : [];
    if (questions.length) {
      lines.push('생각해볼 질문', '');
      for (const q of questions) {
        lines.push(`- ${q}`);
      }
      lines.push('');
    }
  }
  const warnings = Array.isArray(report?.legal_warnings) ? report.legal_warnings : [];
  if (warnings.length) {
    lines.push('## 법적 메모', '');
    lines.push(
      '즉각 손해가 발생할 수 있는 법적 항목을 모아둔다. 출시 직전(Inspect 단계)에 다시 본다.',
      '',
    );
    for (const w of warnings) {
      const item = (w && w.item) || '';
      const reason = (w && w.reason) || '';
      lines.push(`- ${item}: ${reason}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// 7항목 체크리스트를 사용자에게 출력한다. 채움/비움 마커와 한국어 라벨이 한 줄에 나란히.
// 비기술 창업자가 자기가 적은 답변과 빈 자리를 한 화면에서 보게 하는 자리(ADR 0026).
function printChecklist(extracted, log = console.log) {
  log('');
  log('이렇게 정리됐어요.');
  log('');
  for (const key of FIELDS) {
    const value = extracted[key] || '';
    const marker = value.trim() ? '[채움]' : '[비움]';
    const label = QUESTIONS[key] ? QUESTIONS[key].label : key;
    const tail = value.trim() ? value : '─';
    log(`  ${marker} ${label} (${key})`);
    log(`         ${tail}`);
  }
  log('');
}

function advanceState(state, stage) {
  const completed = Array.isArray(state.completed_stages) ? state.completed_stages : [];
  return {
    ...state,
    current_stage: NEXT_STAGE,
    completed_stages: completed.includes(stage) ? completed : [...completed, stage],
  };
}

// 카탈로그 출처 선택을 카탈로그 파일과 source 필드로 풀어낸다(ADR 0027).
// source 인자는 { kind: 'template', name } 또는 { kind: 'ai' } 또는 undefined(자동 추천).
// 자동 추천 시 빌트인 템플릿이 매칭 안 되면 한국어 에러로 안내(PR-A 동작 보존).
async function resolveCatalogSource({ source, suggestedTemplate, adapter, answers, catalogFile }) {
  const choice =
    source || (suggestedTemplate ? { kind: 'template', name: suggestedTemplate } : null);
  if (!choice) {
    throw new Error(
      `사용자 답변에서 적합한 빌트인 템플릿을 추천하지 못했습니다.\n` +
        `지금 지원하는 도메인: ${listAvailableTemplates()}`,
    );
  }
  if (choice.kind === 'template') {
    if (!templates[choice.name]) {
      throw new Error(
        `알 수 없는 템플릿입니다: ${choice.name}\n지금 지원하는 도메인: ${listAvailableTemplates()}`,
      );
    }
    copyFileSync(templatePath(choice.name), catalogFile);
    return `template:${choice.name}`;
  }
  if (choice.kind === 'ai') {
    if (typeof adapter.generateCatalog !== 'function') {
      throw new Error(
        'AI 카탈로그 생성을 고르셨지만 어댑터가 generateCatalog를 구현하지 않았습니다.',
      );
    }
    const generated = await adapter.generateCatalog({
      answers,
      seedTemplate: suggestedTemplate || null,
    });
    const { valid, errors } = validateCatalog(generated);
    if (!valid) {
      const detail = errors.slice(0, 3).join('; ');
      throw new Error(
        `AI가 만든 카탈로그가 형식 검증에 걸렸어요. 빌트인 템플릿(${listAvailableTemplates()}) 중 하나를 골라보시겠어요?\n` +
          `검증 오류: ${detail}`,
      );
    }
    writeFileSync(catalogFile, yaml.dump(generated, { sortKeys: false }), 'utf8');
    return `ai:${adapter.name}`;
  }
  throw new Error(`알 수 없는 카탈로그 출처 종류입니다: ${JSON.stringify(choice)}`);
}

// runProspect는 prospect 단계의 본체다. 어댑터 의존성 주입(ADR 0009 결정 4)으로
// LLM 호출 없는 단위 테스트가 가능하다.
//
// 입력:
//   cwd        - 프로젝트 루트 절대 경로
//   answers    - 사용자가 7항목에 답한 객체 (ProspectAnswers, ADR 0026)
//   adapter    - AiAdapter 구현(mock, claude 등). extractIntent 메서드를 가진다
//   source     - 카탈로그 출처 선택 (ADR 0027). { kind:'template', name } 또는 { kind:'ai' }.
//                생략 시 suggested_template으로 자동 추천(PR-A 동작 보존)
//   extracted  - 이미 extractIntent를 거친 결과(선택). interactiveProspect가 미리 호출했을 때
//                중복 LLM 호출을 막는 자리. 없으면 여기서 호출
//   now        - 테스트용 결정적 시각(선택)
//   log        - 콘솔 출력 함수(선택). 기본은 console.log. 테스트는 빈 함수로 침묵 가능
//
// 반환: { intentFile, catalogFile, realityCheckFile, suggestedTemplate, source, nextStage, unanswered }
export async function runProspect({
  cwd,
  answers,
  adapter,
  source,
  extracted: preExtracted,
  now,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('runProspect({ cwd })가 필요합니다');
  if (!adapter || typeof adapter.extractIntent !== 'function') {
    throw new Error(
      'runProspect({ adapter })가 필요합니다. AiAdapter 인터페이스(extractIntent)를 구현한 객체여야 합니다',
    );
  }
  const normalized = normalizeAnswers(answers);
  if (isAllEmpty(normalized)) {
    throw new Error(
      'runProspect({ answers })가 필요합니다. 한 항목이라도 적어주세요. 비워둔 자리는 다이어리로 옮겨드립니다',
    );
  }

  const byeorimDir = join(cwd, '.byeorim');
  const stateFile = join(byeorimDir, 'state.yml');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const extracted = preExtracted || (await adapter.extractIntent(normalized));

  const catalogDir = join(byeorimDir, 'project', 'catalog');
  mkdirSync(catalogDir, { recursive: true });
  const catalogFile = join(catalogDir, 'catalog.yml');
  const sourceField = await resolveCatalogSource({
    source,
    suggestedTemplate: extracted.suggested_template,
    adapter,
    answers: normalized,
    catalogFile,
  });

  // Reality Check 6영역 리포트 생성(ADR 0003 + docs/specs/reality-check.md).
  // 어댑터가 generateRealityCheck를 구현하지 않은 경우(미래의 다른 어댑터)는 status='skipped'로 둔다.
  const realityCheckFile = join(byeorimDir, 'project', 'reality-check.md');
  const diaryFile = join(byeorimDir, 'project', 'diary.md');
  let realityCheckStatus = 'skipped';
  if (typeof adapter.generateRealityCheck === 'function') {
    const catalogObj = loadCatalog(catalogFile);
    const report = await adapter.generateRealityCheck({ answers: normalized, catalog: catalogObj });
    writeFileSync(realityCheckFile, renderRealityCheckMarkdown(report), 'utf8');
    appendRealityCheckDiary(diaryFile, report, now);
    realityCheckStatus = 'completed';
  } else {
    writeFileSync(
      realityCheckFile,
      REALITY_CHECK_INTRO + '_이 어댑터는 Reality Check를 지원하지 않아 자리만 잡아두었습니다._\n',
      'utf8',
    );
  }

  const intentDoc = buildIntent(normalized, extracted, sourceField, realityCheckStatus, now);
  const intentFile = join(byeorimDir, 'project', 'intent.yml');
  writeFileSync(intentFile, yaml.dump(intentDoc, { sortKeys: false }), 'utf8');

  appendIntentDiary(diaryFile, intentDoc.unanswered, now);

  // 외부 AI 경로용 부산물 프롬프트 작성(ADR 0028). source가 무엇이든 항상 만들어둔다.
  // 사용자가 카탈로그 품질에 만족 못 하거나 더 자세한 자리를 원할 때 쓰는 결.
  const promptsDir = join(byeorimDir, 'project', 'prompts');
  mkdirSync(promptsDir, { recursive: true });
  const catalogPromptFile = join(promptsDir, 'catalog-prompt.md');
  writeFileSync(
    catalogPromptFile,
    buildCatalogPromptMarkdown({
      answers: normalized,
      suggestedTemplate: extracted.suggested_template,
    }),
    'utf8',
  );

  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  printChecklist(intentDoc.extracted, log);
  if (intentDoc.unanswered.length) {
    log(
      `다이어리에 prospect 의도에서 미뤄둔 ${intentDoc.unanswered.length}개 질문을 적어두었어요: ${intentDoc.unanswered.join(', ')}`,
    );
  }
  if (realityCheckStatus === 'completed') {
    log('Reality Check 6영역을 reality-check.md에 적어두었어요. 질문은 다이어리로도 옮겨졌습니다.');
  }
  log(`카탈로그 출처: ${sourceField}`);
  log(
    '더 자세한 카탈로그를 원하시면 .byeorim/project/prompts/catalog-prompt.md를 외부 AI에 붙여넣고',
  );
  log('  byeorim prospect import-catalog <받은-파일.yml>  명령으로 가져오세요(ADR 0028).');
  log(`다음 단계로 같이 갑니다: byeorim ${NEXT_STAGE}`);

  return {
    intentFile,
    catalogFile,
    realityCheckFile,
    catalogPromptFile,
    suggestedTemplate: extracted.suggested_template,
    source: sourceField,
    realityCheckStatus,
    nextStage: NEXT_STAGE,
    unanswered: intentDoc.unanswered,
  };
}

// 기본 askCatalogSource. 4지선다(빌트인 3 + AI). suggested_template이 있으면 그 자리에 (추천) 표시.
// 추천이 null이면 AI 옵션이 기본 선택(ADR 0027 결정 1).
async function defaultAskCatalogSource({ suggested } = {}) {
  const labels = {
    commerce: 'commerce (쇼핑/마켓/결제)',
    'job-aggregator': 'job-aggregator (채용/구인/일자리)',
    reservation: 'reservation (예약/대관/클래스/강좌/시간표)',
  };
  const choices = Object.entries(labels).map(([name, label]) => ({
    name: name === suggested ? `${label} (추천)` : label,
    value: { kind: 'template', name },
  }));
  choices.push({
    name: 'AI가 내 도메인에 맞춰 새로 만들기',
    value: { kind: 'ai' },
  });
  const defaultValue = suggested
    ? choices.find((c) => c.value.kind === 'template' && c.value.name === suggested).value
    : choices[choices.length - 1].value;
  return select({
    message: '어떤 카탈로그로 시작할까요?',
    choices,
    default: defaultValue,
  });
}

// 기본 askAnswers. 7항목을 차례차례 한 줄씩 묻는다. 빈 답 허용(ADR 0026 결정 3).
// 사용자가 그냥 엔터로 비워두면 그 자리는 빈 문자열로 두고 다이어리로 흘러간다.
async function defaultAskAnswers({ log = console.log } = {}) {
  log('');
  log('같이 그려봅시다. 7가지를 차례차례 물어볼게요.');
  log('비워둬도 됩니다. 비워둔 자리는 다이어리에 질문으로 옮겨드립니다.');
  log('');
  const answers = {};
  for (let i = 0; i < FIELDS.length; i++) {
    const key = FIELDS[i];
    const q = QUESTIONS[key];
    const value = await input({
      message: `${i + 1}/${FIELDS.length}. ${q.label} ${q.example}`,
    });
    answers[key] = (value || '').trim();
  }
  return answers;
}

// interactiveProspect는 인자 없이 들어온 사용자에게 7항목 질문과 카탈로그 출처 선택을 차례로 띄우고
// runProspect로 위임한다. askAnswers와 askCatalogSource는 의존성 주입(ADR 0011 결정 5)이라
// 단위 테스트가 결정적이다.
//
// 입력:
//   cwd                - 프로젝트 루트 절대 경로
//   adapter            - AiAdapter 구현(mock, claude 등)
//   askAnswers         - async ({ log }) => ProspectAnswers. 기본은 7항목 차례 input
//   askCatalogSource   - async ({ suggested }) => { kind, name? }. 기본은 4지선다 select(ADR 0027)
//   now                - 테스트용 결정적 시각(선택)
//   log                - 콘솔 출력 함수(선택)
//
// 반환: runProspect와 같은 형태
export async function interactiveProspect({
  cwd,
  adapter,
  askAnswers = defaultAskAnswers,
  askCatalogSource = defaultAskCatalogSource,
  now,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('interactiveProspect({ cwd })가 필요합니다');
  if (!adapter || typeof adapter.extractIntent !== 'function') {
    throw new Error(
      'interactiveProspect({ adapter })가 필요합니다. AiAdapter 인터페이스(extractIntent)를 구현한 객체여야 합니다',
    );
  }

  // askAnswers를 띄우기 전에 단계를 먼저 검증한다. 사용자가 7항목을 다 적은 뒤
  // 단계 불일치로 거부당하는 일을 막는 자리(ADR 0011 결정 5의 정신).
  const stateFile = join(cwd, '.byeorim', 'state.yml');
  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const answers = await askAnswers({ log });
  const normalized = normalizeAnswers(answers);
  if (isAllEmpty(normalized)) {
    throw new Error(
      'interactiveProspect: 한 항목이라도 적어주세요. 비워둔 자리는 다이어리로 옮겨드립니다',
    );
  }
  // 한 번만 extractIntent를 부르고 그 결과를 runProspect에 넘긴다(중복 LLM 호출 방지).
  const extracted = await adapter.extractIntent(normalized);
  const source = await askCatalogSource({ suggested: extracted.suggested_template });
  return runProspect({ cwd, answers: normalized, adapter, source, extracted, now, log });
}
