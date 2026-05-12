// runRun과 buildRunTargets 단위 테스트. ADR 0047을 따른다.
// spawnProcess와 fetchHealth는 의존성 주입(ADR 0047 결정 7)으로 mock.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runRun, buildRunTargets } from '../../packages/cli/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'byeorim-run-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// 한 cwd에 .byeorim/ 트리를 최소한으로 만든다(state.yml + prospect-intent.yml + shape-architecture.yml + generated/{backend,frontend}/).
// generator를 통째로 안 돌려 테스트 속도를 빠르게 유지(ADR 0046이 박은 generator는 별도 단위 테스트가 검증).
function setupByeorim(
  cwd,
  { language = 'node', backend = true, frontend = true, what = '쇼핑몰' } = {},
) {
  const byeorimDir = join(cwd, '.byeorim');
  const projectDir = join(byeorimDir, 'project');
  const generatedDir = join(projectDir, 'generated');
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(
    join(byeorimDir, 'state.yml'),
    yaml.dump({ schema_version: 1, current_stage: 'inspect' }),
    'utf8',
  );
  writeFileSync(
    join(projectDir, 'prospect-intent.yml'),
    yaml.dump({ extracted: { what } }),
    'utf8',
  );
  writeFileSync(
    join(projectDir, 'shape-architecture.yml'),
    yaml.dump({ language, database: 'postgresql', api_style: 'rest' }),
    'utf8',
  );
  if (backend) mkdirSync(join(generatedDir, 'backend'), { recursive: true });
  if (frontend) mkdirSync(join(generatedDir, 'frontend'), { recursive: true });
  return { byeorimDir, generatedDir };
}

// 결정적 mock spawnProcess. 호출 즉시 onStdout으로 한 줄 emit, kill()이 호출되거나
// preExit가 호출되면 exited resolve. 테스트가 lifecycle을 직접 통제.
function createMockSpawn() {
  const spawned = [];
  const spawn = (spec) => {
    let resolveExit;
    const exited = new Promise((res) => {
      resolveExit = res;
    });
    const handle = {
      pid: 1000 + spawned.length,
      killed: false,
      killSignal: null,
      kill(sig = 'SIGTERM') {
        if (handle.killed) return;
        handle.killed = true;
        handle.killSignal = sig;
        resolveExit({ code: null, signal: sig });
      },
      exited,
      // 테스트가 직접 종료를 트리거할 때
      _finishWithCode(code) {
        if (handle.killed) return;
        handle.killed = true;
        resolveExit({ code, signal: null });
      },
    };
    spec.onStdout(`${spec.cmd} ${spec.args.join(' ')} 시작 시뮬레이션`);
    spawned.push({ spec, handle });
    return handle;
  };
  spawn.spawned = spawned;
  return spawn;
}

// fetchHealth mock: N번째 호출에서 true를 반환. nReadyAt=1이면 첫 호출에서 ready.
function createMockFetch(nReadyAt = 1) {
  let count = 0;
  const fn = async () => {
    count += 1;
    return count >= nReadyAt;
  };
  fn.callCount = () => count;
  return fn;
}

// ── buildRunTargets ─────────────────────────────────────

test('buildRunTargets: target=both이고 둘 다 있으면 backend + frontend 두 자리 반환', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const targets = buildRunTargets({
      cwd,
      intent: { extracted: { what: '쇼핑몰' } },
      architecture: { language: 'node' },
      target: 'both',
    });
    assert.equal(targets.length, 2);
    assert.equal(targets[0].name, 'backend');
    assert.equal(targets[1].name, 'frontend');
    assert.equal(targets[0].cmd, 'npm');
    assert.deepEqual(targets[0].args, ['run', 'dev']);
    assert.equal(targets[0].readyUrl, 'http://localhost:3000/health');
    assert.equal(targets[0].url, 'http://localhost:3000');
    assert.equal(targets[1].cmd, 'npm');
    assert.deepEqual(targets[1].args, ['run', 'dev']);
    assert.equal(targets[1].readyUrl, undefined);
    assert.equal(targets[1].url, 'http://localhost:5173');
  });
});

test('buildRunTargets: language=java면 ./gradlew :app:bootRun, port 8080', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'java' });
    const targets = buildRunTargets({
      cwd,
      intent: {},
      architecture: { language: 'java' },
      target: 'both',
    });
    const backend = targets.find((t) => t.name === 'backend');
    assert.ok(backend);
    assert.match(backend.cmd, /gradlew/);
    assert.deepEqual(backend.args, [':app:bootRun']);
    assert.equal(backend.readyUrl, 'http://localhost:8080/health');
  });
});

test('buildRunTargets: language=python이면 poetry run uvicorn {pkg}.main:app, port 8000', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'python', what: '도서관' });
    const targets = buildRunTargets({
      cwd,
      intent: { extracted: { what: '도서관' } },
      architecture: { language: 'python' },
      target: 'both',
    });
    const backend = targets.find((t) => t.name === 'backend');
    assert.ok(backend);
    assert.equal(backend.cmd, 'poetry');
    assert.ok(backend.args.includes('uvicorn'));
    // 한국어 what은 fallback으로 'byeorim' 패키지가 됨(ASCII만 허용)
    assert.ok(backend.args.find((a) => a.endsWith('.main:app')));
    assert.equal(backend.readyUrl, 'http://localhost:8000/health');
  });
});

test('buildRunTargets: target=backend면 frontend는 빠진다', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const targets = buildRunTargets({
      cwd,
      intent: {},
      architecture: { language: 'node' },
      target: 'backend',
    });
    assert.equal(targets.length, 1);
    assert.equal(targets[0].name, 'backend');
  });
});

test('buildRunTargets: target=frontend면 backend는 빠진다', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const targets = buildRunTargets({
      cwd,
      intent: {},
      architecture: { language: 'node' },
      target: 'frontend',
    });
    assert.equal(targets.length, 1);
    assert.equal(targets[0].name, 'frontend');
  });
});

test('buildRunTargets: backend 디렉토리가 없으면 backend 자리 빠진다', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node', backend: false });
    const targets = buildRunTargets({
      cwd,
      intent: {},
      architecture: { language: 'node' },
      target: 'both',
    });
    assert.equal(targets.length, 1);
    assert.equal(targets[0].name, 'frontend');
  });
});

test('buildRunTargets: 알 수 없는 language는 backend 빠진다', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'kotlin' });
    const targets = buildRunTargets({
      cwd,
      intent: {},
      architecture: { language: 'kotlin' },
      target: 'both',
    });
    // backend가 빠지고 frontend만
    assert.equal(targets.length, 1);
    assert.equal(targets[0].name, 'frontend');
  });
});

// ── runRun ──────────────────────────────────────────────

test('runRun: target=both면 backend와 frontend 둘 다 spawn 호출', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const spawnProcess = createMockSpawn();
    const fetchHealth = createMockFetch(1);
    const logs = [];
    const ac = new AbortController();

    const runPromise = runRun({
      cwd,
      target: 'both',
      spawnProcess,
      fetchHealth,
      log: (line) => logs.push(line),
      signal: ac.signal,
      readinessTimeoutMs: 1000,
      readinessIntervalMs: 10,
    });

    // 두 프로세스 spawn 직후 abort로 종료 트리거
    setTimeout(() => ac.abort(), 50);
    const result = await runPromise;

    assert.equal(spawnProcess.spawned.length, 2);
    assert.equal(spawnProcess.spawned[0].spec.cmd, 'npm');
    assert.equal(spawnProcess.spawned[1].spec.cmd, 'npm');
    assert.equal(result.targets.length, 2);
    assert.deepEqual(result.targets, ['backend', 'frontend']);
    // signal로 종료된 결
    assert.equal(result.firstExit.name, 'signal');
    // 두 child 모두 kill 호출됨
    assert.ok(spawnProcess.spawned[0].handle.killed);
    assert.ok(spawnProcess.spawned[1].handle.killed);
  });
});

test('runRun: backend의 /health가 응답하면 ready 안내 출력', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const spawnProcess = createMockSpawn();
    const fetchHealth = createMockFetch(2); // 두 번째 호출에 ready
    const logs = [];
    const ac = new AbortController();

    const runPromise = runRun({
      cwd,
      target: 'both',
      spawnProcess,
      fetchHealth,
      log: (line) => logs.push(line),
      signal: ac.signal,
      readinessTimeoutMs: 5000,
      readinessIntervalMs: 10,
    });

    setTimeout(() => ac.abort(), 100);
    await runPromise;

    // ready 안내가 한 줄에 박힘
    const readyLine = logs.find((l) => l.includes('✓ ready'));
    assert.ok(readyLine, 'ready 안내가 출력되어야 한다');
    assert.match(readyLine, /http:\/\/localhost:3000/);
  });
});

test('runRun: readiness timeout이면 한국어 안내 후 진행 계속', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const spawnProcess = createMockSpawn();
    // 절대 ready 안 됨
    const fetchHealth = async () => false;
    const logs = [];
    const ac = new AbortController();

    const runPromise = runRun({
      cwd,
      target: 'both',
      spawnProcess,
      fetchHealth,
      log: (line) => logs.push(line),
      signal: ac.signal,
      readinessTimeoutMs: 50,
      readinessIntervalMs: 10,
    });

    setTimeout(() => ac.abort(), 200);
    await runPromise;

    const timeoutLine = logs.find((l) => l.includes('readiness 확인 시간 초과'));
    assert.ok(timeoutLine, 'timeout 안내가 출력되어야 한다');
  });
});

test('runRun: 한쪽 프로세스가 종료되면 다른 쪽도 정리(fail-fast)', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const spawnProcess = createMockSpawn();
    const fetchHealth = createMockFetch(1);
    const logs = [];

    const runPromise = runRun({
      cwd,
      target: 'both',
      spawnProcess,
      fetchHealth,
      log: (line) => logs.push(line),
      readinessTimeoutMs: 1000,
      readinessIntervalMs: 10,
    });

    // backend가 먼저 종료(코드 0)
    setTimeout(() => {
      spawnProcess.spawned[0].handle._finishWithCode(0);
    }, 100);

    const result = await runPromise;

    // 가장 먼저 종료된 자리가 backend
    assert.equal(result.firstExit.name, 'backend');
    // frontend도 cleanup으로 kill
    assert.ok(spawnProcess.spawned[1].handle.killed);
    // 안내 메시지
    const exitLine = logs.find((l) => l.includes('종료'));
    assert.ok(exitLine);
  });
});

test('runRun: target=backend면 frontend는 spawn하지 않는다', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const spawnProcess = createMockSpawn();
    const fetchHealth = createMockFetch(1);
    const ac = new AbortController();

    const runPromise = runRun({
      cwd,
      target: 'backend',
      spawnProcess,
      fetchHealth,
      log: () => {},
      signal: ac.signal,
      readinessTimeoutMs: 1000,
      readinessIntervalMs: 10,
    });

    setTimeout(() => ac.abort(), 50);
    const result = await runPromise;

    assert.equal(spawnProcess.spawned.length, 1);
    assert.equal(spawnProcess.spawned[0].spec.cmd, 'npm');
    assert.deepEqual(spawnProcess.spawned[0].spec.args, ['run', 'dev']);
    assert.deepEqual(result.targets, ['backend']);
  });
});

test('runRun: target=frontend면 backend는 spawn하지 않는다', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const spawnProcess = createMockSpawn();
    const fetchHealth = createMockFetch(1);
    const ac = new AbortController();

    const runPromise = runRun({
      cwd,
      target: 'frontend',
      spawnProcess,
      fetchHealth,
      log: () => {},
      signal: ac.signal,
      readinessTimeoutMs: 1000,
      readinessIntervalMs: 10,
    });

    setTimeout(() => ac.abort(), 50);
    const result = await runPromise;

    assert.equal(spawnProcess.spawned.length, 1);
    assert.deepEqual(result.targets, ['frontend']);
    // frontend는 readyUrl이 없어 fetchHealth 호출 안 됨
    assert.equal(fetchHealth.callCount(), 0);
  });
});

test('runRun: state.yml이 없으면 명확한 한국어 에러', async () => {
  await withTempCwd(async (cwd) => {
    // .byeorim 자체가 없는 결
    await assert.rejects(
      runRun({
        cwd,
        spawnProcess: createMockSpawn(),
        fetchHealth: async () => true,
        log: () => {},
      }),
      /byeorim init/,
    );
  });
});

test('runRun: 실행할 backend/frontend가 없으면 한국어 에러', async () => {
  await withTempCwd(async (cwd) => {
    // generated가 비어있음
    setupByeorim(cwd, { language: 'node', backend: false, frontend: false });
    await assert.rejects(
      runRun({
        cwd,
        spawnProcess: createMockSpawn(),
        fetchHealth: async () => true,
        log: () => {},
      }),
      /byeorim set/,
    );
  });
});

test('runRun: target이 잘못된 값이면 한국어 에러', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    await assert.rejects(
      runRun({
        cwd,
        target: 'invalid',
        spawnProcess: createMockSpawn(),
        fetchHealth: async () => true,
        log: () => {},
      }),
      /target/,
    );
  });
});

test('runRun: 출력이 [backend]/[frontend] prefix로 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    const spawnProcess = createMockSpawn();
    const fetchHealth = createMockFetch(1);
    const logs = [];
    const ac = new AbortController();

    const runPromise = runRun({
      cwd,
      target: 'both',
      spawnProcess,
      fetchHealth,
      log: (line) => logs.push(line),
      signal: ac.signal,
      readinessTimeoutMs: 1000,
      readinessIntervalMs: 10,
    });

    setTimeout(() => ac.abort(), 50);
    await runPromise;

    // 두 prefix가 모두 박힘
    assert.ok(logs.some((l) => l.startsWith('[backend]')));
    assert.ok(logs.some((l) => l.startsWith('[frontend]')));
  });
});
