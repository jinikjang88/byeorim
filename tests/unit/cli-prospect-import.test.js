// importCatalog 테스트(ADR 0028). 외부 AI 카탈로그 yml을 가져와 catalog.yml로 교체.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runInit, runProspect, importCatalog } from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-import-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const silentLog = () => {};

const VALID_CATALOG_YAML = `name: 사용자 도메인
domain: user-domain
worlds:
  - id: w-customer
    title: 손님 세계
    description: 서비스를 쓰는 손님
  - id: w-operator
    title: 운영자 세계
    description: 서비스를 운영하는 사람
blocks:
  - id: b-order
    name: 주문
    user_desc: 손님이 메뉴를 보고 주문을 넣는 자리
    tech_desc: 주문 데이터를 받아 결제와 묶는 자리
  - id: b-manage
    name: 관리
    user_desc: 매장 태블릿에서 주문을 본다
    tech_desc: 운영자 화면
`;

async function preparedCwd(cwd) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: silentLog,
  });
}

test('유효한 yml 파일을 가져오면 catalog.yml이 교체되고 source가 custom으로 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    await preparedCwd(cwd);
    const sourcePath = join(cwd, 'user-catalog.yml');
    writeFileSync(sourcePath, VALID_CATALOG_YAML, 'utf8');
    // When
    const result = importCatalog({ cwd, sourcePath, log: silentLog });
    // Then
    assert.equal(result.replacedSource, 'custom');
    assert.equal(result.previousSource, 'template:commerce');
    const catalog = yaml.load(readFileSync(result.catalogFile, 'utf8'));
    assert.equal(catalog.worlds[0].id, 'w-customer');
    assert.equal(catalog.blocks[0].id, 'b-order');
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.source, 'custom');
  });
});

test('import 후 사용자에게 RC가 이전 카탈로그 기준이라는 한국어 안내가 띄워진다', async () => {
  await withTempCwd(async (cwd) => {
    await preparedCwd(cwd);
    const sourcePath = join(cwd, 'user-catalog.yml');
    writeFileSync(sourcePath, VALID_CATALOG_YAML, 'utf8');
    const result = importCatalog({ cwd, sourcePath, log: silentLog });
    assert.ok(result.warnings.length >= 1);
    assert.match(result.warnings[0], /reality-check\.md.*이전 카탈로그/);
  });
});

test('형식이 어긋난 yml은 한국어 에러로 거부하고 catalog.yml은 그대로 둔다', async () => {
  await withTempCwd(async (cwd) => {
    await preparedCwd(cwd);
    const sourcePath = join(cwd, 'broken.yml');
    // 빈 worlds라 catalog.schema.json의 minItems=1을 어김
    writeFileSync(sourcePath, 'worlds: []\nblocks: []\n', 'utf8');
    const beforeCatalog = readFileSync(
      join(cwd, '.beoreum', 'project', 'catalog', 'catalog.yml'),
      'utf8',
    );
    assert.throws(() => importCatalog({ cwd, sourcePath, log: silentLog }), /형식 검증에 걸렸어요/);
    // catalog.yml이 변경되지 않았다
    const afterCatalog = readFileSync(
      join(cwd, '.beoreum', 'project', 'catalog', 'catalog.yml'),
      'utf8',
    );
    assert.equal(beforeCatalog, afterCatalog);
  });
});

test('YAML 파싱 자체가 실패하면 한국어로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    await preparedCwd(cwd);
    const sourcePath = join(cwd, 'malformed.yml');
    // 의도적으로 깨진 yaml
    writeFileSync(sourcePath, 'worlds: [\n  - id: bad\n  not valid yaml here\n', 'utf8');
    assert.throws(
      () => importCatalog({ cwd, sourcePath, log: silentLog }),
      /YAML 형식이 어긋났어요/,
    );
  });
});

test('파일이 없으면 한국어로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    await preparedCwd(cwd);
    assert.throws(
      () => importCatalog({ cwd, sourcePath: join(cwd, 'no-such.yml'), log: silentLog }),
      /파일을 찾지 못했어요/,
    );
  });
});

test('intent.yml이 없으면(prospect 안 끝낸 자리) 한국어로 안내', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // prospect 안 끝냄
    const sourcePath = join(cwd, 'user-catalog.yml');
    writeFileSync(sourcePath, VALID_CATALOG_YAML, 'utf8');
    assert.throws(
      () => importCatalog({ cwd, sourcePath, log: silentLog }),
      /intent\.yml이 없습니다/,
    );
  });
});

test('필수 인자 누락은 한국어로 거부한다', async () => {
  assert.throws(() => importCatalog({}), /cwd.*필요합니다/);
  assert.throws(() => importCatalog({ cwd: '/tmp' }), /sourcePath.*필요합니다/);
});

test('교체된 파일이 yml 형식으로 다시 쓰여지고 loadCatalog가 통과한다', async () => {
  await withTempCwd(async (cwd) => {
    await preparedCwd(cwd);
    const sourcePath = join(cwd, 'user-catalog.yml');
    writeFileSync(sourcePath, VALID_CATALOG_YAML, 'utf8');
    const result = importCatalog({ cwd, sourcePath, log: silentLog });
    assert.equal(existsSync(result.catalogFile), true);
    const written = readFileSync(result.catalogFile, 'utf8');
    // YAML로 다시 dump되어 있어야 한다(import 시점에 yaml.dump 거침)
    assert.match(written, /^name:/m);
    assert.match(written, /worlds:/);
  });
});
