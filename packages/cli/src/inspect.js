// byeorim inspect. 7단계의 마지막. 6영역 다관점 체크리스트와 코드 검수로 inspect-report.md를 만든다.
// ADR 0007, ADR 0016(6영역과 정적 체크리스트), ADR 0003 결정 3(강한 신호),
// ADR 0049(정적 규칙 코드 검수), ADR 0050(AI 검수), ADR 0051(외부 검토 + import-review)를 따른다.
// 사용자 입력 없는 변환 단계라 picker 없음(import-review는 별도 명령).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runAllRules } from './inspect-rules.js';
import { buildInspectReviewPromptMarkdown } from './inspect-prompt.js';

const STAGE = 'inspect';
const DONE_MARKER = 'done';

// 6영역 정의(ADR 0016 결정 1). 영역 추가/제거나 이름 변경은 ADR로 결정한다.
// 각 영역의 questions는 정적 한국어 체크리스트(ADR 0016 결정 2).
const INSPECT_AREAS = [
  {
    title: '보안',
    questions: [
      '사용자 인증과 권한 관리는 어떻게 하시나요? (로그인, 세션, 토큰)',
      '사용자 데이터(개인정보, 결제 정보)는 어떻게 보호하시나요? (암호화, 접근 제어)',
      '입력값 검증과 SQL injection/XSS 방어는 어디에 두시나요?',
      'HTTPS/TLS는 출시 시점부터 적용되시나요?',
    ],
  },
  {
    title: '성능',
    questions: [
      '첫 출시 예상 사용자 수와 동시 접속자 수는 얼마인가요?',
      '가장 자주 호출될 엔드포인트는 무엇이고, 응답 시간 목표는 얼마인가요?',
      '데이터베이스 쿼리 중 N+1 문제가 생길 만한 자리는 없나요?',
      '캐싱이 필요한 자리(상품 목록, 정적 데이터)는 어디인가요?',
    ],
  },
  {
    title: '운영',
    questions: [
      '에러 로그는 어디에 모이고 누가 보시나요?',
      '사용자 문의가 들어오면 어떤 채널로 받으시나요?',
      '데이터 백업 주기와 복구 방법은 정하셨나요?',
      '배포(첫 출시, 이후 업데이트)는 어떻게 하시나요?',
    ],
  },
  {
    title: '확장성',
    questions: [
      '사용자가 10배 늘어나면 가장 먼저 막히는 자리는 어디인가요?',
      '데이터베이스가 커지면 어떻게 대응하시나요? (인덱스, 파티셔닝, 샤딩)',
      '정적 자원(이미지, 동영상)은 어디에 두시나요?',
      '비동기 처리가 필요한 작업은 무엇인가요? (알림, 정산, 배치)',
    ],
  },
  {
    title: '법적 리스크',
    // ADR 0016 결정 3: 영역 머리에 blockquote 경고 인용구.
    // ADR 0003 결정 3의 강한 신호 정신.
    warning:
      '⚠ 이 영역은 출시 직전 강한 신호 자리입니다(ADR 0003 결정 3). 사용자 데이터, 인허가, 미성년자 보호처럼 법령 위반 시 즉각적 손해가 발생하는 자리는 변호사 자문을 받으세요.',
    questions: [
      '사용자 데이터를 처리하시는 사업이라면 개인정보보호법 검토를 받으셨나요?',
      '업종별 인허가가 필요한 사업이라면 신고/등록을 마치셨나요?',
      '미성년자가 사용할 수 있는 서비스라면 보호 장치를 갖추셨나요?',
      '결제, 환불 정책이 전자상거래법에 맞나요?',
      'AI를 사용하는 자리에서 알고리즘 차별 가능성은 없나요?',
    ],
  },
  {
    title: '시장 재검',
    // ADR 0016 결정 4: reality-check.md 경로 명시.
    intro:
      'prospect 단계에서 본 시장을 다시 봅니다. 만들기 시작했을 때와 출시 직전의 시각은 다릅니다.\n\n`.byeorim/project/reality-check.md`를 다시 읽어보세요. 그때와 시장이 달라진 자리가 있나요?',
    questions: [
      '첫 100명의 사용자를 어떻게 모으실 건가요?',
      '6개월 동안 운영비를 지탱할 자금이 있으신가요?',
      '같은 도메인에서 망한 서비스를 다시 한 번 보세요. 그들이 망한 이유와 우리가 다른 점은 무엇인가요?',
      '출시 후 첫 일주일 동안 어떤 신호(가입 수, 매출, 사용자 피드백)를 어떻게 모으실 건가요?',
    ],
  },
];

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

// severity별 prefix 마커. ADR 0049 결정 3.
const SEVERITY_PREFIX = {
  pass: '✓',
  warning: '⚠',
  concern: '✗',
};

// finding의 source prefix. ADR 0050 결정 8 + ADR 0051 결정 5.
// 'static' → '[정적]', 'ai' → '[AI]', 'external' → '[외부 AI]'.
// source 없으면 '[정적]' 폴백(ADR 0049 후행 호환).
const SOURCE_PREFIX = {
  static: '[정적]',
  ai: '[AI]',
  external: '[외부 AI]',
};

// 한 영역에 묶인 finding을 markdown 한 묶음으로 박는다.
// 정적 finding이 0개면 ADR 0050 안내 한 줄(미래 자리 결).
// AI finding과 정적 finding이 섞여 있을 때 출처 prefix로 구분.
function buildFindingsSection(findings) {
  if (findings.length === 0) {
    return '_(코드 검수 결과가 없습니다. claude 어댑터로 inspect를 실행하면 AI 검수가 추가됩니다)_\n';
  }
  return findings
    .map((f) => {
      const sourcePrefix = SOURCE_PREFIX[f.source] || SOURCE_PREFIX.static;
      const severityPrefix = SEVERITY_PREFIX[f.severity] || '·';
      const fileSuffix = f.file ? ` _(${f.file})_` : '';
      return `${sourcePrefix} ${severityPrefix} **${f.title}**${fileSuffix}\n  ${f.detail}`;
    })
    .join('\n\n');
}

function buildAreaSection(area, index, findingsByArea) {
  const lines = [`## ${index}. ${area.title}`, ''];
  if (area.warning) {
    lines.push(`> ${area.warning}`, '');
  }
  if (area.intro) {
    lines.push(area.intro, '');
  }
  // 자기 점검 체크리스트
  for (const q of area.questions) {
    lines.push(`- [ ] ${q}`);
  }
  lines.push('');
  // 코드 검수 (ADR 0049 정적 + ADR 0050 AI)
  lines.push('### 코드 검수');
  lines.push('');
  lines.push(buildFindingsSection(findingsByArea[area.title] || []));
  lines.push('');
  return lines.join('\n');
}

// finding 배열을 area별로 묶는다. ADR 0049 결정 2.
function groupFindingsByArea(findings) {
  const map = {};
  for (const f of findings) {
    if (!map[f.area]) map[f.area] = [];
    map[f.area].push(f);
  }
  return map;
}

// concern severity 결함 수를 센다. ADR 0049 결정 5(머리에 강한 신호 안내).
function countConcerns(findings) {
  return findings.filter((f) => f.severity === 'concern').length;
}

function buildReport(now, findings, aiError) {
  const createdAt = (now || new Date()).toISOString();
  const concernCount = countConcerns(findings);
  const concernNotice =
    concernCount > 0
      ? `\n> ⚠ concern severity의 결함이 ${concernCount}개 발견되었습니다. 출시 직전 자리이므로 각 영역의 코드 검수 섹션을 보고 결정해주세요.\n`
      : '';
  // ADR 0050 결정 6: AI 검수 실패 시 한국어 안내 한 줄.
  const aiErrorNotice = aiError
    ? `\n> AI 검수가 실패했습니다. 정적 검수만 보고합니다(원인: ${aiError}). claude 어댑터 설정(BYEORIM_AI_ADAPTER, ANTHROPIC_API_KEY 또는 ANTHROPIC_BASE_URL)을 확인해주세요.\n`
    : '';
  const header = `# Inspect Report

벼림의 마지막 단계 비춤. 도구를 빛에 비춰 결함을 봅니다. 6영역으로 점검합니다.
${concernNotice}${aiErrorNotice}
생성 시각: ${createdAt}
`;
  const findingsByArea = groupFindingsByArea(findings);
  const sections = INSPECT_AREAS.map((area, i) =>
    buildAreaSection(area, i + 1, findingsByArea),
  ).join('\n');
  const closing = `## 마무리

이 체크리스트는 자동으로 채워지지 않습니다. 답하지 못한 질문은 다이어리(\`.byeorim/project/diary.md\`)에 같이 남겨두세요. 만들면서, 출시 전에, 첫 사용자를 만났을 때, 그 질문이 다시 찾아옵니다.

코드 검수 섹션은 set이 만든 코드를 정적 규칙으로 비춘 결과입니다. concern severity는 출시 전에 풀어주세요. warning은 검토 후 결정.

7단계 흐름이 끝났습니다. 합성 README(\`.byeorim/project/generated/README.md\`)를 보면서 다음 일을 정해주세요.
`;
  return `${header}\n${sections}\n${closing}`;
}

// inspect는 7단계의 마지막. completed_stages에 inspect를 추가하고 current_stage는 'done' marker로.
// ADR 0016 결정 5.
function advanceState(state, stage) {
  const completed = Array.isArray(state.completed_stages) ? state.completed_stages : [];
  return {
    ...state,
    current_stage: DONE_MARKER,
    completed_stages: completed.includes(stage) ? completed : [...completed, stage],
  };
}

function loadArchitectureSafe(byeorimDir) {
  const archFile = join(byeorimDir, 'project', 'architecture.yml');
  if (!existsSync(archFile)) return null;
  try {
    return yaml.load(readFileSync(archFile, 'utf8')) || null;
  } catch {
    return null;
  }
}

function loadYamlSafe(path) {
  if (!existsSync(path)) return null;
  try {
    return yaml.load(readFileSync(path, 'utf8')) || null;
  } catch {
    return null;
  }
}

function readSafe(path) {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// 한 디렉토리의 첫 하위 디렉토리 이름. ADR 0050 결정 2의 features 첫 sample 결.
function firstSubdir(path) {
  if (!existsSync(path)) return null;
  try {
    // dynamic import 없이 readdirSync 결로 풀어쓴다(이미 readFileSync 결과 같은 결).
    const dirs = readdirSync(path, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    return dirs.length > 0 ? dirs[0] : null;
  } catch {
    return null;
  }
}

// buildInspectInput은 ADR 0050 결정 2의 균형 파일 범위를 모은다.
// backend 엔트리 + features 첫 sample + frontend 엔트리 + 메타데이터.
//
// 입력:
//   byeorimDir, architecture
//
// 반환: { language, files, intent, architecture, contracts, scenarios }
function buildInspectInput({ byeorimDir, architecture }) {
  const projectDir = join(byeorimDir, 'project');
  const generatedDir = join(projectDir, 'generated');
  const language = architecture && architecture.language;
  const files = {};

  // backend 엔트리 + features 첫 sample
  const backendDir = join(generatedDir, 'backend');
  if (language === 'node' && existsSync(backendDir)) {
    const srcDir = join(backendDir, 'src');
    addFileIfPresent(files, 'src/server.js', join(srcDir, 'server.js'));
    addFileIfPresent(files, 'package.json', join(backendDir, 'package.json'));
    addFileIfPresent(files, '.env.production', join(backendDir, '.env.production'));
    const featuresDir = join(srcDir, 'features');
    const first = firstSubdir(featuresDir);
    if (first) {
      const fdir = join(featuresDir, first);
      for (const name of ['routes.js', 'service.js', 'schemas.js', 'repository.js', 'domain.js']) {
        addFileIfPresent(files, `src/features/${first}/${name}`, join(fdir, name));
      }
    }
  } else if (language === 'java' && existsSync(backendDir)) {
    const groupPath = join(backendDir, 'app', 'src', 'main', 'java', 'com', 'example');
    const pkg = firstSubdir(groupPath);
    if (pkg) {
      const javaDir = join(groupPath, pkg);
      addFileIfPresent(files, `app/.../${pkg}/Application.java`, join(javaDir, 'Application.java'));
      addFileIfPresent(
        files,
        `app/.../${pkg}/HealthController.java`,
        join(javaDir, 'HealthController.java'),
      );
      addFileIfPresent(
        files,
        `app/.../${pkg}/config/EnvSecretsValidator.java`,
        join(javaDir, 'config', 'EnvSecretsValidator.java'),
      );
    }
    addFileIfPresent(
      files,
      'app/src/main/resources/application.yml',
      join(backendDir, 'app', 'src', 'main', 'resources', 'application.yml'),
    );
    addFileIfPresent(
      files,
      'app/src/main/resources/application-production.yml',
      join(backendDir, 'app', 'src', 'main', 'resources', 'application-production.yml'),
    );
    // 첫 feature 모듈 sample
    const modulesDir = join(backendDir, 'modules');
    const firstModule = firstSubdir(modulesDir);
    if (firstModule && pkg) {
      const featurePath = join(
        modulesDir,
        firstModule,
        'src',
        'main',
        'java',
        'com',
        'example',
        pkg,
      );
      const fpkg = firstSubdir(featurePath);
      if (fpkg) {
        const fbase = join(featurePath, fpkg);
        for (const layer of ['domain', 'application', 'infrastructure', 'web']) {
          const ldir = join(fbase, layer);
          if (existsSync(ldir)) {
            try {
              for (const f of readdirSync(ldir)) {
                if (f.endsWith('.java')) {
                  addFileIfPresent(files, `modules/${firstModule}/${layer}/${f}`, join(ldir, f));
                }
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }
  } else if (language === 'python' && existsSync(backendDir)) {
    const srcDir = join(backendDir, 'src');
    const pkg = firstSubdir(srcDir);
    if (pkg) {
      const pkgDir = join(srcDir, pkg);
      addFileIfPresent(files, `src/${pkg}/main.py`, join(pkgDir, 'main.py'));
      addFileIfPresent(files, `src/${pkg}/config.py`, join(pkgDir, 'config.py'));
      const featuresDir = join(pkgDir, 'features');
      const firstFeature = firstSubdir(featuresDir);
      if (firstFeature) {
        const fdir = join(featuresDir, firstFeature);
        for (const name of [
          'routes.py',
          'application.py',
          'schemas.py',
          'infrastructure.py',
          'domain.py',
        ]) {
          addFileIfPresent(files, `src/${pkg}/features/${firstFeature}/${name}`, join(fdir, name));
        }
      }
    }
    addFileIfPresent(files, 'pyproject.toml', join(backendDir, 'pyproject.toml'));
    addFileIfPresent(files, '.env.production', join(backendDir, '.env.production'));
  }

  // frontend 엔트리 + 첫 feature
  const frontendDir = join(generatedDir, 'frontend');
  if (existsSync(frontendDir)) {
    addFileIfPresent(files, 'frontend/vite.config.ts', join(frontendDir, 'vite.config.ts'));
    addFileIfPresent(files, 'frontend/index.html', join(frontendDir, 'index.html'));
    addFileIfPresent(files, 'frontend/.env.production', join(frontendDir, '.env.production'));
    addFileIfPresent(files, 'frontend/src/main.tsx', join(frontendDir, 'src', 'main.tsx'));
    addFileIfPresent(files, 'frontend/src/App.tsx', join(frontendDir, 'src', 'App.tsx'));
    const apiDir = join(frontendDir, 'src', 'api');
    if (existsSync(apiDir)) {
      try {
        const apiFiles = readdirSync(apiDir).filter((f) => f.endsWith('.ts'));
        if (apiFiles.length > 0) {
          addFileIfPresent(files, `frontend/src/api/${apiFiles[0]}`, join(apiDir, apiFiles[0]));
        }
      } catch {
        // ignore
      }
    }
  }

  return {
    language: language || null,
    files,
    intent: loadYamlSafe(join(projectDir, 'intent.yml')) || {},
    architecture: architecture || {},
    contracts: loadYamlSafe(join(projectDir, 'contracts.yml')) || {},
    scenarios: loadYamlSafe(join(projectDir, 'test-scenarios.yml')) || {},
  };
}

function addFileIfPresent(files, key, path) {
  const content = readSafe(path);
  if (content !== null) files[key] = content;
}

// inspect-findings.yml 결. ADR 0051 결정 5의 단일 진실 소스.
// findings: { static: [...], ai: [...], external: [...] }
function loadInspectFindingsFile(findingsFile) {
  if (!existsSync(findingsFile)) return null;
  try {
    return yaml.load(readFileSync(findingsFile, 'utf8'));
  } catch {
    return null;
  }
}

// 기존 yml에서 external 섹션만 보존해 가져온다. 없으면 빈 배열.
function loadExternalFindings(findingsFile) {
  const doc = loadInspectFindingsFile(findingsFile);
  if (!doc || !doc.findings) return [];
  const ext = doc.findings.external;
  return Array.isArray(ext) ? ext.map((f) => ({ ...f, source: 'external' })) : [];
}

// inspect-findings.yml 박기. ADR 0051 결정 5.
function writeInspectFindingsFile({
  findingsFile,
  now,
  staticFindings,
  aiFindings,
  externalFindings,
}) {
  const doc = {
    schema_version: 1,
    generated_at: (now || new Date()).toISOString(),
    findings: {
      static: staticFindings.map(stripSource),
      ai: aiFindings.map(stripSource),
      external: externalFindings.map(stripSource),
    },
  };
  writeFileSync(findingsFile, yaml.dump(doc, { sortKeys: false }), 'utf8');
  return doc;
}

// yml에 박힐 때 source 필드는 빼고 박는다(섹션 자체가 출처라 중복).
function stripSource(f) {
  const { source: _source, ...rest } = f;
  return rest;
}

// yml에서 finding을 읽어올 때 source를 채운다.
function annotateSource(findings, source) {
  return (findings || []).map((f) => ({ ...f, source }));
}

// runInspect는 7단계의 마지막 단계의 본체.
// 자기 점검 체크리스트(ADR 0016) + 정적 규칙 코드 검수(ADR 0049) + AI 검수(ADR 0050) + 보존된 외부 검토(ADR 0051)를 합쳐
// inspect-findings.yml(단일 진실 소스)에 저장하고 inspect-report.md를 derive,
// inspect-review-prompt.md(외부 검토 부산물)를 박고 state.yml을 'done'으로 갱신한다.
//
// 입력:
//   cwd      - 프로젝트 루트 절대 경로
//   now      - 테스트용 결정적 시각(선택)
//   adapter  - AI 어댑터(선택, ADR 0050 결정 5). adapter.inspectCode가 있으면 호출
//
// 반환: {
//   reportFile, findingsFile, promptFile,
//   areaCount, questionCount, findingCount,
//   staticFindingCount, aiFindingCount, externalFindingCount,
//   concernCount, aiCalled, aiFailed, aiError, isDone
// }
export async function runInspect({ cwd, now, adapter } = {}) {
  if (!cwd) throw new Error('runInspect({ cwd })가 필요합니다');

  const byeorimDir = join(cwd, '.byeorim');
  const projectDir = join(byeorimDir, 'project');
  const stateFile = join(byeorimDir, 'state.yml');
  const reportFile = join(projectDir, 'inspect-report.md');
  const findingsFile = join(projectDir, 'inspect-findings.yml');
  const promptsDir = join(projectDir, 'prompts');
  const promptFile = join(promptsDir, 'inspect-review-prompt.md');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  // ADR 0049: 정적 규칙으로 코드 검수
  const architecture = loadArchitectureSafe(byeorimDir);
  const staticFindings = runAllRules({ cwd, architecture });

  // ADR 0050: AI 어댑터로 nuanced 검수(옵셔널). graceful degrade.
  let aiFindings = [];
  let aiCalled = false;
  let aiFailed = false;
  let aiError = null;
  if (adapter && typeof adapter.inspectCode === 'function') {
    aiCalled = true;
    try {
      const input = buildInspectInput({ byeorimDir, architecture });
      aiFindings = await adapter.inspectCode(input);
      aiFindings = (aiFindings || []).map((f) => ({ source: 'ai', ...f }));
    } catch (err) {
      aiFailed = true;
      aiError = err && err.message ? err.message : String(err);
      aiFindings = [];
    }
  }

  // ADR 0051 결정 5: 기존 yml의 external 섹션을 보존해서 합친다.
  const externalFindings = loadExternalFindings(findingsFile);

  // 단일 진실 소스 yml에 저장(static + ai 갱신, external 보존)
  writeInspectFindingsFile({
    findingsFile,
    now,
    staticFindings,
    aiFindings,
    externalFindings,
  });

  // inspect-report.md는 yml에서 derive
  const findings = [...staticFindings, ...aiFindings, ...externalFindings];
  writeFileSync(reportFile, buildReport(now, findings, aiError), 'utf8');

  // ADR 0051: 외부 검토 프롬프트 부산물
  mkdirSync(promptsDir, { recursive: true });
  const input = buildInspectInput({ byeorimDir, architecture });
  writeFileSync(promptFile, buildInspectReviewPromptMarkdown(input), 'utf8');

  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  const questionCount = INSPECT_AREAS.reduce((sum, a) => sum + a.questions.length, 0);

  return {
    reportFile,
    findingsFile,
    promptFile,
    areaCount: INSPECT_AREAS.length,
    questionCount,
    findingCount: findings.length,
    staticFindingCount: staticFindings.length,
    aiFindingCount: aiFindings.length,
    externalFindingCount: externalFindings.length,
    concernCount: countConcerns(findings),
    aiCalled,
    aiFailed,
    aiError,
    isDone: true,
  };
}

// rebuildInspectReport는 inspect-findings.yml에서 inspect-report.md를 다시 만든다.
// import-review가 yml만 갱신한 뒤 호출하는 결.
// state는 안 건드리고 report만 갱신.
export function rebuildInspectReport({ cwd, now } = {}) {
  if (!cwd) throw new Error('rebuildInspectReport({ cwd })가 필요합니다');
  const byeorimDir = join(cwd, '.byeorim');
  const findingsFile = join(byeorimDir, 'project', 'inspect-findings.yml');
  const reportFile = join(byeorimDir, 'project', 'inspect-report.md');
  const doc = loadInspectFindingsFile(findingsFile);
  if (!doc || !doc.findings) {
    throw new Error(
      'inspect-findings.yml이 없거나 비어있습니다. 먼저 byeorim inspect를 실행해주세요',
    );
  }
  const staticF = annotateSource(doc.findings.static, 'static');
  const aiF = annotateSource(doc.findings.ai, 'ai');
  const extF = annotateSource(doc.findings.external, 'external');
  const findings = [...staticF, ...aiF, ...extF];
  writeFileSync(reportFile, buildReport(now, findings, null), 'utf8');
  return {
    reportFile,
    findingCount: findings.length,
    staticFindingCount: staticF.length,
    aiFindingCount: aiF.length,
    externalFindingCount: extF.length,
    concernCount: countConcerns(findings),
  };
}
