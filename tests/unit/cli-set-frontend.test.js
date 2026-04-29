// runSet의 frontend 생성 단위 테스트. ADR 0021을 따른다.

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
  return mkdtempSync(join(tmpdir(), 'beoreum-set-frontend-'));
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

async function setupReadyForSet(cwd, blockIds) {
  runInit({ cwd });
  await runProspect({
    cwd,
    userInput: '쇼핑몰 만들어줘',
    adapter: createMockAdapter(),
  });
  await runSmelt({ cwd, blockIds });
  await interactiveShape({ cwd, askArchitecture: async () => NODE_CHOICES });
  await runForge({ cwd });
  await runTemper({ cwd });
}

function frontendPath(cwd, ...rest) {
  return join(cwd, '.beoreum', 'project', 'generated', 'frontend', ...rest);
}

test('frontend/ 트리가 8개 루트 파일과 함께 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    const result = await runSet({ cwd });
    assert.ok(result.frontendDir);
    assert.ok(result.frontendFileCount >= 8);
    for (const file of [
      'package.json',
      'vite.config.ts',
      'tsconfig.json',
      'index.html',
      'README.md',
      'src/main.tsx',
      'src/App.tsx',
      'src/router.tsx',
    ]) {
      assert.equal(
        existsSync(frontendPath(cwd, ...file.split('/'))),
        true,
        `${file}이 있어야 한다`,
      );
    }
  });
});

test('각 public feature에 api/types/features 3개 파일이 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['refund']); // refund + payment + cancel-return + pg-integration(internal)
    await runSet({ cwd });
    for (const [blockId, className] of [
      ['refund', 'Refund'],
      ['payment', 'Payment'],
      ['cancel-return', 'CancelReturn'],
    ]) {
      assert.equal(existsSync(frontendPath(cwd, 'src', 'api', `${blockId}.ts`)), true);
      assert.equal(existsSync(frontendPath(cwd, 'src', 'types', `${blockId}.ts`)), true);
      assert.equal(
        existsSync(frontendPath(cwd, 'src', 'features', blockId, `${className}Page.tsx`)),
        true,
      );
    }
  });
});

test('internal 블럭(pg-integration)은 frontend에 만들지 않는다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['payment']);
    await runSet({ cwd });
    assert.equal(existsSync(frontendPath(cwd, 'src', 'api', 'payment.ts')), true);
    assert.equal(
      existsSync(frontendPath(cwd, 'src', 'api', 'pg-integration.ts')),
      false,
      'internal 블럭은 frontend에 들어가면 안 된다',
    );
    assert.equal(existsSync(frontendPath(cwd, 'src', 'features', 'pg-integration')), false);
  });
});

test('package.json에 React + React Router + Vite 의존성이 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const pkg = JSON.parse(readFileSync(frontendPath(cwd, 'package.json'), 'utf8'));
    for (const dep of ['react', 'react-dom', 'react-router-dom']) {
      assert.ok(pkg.dependencies[dep], `${dep}가 dependencies에 있어야 한다`);
    }
    for (const dep of ['vite', '@vitejs/plugin-react', 'typescript', 'vitest']) {
      assert.ok(pkg.devDependencies[dep], `${dep}가 devDependencies에 있어야 한다`);
    }
  });
});

test('tsconfig.json이 strict 모드를 켠다(ADR 0021 결정 3)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const tsconfig = JSON.parse(readFileSync(frontendPath(cwd, 'tsconfig.json'), 'utf8'));
    assert.equal(tsconfig.compilerOptions.strict, true);
    assert.equal(tsconfig.compilerOptions.noUnusedLocals, true);
    assert.equal(tsconfig.compilerOptions.jsx, 'react-jsx');
  });
});

test('index.html에 CSP meta 태그가 들어간다(ADR 0021 결정 8)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const html = readFileSync(frontendPath(cwd, 'index.html'), 'utf8');
    assert.match(html, /<meta\s+http-equiv="Content-Security-Policy"/);
    assert.match(html, /default-src 'self'/);
  });
});

test('api/{feature}.ts가 fetch에 credentials: include를 항상 넣는다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const api = readFileSync(frontendPath(cwd, 'src', 'api', 'order.ts'), 'utf8');
    // 모든 fetch 호출이 credentials: 'include'를 포함
    const fetchCount = (api.match(/await fetch\(/g) || []).length;
    const credentialsCount = (api.match(/credentials: 'include'/g) || []).length;
    assert.ok(fetchCount > 0, 'fetch 호출이 있어야 한다');
    assert.equal(credentialsCount, fetchCount, '모든 fetch가 credentials를 가져야 한다');
  });
});

test('api/{feature}.ts의 함수 이름이 operation 매핑을 따르고 delete는 remove로 매핑된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const api = readFileSync(frontendPath(cwd, 'src', 'api', 'order.ts'), 'utf8');
    // create/list/get/update/search는 그대로
    assert.match(api, /export async function create\(/);
    assert.match(api, /export async function list\(/);
    assert.match(api, /export async function get\(/);
    assert.match(api, /export async function update\(/);
    // delete는 JS 예약어라 remove로 매핑
    assert.match(api, /export async function remove\(/);
    // delete가 함수 이름으로 들어가면 안 된다
    assert.equal(/export async function delete\(/.test(api), false);
  });
});

test('types/{feature}.ts가 endpoint별 Request/Response interface를 export한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const types = readFileSync(frontendPath(cwd, 'src', 'types', 'order.ts'), 'utf8');
    // hasBody operation(create, update)에는 Request도 있음
    assert.match(types, /export interface CreateRequest/);
    assert.match(types, /export interface UpdateRequest/);
    // 모든 operation에 Response
    assert.match(types, /export interface CreateResponse/);
    assert.match(types, /export interface ListResponse/);
    assert.match(types, /export interface GetResponse/);
    assert.match(types, /export interface DeleteResponse/);
  });
});

test('router.tsx가 모든 public feature를 라우트로 등록한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['refund']);
    await runSet({ cwd });
    const router = readFileSync(frontendPath(cwd, 'src', 'router.tsx'), 'utf8');
    // 각 feature의 import + Route 등록
    for (const [blockId, className] of [
      ['refund', 'Refund'],
      ['payment', 'Payment'],
      ['cancel-return', 'CancelReturn'],
    ]) {
      assert.match(
        router,
        new RegExp(`import { ${className}Page } from './features/${blockId}/${className}Page'`),
      );
      assert.match(
        router,
        new RegExp(`<Route path="/${blockId}/\\*" element={<${className}Page />}`),
      );
    }
    // pg-integration은 internal이라 라우트 없음
    assert.equal(router.includes('PgIntegrationPage'), false);
  });
});

test('frontend는 architecture.language와 무관하게 항상 생성된다', async () => {
  await withTempCwd(async (cwd) => {
    // backend 언어가 java여도 frontend는 React 표준으로 만들어짐(ADR 0021)
    runInit({ cwd });
    await runProspect({ cwd, userInput: '쇼핑몰', adapter: createMockAdapter() });
    await runSmelt({ cwd, blockIds: ['order'] });
    await interactiveShape({
      cwd,
      askArchitecture: async () => ({ ...NODE_CHOICES, language: 'java' }),
    });
    await runForge({ cwd });
    await runTemper({ cwd });
    const result = await runSet({ cwd });
    assert.equal(result.language, 'java');
    assert.ok(result.frontendDir, '언어가 java여도 frontend는 만들어져야 한다');
    assert.equal(existsSync(frontendPath(cwd, 'package.json')), true);
  });
});
