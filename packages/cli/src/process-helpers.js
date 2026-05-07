// 프로세스 lifecycle과 healthcheck 폴링 공통 헬퍼. ADR 0048 결정 2(코드 공유).
// run.js와 verify.js가 같은 결로 import.
// spawnProcess: long-running 프로세스를 spawn하고 stdout/stderr를 줄 단위로 콜백에 전달.
// fetchHealth: HTTP healthcheck 한 번 호출(true/false 반환).
// pollUntilReady: fetchHealth를 timeoutMs까지 intervalMs 간격으로 반복.

import { spawn } from 'node:child_process';

// defaultSpawnProcess. child_process.spawn 래퍼로 stdout/stderr를 줄 단위로 onStdout/onStderr에 전달.
// Windows 호환을 위해 shell: true. exited Promise는 close 이벤트에 resolve.
//
// 입력:
//   cmd, args, cwd  - spawn 인자
//   onStdout(line)  - stdout 한 줄 콜백
//   onStderr(line)  - stderr 한 줄 콜백
//
// 반환: { pid, kill(sig?), exited: Promise<{ code, signal }> }
export function defaultSpawnProcess({ cmd, args, cwd, onStdout, onStderr }) {
  const child = spawn(cmd, args, {
    cwd,
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  let stdoutBuf = '';
  let stderrBuf = '';

  function flushBuf(buf, callback) {
    let remaining = buf;
    let idx;
    while ((idx = remaining.indexOf('\n')) >= 0) {
      callback(remaining.slice(0, idx));
      remaining = remaining.slice(idx + 1);
    }
    return remaining;
  }

  child.stdout.on('data', (d) => {
    stdoutBuf = flushBuf(stdoutBuf + d.toString(), onStdout);
  });
  child.stderr.on('data', (d) => {
    stderrBuf = flushBuf(stderrBuf + d.toString(), onStderr);
  });

  let resolveExit;
  const exited = new Promise((res) => {
    resolveExit = res;
  });

  child.on('close', (code, signal) => {
    if (stdoutBuf) onStdout(stdoutBuf);
    if (stderrBuf) onStderr(stderrBuf);
    resolveExit({ code: code ?? -1, signal });
  });

  child.on('error', (err) => {
    onStderr(`프로세스 시작 실패: ${err.message}`);
    resolveExit({ code: -1, signal: null });
  });

  return {
    pid: child.pid,
    kill(sig = 'SIGTERM') {
      try {
        child.kill(sig);
      } catch {
        // 이미 종료된 프로세스에 kill을 시도하면 ESRCH. 무시한다.
      }
    },
    exited,
  };
}

// defaultFetchHealth. fetch + AbortController로 timeout 적용. 에러나 non-200은 false.
export async function defaultFetchHealth(url, { timeoutMs = 1500 } = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// pollUntilReady는 readyUrl을 intervalMs 간격으로 timeoutMs까지 폴링한다.
// fetchFn이 true를 반환하면 즉시 true. signal.aborted면 false 즉시 반환.
//
// 결정성: 테스트가 fetchFn mock으로 N번째 호출에서 true 반환하는 결로 시간 진행을 가짠다.
export async function pollUntilReady(url, { fetchFn, timeoutMs, intervalMs, signal }) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal && signal.aborted) return false;
    if (await fetchFn(url, { timeoutMs: Math.min(intervalMs, 1500) })) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}
