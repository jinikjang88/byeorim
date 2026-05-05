// runVerify 단위 테스트. ADR 0022의 runCommand 의존성 주입으로 외부 프로세스 회피.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runInit,
  runProspect,
  runSmelt,
  interactiveShape,
  runForge,
  runTemper,
  runSet,
  runVerify,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-verify-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const NODE_CHOICES = {
  language: 'node',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

// 한 흐름으로 set까지 가서 backend(node)와 frontend가 둘 다 생성된 상태.
async function setupReadyForVerify(cwd, blockIds = ['order'], choices = NODE_CHOICES) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  await runSmelt({ cwd, blockIds });
  await interactiveShape({
    cwd,
    askArchitecture: async () => choices,
    confirmArchitecture: async () => 'proceed',
  });
  await runForge({ cwd });
  await runTemper({ cwd });
  await runSet({ cwd });
}

// 모든 명령에 성공을 돌려주는 mock.
function makeSuccessRunCommand() {
  const calls = [];
  const runCommand = async ({ cmd, args, cwd }) => {
    calls.push({ cmd, args, cwd });
    return { exitCode: 0, stdout: `mock stdout for ${cmd} ${args.join(' ')}\n`, stderr: '' };
  };
  return { runCommand, calls };
}

test('전체 성공 시 allPassed=true, 보고서가 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForVerify(cwd);
    const { runCommand } = makeSuccessRunCommand();
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    const result = await runVerify({ cwd, runCommand, now: fixedNow });
    assert.equal(result.allPassed, true);
    assert.equal(result.failedCount, 0);
    assert.ok(result.passedCount >= 2); // backend + frontend
    assert.ok(existsSync(result.reportFile));
    const report = readFileSync(result.reportFile, 'utf8');
    assert.match(report, /전체 결과: 2 성공, 0 실패/);
    assert.match(report, /2026-04-28T12:00:00\.000Z/);
  });
});

test('mock runCommand가 backend와 frontend cwd로 정확히 호출된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForVerify(cwd);
    const { runCommand, calls } = makeSuccessRunCommand();
    await runVerify({ cwd, runCommand });
    const backendCwds = new Set(calls.filter((c) => c.cwd.includes('backend')).map((c) => c.cwd));
    const frontendCwds = new Set(calls.filter((c) => c.cwd.includes('frontend')).map((c) => c.cwd));
    assert.equal(backendCwds.size, 1, 'backend cwd가 한 개여야 한다');
    assert.equal(frontendCwds.size, 1, 'frontend cwd가 한 개여야 한다');
    // backend(node)는 npm install + npm test 두 명령
    const backendNpmCalls = calls.filter((c) => c.cwd.includes('backend') && c.cmd === 'npm');
    assert.equal(backendNpmCalls.length, 2);
  });
});

test('backend 실패 시 allPassed=false, exit code가 0이 아니다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForVerify(cwd);
    // npm test에서 실패
    const calls = [];
    const runCommand = async ({ cmd, args, cwd: targetCwd }) => {
      calls.push({ cmd, args, cwd: targetCwd });
      if (targetCwd.includes('backend') && args[0] === 'test') {
        return { exitCode: 1, stdout: 'tests failed\n', stderr: '' };
      }
      return { exitCode: 0, stdout: 'ok\n', stderr: '' };
    };
    const result = await runVerify({ cwd, runCommand });
    assert.equal(result.allPassed, false);
    assert.equal(result.failedCount, 1);
    const backend = result.targets.find((t) => t.key.startsWith('backend'));
    assert.equal(backend.passed, false);
    assert.equal(backend.exitCode, 1);
  });
});

test('frontend 실패도 잡힌다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForVerify(cwd);
    const runCommand = async ({ cwd: targetCwd, args }) => {
      if (targetCwd.includes('frontend') && args[0] === 'run' && args[1] === 'build') {
        return { exitCode: 2, stdout: 'build failed\n', stderr: '' };
      }
      return { exitCode: 0, stdout: 'ok\n', stderr: '' };
    };
    const result = await runVerify({ cwd, runCommand });
    assert.equal(result.allPassed, false);
    const frontend = result.targets.find((t) => t.key === 'frontend');
    assert.equal(frontend.passed, false);
    // npm install 통과 후 npm run build에서 실패. test는 안 돌아감
    assert.equal(frontend.lastCommand, 'npm run build');
  });
});

test('failed 명령 이후의 명령은 실행되지 않는다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForVerify(cwd);
    const calls = [];
    const runCommand = async ({ cmd, args, cwd: targetCwd }) => {
      calls.push({ cmd, args });
      if (targetCwd.includes('backend') && args[0] === 'install') {
        return { exitCode: 1, stdout: '', stderr: 'install failed' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };
    await runVerify({ cwd, runCommand });
    // backend install 실패 후 backend test는 호출되지 않아야 한다.
    // calls 배열을 cwd로 분류해 backend의 호출만 본다.
    const backendCalls = calls.filter((_, i) => i < calls.findIndex((c) => c.args[1] === 'build'));
    // 단순 체크: backend install 다음 호출이 backend test가 아니어야 함
    const installIdx = backendCalls.findIndex((c) => c.args[0] === 'install');
    assert.ok(installIdx >= 0, 'backend install이 호출되어야 한다');
    const nextCall = backendCalls[installIdx + 1];
    if (nextCall) {
      assert.notEqual(nextCall.args[0], 'test', 'install 실패 후 backend test는 호출되면 안 된다');
    }
  });
});

test('보고서에 대상별 섹션과 status/명령/exit code가 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForVerify(cwd);
    const { runCommand } = makeSuccessRunCommand();
    const result = await runVerify({ cwd, runCommand });
    const report = readFileSync(result.reportFile, 'utf8');
    assert.match(report, /## Backend \(node\)/);
    assert.match(report, /## Frontend \(React\)/);
    assert.match(report, /- 상태: 성공/);
    assert.match(report, /- 종료 코드: 0/);
    assert.match(report, /### 마지막 출력/);
    assert.match(report, /```/); // markdown code fence
  });
});

test('출력이 길면 마지막 40줄로 자른다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForVerify(cwd);
    const longOutput = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const runCommand = async () => ({ exitCode: 0, stdout: longOutput, stderr: '' });
    const result = await runVerify({ cwd, runCommand });
    const report = readFileSync(result.reportFile, 'utf8');
    assert.match(report, /앞쪽 줄 생략/);
    // 100번째 줄(line 99)은 들어있어야 한다(마지막 40줄에 포함)
    assert.match(report, /line 99/);
    // 0번째 줄은 잘려서 사라져야 한다
    assert.equal(report.includes('line 0\n'), false);
  });
});

test('set이 안 된 자리는 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // set 안 함
    const { runCommand } = makeSuccessRunCommand();
    await assert.rejects(runVerify({ cwd, runCommand }), /beoreum set을 실행해주세요/);
  });
});

test('init도 안 된 자리는 한국어 메시지로 거부한다', async () => {
  const cwd = makeTempCwd();
  try {
    const { runCommand } = makeSuccessRunCommand();
    await assert.rejects(runVerify({ cwd, runCommand }), /beoreum init을 실행해주세요/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(runVerify({}), /cwd.*필요합니다/);
});
