// runForge 단위 테스트. ADR 0013(forge 책임과 contracts.yml 형식).

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
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'byeorim-forge-'));
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

// init → prospect → smelt(blockIds) → shape(api_style)까지 끝낸 자리. forge 단계에 들어와 있음.
async function setupReadyForForge(cwd, blockIds = ['order'], apiStyle = 'rest') {
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
    askArchitecture: async () => ({ ...REST_CHOICES, api_style: apiStyle }),
    confirmArchitecture: async () => 'proceed',
  });
}

function readContracts(cwd) {
  return yaml.load(readFileSync(join(cwd, '.byeorim', 'project', 'contracts.yml'), 'utf8'));
}

test('정상 흐름: forge가 contracts.yml을 만들고 단계가 temper로 넘어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: shape까지 끝낸 자리
    await setupReadyForForge(cwd);
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    // When
    const result = await runForge({ cwd, now: fixedNow });
    // Then: contracts.yml 형식이 ADR 0013을 따른다
    const doc = readContracts(cwd);
    assert.equal(doc.schema_version, 1);
    assert.equal(doc.created_at, '2026-04-28T12:00:00.000Z');
    assert.equal(doc.architecture_api_style, 'rest');
    assert.ok(Array.isArray(doc.contracts));
    assert.equal(result.nextStage, 'temper');
  });
});

test('resource 블럭은 CRUD 5개 endpoint로 풀린다(ADR 0013 결정 3)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order(commerce 카탈로그상 resource)로 smelt
    await setupReadyForForge(cwd, ['order']);
    // When
    await runForge({ cwd });
    // Then: order의 contract에 5개 endpoint, 메서드 셋이 모두 들어있다
    const doc = readContracts(cwd);
    const orderContract = doc.contracts.find((c) => c.block_id === 'order');
    assert.ok(orderContract, 'order contract가 있어야 한다');
    assert.equal(orderContract.api_style, 'resource');
    assert.equal(orderContract.endpoints.length, 5);
    const methods = new Set(orderContract.endpoints.map((e) => e.method));
    assert.deepEqual(methods, new Set(['POST', 'GET', 'PUT', 'DELETE']));
    const operations = new Set(orderContract.endpoints.map((e) => e.operation));
    assert.deepEqual(operations, new Set(['create', 'list', 'get', 'update', 'delete']));
  });
});

test('endpoint마다 request_schema와 response_schema가 TODO로 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: shape까지 끝낸 자리
    await setupReadyForForge(cwd, ['order']);
    // When
    await runForge({ cwd });
    // Then: 모든 endpoint의 두 스키마 자리가 TODO
    const doc = readContracts(cwd);
    for (const c of doc.contracts) {
      for (const ep of c.endpoints) {
        assert.equal(ep.request_schema, 'TODO');
        assert.equal(ep.response_schema, 'TODO');
      }
    }
  });
});

test('query 블럭은 검색 endpoint 한 개로 풀린다(ADR 0013 결정 3)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: product-search(commerce 카탈로그상 query)로 smelt
    await setupReadyForForge(cwd, ['product-search']);
    // When
    await runForge({ cwd });
    // Then: product-search의 contract에 search endpoint 한 개
    const doc = readContracts(cwd);
    const searchContract = doc.contracts.find((c) => c.block_id === 'product-search');
    assert.ok(searchContract);
    assert.equal(searchContract.api_style, 'query');
    assert.equal(searchContract.endpoints.length, 1);
    assert.equal(searchContract.endpoints[0].operation, 'search');
    assert.equal(searchContract.endpoints[0].method, 'GET');
  });
});

test('internal 블럭은 endpoints가 빈 배열이고 internal=true 마커가 붙는다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: pg-integration(commerce 카탈로그상 internal). payment를 고르면 requires로 따라온다
    await setupReadyForForge(cwd, ['payment']);
    // When
    await runForge({ cwd });
    // Then
    const doc = readContracts(cwd);
    const pg = doc.contracts.find((c) => c.block_id === 'pg-integration');
    assert.ok(pg, 'pg-integration이 auto_added로 들어와야 한다');
    assert.equal(pg.api_style, 'internal');
    assert.equal(pg.internal, true);
    assert.deepEqual(pg.endpoints, []);
  });
});

test('selected와 auto_added가 모두 contracts에 들어간다(ADR 0013 결정 5)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: refund(requires로 payment, cancel-return을 끌어온다)
    await setupReadyForForge(cwd, ['refund']);
    // When
    await runForge({ cwd });
    // Then: refund + payment + cancel-return + pg-integration이 모두 들어간다
    const doc = readContracts(cwd);
    const ids = new Set(doc.contracts.map((c) => c.block_id));
    assert.equal(ids.has('refund'), true);
    assert.equal(ids.has('payment'), true);
    assert.equal(ids.has('cancel-return'), true);
    assert.equal(ids.has('pg-integration'), true);
  });
});

test('선택된 블럭이 자동 추가된 블럭보다 contracts 앞에 온다(ADR 0013 결정 5 순서)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: refund 한 개 선택. selected=[refund], auto_added=[payment, cancel-return, pg-integration]
    await setupReadyForForge(cwd, ['refund']);
    // When
    await runForge({ cwd });
    // Then: 첫 contract는 refund(selected), 그 뒤가 auto_added
    const doc = readContracts(cwd);
    assert.equal(doc.contracts[0].block_id, 'refund');
  });
});

test('architecture.api_style이 rest가 아니면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: shape에서 graphql을 골랐다고 가정
    await setupReadyForForge(cwd, ['order'], 'graphql');
    // When/Then
    await assert.rejects(runForge({ cwd }), /지금 출시의 forge는 REST만 지원합니다/);
  });
});

test('현재 단계가 forge가 아니면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 한 자리(current_stage = prospect)
    runInit({ cwd });
    // When/Then
    await assert.rejects(runForge({ cwd }), /현재 단계가 forge가 아닙니다/);
  });
});

test('architecture.yml이 없으면 shape 안내 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: smelt까지 끝낸 자리에서 강제로 stage를 forge로 옮긴다
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: () => {},
    });
    await runSmelt({ cwd, blockIds: ['order'] });
    const stateFile = join(cwd, '.byeorim', 'state.yml');
    const state = yaml.load(readFileSync(stateFile, 'utf8'));
    state.current_stage = 'forge';
    state.completed_stages = ['prospect', 'smelt', 'shape'];
    writeFileSync(stateFile, yaml.dump(state, { sortKeys: false }), 'utf8');
    // When/Then
    await assert.rejects(runForge({ cwd }), /byeorim shape를 실행해주세요/);
  });
});

test('cwd 누락은 한국어로 거부한다', async () => {
  await assert.rejects(runForge({}), /cwd.*필요합니다/);
});

// ADR 0041: REST endpoint path 복수형 default.

test('path가 단순 영문 block id에서 복수형으로 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order 블럭(resource)
    await setupReadyForForge(cwd, ['order']);
    // When
    await runForge({ cwd });
    // Then: path가 /orders로 박힘(단수형 /order 아님)
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    const paths = order.endpoints.map((e) => e.path);
    assert.ok(
      paths.includes('/orders'),
      `paths에 /orders가 있어야 한다. 실제: ${JSON.stringify(paths)}`,
    );
    assert.ok(paths.includes('/orders/{id}'), `paths에 /orders/{id}가 있어야 한다`);
    // 단수형이 박히면 안 됨
    assert.ok(!paths.includes('/order'));
  });
});

test('path가 하이픈 복합어에서 마지막 단어만 복수화된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: cancel-return(resource) — "return"이 마지막 단어
    await setupReadyForForge(cwd, ['cancel-return']);
    // When
    await runForge({ cwd });
    // Then: /cancel-returns (마지막 return만 복수화. 첫 cancel은 그대로)
    const cancelReturn = readContracts(cwd).contracts.find((c) => c.block_id === 'cancel-return');
    const paths = cancelReturn.endpoints.map((e) => e.path);
    assert.ok(paths.includes('/cancel-returns'));
    assert.ok(paths.includes('/cancel-returns/{id}'));
  });
});

test('path가 불규칙 명사도 올바르게 복수화한다(history → histories)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order-history(commerce 카탈로그상 resource)
    await setupReadyForForge(cwd, ['order-history']);
    // When
    await runForge({ cwd });
    // Then: /order-histories (history → histories 불규칙)
    const oh = readContracts(cwd).contracts.find((c) => c.block_id === 'order-history');
    const paths = oh.endpoints.map((e) => e.path);
    assert.ok(
      paths.some((p) => p === '/order-histories' || p === '/order-histories/{id}'),
      `paths에 /order-histories 자리가 있어야 한다. 실제: ${JSON.stringify(paths)}`,
    );
  });
});

test('path가 query 블럭도 복수형(product-search → product-searches)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: product-search(query)
    await setupReadyForForge(cwd, ['product-search']);
    // When
    await runForge({ cwd });
    // Then: query 블럭의 한 endpoint도 /product-searches
    const ps = readContracts(cwd).contracts.find((c) => c.block_id === 'product-search');
    assert.equal(ps.endpoints.length, 1);
    assert.equal(ps.endpoints[0].path, '/product-searches');
  });
});

// ADR 0042: block.path 옵셔널 override.

test('block.path가 있으면 자동 복수화 대신 그 path를 쓴다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order 블럭(resource). 카탈로그에 path: /custom-orders 박음
    await setupReadyForForge(cwd, ['order']);
    const catalogFile = join(cwd, '.byeorim', 'project', 'catalog', 'catalog.yml');
    const catalog = yaml.load(readFileSync(catalogFile, 'utf8'));
    const orderBlock = catalog.blocks.find((b) => b.id === 'order');
    orderBlock.path = '/custom-orders';
    writeFileSync(catalogFile, yaml.dump(catalog, { sortKeys: false }), 'utf8');
    // When
    await runForge({ cwd });
    // Then: 5개 endpoint 모두 /custom-orders 또는 /custom-orders/{id}
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    const paths = order.endpoints.map((e) => e.path);
    assert.ok(paths.includes('/custom-orders'));
    assert.ok(paths.includes('/custom-orders/{id}'));
    // 자동 복수화 결과(/orders)는 안 박힘
    assert.ok(!paths.includes('/orders'));
  });
});

test('block.path가 query 블럭에도 적용된다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: product-search(query)에 path: /products/search 박음
    await setupReadyForForge(cwd, ['product-search']);
    const catalogFile = join(cwd, '.byeorim', 'project', 'catalog', 'catalog.yml');
    const catalog = yaml.load(readFileSync(catalogFile, 'utf8'));
    const psBlock = catalog.blocks.find((b) => b.id === 'product-search');
    psBlock.path = '/products/search';
    writeFileSync(catalogFile, yaml.dump(catalog, { sortKeys: false }), 'utf8');
    // When
    await runForge({ cwd });
    // Then
    const ps = readContracts(cwd).contracts.find((c) => c.block_id === 'product-search');
    assert.equal(ps.endpoints[0].path, '/products/search');
  });
});

// ADR 0044: singleton api_style.

test('singleton 블럭은 GET/PATCH/DELETE 3개 endpoint로 풀린다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order 블럭의 api_style을 singleton으로 강제 + path: /me 박음
    await setupReadyForForge(cwd, ['order']);
    const catalogFile = join(cwd, '.byeorim', 'project', 'catalog', 'catalog.yml');
    const catalog = yaml.load(readFileSync(catalogFile, 'utf8'));
    const orderBlock = catalog.blocks.find((b) => b.id === 'order');
    orderBlock.api_style = 'singleton';
    orderBlock.path = '/me';
    writeFileSync(catalogFile, yaml.dump(catalog, { sortKeys: false }), 'utf8');
    // When
    await runForge({ cwd });
    // Then: 3개 endpoint(GET/PATCH/DELETE) 모두 /me에 박힘. {id} 자리 없음
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    assert.equal(order.api_style, 'singleton');
    assert.equal(order.endpoints.length, 3);
    const methods = new Set(order.endpoints.map((e) => e.method));
    assert.deepEqual(methods, new Set(['GET', 'PATCH', 'DELETE']));
    for (const ep of order.endpoints) {
      assert.equal(ep.path, '/me', `${ep.method} 가 /me여야 한다`);
    }
    const operations = new Set(order.endpoints.map((e) => e.operation));
    assert.deepEqual(operations, new Set(['get', 'update', 'delete']));
  });
});

test('singleton 블럭에 block.path 없으면 단수형(/account)으로 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForForge(cwd, ['order']);
    const catalogFile = join(cwd, '.byeorim', 'project', 'catalog', 'catalog.yml');
    const catalog = yaml.load(readFileSync(catalogFile, 'utf8'));
    const orderBlock = catalog.blocks.find((b) => b.id === 'order');
    orderBlock.api_style = 'singleton';
    // path 안 박음
    writeFileSync(catalogFile, yaml.dump(catalog, { sortKeys: false }), 'utf8');
    await runForge({ cwd });
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    // 자동 복수화 안 함. /order 단수형 그대로
    for (const ep of order.endpoints) {
      assert.equal(ep.path, '/order');
    }
  });
});

test('block.path가 없는 블럭은 자동 복수화 default로 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order에 path 필드 안 박음(commerce 카탈로그 그대로)
    await setupReadyForForge(cwd, ['order']);
    // When
    await runForge({ cwd });
    // Then: 자동 복수화 default(/orders)
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    const paths = order.endpoints.map((e) => e.path);
    assert.ok(paths.includes('/orders'));
    assert.ok(paths.includes('/orders/{id}'));
  });
});
