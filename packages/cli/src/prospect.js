// beoreum prospect. 사용자 자연어에서 의도를 추출하고 카탈로그를 생성한다.
// ADR 0007의 자리, ADR 0008의 intent.yml 형식, ADR 0009의 AI 어댑터 인터페이스를 따른다.
// ADR 0026이 picker → generator 전환을 박았고, ADR 0027이 generateCatalog 시그니처를,
// ADR 0028이 design.md 산출물의 자리를 박았다. Reality Check 6영역 자동 생성은 별도 ADR.
//
// 흐름 한 줄:
//   extractIntent → seedCatalog 결정(suggested_template 또는 commerce default)
//   → generateCatalog → validateCatalog → 통과: 그대로 / 실패: 시드 fallback + banner
//   → generateTradeOffDoc → design.md → intent.yml + state advance

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { input } from '@inquirer/prompts';
import { templates, templatePath } from '@beoreum/templates';
import { loadCatalog, validateCatalog } from '@beoreum/catalog';

const SCHEMA_VERSION = 1;
const STAGE = 'prospect';
const NEXT_STAGE = 'smelt';
// ADR 0026 결정 2: 시드 후보가 없으면 commerce를 default seed로 본다.
// 이 결정은 mock의 결정성을 위한 자리지 데이터 의미를 강제하지 않는다.
const DEFAULT_SEED_NAME = 'commerce';

const REALITY_CHECK_PLACEHOLDER = `# Reality Check

이 자리는 다음 출시에서 채워집니다.

ADR 0003에서 정한 6영역(시장 포화, 진입 비용, 양면 시장, 법적 리스크, 수익 모델, 묘지)이 이 파일을 채울 예정입니다. 지금은 prospect 단계가 자리만 잡아두고 다음 단계로 넘어갑니다.

답하지 못한 질문은 .beoreum/project/diary.md에 적어두세요. 다이어리는 여러분이 만들고 여러분이 봅니다.
`;

function loadState(stateFile) {
  if (!existsSync(stateFile)) {
    throw new Error('.beoreum/state.yml이 없습니다. 먼저 beoreum init을 실행해주세요');
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

// suggested_template이 유효하면 그대로, 아니면 commerce default(ADR 0026 결정 2).
function resolveSeedName(suggestedTemplate) {
  if (suggestedTemplate && templates[suggestedTemplate]) return suggestedTemplate;
  return DEFAULT_SEED_NAME;
}

function buildIntent(userInput, extracted, source, now) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    user_input: userInput,
    source,
    extracted: {
      what: extracted.what,
      who: extracted.who,
      why: extracted.why,
    },
    reality_check_status: 'pending',
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

function formatValidationErrorBrief(errors) {
  const first = errors && errors[0];
  if (!first) return '검증 실패';
  return `[${first.kind}] ${first.path} ${first.message}`;
}

// ADR 0028 결정 4: fallback 사실은 design.md 맨 위 한 줄 인용 banner와 intent.source 두 자리.
function buildFallbackBanner(seedName, errors) {
  return `> 이번 prospect는 AI 카탈로그 생성에 실패해 ${seedName} seed로 대체됐습니다. 이유: ${formatValidationErrorBrief(errors)}\n\n`;
}

// adapter.generateCatalog가 있으면 호출, 없으면 시드 그대로(adapter-optional, ADR 0027 결).
// 반환: { catalog, source, fallbackErrors|null }
async function buildFinalCatalog({ adapter, userInput, extracted, seedName, seedCatalog }) {
  if (typeof adapter.generateCatalog !== 'function') {
    return { catalog: seedCatalog, source: `template:${seedName}`, fallbackErrors: null };
  }
  try {
    const result = await adapter.generateCatalog({ userInput, intent: extracted, seedCatalog });
    const candidate = result && result.catalog;
    if (!candidate) {
      return {
        catalog: seedCatalog,
        source: `fallback:template:${seedName}`,
        fallbackErrors: [{ kind: 'shape', path: '/', message: '어댑터가 catalog를 돌려주지 않음' }],
      };
    }
    const validation = validateCatalog(candidate);
    if (validation.valid) {
      return { catalog: candidate, source: `ai-generated:hybrid:${seedName}`, fallbackErrors: null };
    }
    return {
      catalog: seedCatalog,
      source: `fallback:template:${seedName}`,
      fallbackErrors: validation.errors,
    };
  } catch (err) {
    // generateCatalog가 throw하면 시드 fallback. 동행 톤(매니페스토 V).
    return {
      catalog: seedCatalog,
      source: `fallback:template:${seedName}`,
      fallbackErrors: [{ kind: 'runtime', path: '/', message: err.message }],
    };
  }
}

// adapter.generateTradeOffDoc이 있으면 호출, 없으면 한 줄짜리 fallback 마크다운.
async function buildDesignBody({ adapter, catalog, intentDoc, now }) {
  if (typeof adapter.generateTradeOffDoc !== 'function') {
    return '# 설계 거울 미생성\n\n어댑터가 generateTradeOffDoc을 구현하지 않았습니다. catalog.yml을 직접 보세요.\n';
  }
  try {
    const result = await adapter.generateTradeOffDoc({ catalog, intent: intentDoc, now });
    return (result && result.doc) || '';
  } catch (err) {
    return `# 설계 거울 미생성\n\n어댑터가 design.md를 만들지 못했습니다. catalog.yml을 직접 보세요.\n사유: ${err.message}\n`;
  }
}

// runProspect는 prospect 단계의 본체. 어댑터 의존성 주입(ADR 0009 결정 4)으로
// LLM 호출 없는 단위 테스트가 가능하다.
//
// 입력:
//   cwd        - 프로젝트 루트 절대 경로
//   userInput  - 사용자가 입력한 자연어 한 마디
//   adapter    - AiAdapter 구현(mock, claude 등). extractIntent 메서드를 가진다
//   now        - 테스트용 결정적 시각(선택)
//
// 반환: { intentFile, catalogFile, designFile, realityCheckFile,
//         suggestedTemplate, seedName, source, nextStage }
export async function runProspect({ cwd, userInput, adapter, now } = {}) {
  if (!cwd) throw new Error('runProspect({ cwd })가 필요합니다');
  if (!userInput || !userInput.trim()) {
    throw new Error(
      'runProspect({ userInput })이 필요합니다. 무엇을 만들고 싶은지 한 마디로 적어주세요',
    );
  }
  if (!adapter || typeof adapter.extractIntent !== 'function') {
    throw new Error(
      'runProspect({ adapter })가 필요합니다. AiAdapter 인터페이스(extractIntent)를 구현한 객체여야 합니다',
    );
  }

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');
  const projectDir = join(beoreumDir, 'project');
  const catalogDir = join(projectDir, 'catalog');
  const catalogFile = join(catalogDir, 'catalog.yml');
  const intentFile = join(projectDir, 'intent.yml');
  const designFile = join(projectDir, 'design.md');
  const realityCheckFile = join(projectDir, 'reality-check.md');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const extracted = await adapter.extractIntent(userInput);
  const seedName = resolveSeedName(extracted.suggested_template);
  const seedCatalog = loadCatalog(templatePath(seedName));

  const { catalog, source, fallbackErrors } = await buildFinalCatalog({
    adapter,
    userInput,
    extracted,
    seedName,
    seedCatalog,
  });

  mkdirSync(catalogDir, { recursive: true });
  writeFileSync(catalogFile, yaml.dump(catalog, { sortKeys: false }), 'utf8');

  const intentDoc = buildIntent(userInput, extracted, source, now);
  writeFileSync(intentFile, yaml.dump(intentDoc, { sortKeys: false }), 'utf8');

  const designBody = await buildDesignBody({ adapter, catalog, intentDoc, now });
  const banner = fallbackErrors ? buildFallbackBanner(seedName, fallbackErrors) : '';
  writeFileSync(designFile, banner + designBody, 'utf8');

  writeFileSync(realityCheckFile, REALITY_CHECK_PLACEHOLDER, 'utf8');

  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  return {
    intentFile,
    catalogFile,
    designFile,
    realityCheckFile,
    suggestedTemplate: extracted.suggested_template,
    seedName,
    source,
    nextStage: NEXT_STAGE,
  };
}

// 기본 askInput. @inquirer/prompts의 input으로 자유 텍스트 한 줄을 받는다.
// 빈 입력은 다시 묻는다(사용자에게 "한 글자 이상" 안내).
async function defaultAskInput() {
  return input({
    message: '무엇을 만들고 싶으세요? 한 마디로 적어주세요',
    validate: (value) => (value && value.trim().length > 0 ? true : '한 글자 이상 적어주세요'),
  });
}

// interactiveProspect는 인자 없이 들어온 사용자에게 자유 텍스트 prompt를 띄우고 runProspect로 위임한다.
// askInput은 의존성 주입(ADR 0011 결정 5)이라 단위 테스트가 결정적이다.
//
// 입력:
//   cwd        - 프로젝트 루트 절대 경로
//   adapter    - AiAdapter 구현(mock, claude 등)
//   askInput   - async () => string 반환하는 함수. 기본은 @inquirer input
//   now        - 테스트용 결정적 시각(선택)
//
// 반환: runProspect와 같은 형태
export async function interactiveProspect({ cwd, adapter, askInput = defaultAskInput, now } = {}) {
  if (!cwd) throw new Error('interactiveProspect({ cwd })가 필요합니다');
  if (!adapter || typeof adapter.extractIntent !== 'function') {
    throw new Error(
      'interactiveProspect({ adapter })가 필요합니다. AiAdapter 인터페이스(extractIntent)를 구현한 객체여야 합니다',
    );
  }

  // askInput을 띄우기 전에 단계를 먼저 검증한다. 사용자가 자유 텍스트를 입력한 뒤
  // 단계 불일치로 거부당하는 일을 막는 자리(ADR 0011 결정 5의 정신을 따른다).
  const stateFile = join(cwd, '.beoreum', 'state.yml');
  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const userInput = await askInput();
  return runProspect({ cwd, userInput, adapter, now });
}
