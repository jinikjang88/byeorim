// runSet의 Node 백엔드 생성 단위 테스트. ADR 0018을 따른다.

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
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-set-node-'));
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

async function setupReadyForSet(cwd, blockIds, choices = NODE_CHOICES) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  await runSmelt({ cwd, blockIds });
  await interactiveShape({ cwd, askArchitecture: async () => choices });
  await runForge({ cwd });
  await runTemper({ cwd });
}

function backendPath(cwd, ...rest) {
  return join(cwd, '.beoreum', 'project', 'generated', 'backend', ...rest);
}

test('language=node일 때 backend/ 디렉토리와 표준 파일 셋이 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    const result = await runSet({ cwd });
    // 결과 객체에 backendDir과 fileCount
    assert.ok(result.backendDir);
    assert.equal(result.language, 'node');
    assert.ok(result.backendFileCount >= 3); // package.json + README + server.js 최소
    // 파일 존재
    assert.equal(existsSync(backendPath(cwd, 'package.json')), true);
    assert.equal(existsSync(backendPath(cwd, 'README.md')), true);
    assert.equal(existsSync(backendPath(cwd, 'src', 'server.js')), true);
  });
});

test('각 feature(internal 제외)에 5개 표준 파일이 생성된다(ADR 0018 결정 4)', async () => {
  await withTempCwd(async (cwd) => {
    // refund는 requires로 payment, cancel-return을 끌어온다. payment는 pg-integration(internal)을 끌어옴
    await setupReadyForSet(cwd, ['refund']);
    await runSet({ cwd });
    // refund, payment, cancel-return은 features 폴더가 있어야 한다
    for (const blockId of ['refund', 'payment', 'cancel-return']) {
      const featureDir = backendPath(cwd, 'src', 'features', blockId);
      assert.equal(existsSync(featureDir), true, `${blockId} feature 폴더가 있어야 한다`);
      for (const file of ['domain.js', 'service.js', 'repository.js', 'routes.js', 'schemas.js']) {
        assert.equal(existsSync(join(featureDir, file)), true, `${blockId}/${file}이 있어야 한다`);
      }
    }
  });
});

test('internal 블럭(pg-integration)은 features 폴더에 만들지 않는다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['payment']); // pg-integration이 requires로 따라옴
    await runSet({ cwd });
    // payment는 features에 있어야 하고, pg-integration은 없어야 한다
    assert.equal(existsSync(backendPath(cwd, 'src', 'features', 'payment')), true);
    assert.equal(
      existsSync(backendPath(cwd, 'src', 'features', 'pg-integration')),
      false,
      'internal 블럭은 features에 들어가면 안 된다',
    );
  });
});

test('routes.js의 path가 Fastify 형식(:id)으로 변환된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const routes = readFileSync(backendPath(cwd, 'src', 'features', 'order', 'routes.js'), 'utf8');
    // forge가 만든 path는 /order/{id}, Fastify에서는 /order/:id
    assert.match(routes, /\/order\/:id/);
    // 5개 endpoint 메서드(post/get/put/delete)가 모두 등장
    assert.match(routes, /fastify\.post\(/);
    assert.match(routes, /fastify\.get\(/);
    assert.match(routes, /fastify\.put\(/);
    assert.match(routes, /fastify\.delete\(/);
  });
});

test('하이픈 식별자(pg-integration 같은)가 camelCase 함수명으로 변환된다', async () => {
  await withTempCwd(async (cwd) => {
    // payment를 고르면 pg-integration이 requires로 끌려오지만 internal이라 features에 없음.
    // 대신 cancel-return(하이픈 ID)을 고르는 자리로 가자.
    await setupReadyForSet(cwd, ['cancel-return']);
    await runSet({ cwd });
    const routes = readFileSync(
      backendPath(cwd, 'src', 'features', 'cancel-return', 'routes.js'),
      'utf8',
    );
    // 함수명이 cancelReturnRoutes
    assert.match(routes, /export async function cancelReturnRoutes/);
    // 팩토리도 camelCase
    assert.match(routes, /createCancelReturnService/);
    assert.match(routes, /createCancelReturnRepository/);
  });
});

test('server.js가 보안 plugin(helmet, jwt, cors, rate-limit)을 등록한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const server = readFileSync(backendPath(cwd, 'src', 'server.js'), 'utf8');
    assert.match(server, /helmet/);
    assert.match(server, /jwt/);
    assert.match(server, /cors/);
    assert.match(server, /rateLimit/);
    // pino redact가 들어있다
    assert.match(server, /redact:/);
    assert.match(server, /password/);
    // JWT_SECRET 환경 변수 강제
    assert.match(server, /JWT_SECRET 환경 변수가 필요합니다/);
  });
});

test('package.json에 보안 의존성이 빠짐없이 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const pkg = JSON.parse(readFileSync(backendPath(cwd, 'package.json'), 'utf8'));
    const deps = pkg.dependencies;
    for (const required of [
      'fastify',
      '@fastify/helmet',
      '@fastify/jwt',
      '@fastify/cors',
      '@fastify/rate-limit',
      '@fastify/sensible',
      'argon2',
      'dotenv',
    ]) {
      assert.ok(deps[required], `${required}가 dependencies에 있어야 한다`);
    }
  });
});

test('schemas.js에 endpoint별 schema가 모두 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const schemas = readFileSync(
      backendPath(cwd, 'src', 'features', 'order', 'schemas.js'),
      'utf8',
    );
    // order의 5개 endpoint(create, list, get, update, delete) 모두 export
    for (const op of ['create', 'list', 'get', 'update', 'delete']) {
      assert.match(schemas, new RegExp(`export const ${op}Schema`));
    }
  });
});
