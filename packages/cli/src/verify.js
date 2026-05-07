// beoreum verify. 생성된 backend/frontend의 컴파일과 테스트를 실행하고 리포트를 만든다.
// ADR 0022(install + test)와 ADR 0048(--smoke 플래그로 server up → /health → kill)을 따른다.
// 단계 독립 명령(answer/status와 같은 결).
// runCommand는 의존성 주입(ADR 0022 결정 7), spawnProcess/fetchHealth는 ADR 0048 결정 6으로 주입.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import yaml from 'js-yaml';
import { defaultSpawnProcess, defaultFetchHealth, pollUntilReady } from './process-helpers.js';
import { buildRunTargets } from './run.js';

const REPORT_LAST_N_LINES = 40;
const SMOKE_TIMEOUT_DEFAULT_MS = 60000;
const SMOKE_INTERVAL_DEFAULT_MS = 1000;
const SMOKE_CLEANUP_TIMEOUT_MS = 5000;

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

// loadIntent는 architecture와 함께 buildRunTargets에 전달할 intent 객체를 읽는다.
// python의 backend 명령이 intent.extracted.what에서 패키지 이름을 추출(ADR 0047 결정 7).
function loadIntent(beoreumDir) {
  const file = join(beoreumDir, 'project', 'intent.yml');
  if (!existsSync(file)) return null;
  try {
    return yaml.load(readFileSync(file, 'utf8')) || null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// runSmokeTest는 backend를 잠깐 띄워 /health가 응답하는지 본다. ADR 0048.
// run.js의 buildRunTargets로 backend 명령을 가져와 spawnProcess로 띄우고, fetchHealth로 폴링.
// 결과 통과 여부와 verify-report.md 형식 결로 결과 객체를 반환.
//
// 입력:
//   cwd, intent, architecture       - 입력
//   spawnProcess, fetchHealth       - 의존성 주입
//   timeoutMs, intervalMs           - 폴링
//
// 반환: { key, label, cwd, passed, lastCommand, exitCode, output, readyUrl } 또는 null(backend 없음)
async function runSmokeTest({
  cwd,
  intent,
  architecture,
  spawnProcess,
  fetchHealth,
  timeoutMs,
  intervalMs,
}) {
  // backend만 smoke 대상(ADR 0048 결정 3).
  const targets = buildRunTargets({ cwd, intent, architecture, target: 'backend' });
  if (targets.length === 0) return null;
  const t = targets[0];
  const displayCmd = `${t.cmd} ${t.args.join(' ')} → ${t.readyUrl}`;

  let combinedOutput = `$ ${displayCmd}\n`;
  const handle = spawnProcess({
    cmd: t.cmd,
    args: t.args,
    cwd: t.cwd,
    onStdout: (line) => {
      combinedOutput += `${line}\n`;
    },
    onStderr: (line) => {
      combinedOutput += `${line}\n`;
    },
  });

  // /health 폴링
  const ready = await pollUntilReady(t.readyUrl, {
    fetchFn: fetchHealth,
    timeoutMs,
    intervalMs,
  });

  // 서버 정리(SIGTERM, cleanup timeout 후 SIGKILL)
  handle.kill('SIGTERM');
  const cleanupResult = await Promise.race([
    handle.exited,
    sleep(SMOKE_CLEANUP_TIMEOUT_MS).then(() => 'timeout'),
  ]);
  if (cleanupResult === 'timeout') {
    handle.kill('SIGKILL');
    await handle.exited;
  }

  const passed = ready;
  const lastCommand = ready
    ? `${displayCmd} (ready)`
    : `${displayCmd} (시간 초과 ${Math.round(timeoutMs / 1000)}초)`;

  if (!ready) {
    combinedOutput += `\n[smoke] /health 응답 시간 초과(${Math.round(timeoutMs / 1000)}초). 서버가 안 떴거나 healthcheck endpoint가 응답하지 않습니다.\n`;
  } else {
    combinedOutput += `\n[smoke] ✓ /health 응답 확인. 정리 후 종료.\n`;
  }

  return {
    key: `smoke:${architecture && architecture.language}`,
    label: `Backend Smoke (${architecture && architecture.language})`,
    cwd: t.cwd,
    passed,
    lastCommand,
    exitCode: passed ? 0 : 1,
    output: combinedOutput,
    readyUrl: t.readyUrl,
  };
}

function smokeTimeoutFromEnv() {
  const raw = process.env.BEOREUM_VERIFY_SMOKE_TIMEOUT_MS;
  if (!raw) return SMOKE_TIMEOUT_DEFAULT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : SMOKE_TIMEOUT_DEFAULT_MS;
}

// runVerify는 verify 단계의 본체. set이 만든 backend/frontend를 실행해 자기 발로 서는지 본다.
// smoke=true면 install + test 다음에 server up → /health → kill 결을 추가(ADR 0048).
//
// 입력:
//   cwd                  - 프로젝트 루트 절대 경로
//   runCommand           - async ({ cmd, args, cwd }) => { exitCode, stdout, stderr } (ADR 0022)
//   smoke                - true면 backend smoke test 추가(default: false, ADR 0048)
//   spawnProcess         - smoke 전용 의존성 주입. 기본은 process-helpers의 defaultSpawnProcess
//   fetchHealth          - smoke 전용 의존성 주입. (url, opts) => Promise<boolean>
//   smokeTimeoutMs       - smoke /health 폴링 timeout(기본 60초 또는 BEOREUM_VERIFY_SMOKE_TIMEOUT_MS)
//   smokeIntervalMs      - smoke 폴링 간격(기본 1초)
//   now                  - 테스트용 결정적 시각(선택)
//
// 반환: {
//   reportFile, targets, passedCount, failedCount, allPassed
// }
export async function runVerify({
  cwd,
  runCommand = defaultRunCommand,
  smoke = false,
  spawnProcess = defaultSpawnProcess,
  fetchHealth = defaultFetchHealth,
  smokeTimeoutMs,
  smokeIntervalMs = SMOKE_INTERVAL_DEFAULT_MS,
  now,
} = {}) {
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

  // ADR 0048: --smoke 플래그가 있으면 backend smoke test 추가.
  if (smoke) {
    const intent = loadIntent(beoreumDir);
    const smokeResult = await runSmokeTest({
      cwd,
      intent,
      architecture,
      spawnProcess,
      fetchHealth,
      timeoutMs: smokeTimeoutMs ?? smokeTimeoutFromEnv(),
      intervalMs: smokeIntervalMs,
    });
    if (smokeResult) results.push(smokeResult);
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
