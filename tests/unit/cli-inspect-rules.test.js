// inspect-rules.js 단위 테스트. ADR 0049를 따른다.
// 임시 디렉토리에 generated/ 트리를 박고 finding 배열을 직접 단언.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runAllRules } from '../../packages/cli/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'byeorim-inspect-rules-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

// 한 cwd에 .byeorim/ 트리를 최소한으로 박는다(state.yml + shape-architecture.yml + generated/).
function setupByeorim(cwd, { language = 'node' } = {}) {
  const byeorimDir = join(cwd, '.byeorim');
  const projectDir = join(byeorimDir, 'project');
  const generatedDir = join(projectDir, 'generated');
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(
    join(byeorimDir, 'state.yml'),
    yaml.dump({ schema_version: 1, current_stage: 'inspect' }),
    'utf8',
  );
  writeFileSync(
    join(projectDir, 'shape-architecture.yml'),
    yaml.dump({ language, database: 'postgresql', api_style: 'rest' }),
    'utf8',
  );
  return { byeorimDir, generatedDir };
}

// Node backend 트리 minimal 박기. ADR 0046 baseline 패턴 흉내.
function setupNodeBackend(generatedDir, { withGuards = true } = {}) {
  const backendDir = join(generatedDir, 'backend');
  const srcDir = join(backendDir, 'src');
  mkdirSync(srcDir, { recursive: true });
  const serverContent = withGuards
    ? `import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
const ENV_FILE = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
const DEV_PLACEHOLDER_PREFIX = 'BYEORIM_DEV_PLACEHOLDER_';
function ensureProdSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.JWT_SECRET?.startsWith(DEV_PLACEHOLDER_PREFIX)) {
    throw new Error('PROD 모드에서 JWT_SECRET 값이 dev placeholder입니다');
  }
}
ensureProdSecrets();
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET 필요합니다');
const app = Fastify({ logger: { redact: ['password'] } });
app.register(helmet);
app.register(cors);
app.register(rateLimit);
app.get('/health', async () => ({ status: 'ok' }));
`
    : `// 망가진 server.js
import Fastify from 'fastify';
const app = Fastify();
app.listen({ port: 3000 });
`;
  writeFileSync(join(srcDir, 'server.js'), serverContent, 'utf8');
  writeFileSync(join(backendDir, '.env'), 'JWT_SECRET=BYEORIM_DEV_PLACEHOLDER_jwt\n', 'utf8');
  writeFileSync(
    join(backendDir, '.env.production'),
    'JWT_SECRET=BYEORIM_DEV_PLACEHOLDER_jwt\n',
    'utf8',
  );
  writeFileSync(join(backendDir, '.gitignore'), 'node_modules/\n.env\n.env.production\n', 'utf8');
}

// Frontend 트리 minimal 박기.
function setupFrontend(generatedDir, { withGuards = true } = {}) {
  const frontendDir = join(generatedDir, 'frontend');
  mkdirSync(frontendDir, { recursive: true });
  writeFileSync(
    join(frontendDir, 'index.html'),
    withGuards
      ? `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'"></head><body></body></html>`
      : `<!doctype html><html><head></head><body></body></html>`,
    'utf8',
  );
  writeFileSync(
    join(frontendDir, 'vite.config.ts'),
    withGuards
      ? `import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (mode === 'production') {
    for (const [name, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.startsWith('BYEORIM_DEV_PLACEHOLDER_')) {
        throw new Error('PROD 빌드 거부');
      }
    }
  }
  return { plugins: [] };
});
`
      : `import { defineConfig } from 'vite';
export default defineConfig({ plugins: [] });
`,
    'utf8',
  );
  writeFileSync(join(frontendDir, '.env'), 'VITE_API_BASE=http://localhost:3000\n', 'utf8');
  writeFileSync(
    join(frontendDir, '.env.production'),
    'VITE_API_BASE=BYEORIM_DEV_PLACEHOLDER_vite_api_base\n',
    'utf8',
  );
  writeFileSync(join(frontendDir, '.gitignore'), 'node_modules/\n.env\n.env.production\n', 'utf8');
  writeFileSync(
    join(frontendDir, 'package.json'),
    JSON.stringify({ scripts: { dev: 'vite' } }, null, 2),
    'utf8',
  );
}

function findFinding(findings, title) {
  return findings.find((f) => f.title.includes(title));
}

// ── 언어 무관 ─────────────────────────────────────────

test('state.yml이 있으면 운영 영역 pass', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd);
    const findings = runAllRules({ cwd, architecture: { language: 'node' } });
    const f = findFinding(findings, 'state.yml이 존재합니다');
    assert.ok(f);
    assert.equal(f.severity, 'pass');
    assert.equal(f.area, '운영');
  });
});

test('architecture.language가 비어있으면 운영 warning', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd);
    const findings = runAllRules({ cwd, architecture: {} });
    const f = findFinding(findings, 'shape-architecture.yml의 language가 비어있습니다');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
  });
});

// ── Node backend ───────────────────────────────────────

test('Node baseline이 박히면 보안 영역에 pass finding 여러 개', async () => {
  await withTempCwd(async (cwd) => {
    const { generatedDir } = setupByeorim(cwd, { language: 'node' });
    setupNodeBackend(generatedDir, { withGuards: true });
    const findings = runAllRules({ cwd, architecture: { language: 'node' } });
    assert.ok(findFinding(findings, '/health endpoint가 인증 없이 공개됩니다'));
    assert.ok(findFinding(findings, 'JWT_SECRET startup 검사가 박혀 있습니다'));
    assert.ok(findFinding(findings, 'prod placeholder 가드가 박혀 있습니다'));
    assert.ok(findFinding(findings, '보안 plugin이 모두 등록되었습니다'));
    // 모두 pass
    for (const title of [
      '/health endpoint가 인증 없이 공개됩니다',
      'JWT_SECRET startup 검사가 박혀 있습니다',
      'prod placeholder 가드가 박혀 있습니다',
    ]) {
      assert.equal(findFinding(findings, title).severity, 'pass');
    }
  });
});

test('Node baseline이 망가지면 보안 영역에 concern finding', async () => {
  await withTempCwd(async (cwd) => {
    const { generatedDir } = setupByeorim(cwd, { language: 'node' });
    setupNodeBackend(generatedDir, { withGuards: false });
    const findings = runAllRules({ cwd, architecture: { language: 'node' } });
    const concerns = findings.filter((f) => f.severity === 'concern');
    assert.ok(concerns.length > 0, 'concern severity finding이 한 개 이상');
    assert.ok(findFinding(findings, 'JWT_SECRET 검사가 안 보입니다'));
    assert.ok(findFinding(findings, 'prod placeholder 가드가 안 보입니다'));
  });
});

test('Node backend 디렉토리가 없으면 검사 자체를 안 함', async () => {
  await withTempCwd(async (cwd) => {
    setupByeorim(cwd, { language: 'node' });
    // backend 안 만듦
    const findings = runAllRules({ cwd, architecture: { language: 'node' } });
    // server.js 관련 finding이 없어야 한다
    assert.equal(findFinding(findings, 'JWT_SECRET'), undefined);
  });
});

// ── Frontend ───────────────────────────────────────────

test('Frontend baseline이 박히면 CSP meta와 prod 가드가 pass', async () => {
  await withTempCwd(async (cwd) => {
    const { generatedDir } = setupByeorim(cwd, { language: 'node' });
    setupNodeBackend(generatedDir, { withGuards: true });
    setupFrontend(generatedDir, { withGuards: true });
    const findings = runAllRules({ cwd, architecture: { language: 'node' } });
    assert.equal(findFinding(findings, 'index.html에 CSP meta가 박혀 있습니다').severity, 'pass');
    assert.equal(
      findFinding(findings, 'prod build에서 placeholder 가드가 동작합니다').severity,
      'pass',
    );
  });
});

test('Frontend baseline이 빠지면 CSP meta warning과 vite 가드 concern', async () => {
  await withTempCwd(async (cwd) => {
    const { generatedDir } = setupByeorim(cwd, { language: 'node' });
    setupNodeBackend(generatedDir, { withGuards: true });
    setupFrontend(generatedDir, { withGuards: false });
    const findings = runAllRules({ cwd, architecture: { language: 'node' } });
    assert.equal(findFinding(findings, 'index.html에 CSP meta가 안 보입니다').severity, 'warning');
    assert.equal(
      findFinding(findings, 'vite.config의 prod 빌드 가드가 안 보입니다').severity,
      'concern',
    );
  });
});

// ── language별 분기 ────────────────────────────────────

test('language=java면 HealthController 검사가 동작', async () => {
  await withTempCwd(async (cwd) => {
    const { generatedDir } = setupByeorim(cwd, { language: 'java' });
    const backendDir = join(generatedDir, 'backend');
    const javaDir = join(backendDir, 'app', 'src', 'main', 'java', 'com', 'example', 'byeorim');
    const configDir = join(javaDir, 'config');
    const resourcesDir = join(backendDir, 'app', 'src', 'main', 'resources');
    mkdirSync(configDir, { recursive: true });
    mkdirSync(resourcesDir, { recursive: true });
    writeFileSync(
      join(javaDir, 'HealthController.java'),
      `import org.springframework.web.bind.annotation.GetMapping;\n@GetMapping("/health") public Object health() { return null; }`,
      'utf8',
    );
    writeFileSync(
      join(configDir, 'EnvSecretsValidator.java'),
      `@Profile("production") class EnvSecretsValidator {}`,
      'utf8',
    );
    writeFileSync(join(resourcesDir, 'application-production.yml'), 'foo: bar\n', 'utf8');
    writeFileSync(join(backendDir, '.gitignore'), 'application-production.yml\n', 'utf8');
    const findings = runAllRules({ cwd, architecture: { language: 'java' } });
    assert.ok(findFinding(findings, '/health endpoint가 박혀 있습니다'));
    assert.equal(
      findFinding(findings, 'production profile에서 placeholder 가드가 동작합니다').severity,
      'pass',
    );
  });
});

test('language=python이면 main.py와 config.py 검사', async () => {
  await withTempCwd(async (cwd) => {
    const { generatedDir } = setupByeorim(cwd, { language: 'python' });
    const backendDir = join(generatedDir, 'backend');
    const pkgDir = join(backendDir, 'src', 'mybyeorim');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'main.py'),
      `from fastapi import FastAPI\nfrom secure import Secure\napp = FastAPI()\n@app.get("/health")\nasync def health(): return {"status": "ok"}\n`,
      'utf8',
    );
    writeFileSync(
      join(pkgDir, 'config.py'),
      `import os\nDEV_PLACEHOLDER_PREFIX = 'BYEORIM_DEV_PLACEHOLDER_'\n_env_file = '.env.production' if os.environ.get('PYTHON_ENV') == 'production' else '.env'\nclass Settings: pass\n`,
      'utf8',
    );
    writeFileSync(join(backendDir, '.env'), 'JWT=x\n', 'utf8');
    writeFileSync(join(backendDir, '.env.production'), 'JWT=x\n', 'utf8');
    writeFileSync(join(backendDir, '.gitignore'), '.env\n.env.production\n', 'utf8');
    const findings = runAllRules({ cwd, architecture: { language: 'python' } });
    assert.ok(findFinding(findings, '/health endpoint가 박혀 있습니다'));
    assert.equal(
      findFinding(findings, 'PYTHON_ENV=production에서 placeholder 가드가 동작합니다').severity,
      'pass',
    );
    assert.equal(findFinding(findings, 'secure 미들웨어가 등록되었습니다').severity, 'pass');
  });
});

test('finding 객체의 결이 표준 (area/severity/title/detail/file)', async () => {
  await withTempCwd(async (cwd) => {
    const { generatedDir } = setupByeorim(cwd, { language: 'node' });
    setupNodeBackend(generatedDir, { withGuards: true });
    const findings = runAllRules({ cwd, architecture: { language: 'node' } });
    for (const f of findings) {
      assert.ok(['보안', '성능', '운영', '확장성', '법적 리스크', '시장 재검'].includes(f.area));
      assert.ok(['pass', 'warning', 'concern'].includes(f.severity));
      assert.equal(typeof f.title, 'string');
      assert.equal(typeof f.detail, 'string');
      // file은 선택. 있으면 string
      if (f.file !== undefined) assert.equal(typeof f.file, 'string');
    }
  });
});
