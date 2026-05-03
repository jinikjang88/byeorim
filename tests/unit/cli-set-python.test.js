// runSet의 Python 백엔드 생성 단위 테스트. ADR 0020을 따른다.

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
  return mkdtempSync(join(tmpdir(), 'beoreum-set-python-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const PYTHON_CHOICES = {
  language: 'python',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

async function setupReadyForSet(cwd, blockIds) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  await runSmelt({ cwd, blockIds });
  await interactiveShape({ cwd, askArchitecture: async () => PYTHON_CHOICES });
  await runForge({ cwd });
  await runTemper({ cwd });
}

function backendPath(cwd, ...rest) {
  return join(cwd, '.beoreum', 'project', 'generated', 'backend', ...rest);
}

// 한국어 입력은 ASCII 변환 후 빈 문자열이라 fallback 'beoreum'이 패키지 이름.
const PROJECT_PACKAGE = 'beoreum';

test('language=python일 때 backend/ Poetry + src layout 트리가 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    const result = await runSet({ cwd });
    assert.equal(result.language, 'python');
    assert.ok(result.backendDir);
    assert.ok(result.backendFileCount >= 6);
    // 루트
    assert.equal(existsSync(backendPath(cwd, 'pyproject.toml')), true);
    assert.equal(existsSync(backendPath(cwd, 'README.md')), true);
    // src/{pkg}/
    assert.equal(existsSync(backendPath(cwd, 'src', PROJECT_PACKAGE, '__init__.py')), true);
    assert.equal(existsSync(backendPath(cwd, 'src', PROJECT_PACKAGE, 'main.py')), true);
    assert.equal(existsSync(backendPath(cwd, 'src', PROJECT_PACKAGE, 'config.py')), true);
    // features/
    assert.equal(
      existsSync(backendPath(cwd, 'src', PROJECT_PACKAGE, 'features', '__init__.py')),
      true,
    );
  });
});

test('각 feature(internal 제외)에 6개 파일(__init__ + 5 layer)이 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['refund']); // refund + payment + cancel-return + pg-integration(internal)
    await runSet({ cwd });
    const featureBase = (snake) => backendPath(cwd, 'src', PROJECT_PACKAGE, 'features', snake);
    for (const [blockId, snake] of [
      ['refund', 'refund'],
      ['payment', 'payment'],
      ['cancel-return', 'cancel_return'],
    ]) {
      assert.equal(existsSync(featureBase(snake)), true, `${blockId} 패키지 디렉토리`);
      for (const file of [
        '__init__.py',
        'domain.py',
        'application.py',
        'infrastructure.py',
        'routes.py',
        'schemas.py',
      ]) {
        assert.equal(
          existsSync(join(featureBase(snake), file)),
          true,
          `${snake}/${file}이 있어야 한다`,
        );
      }
    }
  });
});

test('internal 블럭(pg-integration)은 features에 만들지 않는다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['payment']);
    await runSet({ cwd });
    assert.equal(existsSync(backendPath(cwd, 'src', PROJECT_PACKAGE, 'features', 'payment')), true);
    assert.equal(
      existsSync(backendPath(cwd, 'src', PROJECT_PACKAGE, 'features', 'pg_integration')),
      false,
      'internal 블럭은 features에 들어가면 안 된다',
    );
  });
});

test('하이픈 ID(cancel-return)는 snake_case 패키지(cancel_return)로 변환된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['cancel-return']);
    await runSet({ cwd });
    const dir = backendPath(cwd, 'src', PROJECT_PACKAGE, 'features', 'cancel_return');
    assert.equal(existsSync(dir), true);
    // 클래스 이름은 PascalCase: CancelReturn
    const domain = readFileSync(join(dir, 'domain.py'), 'utf8');
    assert.match(domain, /class CancelReturn/);
    assert.match(domain, /class CancelReturnRepository/);
  });
});

test('main.py가 FastAPI + 보안 미들웨어를 등록한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const main = readFileSync(backendPath(cwd, 'src', PROJECT_PACKAGE, 'main.py'), 'utf8');
    assert.match(main, /from fastapi import FastAPI/);
    assert.match(main, /from secure import Secure/);
    assert.match(main, /CORSMiddleware/);
    assert.match(main, /set_secure_headers/);
    // 라우터 import와 등록
    assert.match(main, /from \.features\.order\.routes import router as order_router/);
    assert.match(main, /app\.include_router\(order_router\)/);
  });
});

test('config.py가 pydantic-settings로 JWT_SECRET을 필수 필드로 둔다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const config = readFileSync(backendPath(cwd, 'src', PROJECT_PACKAGE, 'config.py'), 'utf8');
    assert.match(config, /from pydantic_settings import BaseSettings/);
    // JWT_SECRET이 필수(타입만 표시, default 없음)
    assert.match(config, /JWT_SECRET: str$/m);
    // 자리에서 시작 실패 의도가 주석에 박혀있다
    assert.match(config, /시작 시 즉시 실패/);
  });
});

test('domain.py가 dataclass와 Protocol(인터페이스)을 사용한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const domain = readFileSync(
      backendPath(cwd, 'src', PROJECT_PACKAGE, 'features', 'order', 'domain.py'),
      'utf8',
    );
    assert.match(domain, /from dataclasses import dataclass/);
    assert.match(domain, /from typing import Protocol/);
    assert.match(domain, /@dataclass\(frozen=True\)/);
    assert.match(domain, /class Order:/);
    assert.match(domain, /class OrderRepository\(Protocol\):/);
  });
});

test('routes.py가 FastAPI 라우터와 Depends를 사용한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const routes = readFileSync(
      backendPath(cwd, 'src', PROJECT_PACKAGE, 'features', 'order', 'routes.py'),
      'utf8',
    );
    assert.match(routes, /from fastapi import APIRouter, Depends/);
    assert.match(routes, /router = APIRouter\(prefix="\/order"/);
    // 5개 endpoint(create/list/get/update/delete) HTTP 메서드 매핑
    assert.match(routes, /@router\.post\(""/);
    assert.match(routes, /@router\.get\(""/); // list
    assert.match(routes, /@router\.get\("\/{id}"/); // get
    assert.match(routes, /@router\.put\("\/{id}"/);
    assert.match(routes, /@router\.delete\("\/{id}"/);
    // status_code와 response_model
    assert.match(routes, /status_code=201/);
    assert.match(routes, /response_model=CreateResponse/);
  });
});

test('schemas.py가 Pydantic BaseModel 모델들을 export한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const schemas = readFileSync(
      backendPath(cwd, 'src', PROJECT_PACKAGE, 'features', 'order', 'schemas.py'),
      'utf8',
    );
    assert.match(schemas, /from pydantic import BaseModel/);
    // 5개 endpoint × Request(있는 곳만)/Response 모델
    assert.match(schemas, /class CreateRequest\(BaseModel\)/);
    assert.match(schemas, /class CreateResponse\(BaseModel\)/);
    // delete는 hasBody=false라 Request 없음. Response만
    assert.match(schemas, /class DeleteResponse\(BaseModel\)/);
  });
});

test('pyproject.toml에 보안 의존성이 빠짐없이 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const pyproject = readFileSync(backendPath(cwd, 'pyproject.toml'), 'utf8');
    for (const required of [
      'fastapi',
      'pydantic',
      'pydantic-settings',
      '"python-jose"',
      'passlib',
      'sqlalchemy',
      'structlog',
      'secure',
    ]) {
      assert.ok(pyproject.includes(required), `${required}가 pyproject.toml에 있어야 한다`);
    }
  });
});
