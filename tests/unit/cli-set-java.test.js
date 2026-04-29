// runSet의 Java 백엔드 생성 단위 테스트. ADR 0019를 따른다.

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
  return mkdtempSync(join(tmpdir(), 'beoreum-set-java-'));
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
    userInput: '쇼핑몰 만들어줘',
    adapter: createMockAdapter(),
  });
  await runSmelt({ cwd, blockIds });
  await interactiveShape({ cwd, askArchitecture: async () => JAVA_CHOICES });
  await runForge({ cwd });
  await runTemper({ cwd });
}

function backendPath(cwd, ...rest) {
  return join(cwd, '.beoreum', 'project', 'generated', 'backend', ...rest);
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
        'beoreum',
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
      'beoreum',
      'cancelreturn',
    );
    assert.equal(existsSync(javaBase), true);
    // 클래스 이름은 PascalCase: CancelReturn
    const controller = readFileSync(join(javaBase, 'web', 'CancelReturnController.java'), 'utf8');
    assert.match(controller, /class CancelReturnController/);
    assert.match(controller, /package com\.example\.beoreum\.cancelreturn\.web/);
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
        'beoreum',
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
        'beoreum',
        'Application.java',
      ),
      'utf8',
    );
    assert.match(app, /@SpringBootApplication/);
    assert.match(app, /package com\.example\.beoreum/);
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
        'beoreum',
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
      'beoreum',
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
