// runStatus 단위 테스트. 단계 독립 명령어, 부작용 없음(read-only).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runInit,
  runProspect,
  runSmelt,
  interactiveAnswer,
  interactiveShape,
  runForge,
  runTemper,
  runSet,
  runInspect,
  runStatus,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-status-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const REST_CHOICES = {
  language: 'node',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

test('init 안 된 빈 디렉토리는 initialized=false를 돌려준다', () => {
  const cwd = makeTempCwd();
  try {
    const status = runStatus({ cwd });
    assert.equal(status.initialized, false);
    assert.equal(status.beoreumDir, join(cwd, '.beoreum'));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('init 직후 status는 prospect를 current로 보여준다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const status = runStatus({ cwd });
    assert.equal(status.initialized, true);
    assert.equal(status.current_stage, 'prospect');
    assert.equal(status.is_done, false);
    assert.equal(status.next_stage, 'prospect');
    assert.deepEqual(status.completed_stages, []);
    // 7단계 모두 등장하고 prospect만 current
    assert.equal(status.stages.length, 7);
    const prospect = status.stages.find((s) => s.id === 'prospect');
    assert.equal(prospect.status, 'current');
    assert.equal(prospect.korean, '탐광');
    const others = status.stages.filter((s) => s.id !== 'prospect');
    for (const s of others) {
      assert.equal(s.status, 'pending');
    }
  });
});

test('일부 단계 완료 후 status가 진행 상황을 정확히 표시한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    await runSmelt({ cwd, blockIds: ['order'] });
    // 이제 shape 단계
    const status = runStatus({ cwd });
    assert.equal(status.current_stage, 'shape');
    assert.deepEqual(status.completed_stages, ['prospect', 'smelt']);
    const stageMap = new Map(status.stages.map((s) => [s.id, s.status]));
    assert.equal(stageMap.get('prospect'), 'completed');
    assert.equal(stageMap.get('smelt'), 'completed');
    assert.equal(stageMap.get('shape'), 'current');
    assert.equal(stageMap.get('forge'), 'pending');
  });
});

test('7단계 끝까지 가면 is_done=true, 모든 단계가 completed', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    await runSmelt({ cwd, blockIds: ['order'] });
    await interactiveShape({ cwd, askArchitecture: async () => REST_CHOICES });
    await runForge({ cwd });
    await runTemper({ cwd });
    await runSet({ cwd });
    await runInspect({ cwd });
    // When
    const status = runStatus({ cwd });
    // Then
    assert.equal(status.is_done, true);
    assert.equal(status.current_stage, 'done');
    assert.equal(status.next_stage, null);
    for (const s of status.stages) {
      assert.equal(s.status, 'completed', `${s.id}이 completed가 아님`);
    }
    assert.equal(status.artifacts.generated_readme, true);
    assert.equal(status.artifacts.inspect_report, true);
  });
});

test('cascade 결정 카운트가 정확히 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    // coupon 카탈로그 데이터에 cascade 두 결정
    await runSmelt({ cwd, blockIds: ['coupon'] });
    let firstCall = true;
    await interactiveAnswer({
      cwd,
      askAnswer: async (decision) => {
        if (firstCall) {
          firstCall = false;
          return decision.options[0];
        }
        return null;
      },
    });
    // When
    const status = runStatus({ cwd });
    // Then
    assert.ok(status.decisions, 'decisions 카운트가 있어야 한다');
    assert.equal(status.decisions.answered, 1);
    assert.ok(status.decisions.total >= 1);
    assert.equal(status.decisions.pending, status.decisions.total - 1);
  });
});

test('산출물 존재 여부가 단계 진행에 따라 정확히 채워진다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // Init만 한 자리: diary는 있고 다른 산출물은 없다
    let status = runStatus({ cwd });
    assert.equal(status.artifacts.diary, true);
    assert.equal(status.artifacts.intent, false);
    assert.equal(status.artifacts.contracts, false);

    // prospect 후
    await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    status = runStatus({ cwd });
    assert.equal(status.artifacts.intent, true);
    assert.equal(status.artifacts.catalog, true);
    assert.equal(status.artifacts.reality_check, true);
    assert.equal(status.artifacts.selected_blocks, false);
  });
});

test('runStatus는 부작용이 없다(파일을 만들지도 state를 바꾸지도 않는다)', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const stateBefore = readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8');
    // status 두 번 호출
    runStatus({ cwd });
    runStatus({ cwd });
    // state.yml이 그대로
    const stateAfter = readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8');
    assert.equal(stateAfter, stateBefore);
    // status 호출이 새 파일을 만들지 않았다
    assert.equal(existsSync(join(cwd, '.beoreum', 'project', 'intent.yml')), false);
    assert.equal(existsSync(join(cwd, '.beoreum', 'project', 'contracts.yml')), false);
  });
});

test('cwd 누락은 한국어로 거부한다', () => {
  assert.throws(() => runStatus({}), /cwd.*필요합니다/);
});

test('손상된 state.yml도 안전하게 처리한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // state.yml을 망가진 YAML로 덮어쓴다
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(cwd, '.beoreum', 'state.yml'), 'broken: "unclosed', 'utf8');
    // status는 throw하지 않고 안전한 기본값으로 돌려준다
    const status = runStatus({ cwd });
    assert.equal(status.initialized, true);
    // 손상된 파일은 빈 객체로 취급되어 current_stage가 null
    assert.equal(status.current_stage, null);
    assert.deepEqual(status.completed_stages, []);
    // 7단계 모두 pending(current 없음, 손상 시)
    for (const s of status.stages) {
      assert.equal(s.status, 'pending');
    }
  });
});
