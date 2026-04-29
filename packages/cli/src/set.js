// beoreum set. 7단계의 산출물을 한 README 문서로 합성하고, 언어가 지원되면 백엔드 코드도 생성.
// ADR 0007의 자리, ADR 0015(README 합성), ADR 0017(7원칙)과 ADR 0018(Node 구조)을 따른다.
// 사용자 입력 없는 변환 단계라 picker 없음.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { generateNodeBackend } from './generators/node.js';
import { generateJavaBackend } from './generators/java.js';
import { generatePythonBackend } from './generators/python.js';
import { generateFrontend } from './generators/frontend.js';

// language별 백엔드 생성기 매핑. 모든 ADR 0017이 정한 언어가 채워짐.
// 새 언어가 들어오면 이 표만 갱신한다.
const BACKEND_GENERATORS = {
  node: generateNodeBackend,
  java: generateJavaBackend,
  python: generatePythonBackend,
};

// frontend는 ADR 0021의 표준(React)으로 항상 생성. 다른 framework 추가는 미래 ADR에서
// architecture.yml의 frontend_framework를 5번째 결정으로 amendment할 때 결정.

const STAGE = 'set';
const NEXT_STAGE = 'inspect';

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

function loadInputs(beoreumDir) {
  const intentFile = join(beoreumDir, 'project', 'intent.yml');
  const selectedFile = join(beoreumDir, 'project', 'selected-blocks.yml');
  const decisionsFile = join(beoreumDir, 'project', 'decisions.yml');
  const archFile = join(beoreumDir, 'project', 'architecture.yml');
  const contractsFile = join(beoreumDir, 'project', 'contracts.yml');
  const scenariosFile = join(beoreumDir, 'project', 'test-scenarios.yml');

  ensureFile(intentFile, '먼저 beoreum prospect를 실행해주세요');
  ensureFile(selectedFile, '먼저 beoreum smelt를 실행해주세요');
  ensureFile(decisionsFile, '먼저 beoreum smelt를 실행해주세요');
  ensureFile(archFile, '먼저 beoreum shape를 실행해주세요');
  ensureFile(contractsFile, '먼저 beoreum forge를 실행해주세요');
  ensureFile(scenariosFile, '먼저 beoreum temper를 실행해주세요');

  return {
    intent: yaml.load(readFileSync(intentFile, 'utf8')) || {},
    selected: yaml.load(readFileSync(selectedFile, 'utf8')) || {},
    decisionsDoc: yaml.load(readFileSync(decisionsFile, 'utf8')) || {},
    architecture: yaml.load(readFileSync(archFile, 'utf8')) || {},
    contracts: yaml.load(readFileSync(contractsFile, 'utf8')) || {},
    scenariosDoc: yaml.load(readFileSync(scenariosFile, 'utf8')) || {},
  };
}

function fallbackOrEmpty(value) {
  return value && value.trim ? value.trim() : '';
}

function blankNote(value) {
  return fallbackOrEmpty(value) || '_(아직 답하지 않음)_';
}

// ── 섹션 빌더들 ─────────────────────────────────────────────

function buildOverview(intent) {
  const extracted = intent.extracted || {};
  return `## 1. 프로젝트 개요

- 무엇을 만드시나요: ${blankNote(extracted.what)}
- 누구를 위해 만드시나요: ${blankNote(extracted.who)}
- 왜 만드시나요: ${blankNote(extracted.why)}
- 카탈로그 출처: ${intent.source || '_(알 수 없음)_'}
- 사용자 입력 그대로: "${intent.user_input || ''}"
`;
}

function blockNameMap(contracts) {
  const map = new Map();
  for (const c of contracts.contracts || []) {
    map.set(c.block_id, c.name || c.block_id);
  }
  return map;
}

function bulletBlockList(ids, nameMap) {
  if (!ids || ids.length === 0) return '_(없음)_';
  return ids.map((id) => `- ${nameMap.get(id) || id} (\`${id}\`)`).join('\n');
}

function buildBlocks(selected, contracts) {
  const nameMap = blockNameMap(contracts);
  const prereqs = selected.prerequisites || [];
  const prereqLines =
    prereqs.length === 0
      ? '_(없음)_'
      : prereqs
          .map(
            (p) =>
              `- **${p.name}** (${p.where || '장소 미정'}): 시간 ${p.time || '미정'}, 비용 ${p.cost || '미정'}`,
          )
          .join('\n');

  return `## 2. 만들 블럭

### 직접 고른 블럭

${bulletBlockList(selected.selected, nameMap)}

### 의존성으로 따라온 블럭

${bulletBlockList(selected.auto_added, nameMap)}

### 영향 받는 자리(빌드되지는 않음)

${bulletBlockList(selected.affected, nameMap)}

### World 0 준비물

${prereqLines}
`;
}

function buildDecisions(decisionsDoc) {
  const decisions = Array.isArray(decisionsDoc.decisions) ? decisionsDoc.decisions : [];
  if (decisions.length === 0) {
    return `## 3. cascade 결정

이번 선택에서 결정할 cascade 질문이 없습니다.
`;
  }

  const answered = decisions.filter((d) => d.answer);
  const unanswered = decisions.filter((d) => !d.answer);

  const answeredLines =
    answered.length === 0
      ? '_(없음)_'
      : answered.map((d) => `- [\`${d.trigger}\`] ${d.question}\n  답: **${d.answer}**`).join('\n');

  const unansweredLines =
    unanswered.length === 0
      ? '_(없음)_'
      : unanswered
          .map((d) => {
            const opts = (d.options || []).map((o) => `\`${o}\``).join(', ');
            return `- [\`${d.trigger}\`] ${d.question}\n  옵션: ${opts || '_(없음)_'}`;
          })
          .join('\n');

  return `## 3. cascade 결정

총 ${decisions.length}개 중 ${answered.length}개 답함, ${unanswered.length}개 남음.

### 답한 결정

${answeredLines}

### 답하지 못한 결정

${unansweredLines}
`;
}

function buildArchitecture(architecture) {
  return `## 4. 아키텍처 결정

- 언어: \`${architecture.language || '_(미정)_'}\`
- 저장소: \`${architecture.database || '_(미정)_'}\`
- API 형식: \`${architecture.api_style || '_(미정)_'}\`
- 코드 구조: \`${architecture.architecture_pattern || '_(미정)_'}\`
`;
}

function endpointTableRow(ep) {
  return `| \`${ep.operation}\` | \`${ep.method}\` | \`${ep.path}\` | ${ep.description || ''} |`;
}

function buildContracts(contracts) {
  const list = contracts.contracts || [];
  if (list.length === 0) {
    return `## 5. API 계약

_(계약이 비어있습니다)_
`;
  }

  const blocks = list
    .map((c) => {
      const header = `### ${c.name} (\`${c.block_id}\`)\n\napi_style: \`${c.api_style}\``;
      if (c.internal) {
        return `${header}\n\n_(internal: 공개 API 없음)_`;
      }
      const eps = c.endpoints || [];
      if (eps.length === 0) {
        return `${header}\n\n_(엔드포인트 없음)_`;
      }
      const tableHeader = '| Operation | Method | Path | 설명 |\n| --- | --- | --- | --- |';
      const rows = eps.map(endpointTableRow).join('\n');
      return `${header}\n\n${tableHeader}\n${rows}`;
    })
    .join('\n\n');

  return `## 5. API 계약

architecture_api_style: \`${contracts.architecture_api_style || '_(미정)_'}\`

${blocks}
`;
}

function buildScenarios(scenariosDoc) {
  const list = scenariosDoc.scenarios || [];
  if (list.length === 0) {
    return `## 6. 테스트 의도

_(시나리오가 비어있습니다)_
`;
  }

  const blocks = list
    .map((b) => {
      const header = `### ${b.name} (\`${b.block_id}\`)`;
      const eps = b.endpoints || [];
      if (eps.length === 0) {
        return `${header}\n\n_(엔드포인트 없음)_`;
      }
      const sections = eps
        .map((ep) => {
          const epHeader = `**\`${ep.operation}\`** \`${ep.method} ${ep.path}\``;
          const scenarios = (ep.scenarios || [])
            .map((s) => `- _Given_: ${s.given}\n- _When_: ${s.when}\n- _Then_: ${s.then}`)
            .join('\n\n');
          return `${epHeader}\n\n${scenarios || '_(시나리오 없음)_'}`;
        })
        .join('\n\n');
      return `${header}\n\n${sections}`;
    })
    .join('\n\n');

  return `## 6. 테스트 의도

${blocks}
`;
}

function buildNextSteps() {
  return `## 7. 다음 단계

이 문서를 다른 개발자나 AI 도우미에게 보여주세요. 위 정보가 코드 작업의 출발점이 됩니다.

답하지 못한 cascade 결정은 다이어리(\`.beoreum/project/diary.md\`)에 같이 남겨두면 좋습니다. 만들면서, 출시 전에, 첫 사용자를 만났을 때, 그 질문이 다시 찾아옵니다.

미래 출시에서 벼름이 직접 코드 스켈레톤을 만들고 검증까지 도울 예정입니다. 지금은 이 문서가 가장 큰 자리입니다.
`;
}

function buildReadme(inputs, now) {
  const createdAt = (now || new Date()).toISOString();
  const what = (inputs.intent.extracted && inputs.intent.extracted.what) || '벼름 프로젝트';
  const header = `# ${what}

이 문서는 벼름의 7단계 중 6단계까지의 의도와 결정을 한 자리에 모은 합성본입니다.

생성 시각: ${createdAt}
`;
  return [
    header,
    buildOverview(inputs.intent),
    buildBlocks(inputs.selected, inputs.contracts),
    buildDecisions(inputs.decisionsDoc),
    buildArchitecture(inputs.architecture),
    buildContracts(inputs.contracts),
    buildScenarios(inputs.scenariosDoc),
    buildNextSteps(),
  ].join('\n');
}

function buildVerifyReport(now) {
  const createdAt = (now || new Date()).toISOString();
  return `# Verify Report

이 자리는 다음 출시에서 채워집니다.

set 단계의 verify(생성된 코드의 컴파일과 테스트 실행)는 실제 코드 생성이 들어와야 의미가 있습니다. 이번 출시는 합성 README 중심이고, 코드 생성과 verify 실행은 미래 ADR로 정합니다.

지금은 다음 단계(inspect)로 그대로 넘어가실 수 있습니다.

생성된 시각: ${createdAt}
`;
}

function advanceState(state, stage) {
  const completed = Array.isArray(state.completed_stages) ? state.completed_stages : [];
  return {
    ...state,
    current_stage: NEXT_STAGE,
    completed_stages: completed.includes(stage) ? completed : [...completed, stage],
  };
}

// runSet은 set 단계의 본체. 6개 입력 파일을 합성 README로 묶고, 지원 언어면 백엔드 코드도 생성.
// 사용자 입력 없는 결정적 변환.
//
// 입력:
//   cwd  - 프로젝트 루트 절대 경로
//   now  - 테스트용 결정적 시각(선택)
//
// 반환: { readmeFile, verifyFile, blockCount, endpointCount, scenarioCount,
//         backendDir, backendFileCount, language, nextStage }
export async function runSet({ cwd, now } = {}) {
  if (!cwd) throw new Error('runSet({ cwd })가 필요합니다');

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  const inputs = loadInputs(beoreumDir);

  const generatedDir = join(beoreumDir, 'project', 'generated');
  mkdirSync(generatedDir, { recursive: true });
  const readmeFile = join(generatedDir, 'README.md');
  const verifyFile = join(beoreumDir, 'project', 'verify-report.md');

  writeFileSync(readmeFile, buildReadme(inputs, now), 'utf8');
  writeFileSync(verifyFile, buildVerifyReport(now), 'utf8');

  // architecture.language에 따라 백엔드 코드 생성. 지원하지 않는 언어는 README만 만들고 끝.
  const language = inputs.architecture.language;
  const generator = BACKEND_GENERATORS[language];
  let backendDir = null;
  let backendFileCount = 0;
  if (generator) {
    const result = generator({ inputs, generatedDir, now });
    backendDir = result.backendDir;
    backendFileCount = result.fileCount;
  }

  // frontend는 ADR 0021 standard(React)로 항상 생성.
  const frontendResult = generateFrontend({ inputs, generatedDir, now });

  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  const contracts = inputs.contracts.contracts || [];
  const scenarios = inputs.scenariosDoc.scenarios || [];
  const blockCount = contracts.length;
  const endpointCount = contracts.reduce(
    (sum, c) => sum + (Array.isArray(c.endpoints) ? c.endpoints.length : 0),
    0,
  );
  const scenarioCount = scenarios.reduce(
    (sum, b) => sum + (b.endpoints || []).reduce((s, ep) => s + (ep.scenarios || []).length, 0),
    0,
  );

  return {
    readmeFile,
    verifyFile,
    blockCount,
    endpointCount,
    scenarioCount,
    backendDir,
    backendFileCount,
    frontendDir: frontendResult.frontendDir,
    frontendFileCount: frontendResult.fileCount,
    language,
    nextStage: NEXT_STAGE,
  };
}
