// beoreum verify. 생성된 backend/frontend의 컴파일과 테스트를 실행하고 리포트를 만든다.
// ADR 0022를 따른다. 단계 독립 명령어(answer/status와 같은 결).
// runCommand는 의존성 주입(ADR 0022 결정 7) — 테스트에서 mock으로 외부 프로세스 회피.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import yaml from 'js-yaml';

const REPORT_LAST_N_LINES = 40;

// 대상별 실행 명령. ADR 0022 결정 2의 표.
// 새 backend 언어가 ADR로 들어오면 이 표만 갱신한다.
const TARGET_COMMANDS = {
  'backend:node': [
    { display: 'npm install', cmd: 'npm', args: ['install'] },
    { display: 'npm test', cmd: 'npm', args: ['test'] },
  ],
  'backend:java': [
    {
      display: './gradlew build',
      cmd: process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
      args: ['build'],
    },
  ],
  'backend:python': [
    { display: 'poetry install', cmd: 'poetry', args: ['install'] },
    { display: 'poetry run pytest', cmd: 'poetry', args: ['run', 'pytest'] },
  ],
  frontend: [
    { display: 'npm install', cmd: 'npm', args: ['install'] },
    { display: 'npm run build', cmd: 'npm', args: ['run', 'build'] },
    { display: 'npm test', cmd: 'npm', args: ['test'] },
  ],
};

// 기본 runCommand. child_process.spawn 래퍼로 stdout/stderr 캡처와 exit 코드 수집.
// Windows 호환을 위해 shell: true.
function defaultRunCommand({ cmd, args, cwd }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
    child.on('error', (err) => {
      resolve({ exitCode: -1, stdout: '', stderr: err.message });
    });
  });
}

function lastNLines(text, n) {
  if (!text) return '';
  const lines = text.split('\n');
  if (lines.length <= n) return text.trimEnd();
  return ['...(앞쪽 줄 생략)', ...lines.slice(-n)].join('\n').trimEnd();
}

function buildReport(targets, now) {
  const createdAt = (now || new Date()).toISOString();
  const passedCount = targets.filter((t) => t.passed).length;
  const failedCount = targets.length - passedCount;

  const sections = targets
    .map((t) => {
      const status = t.passed ? '성공' : '실패';
      const truncated = lastNLines(t.output, REPORT_LAST_N_LINES);
      return `## ${t.label}

- 상태: ${status}
- 마지막 명령: \`${t.lastCommand}\`
- 종료 코드: ${t.exitCode}
- cwd: \`${t.cwd}\`

### 마지막 출력 (${REPORT_LAST_N_LINES}줄)

\`\`\`
${truncated}
\`\`\`
`;
    })
    .join('\n');

  return `# Verify Report

생성 시각: ${createdAt}
전체 결과: ${passedCount} 성공, ${failedCount} 실패

${sections}`;
}

function loadArchitecture(beoreumDir) {
  const archFile = join(beoreumDir, 'project', 'architecture.yml');
  if (!existsSync(archFile)) return null;
  try {
    return yaml.load(readFileSync(archFile, 'utf8')) || null;
  } catch {
    return null;
  }
}

function buildTargets(beoreumDir, architecture) {
  const targets = [];
  const language = architecture && architecture.language;
  const backendDir = join(beoreumDir, 'project', 'generated', 'backend');
  const frontendDir = join(beoreumDir, 'project', 'generated', 'frontend');

  if (existsSync(backendDir) && language && TARGET_COMMANDS[`backend:${language}`]) {
    targets.push({
      key: `backend:${language}`,
      label: `Backend (${language})`,
      cwd: backendDir,
    });
  }
  if (existsSync(frontendDir) && TARGET_COMMANDS.frontend) {
    targets.push({
      key: 'frontend',
      label: 'Frontend (React)',
      cwd: frontendDir,
    });
  }
  return targets;
}

async function runOneTarget(target, runCommand) {
  const commands = TARGET_COMMANDS[target.key];
  let lastResult = { command: '(none)', exitCode: 0 };
  let combinedOutput = '';
  let passed = true;

  for (const cmd of commands) {
    const result = await runCommand({ cmd: cmd.cmd, args: cmd.args, cwd: target.cwd });
    combinedOutput += `$ ${cmd.display}\n${result.stdout}${result.stderr}\n`;
    lastResult = { command: cmd.display, exitCode: result.exitCode };
    if (result.exitCode !== 0) {
      passed = false;
      break;
    }
  }

  return {
    key: target.key,
    label: target.label,
    cwd: target.cwd,
    passed,
    lastCommand: lastResult.command,
    exitCode: lastResult.exitCode,
    output: combinedOutput,
  };
}

// runVerify는 verify 단계의 본체. set이 만든 backend/frontend를 실행해 자기 발로 서는지 본다.
//
// 입력:
//   cwd          - 프로젝트 루트 절대 경로
//   runCommand   - async ({ cmd, args, cwd }) => { exitCode, stdout, stderr }
//                  기본은 child_process.spawn 래퍼. 테스트는 mock 주입(ADR 0022 결정 7).
//   now          - 테스트용 결정적 시각(선택)
//
// 반환: {
//   reportFile,    - 작성된 verify-report.md 경로
//   targets,       - 대상별 결과 배열
//   passedCount,
//   failedCount,
//   allPassed,
// }
export async function runVerify({ cwd, runCommand = defaultRunCommand, now } = {}) {
  if (!cwd) throw new Error('runVerify({ cwd })가 필요합니다');

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');

  if (!existsSync(stateFile)) {
    throw new Error('.beoreum/state.yml이 없습니다. 먼저 beoreum init을 실행해주세요');
  }

  const architecture = loadArchitecture(beoreumDir);
  const targets = buildTargets(beoreumDir, architecture);

  if (targets.length === 0) {
    throw new Error('생성된 backend/frontend가 없습니다. 먼저 beoreum set을 실행해주세요');
  }

  const results = [];
  for (const target of targets) {
    results.push(await runOneTarget(target, runCommand));
  }

  const reportFile = join(beoreumDir, 'project', 'verify-report.md');
  writeFileSync(reportFile, buildReport(results, now), 'utf8');

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  return {
    reportFile,
    targets: results,
    passedCount,
    failedCount,
    allPassed: failedCount === 0,
  };
}
