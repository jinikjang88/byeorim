// runSet의 Java 백엔드 생성 단위 테스트. ADR 0019를 따른다.

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
  return mkdtempSync(join(tmpdir(), 'byeorim-set-java-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const JAVA_CHOICES = {
  language: 'java',
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
  await interactiveShape({
    cwd,
    askArchitecture: async () => JAVA_CHOICES,
    confirmArchitecture: async () => 'proceed',
  });
  await runForge({ cwd });
  await runTemper({ cwd });
}

function backendPath(cwd, ...rest) {
  return join(cwd, '.byeorim', 'project', 'generated', 'backend', ...rest);
}

test('language=java일 때 backend/ Gradle 멀티모듈 트리가 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    const result = await runSet({ cwd });
    assert.equal(result.language, 'java');
    assert.ok(result.backendDir);
    assert.ok(result.backendFileCount >= 6);
    // 루트 4개 파일
    assert.equal(existsSync(backendPath(cwd, 'settings.gradle.kts')), true);
    assert.equal(existsSync(backendPath(cwd, 'build.gradle.kts')), true);
    assert.equal(existsSync(backendPath(cwd, 'gradle.properties')), true);
    assert.equal(existsSync(backendPath(cwd, 'README.md')), true);
    // app 모듈
    assert.equal(existsSync(backendPath(cwd, 'app', 'build.gradle.kts')), true);
    assert.equal(
      existsSync(backendPath(cwd, 'app', 'src', 'main', 'java', 'com', 'example')),
      true,
      'app/src/main/java/com/example 디렉토리가 있어야 한다',
    );
  });
});

test('각 feature(internal 제외)에 헥사고날 4영역 5개 Java 파일이 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['refund']); // refund + payment + cancel-return + pg-integration(internal)
    await runSet({ cwd });
    const featureBase = (blockId, javaPackage) =>
      backendPath(
        cwd,
        'modules',
        blockId,
        'src',
        'main',
        'java',
        'com',
        'example',
        'byeorim',
        javaPackage,
      );
    for (const [blockId, pkg, className] of [
      ['refund', 'refund', 'Refund'],
      ['payment', 'payment', 'Payment'],
      ['cancel-return', 'cancelreturn', 'CancelReturn'],
    ]) {
      assert.equal(existsSync(featureBase(blockId, pkg)), true, `${blockId} 모듈 패키지 디렉토리`);
      assert.equal(
        existsSync(join(featureBase(blockId, pkg), 'domain', `${className}.java`)),
        true,
      );
      assert.equal(
        existsSync(join(featureBase(blockId, pkg), 'domain', `${className}Repository.java`)),
        true,
      );
      assert.equal(
        existsSync(join(featureBase(blockId, pkg), 'application', `${className}Service.java`)),
        true,
      );
      assert.equal(
        existsSync(
          join(featureBase(blockId, pkg), 'infrastructure', `Jpa${className}Repository.java`),
        ),
        true,
      );
      assert.equal(
        existsSync(join(featureBase(blockId, pkg), 'web', `${className}Controller.java`)),
        true,
      );
      assert.equal(existsSync(backendPath(cwd, 'modules', blockId, 'build.gradle.kts')), true);
    }
  });
});

test('internal 블럭(pg-integration)은 modules에 만들지 않는다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['payment']);
    await runSet({ cwd });
    assert.equal(existsSync(backendPath(cwd, 'modules', 'payment')), true);
    assert.equal(
      existsSync(backendPath(cwd, 'modules', 'pg-integration')),
      false,
      'internal 블럭은 modules에 들어가면 안 된다',
    );
  });
});

test('하이픈 ID(cancel-return)는 Java 패키지로 lowercase + 구분자 없음으로 변환된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['cancel-return']);
    await runSet({ cwd });
    // 디렉토리는 하이픈 그대로(cancel-return), Java 패키지는 cancelreturn(no separator)
    const javaBase = backendPath(
      cwd,
      'modules',
      'cancel-return',
      'src',
      'main',
      'java',
      'com',
      'example',
      'byeorim',
      'cancelreturn',
    );
    assert.equal(existsSync(javaBase), true);
    // 클래스 이름은 PascalCase: CancelReturn
    const controller = readFileSync(join(javaBase, 'web', 'CancelReturnController.java'), 'utf8');
    assert.match(controller, /class CancelReturnController/);
    assert.match(controller, /package com\.example\.byeorim\.cancelreturn\.web/);
  });
});

test('Controller가 Spring 어노테이션과 record DTO를 가진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const controller = readFileSync(
      backendPath(
        cwd,
        'modules',
        'order',
        'src',
        'main',
        'java',
        'com',
        'example',
        'byeorim',
        'order',
        'web',
        'OrderController.java',
      ),
      'utf8',
    );
    // Spring 어노테이션
    assert.match(controller, /@RestController/);
    assert.match(controller, /@RequestMapping/);
    assert.match(controller, /@PostMapping/);
    assert.match(controller, /@GetMapping/);
    assert.match(controller, /@PutMapping/);
    assert.match(controller, /@DeleteMapping/);
    // 입력 검증 강제(ADR 0017 결정 1)
    assert.match(controller, /@Valid @RequestBody/);
    // record DTO
    assert.match(controller, /public record CreateRequest/);
    assert.match(controller, /public record GetResponse/);
  });
});

test('Application.java가 @SpringBootApplication을 가진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const app = readFileSync(
      backendPath(
        cwd,
        'app',
        'src',
        'main',
        'java',
        'com',
        'example',
        'byeorim',
        'Application.java',
      ),
      'utf8',
    );
    assert.match(app, /@SpringBootApplication/);
    assert.match(app, /package com\.example\.byeorim/);
    assert.match(app, /public static void main/);
  });
});

test('settings.gradle.kts에 모든 feature 모듈이 등록된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['refund']);
    await runSet({ cwd });
    const settings = readFileSync(backendPath(cwd, 'settings.gradle.kts'), 'utf8');
    assert.match(settings, /include\(":app"\)/);
    assert.match(settings, /include\(":modules:refund"\)/);
    assert.match(settings, /include\(":modules:payment"\)/);
    assert.match(settings, /include\(":modules:cancel-return"\)/);
    // internal 블럭은 settings에 들어가지 않는다
    assert.equal(
      settings.includes('include(":modules:pg-integration")'),
      false,
      'internal 블럭은 settings에 들어가면 안 된다',
    );
  });
});

test('Service 클래스가 생성자 주입을 사용한다(@Autowired 필드 주입 금지)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const service = readFileSync(
      backendPath(
        cwd,
        'modules',
        'order',
        'src',
        'main',
        'java',
        'com',
        'example',
        'byeorim',
        'order',
        'application',
        'OrderService.java',
      ),
      'utf8',
    );
    // 생성자 주입 패턴
    assert.match(service, /public OrderService\(OrderRepository repository\)/);
    // @Autowired 사용 안 함
    assert.equal(service.includes('@Autowired'), false, '@Autowired 필드 주입은 ADR 0019 위배');
  });
});

test('Repository 인터페이스가 domain 영역에 있고 구현체가 infrastructure에 있다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const orderJavaBase = backendPath(
      cwd,
      'modules',
      'order',
      'src',
      'main',
      'java',
      'com',
      'example',
      'byeorim',
      'order',
    );
    const iface = readFileSync(join(orderJavaBase, 'domain', 'OrderRepository.java'), 'utf8');
    assert.match(iface, /public interface OrderRepository/);
    const impl = readFileSync(
      join(orderJavaBase, 'infrastructure', 'JpaOrderRepository.java'),
      'utf8',
    );
    assert.match(impl, /public class JpaOrderRepository implements OrderRepository/);
  });
});

// ADR 0044: singleton api_style. update가 @PatchMapping으로 emit되어야 한다.
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
    askArchitecture: async () => JAVA_CHOICES,
    confirmArchitecture: async () => 'proceed',
  });
  const catalogFile = join(cwd, '.byeorim', 'project', 'catalog', 'catalog.yml');
  const catalog = yaml.load(readFileSync(catalogFile, 'utf8'));
  const order = catalog.blocks.find((b) => b.id === 'order');
  order.api_style = 'singleton';
  order.path = '/me';
  writeFileSync(catalogFile, yaml.dump(catalog, { sortKeys: false }), 'utf8');
  await runForge({ cwd });
  await runTemper({ cwd });
}

test('singleton 블럭의 update는 @PatchMapping으로 emit된다(ADR 0044)', async () => {
  await withTempCwd(async (cwd) => {
    await setupSingletonForSet(cwd);
    await runSet({ cwd });
    const controller = readFileSync(
      backendPath(
        cwd,
        'modules',
        'order',
        'src',
        'main',
        'java',
        'com',
        'example',
        'byeorim',
        'order',
        'web',
        'OrderController.java',
      ),
      'utf8',
    );
    // PATCH 매핑이 emit되어야 한다(PUT은 안 됨)
    assert.match(controller, /@PatchMapping/);
    assert.ok(!/@PutMapping/.test(controller), 'PutMapping은 안 emit되어야 한다');
    // base path는 /me (singleton)
    assert.match(controller, /@RequestMapping\("\/me"\)/);
    // singleton은 /{id} 자리 없음. 메서드 path는 ""
    assert.match(controller, /@PatchMapping\(""\)/);
  });
});

// ADR 0046: 생성 코드의 로컬 실행 가능성 (healthcheck + env 분리 + prod 가드)

function appJavaPath(cwd, ...rest) {
  return backendPath(cwd, 'app', 'src', 'main', 'java', 'com', 'example', 'byeorim', ...rest);
}

function appResourcePath(cwd, ...rest) {
  return backendPath(cwd, 'app', 'src', 'main', 'resources', ...rest);
}

test('HealthController.java가 표준 /health endpoint로 만들어진다(ADR 0046 결정 1)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const file = appJavaPath(cwd, 'HealthController.java');
    assert.equal(existsSync(file), true);
    const code = readFileSync(file, 'utf8');
    assert.match(code, /@RestController/);
    assert.match(code, /@GetMapping\("\/health"\)/);
    assert.match(code, /"status", "ok"/);
  });
});

test('application.yml과 application-production.yml이 둘 다 자동 생성된다(ADR 0046 결정 2)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const dev = appResourcePath(cwd, 'application.yml');
    const prod = appResourcePath(cwd, 'application-production.yml');
    assert.equal(existsSync(dev), true, 'application.yml이 자동 생성되어야 한다');
    assert.equal(existsSync(prod), true, 'application-production.yml이 자동 생성되어야 한다');
    const devText = readFileSync(dev, 'utf8');
    const prodText = readFileSync(prod, 'utf8');
    // dev는 H2 in-memory(ADR 0046 결정 3)
    assert.match(devText, /jdbc:h2:mem/);
    // 둘 다 jwt.secret이 dev placeholder
    assert.match(devText, /secret: BYEORIM_DEV_PLACEHOLDER_/);
    assert.match(prodText, /secret: BYEORIM_DEV_PLACEHOLDER_/);
    // prod 템플릿은 database.url도 placeholder
    assert.match(prodText, /url: BYEORIM_DEV_PLACEHOLDER_/);
  });
});

test('EnvSecretsValidator.java가 production profile에서만 동작한다(ADR 0046 결정 4 안전망 2)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const file = appJavaPath(cwd, 'config', 'EnvSecretsValidator.java');
    assert.equal(existsSync(file), true);
    const code = readFileSync(file, 'utf8');
    assert.match(code, /@Component/);
    assert.match(code, /@Profile\("production"\)/);
    assert.match(code, /BYEORIM_DEV_PLACEHOLDER_/);
    assert.match(code, /@PostConstruct/);
    // 한국어 안내(사용자가 보는 결)
    assert.match(code, /dev placeholder입니다/);
  });
});

test('.gitignore에 application-production.yml이 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const gitignore = readFileSync(backendPath(cwd, '.gitignore'), 'utf8');
    assert.match(gitignore, /application-production\.yml/);
    assert.match(gitignore, /\.gradle/);
  });
});

test('application.yml이 이미 있으면 set 재실행 시 덮어쓰지 않는다(사용자 customization 보호)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForSet(cwd, ['order']);
    await runSet({ cwd });
    const ymlFile = appResourcePath(cwd, 'application.yml');
    // 사용자가 application.yml을 customization했다고 가정
    const userValue = '# 사용자가 customization한 자리\nserver:\n  port: 9090\n';
    writeFileSync(ymlFile, userValue, 'utf8');
    // current_stage를 set으로 되돌려 다시 실행
    const stateFile = join(cwd, '.byeorim', 'state.yml');
    const state = yaml.load(readFileSync(stateFile, 'utf8'));
    state.current_stage = 'set';
    state.completed_stages = state.completed_stages.filter((s) => s !== 'set');
    writeFileSync(stateFile, yaml.dump(state, { sortKeys: false }), 'utf8');
    await runSet({ cwd });
    // 사용자가 customization한 값이 살아있다
    const yml = readFileSync(ymlFile, 'utf8');
    assert.equal(yml, userValue);
  });
});
