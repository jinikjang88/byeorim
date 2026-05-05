// interactiveForge 단위 테스트. ADR 0034(forge 인터랙티브 검토 흐름).
// 검토 화면 표시는 forge-picker-helpers.test.js에서 따로 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import {
  runInit,
  runProspect,
  runSmelt,
  interactiveShape,
  interactiveForge,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-forge-i-'));
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

async function setupReadyForForge(cwd, blockIds = ['order']) {
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
    askArchitecture: async () => REST_CHOICES,
    confirmArchitecture: async () => 'proceed',
  });
}

function readContracts(cwd) {
  return yaml.load(readFileSync(join(cwd, '.beoreum', 'project', 'contracts.yml'), 'utf8'));
}

test('proceed를 누르면 contracts.yml을 쓰고 다음 단계로 advance한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: shape까지 끝낸 자리
    await setupReadyForForge(cwd, ['order']);
    // When
    const result = await interactiveForge({
      cwd,
      adapter: createMockAdapter(),
      confirmContracts: async () => 'proceed',
      log: () => {},
    });
    // Then
    const doc = readContracts(cwd);
    assert.equal(doc.schema_version, 1);
    assert.equal(doc.architecture_api_style, 'rest');
    assert.equal(result.nextStage, 'temper');
    const stateDoc = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    assert.equal(stateDoc.current_stage, 'temper');
  });
});

test('redo를 누르면 contracts를 다시 만들고 두 번째 proceed에서 진행한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: shape까지 끝낸 자리
    await setupReadyForForge(cwd, ['order']);
    let calls = 0;
    // When
    const result = await interactiveForge({
      cwd,
      adapter: createMockAdapter(),
      confirmContracts: async () => {
        calls += 1;
        return calls === 1 ? 'redo' : 'proceed';
      },
      log: () => {},
    });
    // Then: confirmContracts가 두 번 불렸고 결과는 정상
    assert.equal(calls, 2);
    assert.equal(result.nextStage, 'temper');
    assert.ok(readContracts(cwd));
  });
});

test('confirmContracts에 contracts/blockCount/endpointCount/schemaFilled가 전달된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order 한 개 선택. resource라 5개 endpoint
    await setupReadyForForge(cwd, ['order']);
    let captured = null;
    // When
    await interactiveForge({
      cwd,
      adapter: createMockAdapter(),
      confirmContracts: async (args) => {
        captured = args;
        return 'proceed';
      },
      log: () => {},
    });
    // Then
    assert.ok(captured, 'confirmContracts에 인자가 전달되어야 한다');
    assert.ok(Array.isArray(captured.contracts));
    assert.equal(captured.blockCount, captured.contracts.length);
    const total = captured.contracts.reduce(
      (sum, c) => sum + (Array.isArray(c.endpoints) ? c.endpoints.length : 0),
      0,
    );
    assert.equal(captured.endpointCount, total);
    assert.equal(captured.schemaFilled, true);
    assert.ok(captured.adapter);
    assert.equal(captured.adapter.name, 'mock');
    // mock 어댑터는 결정적 어댑터
    assert.equal(captured.adapterIsDeterministic, true);
  });
});

test('adapter가 없으면 schemaFilled=false로 진행하고 안내 한 줄이 출력된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: shape까지 끝낸 자리
    await setupReadyForForge(cwd, ['order']);
    const logs = [];
    let captured = null;
    // When
    await interactiveForge({
      cwd,
      adapter: null,
      confirmContracts: async (args) => {
        captured = args;
        return 'proceed';
      },
      log: (msg) => logs.push(String(msg)),
    });
    // Then: schemaFilled false, 안내 한 줄 노출, 모든 schema가 TODO
    assert.equal(captured.schemaFilled, false);
    assert.ok(
      logs.some((l) => l.includes('schema 자동 채움 없이')),
      '어댑터 없음 안내가 출력되어야 한다',
    );
    const doc = readContracts(cwd);
    for (const c of doc.contracts) {
      for (const ep of c.endpoints) {
        assert.equal(ep.request_schema, 'TODO');
        assert.equal(ep.response_schema, 'TODO');
      }
    }
  });
});

test('adapter가 extractSchema를 구현하지 않으면 schemaFilled=false로 흐른다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: extractSchema 없는 어댑터(다른 메서드만 가짐)
    await setupReadyForForge(cwd, ['order']);
    const partialAdapter = { name: 'partial' };
    let captured = null;
    // When
    await interactiveForge({
      cwd,
      adapter: partialAdapter,
      confirmContracts: async (args) => {
        captured = args;
        return 'proceed';
      },
      log: () => {},
    });
    // Then
    assert.equal(captured.schemaFilled, false);
    assert.equal(captured.adapterIsDeterministic, false);
  });
});

test('redo가 어댑터 호출을 다시 한다(매 루프마다 buildContracts)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: extractSchema 호출 횟수를 세는 어댑터
    await setupReadyForForge(cwd, ['order']);
    let extractCalls = 0;
    let firstRoundEndpointCount = null;
    const countingAdapter = {
      name: 'counting',
      async extractSchema() {
        extractCalls += 1;
        return { request: null, response: { type: 'object' } };
      },
    };
    let confirmCalls = 0;
    // When: redo 한 번, 두 번째에 proceed
    await interactiveForge({
      cwd,
      adapter: countingAdapter,
      confirmContracts: async ({ endpointCount }) => {
        confirmCalls += 1;
        if (confirmCalls === 1) {
          firstRoundEndpointCount = endpointCount;
          return 'redo';
        }
        return 'proceed';
      },
      log: () => {},
    });
    // Then: confirmContracts는 두 번 불렸고 어댑터는 두 라운드만큼 호출됨
    assert.equal(confirmCalls, 2);
    assert.ok(firstRoundEndpointCount > 0, '첫 라운드에 endpoint가 만들어져야 한다');
    // 매 endpoint당 한 번씩 extractSchema. 두 라운드.
    assert.equal(extractCalls, firstRoundEndpointCount * 2);
  });
});

test('현재 단계가 forge가 아니면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 한 자리(current_stage = prospect)
    runInit({ cwd });
    // When/Then
    await assert.rejects(interactiveForge({ cwd, log: () => {} }), /현재 단계가 forge가 아닙니다/);
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(interactiveForge({}), /cwd.*필요합니다/);
});
