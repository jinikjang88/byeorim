// AI 어댑터를 통한 schema 채움의 end-to-end 검증. ADR 0023.
// forge → set 흐름에서 contracts.yml schema가 4개 generator(node/java/python/frontend)의
// 실제 필드로 변환되는지 한 자리에서 본다.

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
  runForge,
  runTemper,
  runSet,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-schema-fill-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// adapter를 forge에 주입해 schema가 채워진 상태로 set까지 가는 setup.
async function setupWithSchemaFill(cwd, blockIds, language) {
  const choices = {
    language,
    database: 'postgresql',
    api_style: 'rest',
    architecture_pattern: 'modular-monolith',
  };
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
  await runForge({ cwd, adapter: createMockAdapter() }); // adapter 주입
  await runTemper({ cwd });
  await runSet({ cwd });
}

test('forge가 adapter로 contracts.yml의 schema를 채운다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: () => {},
    });
    await runSmelt({ cwd, blockIds: ['order'] });
    await interactiveShape({
      cwd,
      askArchitecture: async () => ({
        language: 'node',
        database: 'postgresql',
        api_style: 'rest',
        architecture_pattern: 'modular-monolith',
      }),
      confirmArchitecture: async () => 'proceed',
    });
    const result = await runForge({ cwd, adapter: createMockAdapter() });
    assert.equal(result.schemaFilled, true);
    const contracts = yaml.load(readFileSync(result.contractsFile, 'utf8'));
    const order = contracts.contracts.find((c) => c.block_id === 'order');
    const create = order.endpoints.find((e) => e.operation === 'create');
    // mock의 generic placeholder가 들어왔는지
    assert.equal(create.request_schema.type, 'object');
    assert.ok(create.request_schema.properties.name);
    assert.equal(create.response_schema.type, 'object');
    assert.ok(create.response_schema.properties.id);
  });
});

test('forge에 adapter 없으면 schema는 TODO 그대로(기존 동작 보존)', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    await runProspect({
      cwd,
      answers: { what: '쇼핑몰' },
      adapter: createMockAdapter(),
      log: () => {},
    });
    await runSmelt({ cwd, blockIds: ['order'] });
    await interactiveShape({
      cwd,
      askArchitecture: async () => ({
        language: 'node',
        database: 'postgresql',
        api_style: 'rest',
        architecture_pattern: 'modular-monolith',
      }),
      confirmArchitecture: async () => 'proceed',
    });
    const result = await runForge({ cwd }); // adapter 없음
    assert.equal(result.schemaFilled, false);
    const contracts = yaml.load(readFileSync(result.contractsFile, 'utf8'));
    const order = contracts.contracts.find((c) => c.block_id === 'order');
    const create = order.endpoints.find((e) => e.operation === 'create');
    assert.equal(create.request_schema, 'TODO');
    assert.equal(create.response_schema, 'TODO');
  });
});

test('Node schemas.js가 채워진 schema에서 JSON Schema body/response를 emit한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupWithSchemaFill(cwd, ['order'], 'node');
    const schemasPath = join(
      cwd,
      '.beoreum',
      'project',
      'generated',
      'backend',
      'src',
      'features',
      'order',
      'schemas.js',
    );
    const content = readFileSync(schemasPath, 'utf8');
    // create의 body schema에 mock이 채운 properties.name이 들어가야 한다
    assert.match(content, /export const createSchema =/);
    assert.match(content, /"name"/);
    assert.match(content, /"description"/);
    // response schema에는 id가 들어가야 한다
    assert.match(content, /"id"/);
    assert.match(content, /"created_at"/);
  });
});

test('Java DTO record가 채워진 schema에서 record 필드를 emit한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupWithSchemaFill(cwd, ['order'], 'java');
    const controllerPath = join(
      cwd,
      '.beoreum',
      'project',
      'generated',
      'backend',
      'modules',
      'order',
      'src',
      'main',
      'java',
      'com',
      'example',
      'beoreum',
      'order',
      'web',
      'OrderController.java',
    );
    const content = readFileSync(controllerPath, 'utf8');
    // CreateRequest record는 String name, String description 받음
    assert.match(content, /public record CreateRequest\(String name, String description\)/);
    // CreateResponse record는 String id, String created_at 받음
    assert.match(content, /public record CreateResponse\(String id, String created_at\)/);
    // ListResponse는 java.util.List<...> items, Long total
    assert.match(content, /java\.util\.List/);
    assert.match(content, /Long total/);
  });
});

test('Python Pydantic 모델이 채워진 schema에서 필드를 emit한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupWithSchemaFill(cwd, ['order'], 'python');
    const schemasPath = join(
      cwd,
      '.beoreum',
      'project',
      'generated',
      'backend',
      'src',
      'beoreum',
      'features',
      'order',
      'schemas.py',
    );
    const content = readFileSync(schemasPath, 'utf8');
    // CreateRequest 모델 본문: name과 description (optional)
    assert.match(content, /class CreateRequest\(BaseModel\):/);
    assert.match(content, /name: str \| None = None/);
    assert.match(content, /description: str \| None = None/);
    // CreateResponse: id와 created_at은 required
    assert.match(content, /class CreateResponse\(BaseModel\):/);
    assert.match(content, /id: str$/m);
    assert.match(content, /created_at: str$/m);
  });
});

test('Frontend types.ts가 채워진 schema에서 TS interface 필드를 emit한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupWithSchemaFill(cwd, ['order'], 'node');
    const typesPath = join(
      cwd,
      '.beoreum',
      'project',
      'generated',
      'frontend',
      'src',
      'types',
      'order.ts',
    );
    const content = readFileSync(typesPath, 'utf8');
    // CreateRequest: name과 description은 optional
    assert.match(content, /export interface CreateRequest \{/);
    assert.match(content, /name\?: string;/);
    assert.match(content, /description\?: string;/);
    // CreateResponse: id와 created_at은 required(? 없이)
    assert.match(content, /export interface CreateResponse \{/);
    assert.match(content, /id: string;/);
    assert.match(content, /created_at: string;/);
    // ListResponse: items 배열과 total integer
    assert.match(content, /items: Record<string, unknown>\[\];/);
    assert.match(content, /total: number;/);
  });
});

test('internal 블럭은 schema 채움이 안 된다(공개 API 없음)', async () => {
  await withTempCwd(async (cwd) => {
    await setupWithSchemaFill(cwd, ['payment'], 'node'); // pg-integration이 internal로 따라옴
    const contracts = yaml.load(
      readFileSync(join(cwd, '.beoreum', 'project', 'contracts.yml'), 'utf8'),
    );
    const pg = contracts.contracts.find((c) => c.block_id === 'pg-integration');
    assert.equal(pg.internal, true);
    assert.deepEqual(pg.endpoints, []);
  });
});
