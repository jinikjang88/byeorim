// runSet의 Node 백엔드 생성 단위 테스트. ADR 0018을 따른다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  return mkdtempSync(join(tmpdir(), 'byeorim-set-node-'));
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
  await interactiveShape({
    cwd,
    askArchitecture: async () => choices,
    confirmArchitecture: async () => 'proceed',
  });
  await runForge({ cwd });
  await runTemper({ cwd });
}

function backendPath(cwd, ...rest) {
  return join(cwd, '.byeorim', 'project', 'generated', 'backend', ...rest);
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
    // forge가 만든 path는 /orders/{id}, Fastify에서는 /orders/:id
    assert.match(routes, /\/orders\/:id/);
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

// ADR 0044: singleton api_style. update가 PATCH로 emit되어야 한다.
async function setupSingletonForSet(cwd) {
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
    askArchitecture: async () => NODE_CHOICES,
    confirmArchitecture: async () => 'proceed',
  });
  // catalog의 order를 singleton + /me로 변환
  const catalogFile = join(cwd, '.byeorim', 'project', 'catalog', 'catalog.yml');
  const catalog = yaml.load(readFileSync(catalogFile, 'utf8'));
  const order = catalog.blocks.find((b) => b.id === 'order');
  order.api_style = 'singleton';
  order.path = '/me';
  writeFileSync(catalogFile, yaml.dump(catalog, { sortKeys: false }), 'utf8');
  await runForge({ cwd });
  await runTemper({ cwd });
}

test('singleton 블럭의 update는 fastify.patch()로 emit된다(PATCH, ADR 0044)', async () => {
  await withTempCwd(async (cwd) => {
    await setupSingletonForSet(cwd);
    await runSet({ cwd });
    const routes = readFileSync(backendPath(cwd, 'src', 'features', 'order', 'routes.js'), 'utf8');
    // PATCH로 매핑(기존 PUT 아님)
    assert.match(routes, /fastify\.patch\(/);
    assert.ok(!/fastify\.put\(/.test(routes), 'PUT은 안 emit되어야 한다');
    // path는 /me 그대로(singleton은 /{id} 자리 없음)
    assert.match(routes, /'\/me'/);
    // 3개 method(GET/PATCH/DELETE) 모두 등장
    assert.match(routes, /fastify\.get\(/);
    assert.match(routes, /fastify\.delete\(/);
  });
});

// ADR 0046: 생성 코드의 로컬 실행 가능성 (healthcheck + env 분리 + prod 가드)
test('server.js에 /health endpoint가 표준으로 박힌다(ADR 0046 결정 1)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const server = readFileSync(backendPath(cwd, 'src', 'server.js'), 'utf8');
    assert.match(server, /app\.get\('\/health'/);
    assert.match(server, /status: 'ok'/);
  });
});

test('.env와 .env.production이 둘 다 자동 생성된다(ADR 0046 결정 2)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    assert.equal(existsSync(backendPath(cwd, '.env')), true, '.env가 자동 생성되어야 한다');
    assert.equal(
      existsSync(backendPath(cwd, '.env.production')),
      true,
      '.env.production이 자동 생성되어야 한다',
    );
    const env = readFileSync(backendPath(cwd, '.env'), 'utf8');
    const envProd = readFileSync(backendPath(cwd, '.env.production'), 'utf8');
    // dev .env는 NODE_ENV=development
    assert.match(env, /NODE_ENV=development/);
    // prod 템플릿은 NODE_ENV=production
    assert.match(envProd, /NODE_ENV=production/);
    // 둘 다 JWT_SECRET이 dev placeholder prefix로 박혀있음
    assert.match(env, /JWT_SECRET=BYEORIM_DEV_PLACEHOLDER_/);
    assert.match(envProd, /JWT_SECRET=BYEORIM_DEV_PLACEHOLDER_/);
    // dev DB는 in-memory SQLite
    assert.match(env, /DATABASE_URL=sqlite::memory:/);
    // prod 템플릿은 DATABASE_URL이 placeholder
    assert.match(envProd, /DATABASE_URL=BYEORIM_DEV_PLACEHOLDER_/);
  });
});

test('.gitignore에 .env, .env.production이 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const gitignore = readFileSync(backendPath(cwd, '.gitignore'), 'utf8');
    assert.match(gitignore, /^\.env$/m);
    assert.match(gitignore, /^\.env\.production$/m);
    assert.match(gitignore, /node_modules/);
  });
});

test('server.js에 prod 모드 placeholder 가드가 박힌다(ADR 0046 결정 4 안전망 2)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const server = readFileSync(backendPath(cwd, 'src', 'server.js'), 'utf8');
    // placeholder prefix 표준 마커
    assert.match(server, /BYEORIM_DEV_PLACEHOLDER_/);
    // prod 모드 검사 함수
    assert.match(server, /ensureProdSecrets/);
    // NODE_ENV=production 분기
    assert.match(server, /NODE_ENV.*production/);
    // 한국어 안내(사용자가 보는 결)
    assert.match(server, /dev placeholder입니다/);
  });
});

test('server.js가 NODE_ENV로 .env/.env.production을 분기 로드한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const server = readFileSync(backendPath(cwd, 'src', 'server.js'), 'utf8');
    // dotenv config({ path }) 패턴
    assert.match(server, /loadDotenv\(\{ path: ENV_FILE \}\)/);
    // 분기 결: production이면 .env.production
    assert.match(server, /\.env\.production/);
  });
});

test('package.json에 dev/start/start:prod 스크립트가 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const pkg = JSON.parse(readFileSync(backendPath(cwd, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts.dev, 'dev 스크립트가 있어야 한다');
    assert.match(pkg.scripts.dev, /node --watch/);
    assert.ok(pkg.scripts.start, 'start 스크립트가 있어야 한다');
    assert.ok(pkg.scripts['start:prod'], 'start:prod 스크립트가 있어야 한다');
    assert.match(pkg.scripts['start:prod'], /NODE_ENV=production/);
  });
});

test('.env가 이미 있으면 set 재실행 시 덮어쓰지 않는다(사용자 prod 값 보호)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const envFile = backendPath(cwd, '.env');
    // 사용자가 .env에 자기 값을 박았다고 가정
    const userValue = '# 사용자가 채운 dev 값\nJWT_SECRET=user-real-secret\n';
    writeFileSync(envFile, userValue, 'utf8');
    // set 다시 실행
    // current_stage가 inspect로 갔을 테니 state를 set으로 되돌린다
    const stateFile = join(cwd, '.byeorim', 'state.yml');
    const state = yaml.load(readFileSync(stateFile, 'utf8'));
    state.current_stage = 'set';
    state.completed_stages = state.completed_stages.filter((s) => s !== 'set');
    writeFileSync(stateFile, yaml.dump(state, { sortKeys: false }), 'utf8');
    await runSet({ cwd });
    // 사용자가 박은 값이 그대로 살아있다
    const env = readFileSync(envFile, 'utf8');
    assert.equal(env, userValue);
  });
});
