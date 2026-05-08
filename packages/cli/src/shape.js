// byeorim shape. 직전 단계의 산출물을 입력으로 받아 4개 핵심 아키텍처 결정을 만든다.
// ADR 0007의 자리, ADR 0012의 architecture.yml 형식, ADR 0011의 인터랙티브 prompt 정책,
// ADR 0032(아키텍처 추천과 검토 흐름), ADR 0033(외부 검토 프롬프트 부산물)을 따른다.
// cascade 답안은 맥락으로만 보여주고 직접 참조하지 않는다(ADR 0012 결정 3).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { select } from '@inquirer/prompts';
import { loadCatalog } from '@byeorim/catalog';
import { buildArchitectureReviewPromptMarkdown } from './shape-prompt.js';
import {
  buildOptionDescription,
  formatContextSummary,
  formatChoicesSummary,
} from './shape-picker-helpers.js';

const SCHEMA_VERSION = 1;
const STAGE = 'shape';
const NEXT_STAGE = 'forge';
const EMPTY_RECOMMENDATION = { recommended: {}, reasons: {} };

// 4개 핵심 결정의 옵션 표. ADR 0012 결정 1에 박힌 표준 키와 식별자.
// 옵션의 tradeoff는 picker description으로 항상 노출(추천 유무와 무관). 비기술 창업자 결.
// 단축어(PG, ACID 등)는 안 쓰고 일상 한국어만(CLAUDE.md 섹션 10).
// 새 옵션 추가나 키 변경은 별도 ADR로 결정한다.
const ARCHITECTURE_CHOICES = {
  language: [
    {
      value: 'node',
      name: 'Node.js (JavaScript/TypeScript)',
      tradeoff: '프론트엔드와 같은 언어로 통일하기 좋아요. 비동기 처리가 자연스러워요',
    },
    {
      value: 'java',
      name: 'Java (Spring Boot)',
      tradeoff: '큰 트래픽과 안정 운영에 강해요. 학습 비용은 있어요',
    },
    {
      value: 'python',
      name: 'Python (FastAPI/Django)',
      tradeoff: '데이터 처리와 잘 맞아요. 동시 처리는 신경 써야 해요',
    },
  ],
  database: [
    {
      value: 'postgresql',
      name: 'PostgreSQL (관계형, 가장 보편)',
      tradeoff: '가장 안전한 기본값이에요. 관계형 데이터에 강해요',
    },
    {
      value: 'mysql',
      name: 'MySQL (관계형, 호스팅 풍부)',
      tradeoff: '호스팅이 풍부하고 비용이 작아요. 복잡한 쿼리는 PostgreSQL보다 약해요',
    },
    {
      value: 'sqlite',
      name: 'SQLite (파일 기반, 작은 규모)',
      tradeoff: '한 파일이라 작은 규모에 적합해요. 동시 접속이 많으면 부담스러워요',
    },
    {
      value: 'mongodb',
      name: 'MongoDB (문서형, 유연한 스키마)',
      tradeoff: '스키마가 자주 바뀌는 자리에 맞아요. 거래 안전성은 관계형보다 약해요',
    },
  ],
  api_style: [
    {
      value: 'rest',
      name: 'REST (HTTP 자원 중심)',
      tradeoff: '가장 보편이라 도구가 풍부해요. 표준 방식',
    },
    {
      value: 'graphql',
      name: 'GraphQL (쿼리 중심)',
      tradeoff: '클라이언트가 필요한 자리만 받을 수 있어요. 학습 비용이 커요',
    },
    {
      value: 'rpc',
      name: 'RPC (메서드 호출 중심)',
      tradeoff: '메서드 호출 결로 단순해요. 다양한 클라이언트 지원이 약해요',
    },
  ],
  architecture_pattern: [
    {
      value: 'monolith',
      name: '한 덩어리(Monolith) — 가장 단순',
      tradeoff: '가장 단순. 한 사람이 시작하기 좋아요. 큰 팀이면 좁아져요',
    },
    {
      value: 'modular-monolith',
      name: '모듈형 한 덩어리(Modular Monolith) — 균형',
      tradeoff: '균형. 한 덩어리지만 모듈로 나뉘어 있어 미래 분리가 쉬워요',
    },
    {
      value: 'microservices',
      name: '마이크로서비스(Microservices) — 분산',
      tradeoff: '큰 팀과 분산 운영에 맞아요. 처음부터 가면 무거워요',
    },
  ],
};

// 4개 결정 select 메시지(결정 키를 한국어 질문으로 푼 자리).
const ARCHITECTURE_MESSAGES = {
  language: '어떤 언어로 만들 것인가요?',
  database: '데이터를 어디에 저장할 것인가요?',
  api_style: 'API는 어떤 형태인가요?',
  architecture_pattern: '코드 구조는 어떻게 잡을까요?',
};

const VALID_VALUES = Object.fromEntries(
  Object.entries(ARCHITECTURE_CHOICES).map(([key, opts]) => [
    key,
    new Set(opts.map((o) => o.value)),
  ]),
);

// 4개 결정 키와 표준 옵션 값(ADR 0012). shape-import.js가 validateShapeChange에서 사용.
// 미래 새 옵션 추가는 별도 ADR로.
export const ARCHITECTURE_DECISION_KEYS = [
  'language',
  'database',
  'api_style',
  'architecture_pattern',
];
export function getValidArchitectureValues(key) {
  const set = VALID_VALUES[key];
  return set ? Array.from(set) : [];
}

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

// shape의 입력 자리들을 한 번에 읽는다. 모든 자리가 있어야 다음으로 간다.
// 어댑터가 없어도 catalog는 항상 읽는다(다른 자리에서 쓰일 수 있음).
function loadShapeInputs(byeorimDir) {
  const intentFile = join(byeorimDir, 'project', 'intent.yml');
  const selectedFile = join(byeorimDir, 'project', 'selected-blocks.yml');
  const decisionsFile = join(byeorimDir, 'project', 'decisions.yml');
  const catalogFile = join(byeorimDir, 'project', 'catalog', 'catalog.yml');

  ensureFile(selectedFile, '먼저 byeorim smelt를 실행해주세요');
  ensureFile(intentFile, '먼저 byeorim prospect를 실행해주세요');
  ensureFile(decisionsFile, '먼저 byeorim smelt를 실행해주세요');
  ensureFile(catalogFile, '먼저 byeorim prospect를 실행해주세요');

  const intent = yaml.load(readFileSync(intentFile, 'utf8')) || {};
  const selectedBlocks = yaml.load(readFileSync(selectedFile, 'utf8')) || {};
  const decisionsDoc = yaml.load(readFileSync(decisionsFile, 'utf8')) || {};
  const decisions = Array.isArray(decisionsDoc.decisions) ? decisionsDoc.decisions : [];
  const catalog = loadCatalog(catalogFile);
  const answers =
    intent.user_answers && typeof intent.user_answers === 'object' ? intent.user_answers : {};

  return { intent, answers, selectedBlocks, decisions, catalog };
}

function buildContext({ selectedBlocks, decisions }) {
  const answeredCount = decisions.filter((d) => d && d.answer).length;
  return {
    selectedCount: (selectedBlocks.selected || []).length,
    autoAddedCount: (selectedBlocks.auto_added || []).length,
    affectedCount: (selectedBlocks.affected || []).length,
    prerequisitesCount: (selectedBlocks.prerequisites || []).length,
    decisionsTotal: decisions.length,
    decisionsAnswered: answeredCount,
    decisionsPending: decisions.length - answeredCount,
  };
}

function ensureChoicesValid(choices) {
  const errors = [];
  for (const key of Object.keys(ARCHITECTURE_CHOICES)) {
    const value = choices && choices[key];
    if (!value) {
      errors.push(`${key} 결정이 비어있습니다`);
      continue;
    }
    if (!VALID_VALUES[key].has(value)) {
      errors.push(
        `${key}의 값 "${value}"는 표준 옵션이 아닙니다(허용: ${[...VALID_VALUES[key]].join(', ')})`,
      );
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `아키텍처 결정이 ADR 0012의 표준을 따르지 않습니다:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}

function buildArchitectureDoc(choices, now) {
  return {
    schema_version: SCHEMA_VERSION,
    created_at: (now || new Date()).toISOString(),
    language: choices.language,
    database: choices.database,
    api_style: choices.api_style,
    architecture_pattern: choices.architecture_pattern,
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

// 어댑터에서 추천을 얻는다. 어댑터가 없거나 recommendArchitecture 미구현이면 빈 추천(ADR 0032 결정 4).
async function fetchArchitectureRecommendation({ adapter, answers, catalog, selectedBlocks, log }) {
  if (!adapter || typeof adapter.recommendArchitecture !== 'function') {
    log('이번 흐름은 AI 추천 없이 진행됩니다(어댑터가 추천을 지원하지 않음).');
    return EMPTY_RECOMMENDATION;
  }
  const result = await adapter.recommendArchitecture({ answers, catalog, selectedBlocks });
  const recommended =
    result?.recommended && typeof result.recommended === 'object' ? result.recommended : {};
  const reasons = result?.reasons && typeof result.reasons === 'object' ? result.reasons : {};
  return { recommended, reasons };
}

// reasons[key]에서 사용자 시점 한 줄을 꺼낸다(ADR 0032 결정 2 + ADR 0030 결을 재사용).
// 새 모양({user, dev}) 우선, 옛 string 모양은 user 시점으로 폴백.
function pickUserReason(reasonsEntry) {
  if (!reasonsEntry) return '';
  if (typeof reasonsEntry === 'string') return reasonsEntry;
  if (typeof reasonsEntry === 'object' && typeof reasonsEntry.user === 'string') {
    return reasonsEntry.user;
  }
  return '';
}

// 한 결정 키에 대한 select 옵션 배열을 만든다.
// description은 항상 노출(추천 user reason 우선, 없으면 옵션 tradeoff). 추천 옵션에는 [추천] prefix.
// 옵션 순서는 ADR 0012의 표준 순서를 안 건드린다(ADR 0032 결정 2).
function buildOptionsForKey(key, recommendation = EMPTY_RECOMMENDATION) {
  const recommended = recommendation.recommended || {};
  const reasons = recommendation.reasons || {};
  const recommendedValue = recommended[key];
  const userReason = pickUserReason(reasons[key]);
  return ARCHITECTURE_CHOICES[key].map((opt) => {
    const isRecommended = opt.value === recommendedValue;
    const description = buildOptionDescription(opt, isRecommended ? userReason : '');
    const choice = {
      value: opt.value,
      name: isRecommended ? `[추천] ${opt.name}` : opt.name,
    };
    if (description) choice.description = description;
    return choice;
  });
}

// 기본 askArchitecture. ADR 0012 결정 1의 4개 옵션을 차례로 묻는다.
// 시작에 context 요약 한 단락 출력(어디서 와서 무엇을 빚는지).
// recommendation이 있으면 추천 옵션에 [추천] prefix와 user 이유 description.
// 추천이 없는 옵션도 항상 옵션의 tradeoff 한 줄을 description으로 보여준다.
async function defaultAskArchitecture({
  context,
  recommendation = EMPTY_RECOMMENDATION,
  log = console.log,
} = {}) {
  log('');
  log(formatContextSummary(context));
  log('');
  const language = await select({
    message: ARCHITECTURE_MESSAGES.language,
    choices: buildOptionsForKey('language', recommendation),
  });
  const database = await select({
    message: ARCHITECTURE_MESSAGES.database,
    choices: buildOptionsForKey('database', recommendation),
  });
  const api_style = await select({
    message: ARCHITECTURE_MESSAGES.api_style,
    choices: buildOptionsForKey('api_style', recommendation),
  });
  const architecture_pattern = await select({
    message: ARCHITECTURE_MESSAGES.architecture_pattern,
    choices: buildOptionsForKey('architecture_pattern', recommendation),
  });
  return { language, database, api_style, architecture_pattern };
}

// 기본 confirmArchitecture. 4개 결정을 한국어 이름과 tradeoff 한 줄로 풀어쓰고 진행/다시 고르기를 묻는다(ADR 0032 결정 3).
async function defaultConfirmArchitecture({ choices, log = console.log } = {}) {
  log('');
  log('이 네 자리를 골라봤어요.');
  log(formatChoicesSummary(choices, ARCHITECTURE_CHOICES));
  log('');
  return select({
    message: '이 네 자리를 이대로 가실래요?',
    choices: [
      { name: '예, 진행', value: 'proceed' },
      { name: '아니오, 다시 고를게요', value: 'redo' },
    ],
    default: 'proceed',
  });
}

// interactiveShape는 shape 단계의 본체. askArchitecture와 confirmArchitecture는 의존성 주입(ADR 0011 결정 5).
// adapter가 주어지면 prospect 답변과 smelt 산출물 기반 추천(ADR 0032)으로 picker를 강조한다.
// confirmArchitecture가 'redo'를 돌려주면 4개 결정을 다시 고른다.
//
// 입력:
//   cwd                 - 프로젝트 루트 절대 경로
//   adapter             - AiAdapter(선택). recommendArchitecture를 부르는 자리
//   askArchitecture     - async ({ context, recommendation }) => choices. 기본은 @inquirer select 4번
//   confirmArchitecture - async ({ choices, log }) => 'proceed'|'redo'. 기본은 select
//   now                 - 테스트용 결정적 시각(선택)
//   log                 - 콘솔 출력 함수(선택)
//
// 반환: {
//   architectureFile, choices, context, nextStage,
// }
export async function interactiveShape({
  cwd,
  adapter,
  askArchitecture = defaultAskArchitecture,
  confirmArchitecture = defaultConfirmArchitecture,
  now,
  log = console.log,
} = {}) {
  if (!cwd) throw new Error('interactiveShape({ cwd })가 필요합니다');

  const byeorimDir = join(cwd, '.byeorim');
  const stateFile = join(byeorimDir, 'state.yml');
  const architectureFile = join(byeorimDir, 'project', 'architecture.yml');
  const promptsDir = join(byeorimDir, 'project', 'prompts');
  const architectureReviewPromptFile = join(promptsDir, 'architecture-review-prompt.md');

  // 단계 검증을 prompt 호출 전에 둔다(사용자가 4개 결정을 다 고른 뒤 거부당하는 일을 막음).
  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const inputs = loadShapeInputs(byeorimDir);
  const context = buildContext(inputs);
  const recommendation = await fetchArchitectureRecommendation({
    adapter,
    answers: inputs.answers,
    catalog: inputs.catalog,
    selectedBlocks: inputs.selectedBlocks,
    log,
  });

  // ask → confirm 루프. confirm이 'redo'면 다시. 사용자 의지로 무한 루프 가능(차단 자리 없음, 동행 톤).
  while (true) {
    const choices = await askArchitecture({ context, recommendation, log });
    ensureChoicesValid(choices);
    const decision = await confirmArchitecture({ choices, log });
    if (decision === 'proceed') {
      const doc = buildArchitectureDoc(choices, now);
      writeFileSync(architectureFile, yaml.dump(doc, { sortKeys: false }), 'utf8');

      // 외부 AI 검토 프롬프트 부산물(ADR 0033 결정 1). 사용자가 외부 AI에 붙여넣어 자세히 검토받는 자리.
      mkdirSync(promptsDir, { recursive: true });
      writeFileSync(
        architectureReviewPromptFile,
        buildArchitectureReviewPromptMarkdown({
          answers: inputs.answers,
          catalog: inputs.catalog,
          selectedBlocks: inputs.selectedBlocks,
          choices,
          choicesTable: ARCHITECTURE_CHOICES,
          recommendation,
        }),
        'utf8',
      );

      writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');
      return {
        architectureFile,
        architectureReviewPromptFile,
        choices,
        context,
        nextStage: NEXT_STAGE,
      };
    }
    log('알겠어요. 다시 골라볼게요.');
  }
}
