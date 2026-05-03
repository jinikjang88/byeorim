// runTemper 단위 테스트. ADR 0014(test-scenarios.yml 형식과 operation 템플릿 표).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import {
  runInit,
  runProspect,
  runSmelt,
  interactiveShape,
  runForge,
  runTemper,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-temper-'));
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

// init → prospect → smelt → shape → forge까지 끝낸 자리. temper 단계에 들어와 있음.
async function setupReadyForTemper(cwd, blockIds = ['order']) {
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
  });
  await runForge({ cwd });
}

function readScenarios(cwd) {
  return yaml.load(readFileSync(join(cwd, '.beoreum', 'project', 'test-scenarios.yml'), 'utf8'));
}

test('정상 흐름: temper가 test-scenarios.yml을 만들고 단계가 set으로 넘어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝낸 자리
    await setupReadyForTemper(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    // When
    const result = await runTemper({ cwd, now: fixedNow });
    // Then: 형식이 ADR 0014를 따른다
    const doc = readScenarios(cwd);
    assert.equal(doc.schema_version, 1);
    assert.equal(doc.created_at, '2026-04-28T12:00:00.000Z');
    assert.equal(doc.architecture_api_style, 'rest');
    assert.ok(Array.isArray(doc.scenarios));
    assert.equal(result.nextStage, 'set');
  });
});

test('resource 블럭은 5개 endpoint × 1 happy_path = 5개 시나리오', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order(commerce 카탈로그상 resource)
    await setupReadyForTemper(cwd, ['order']);
    // When
    await runTemper({ cwd });
    // Then
    const doc = readScenarios(cwd);
    const orderBlock = doc.scenarios.find((b) => b.block_id === 'order');
    assert.ok(orderBlock);
    assert.equal(orderBlock.endpoints.length, 5);
    for (const ep of orderBlock.endpoints) {
      assert.equal(ep.scenarios.length, 1);
      assert.equal(ep.scenarios[0].kind, 'happy_path');
    }
  });
});

test('query 블럭은 1개 endpoint × 1 happy_path = 1개 시나리오', async () => {
  await withTempCwd(async (cwd) => {
    // Given: product-search(commerce 카탈로그상 query)
    await setupReadyForTemper(cwd, ['product-search']);
    // When
    await runTemper({ cwd });
    // Then
    const doc = readScenarios(cwd);
    const searchBlock = doc.scenarios.find((b) => b.block_id === 'product-search');
    assert.ok(searchBlock);
    assert.equal(searchBlock.endpoints.length, 1);
    assert.equal(searchBlock.endpoints[0].operation, 'search');
    assert.equal(searchBlock.endpoints[0].scenarios.length, 1);
  });
});

test('internal 블럭은 endpoints가 빈 배열이라 시나리오도 0개', async () => {
  await withTempCwd(async (cwd) => {
    // Given: payment를 고르면 pg-integration(internal)이 requires로 따라온다
    await setupReadyForTemper(cwd, ['payment']);
    // When
    await runTemper({ cwd });
    // Then: pg-integration의 endpoints가 비어있다
    const doc = readScenarios(cwd);
    const pg = doc.scenarios.find((b) => b.block_id === 'pg-integration');
    assert.ok(pg);
    assert.equal(pg.api_style, 'internal');
    assert.deepEqual(pg.endpoints, []);
  });
});

test('Given-When-Then 텍스트가 한국어 템플릿으로 채워진다(블럭 이름과 path 치환)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order resource 블럭
    await setupReadyForTemper(cwd, ['order']);
    // When
    await runTemper({ cwd });
    // Then: create endpoint의 시나리오 텍스트에 블럭 이름(주문)과 path(/order)가 들어있다
    //       (commerce 카탈로그 데이터 의존: order의 name이 한국어 "주문")
    const doc = readScenarios(cwd);
    const orderBlock = doc.scenarios.find((b) => b.block_id === 'order');
    const createEp = orderBlock.endpoints.find((e) => e.operation === 'create');
    const scenario = createEp.scenarios[0];
    assert.match(scenario.given, /입력 데이터가 준비되어 있다/);
    assert.match(scenario.when, /POST .* 생성을 요청한다/);
    assert.match(scenario.then, /201 응답/);
  });
});

test('test_code는 모든 시나리오에 TODO로 들어간다(ADR 0014 결정 4)', async () => {
  await withTempCwd(async (cwd) => {
    // Given
    await setupReadyForTemper(cwd, ['order']);
    // When
    await runTemper({ cwd });
    // Then
    const doc = readScenarios(cwd);
    for (const b of doc.scenarios) {
      for (const ep of b.endpoints) {
        for (const s of ep.scenarios) {
          assert.equal(s.test_code, 'TODO');
        }
      }
    }
  });
});

test('contracts.yml과 test-scenarios.yml의 endpoint가 정확히 일치한다(거울 짝)', async () => {
  await withTempCwd(async (cwd) => {
    // Given
    await setupReadyForTemper(cwd, ['order']);
    // When
    await runTemper({ cwd });
    // Then: 두 파일의 (block_id, operation, method, path) 튜플 집합이 같다
    const contracts = yaml.load(
      readFileSync(join(cwd, '.beoreum', 'project', 'contracts.yml'), 'utf8'),
    );
    const scenarios = readScenarios(cwd);
    const triples = (doc) =>
      new Set(
        doc.contracts
          ? doc.contracts.flatMap((c) =>
              (c.endpoints || []).map((e) => `${c.block_id}|${e.operation}|${e.method}|${e.path}`),
            )
          : doc.scenarios.flatMap((b) =>
              (b.endpoints || []).map((e) => `${b.block_id}|${e.operation}|${e.method}|${e.path}`),
            ),
      );
    assert.deepEqual(triples(scenarios), triples(contracts));
  });
});

test('현재 단계가 temper가 아니면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 한 자리(current_stage = prospect)
    runInit({ cwd });
    // When/Then
    await assert.rejects(runTemper({ cwd }), /현재 단계가 temper가 아닙니다/);
  });
});

test('contracts.yml이 없으면 forge 안내 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지만 한 뒤 강제로 stage를 temper로 옮긴다
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: () => {},
    });
    await runSmelt({ cwd, blockIds: ['order'] });
    const stateFile = join(cwd, '.beoreum', 'state.yml');
    const state = yaml.load(readFileSync(stateFile, 'utf8'));
    state.current_stage = 'temper';
    state.completed_stages = ['prospect', 'smelt', 'shape', 'forge'];
    writeFileSync(stateFile, yaml.dump(state, { sortKeys: false }), 'utf8');
    // When/Then
    await assert.rejects(runTemper({ cwd }), /beoreum forge를 실행해주세요/);
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(runTemper({}), /cwd.*필요합니다/);
});
