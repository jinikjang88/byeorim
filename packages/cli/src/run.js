// byeorim run. set이 만든 backend + frontend를 한 명령으로 동시 기동한다.
// ADR 0047을 따른다. 단계 독립 명령(answer/status/verify와 같은 결).
// spawnProcess와 fetchHealth는 의존성 주입(ADR 0047 결정 7) — 테스트에서 mock으로.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { defaultSpawnProcess, defaultFetchHealth, pollUntilReady } from './process-helpers.js';

const PYTHON_PACKAGE_FALLBACK = 'byeorim';

// 언어별 backend 명령 표(ADR 0047 결정 7).
// 새 backend 언어가 ADR로 들어오면 이 표만 갱신한다.
function backendCommandFor(language, intent) {
  switch (language) {
    case 'node':
      return {
        cmd: 'npm',
        args: ['run', 'dev'],
        readyUrl: 'http://localhost:3000/health',
        url: 'http://localhost:3000',
      };
    case 'java':
      return {
        cmd: process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
        args: [':app:bootRun'],
        readyUrl: 'http://localhost:8080/health',
        url: 'http://localhost:8080',
      };
    case 'python': {
      const pkg = pythonPackageOf(intent);
      return {
        cmd: 'poetry',
        args: [
          'run',
          'uvicorn',
          `${pkg}.main:app`,
          '--reload',
          '--port',
          '8000',
          '--host',
          '0.0.0.0',
        ],
        readyUrl: 'http://localhost:8000/health',
        url: 'http://localhost:8000',
      };
    }
    default:
      return null;
  }
}

// python.js의 buildProjectPackage 로직을 그대로 옮긴다(ADR 0047 결정 7의 표가 의존).
// 미래에 generators/python.js가 결을 바꾸면 두 곳을 같이 갱신.
function pythonPackageOf(intent) {
  const what = intent && intent.extracted && intent.extracted.what;
  if (typeof what !== 'string' || !what.trim()) return PYTHON_PACKAGE_FALLBACK;
  const ascii = what
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  return ascii || PYTHON_PACKAGE_FALLBACK;
}

// buildRunTargets은 architecture와 target에서 실행할 process spec 배열을 만든다.
// 순수 함수(I/O 없음). 단위 테스트가 직접 검증.
//
// 입력:
//   cwd            - 프로젝트 루트
//   intent         - prospect-intent.yml 객체 (또는 null)
//   architecture   - shape-architecture.yml 객체 (또는 null)
//   target         - 'both' | 'backend' | 'frontend'
//   byeorimDirOverride - 테스트용 .byeorim 절대 경로 override(선택)
//
// 반환: Array<{ name, cmd, args, cwd, readyUrl?, url }>
export function buildRunTargets({ cwd, intent, architecture, target = 'both' }) {
  if (!cwd) throw new Error('buildRunTargets({ cwd })가 필요합니다');
  const byeorimDir = join(cwd, '.byeorim');
  const backendDir = join(byeorimDir, 'project', 'generated', 'backend');
  const frontendDir = join(byeorimDir, 'project', 'generated', 'frontend');

  const targets = [];

  const wantBackend = target === 'both' || target === 'backend';
  const wantFrontend = target === 'both' || target === 'frontend';

  if (wantBackend && existsSync(backendDir)) {
    const language = architecture && architecture.language;
    const spec = backendCommandFor(language, intent);
    if (spec) {
      targets.push({
        name: 'backend',
        cmd: spec.cmd,
        args: spec.args,
        cwd: backendDir,
        readyUrl: spec.readyUrl,
        url: spec.url,
      });
    }
  }

  if (wantFrontend && existsSync(frontendDir)) {
    targets.push({
      name: 'frontend',
      cmd: 'npm',
      args: ['run', 'dev'],
      cwd: frontendDir,
      url: 'http://localhost:5173',
    });
  }

  return targets;
}

// spawnProcess, fetchHealth, pollUntilReady는 process-helpers.js로 옮겨졌다(ADR 0048 결정 2).
// run.js와 verify.js가 같은 결로 import.

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function loadYamlSafe(path) {
  if (!existsSync(path)) return null;
  try {
    return yaml.load(readFileSync(path, 'utf8')) || null;
  } catch {
    return null;
  }
}

// runRun은 backend + frontend(또는 한쪽)를 spawn으로 띄우고 readiness를 확인한 뒤
// 한쪽이 종료되거나 signal이 abort될 때까지 살아있는다.
//
// 입력:
//   cwd                - 프로젝트 루트 절대 경로
//   target             - 'both' | 'backend' | 'frontend' (기본 'both')
//   spawnProcess       - 의존성 주입(ADR 0047 결정 7). 기본은 child_process.spawn 래퍼
//   fetchHealth        - 의존성 주입. (url, opts) => Promise<boolean>
//   log                - line => void. 기본은 stdout.write
//   signal             - AbortSignal. Ctrl-C로 abort되면 두 child에 SIGTERM
//   readinessTimeoutMs - readiness 폴링 timeout(기본 60초)
//   readinessIntervalMs - 폴링 간격(기본 1초)
//
// 반환: { targets, firstExit, allExits }
//   targets    - ['backend', 'frontend'] 같이 실행한 대상 이름 배열
//   firstExit  - 가장 먼저 종료된 프로세스 정보 또는 'signal'
//   allExits   - 모든 프로세스의 종료 결과 배열
export async function runRun({
  cwd,
  target = 'both',
  spawnProcess = defaultSpawnProcess,
  fetchHealth = defaultFetchHealth,
  log = (line) => process.stdout.write(line + '\n'),
  signal,
  readinessTimeoutMs = 60000,
  readinessIntervalMs = 1000,
} = {}) {
  if (!cwd) throw new Error('runRun({ cwd })가 필요합니다');
  if (target !== 'both' && target !== 'backend' && target !== 'frontend') {
    throw new Error(
      `target은 'both' | 'backend' | 'frontend' 중 하나여야 합니다(받은 값: ${target})`,
    );
  }

  const byeorimDir = join(cwd, '.byeorim');
  const stateFile = join(byeorimDir, 'state.yml');
  if (!existsSync(stateFile)) {
    throw new Error('.byeorim/state.yml이 없습니다. 먼저 byeorim init을 실행해주세요');
  }

  const intent = loadYamlSafe(join(byeorimDir, 'project', 'prospect-intent.yml'));
  const architecture = loadYamlSafe(join(byeorimDir, 'project', 'shape-architecture.yml'));

  const targets = buildRunTargets({ cwd, intent, architecture, target });

  if (targets.length === 0) {
    throw new Error('실행할 backend/frontend가 없습니다. 먼저 byeorim set을 실행해주세요');
  }

  // 모든 프로세스 spawn. 한 콘솔에 prefix 결합 출력(ADR 0047 결정 2).
  const handles = targets.map((t) => {
    log(`[${t.name}] 시작: ${t.cmd} ${t.args.join(' ')}`);
    return {
      target: t,
      handle: spawnProcess({
        cmd: t.cmd,
        args: t.args,
        cwd: t.cwd,
        onStdout: (line) => log(`[${t.name}] ${line}`),
        onStderr: (line) => log(`[${t.name}] ${line}`),
      }),
    };
  });

  // backend readiness 폴링(ADR 0047 결정 3). frontend는 readyUrl 없음.
  for (const { target: t } of handles) {
    if (!t.readyUrl) continue;
    log(`[${t.name}] readiness 확인 중: ${t.readyUrl}`);
    const ready = await pollUntilReady(t.readyUrl, {
      fetchFn: fetchHealth,
      timeoutMs: readinessTimeoutMs,
      intervalMs: readinessIntervalMs,
      signal,
    });
    if (ready) {
      log(`[${t.name}] ✓ ready: ${t.url}`);
    } else if (signal && signal.aborted) {
      // signal로 끊긴 경우 아래 race에서 처리
      break;
    } else {
      log(
        `[${t.name}] readiness 확인 시간 초과(${Math.round(readinessTimeoutMs / 1000)}초). 그래도 실행을 계속합니다`,
      );
    }
  }

  // 모든 프로세스의 exited Promise를 결합. 어느 쪽이 먼저 끝나면 다른 쪽 정리(ADR 0047 결정 4).
  const exitPromises = handles.map(({ handle, target: t }) =>
    handle.exited.then((result) => ({ name: t.name, ...result })),
  );

  let abortPromise = null;
  if (signal) {
    if (signal.aborted) {
      abortPromise = Promise.resolve({ name: 'signal', code: 130, signal: 'SIGINT' });
    } else {
      abortPromise = new Promise((res) => {
        signal.addEventListener(
          'abort',
          () => res({ name: 'signal', code: 130, signal: 'SIGINT' }),
          {
            once: true,
          },
        );
      });
    }
  }

  const racePromises = abortPromise ? [...exitPromises, abortPromise] : exitPromises;
  const firstExit = await Promise.race(racePromises);

  if (firstExit.name === 'signal') {
    log(`[run] 종료 신호를 받았습니다. 두 프로세스를 정리합니다`);
  } else {
    log(`[${firstExit.name}] 종료(코드 ${firstExit.code}). 다른 프로세스도 정리합니다`);
  }

  // 모든 child에 SIGTERM. 이미 종료된 child는 무시(ADR 0047 결정 5).
  for (const { handle } of handles) {
    handle.kill('SIGTERM');
  }

  // 모든 child가 종료될 때까지 기다린다. cleanup timeout은 5초(ADR 0047 결정 5).
  const cleanupTimeoutMs = 5000;
  const allExitsPromise = Promise.all(exitPromises);
  const cleanupTimerPromise = sleep(cleanupTimeoutMs).then(() => 'timeout');
  const cleanupResult = await Promise.race([allExitsPromise, cleanupTimerPromise]);

  if (cleanupResult === 'timeout') {
    log(`[run] cleanup 시간 초과(${cleanupTimeoutMs / 1000}초). SIGKILL로 강제 종료`);
    for (const { handle } of handles) {
      handle.kill('SIGKILL');
    }
    await allExitsPromise;
  }

  const allExits = await allExitsPromise;

  return {
    targets: targets.map((t) => t.name),
    firstExit,
    allExits,
  };
}
