// Java 백엔드 코드 생성기. ADR 0019를 따른다.
// architecture.yml의 language='java'일 때 set 단계가 호출.
// internal 블럭은 modules에 만들지 않는다(공개 API 없음).
// ep.method가 진실(forge가 박은 자리). resource는 PUT, singleton은 PATCH(ADR 0044).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  toCamelCase,
  toPascalCase,
  getPublicContracts,
  getIntentWhat,
  methodSpec,
  springAnnotation,
  devPlaceholder,
} from './util.js';

const GROUP = 'com.example';
const PROJECT_PACKAGE_FALLBACK = 'byeorim';
const SPRING_BOOT_VERSION = '3.4.0';
const JAVA_VERSION = '17';

// endpoints의 base path를 결정한다. forge가 항상 첫 endpoint를 컬렉션/싱글톤 base로 박는다.
// resource: endpoints[0]이 POST /orders. singleton: endpoints[0]이 GET /me.
function basePathOf(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) return '';
  return String(endpoints[0].path || '');
}

// ep.path에서 path param 이름을 뽑는다. 없으면 'id' 폴백.
// 예: /orders/{id} → 'id', /orders/by-customer/{customerId} → 'customerId'.
function pathParamName(path) {
  const m = String(path || '').match(/\{(\w+)\}/);
  return m ? m[1] : 'id';
}

// pg-integration → pgintegration. Java 패키지 이름은 lowercase, 구분자 없음(전통).
// Java 패키지 식별자 규칙은 다른 언어와 달라 util.js에 두지 않고 여기에 둔다.
function toJavaPackage(blockId) {
  return blockId.replace(/-/g, '').toLowerCase();
}

// JSON Schema → Java 타입 (ADR 0023 결정 4 매핑 표).
// 풀 자격 이름(java.math.BigDecimal 등)을 사용해 추가 import 없이 컴파일 가능.
function javaType(schema) {
  if (!schema || typeof schema !== 'object') return 'Object';
  switch (schema.type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Long';
    case 'number':
      return 'java.math.BigDecimal';
    case 'boolean':
      return 'Boolean';
    case 'array':
      return `java.util.List<${javaType(schema.items)}>`;
    case 'object':
      return 'java.util.Map<String, Object>';
    default:
      return 'Object';
  }
}

// schema가 type='object'면 record 인자 목록(예: "String name, BigDecimal amount").
// 비어있으면 빈 문자열(record without fields).
function schemaToJavaRecordFields(schema) {
  if (!schema || typeof schema !== 'object' || schema.type !== 'object') return '';
  const props = schema.properties || {};
  return Object.entries(props)
    .map(([name, sub]) => `${javaType(sub)} ${name}`)
    .join(', ');
}

function buildProjectPackage(intent) {
  const what = getIntentWhat(intent);
  if (!what) return PROJECT_PACKAGE_FALLBACK;
  // 한국어가 들어와도 안전한 ASCII fallback. lowercase, 영문/숫자만.
  const ascii = what.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ascii || PROJECT_PACKAGE_FALLBACK;
}

function buildProjectName(intent) {
  const what = getIntentWhat(intent);
  if (!what) return 'byeorim-project';
  const slug = what
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'byeorim-project';
}

// ── 루트 빌드 파일 ─────────────────────────────────────────

function buildSettingsGradle(projectName, features) {
  const includes = [`include(":app")`, ...features.map((f) => `include(":modules:${f.dir}")`)].join(
    '\n',
  );
  return `rootProject.name = "${projectName}"

${includes}
`;
}

function buildRootBuildGradle() {
  return `// 루트 build.gradle.kts. 모든 하위 모듈에 공통 적용. ADR 0019를 따른다.

plugins {
  java
  id("org.springframework.boot") version "${SPRING_BOOT_VERSION}" apply false
  id("io.spring.dependency-management") version "1.1.6" apply false
}

allprojects {
  group = "${GROUP}"
  version = "0.1.0-SNAPSHOT"
}

subprojects {
  apply(plugin = "java")
  apply(plugin = "io.spring.dependency-management")

  java {
    toolchain {
      languageVersion.set(JavaLanguageVersion.of(${JAVA_VERSION}))
    }
  }

  repositories {
    mavenCentral()
  }

  dependencies {
    "implementation"("org.springframework.boot:spring-boot-starter")
    "testImplementation"("org.springframework.boot:spring-boot-starter-test")
    "testImplementation"("org.junit.jupiter:junit-jupiter")
  }

  the<io.spring.gradle.dependencymanagement.dsl.DependencyManagementExtension>().apply {
    imports {
      mavenBom("org.springframework.boot:spring-boot-dependencies:${SPRING_BOOT_VERSION}")
    }
  }
}
`;
}

function buildGradleProperties() {
  return `# 자동 생성. 필요 시 갱신.
org.gradle.jvmargs=-Xmx2g
org.gradle.parallel=true
org.gradle.caching=true
`;
}

function buildBackendReadme(projectName, featureCount) {
  return `# ${projectName} (Java)

벼림이 자동 생성한 Spring Boot 백엔드 스켈레톤입니다. ADR 0019와 ADR 0046을 따릅니다.

## 시작하기 (dev)

\`application.yml\`이 dev 값으로 미리 채워져 있어 즉시 띄울 수 있습니다.

1. 빌드: \`./gradlew build\`
2. 개발 실행: \`./gradlew :app:bootRun\`
3. 살아있는지 확인: \`curl http://localhost:8080/health\` → \`{"status":"ok"}\`
4. 테스트: \`./gradlew test\`

## prod로 옮기기

\`application-production.yml\`이 템플릿으로 같이 만들어져 있습니다. 모든 \`BYEORIM_DEV_PLACEHOLDER_\` 값을 실제 prod 값으로 교체한 뒤 production profile로 띄웁니다.

\`\`\`
./gradlew :app:bootRun --args='--spring.profiles.active=production'
\`\`\`

값을 안 채우고 띄우면 시작이 거부됩니다. 한국어 안내 메시지가 나옵니다.

## 구조

\`\`\`
backend/
├── .gitignore
├── settings.gradle.kts
├── build.gradle.kts
├── app/                    # 엔트리, 부트스트랩
│   └── src/main/
│       ├── java/.../Application.java
│       ├── java/.../HealthController.java        # /health 표준
│       ├── java/.../config/EnvSecretsValidator.java   # prod 가드
│       └── resources/
│           ├── application.yml                   # dev 값
│           └── application-production.yml        # prod 템플릿
└── modules/                # ${featureCount}개 feature
    └── {feature-name}/
        └── ... (헥사고날 4영역)
\`\`\`

각 feature는 한 Gradle 모듈입니다. 미래 MSA 분리 시 한 모듈이 한 마이크로서비스로 빠집니다.

## 다음 일

각 feature 모듈의 다섯 자리가 TODO로 들어있습니다.

1. \`domain/{Class}.java\`: 엔티티 필드와 도메인 메서드
2. \`domain/{Class}Repository.java\`: 인터페이스 메서드 시그니처
3. \`application/{Class}Service.java\`: use case 메서드 (생성자 주입)
4. \`infrastructure/Jpa{Class}Repository.java\`: ORM 구현
5. \`web/{Class}Controller.java\`: HTTP 경계 (DTO record는 nested로)

## 보안

이 스켈레톤은 ADR 0017 결정 1(보안 최우선)과 ADR 0046 결정 4(prod 가드)를 따릅니다.

- Spring Security가 모든 엔드포인트를 기본 차단(allow-list 방식). 공개 자리만 명시적으로 허용
- Bean Validation(\`@Valid\`)으로 입력 경계 검증
- \`application.yml\`과 \`application-production.yml\`은 \`.gitignore\`로 git에서 제외
- production profile에서 시크릿이 dev placeholder면 시작 거부(EnvSecretsValidator)
`;
}

// dev application.yml. ADR 0046 결정 2와 3.
// jwt.secret은 dev placeholder prefix로 박아 prod 가드가 잡을 수 있게.
// 데이터베이스는 H2 in-memory(외부 의존성 없음, ADR 0046 결정 3).
function buildApplicationYml() {
  return `# 자동 생성된 dev 환경 설정. ADR 0046을 따른다.
# 이 파일은 dev에서만 동작하는 값들이 들어있다. prod에서 이 값을 그대로 쓰지 않는다.
# prod 환경 변수는 application-production.yml에 별도로 채운다.

server:
  port: 8080

spring:
  application:
    name: byeorim-app
  profiles:
    default: development

# 시크릿. dev placeholder는 prod 가드가 검출해서 막는다(ADR 0046 결정 4).
jwt:
  secret: ${devPlaceholder('jwt_secret')}

# 데이터베이스. dev는 H2 in-memory로 외부 의존성 없이 기동(ADR 0046 결정 3).
# JPA 의존성이 추가되면 자동으로 활성화된다.
database:
  url: jdbc:h2:mem:devdb
  username: sa
  password: ''
`;
}

// prod application-production.yml. ADR 0046 결정 2.
// 모든 시크릿이 dev placeholder로 박혀있어 사용자가 직접 채우지 않으면 prod 가드가 막는다.
function buildApplicationProductionYml() {
  return `# 자동 생성된 prod 환경 설정 템플릿. ADR 0046을 따른다.
# 이 파일을 prod에 배포하기 전에 모든 BYEORIM_DEV_PLACEHOLDER_ 값을 실제 값으로 채운다.
# 채우지 않은 채로 spring.profiles.active=production으로 기동하면 시작이 거부된다.

server:
  port: 8080

# 시크릿. 반드시 안전한 random 값으로 교체.
jwt:
  secret: ${devPlaceholder('jwt_secret')}

# 데이터베이스. architecture.yml에서 고른 DB의 connection string으로 교체.
database:
  url: ${devPlaceholder('database_url')}
  username: ${devPlaceholder('database_username')}
  password: ${devPlaceholder('database_password')}
`;
}

// HealthController. ADR 0046 결정 1의 표준 /health endpoint.
function buildHealthControllerJava(projectPackage) {
  return `package ${GROUP}.${projectPackage};

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// 표준 healthcheck endpoint(ADR 0046 결정 1). 인증 없이 한 URL로 살아있음을 본다.
@RestController
public class HealthController {
  @GetMapping("/health")
  public Map<String, String> health() {
    return Map.of("status", "ok");
  }
}
`;
}

// EnvSecretsValidator. ADR 0046 결정 4 안전망 2.
// production profile에서 시크릿 값이 dev placeholder prefix로 시작하면 시작을 거부.
function buildEnvSecretsValidatorJava(projectPackage) {
  return `package ${GROUP}.${projectPackage}.config;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

// production profile에서 시크릿이 dev placeholder인지 검사한다(ADR 0046 결정 4 안전망 2).
// dev placeholder prefix는 모든 generator에서 같은 표준 마커(ADR 0046 결정 5).
@Component
@Profile("production")
public class EnvSecretsValidator {
  private static final String DEV_PLACEHOLDER_PREFIX = "BYEORIM_DEV_PLACEHOLDER_";

  @Value("\${jwt.secret:}")
  private String jwtSecret;

  @Value("\${database.url:}")
  private String databaseUrl;

  @PostConstruct
  void validate() {
    requireProdValue("jwt.secret", jwtSecret);
    requireProdValue("database.url", databaseUrl);
  }

  private void requireProdValue(String name, String value) {
    if (value == null || value.isBlank()) {
      throw new IllegalStateException(
          "PROD 모드에서 " + name + " 값이 비어있습니다. application-production.yml을 채운 뒤 다시 시작하세요.");
    }
    if (value.startsWith(DEV_PLACEHOLDER_PREFIX)) {
      throw new IllegalStateException(
          "PROD 모드에서 " + name + " 값이 dev placeholder입니다. application-production.yml의 " + name + "을 prod 값으로 채운 뒤 다시 시작하세요.");
    }
  }
}
`;
}

// .gitignore. ADR 0046 결정 2의 안전 결과 Spring 관례를 함께 따른다.
// application.yml은 dev placeholder만 박혀있어 commit 안전. application-production.yml은 사용자가 prod 값을 채우는 자리라 git에서 제외.
function buildGitignore() {
  return `.gradle/
build/
out/
*.class
.idea/
*.iml
.vscode/
.DS_Store

# prod 시크릿 파일(ADR 0046). application.yml은 dev placeholder라 commit 가능.
**/application-production.yml
`;
}

// ── app 모듈 ─────────────────────────────────────────────────

function buildAppBuildGradle(features, projectPackage) {
  const moduleDeps = features
    .map((f) => `  implementation(project(":modules:${f.dir}"))`)
    .join('\n');
  return `// app 모듈. Spring Boot 부트스트랩과 모든 feature 모듈을 합치는 자리.

plugins {
  application
  id("org.springframework.boot")
}

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("org.springframework.boot:spring-boot-starter-security")
  implementation("org.springframework.boot:spring-boot-starter-validation")
${moduleDeps}
}

application {
  mainClass.set("${GROUP}.${projectPackage}.Application")
}
`;
}

function buildApplicationJava(projectPackage) {
  return `package ${GROUP}.${projectPackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// Spring Boot 엔트리. ADR 0019를 따른다.
@SpringBootApplication
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
`;
}

// ── feature 모듈 ─────────────────────────────────────────────

function buildFeatureBuildGradle() {
  return `// 자동 생성된 feature 모듈. ADR 0019의 헥사고날 의존성 방향을 따른다.

dependencies {
  implementation("org.springframework.boot:spring-boot-starter-web")
  implementation("org.springframework.boot:spring-boot-starter-validation")
  implementation("jakarta.validation:jakarta.validation-api")
}
`;
}

function buildDomainClassJava(projectPackage, featurePackage, className, blockName) {
  return `package ${GROUP}.${projectPackage}.${featurePackage}.domain;

// ${blockName} 도메인 모델. 순수 Java(Spring 어노테이션 없음).
// ADR 0019 결정 4의 domain 영역. application/infrastructure/web을 import하지 않습니다.
// TODO: 필드와 도메인 메서드를 정의하세요.
public class ${className} {
  // TODO: 엔티티 필드와 도메인 메서드 추가
}
`;
}

function buildDomainRepositoryJava(projectPackage, featurePackage, className, blockName) {
  return `package ${GROUP}.${projectPackage}.${featurePackage}.domain;

import java.util.Optional;
import java.util.UUID;

// ${blockName} repository 인터페이스. ADR 0019 결정 8의 인터페이스 우선.
// 도메인은 인터페이스만 알고 구현(Jpa${className}Repository)은 모릅니다.
// TODO: 메서드 시그니처를 채우세요.
public interface ${className}Repository {
  Optional<${className}> findById(UUID id);
  void save(${className} aggregate);
}
`;
}

function buildApplicationServiceJava(projectPackage, featurePackage, className, blockName) {
  return `package ${GROUP}.${projectPackage}.${featurePackage}.application;

import ${GROUP}.${projectPackage}.${featurePackage}.domain.${className}Repository;
import org.springframework.stereotype.Service;

// ${blockName} 응용 서비스. use case 단위.
// ADR 0019 결정 8: 생성자 주입만 사용(필드 주입 어노테이션 금지).
// TODO: use case 메서드를 채우세요.
@Service
public class ${className}Service {
  private final ${className}Repository repository;

  public ${className}Service(${className}Repository repository) {
    this.repository = repository;
  }

  // TODO: use case 메서드 (예: place${className}, cancel${className})

  // 미사용 필드 경고를 막는 자리. 위 use case 메서드에서 repository를 호출하면 자연스럽게 해결됨
  protected ${className}Repository repository() {
    return repository;
  }
}
`;
}

function buildInfrastructureRepositoryJava(projectPackage, featurePackage, className, blockName) {
  return `package ${GROUP}.${projectPackage}.${featurePackage}.infrastructure;

import ${GROUP}.${projectPackage}.${featurePackage}.domain.${className};
import ${GROUP}.${projectPackage}.${featurePackage}.domain.${className}Repository;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;

// ${blockName} repository 구현. ADR 0019 결정 4의 infrastructure 영역.
// domain의 인터페이스를 구현. 외부 도구(JPA, Mongo 등)는 여기서만 알고 다른 영역은 모릅니다.
// TODO: 실제 ORM 또는 외부 API 호출을 구현하세요.
@Repository
public class Jpa${className}Repository implements ${className}Repository {
  @Override
  public Optional<${className}> findById(UUID id) {
    // TODO: ORM 쿼리
    return Optional.empty();
  }

  @Override
  public void save(${className} aggregate) {
    // TODO: ORM 저장
  }
}
`;
}

function buildControllerJava(
  projectPackage,
  featurePackage,
  className,
  blockName,
  blockId,
  endpoints,
) {
  const camel = toCamelCase(blockId);
  // base path는 endpoints[0]의 path. 각 endpoint의 상대 path를 base 기준으로 자른다.
  const pathPrefix = basePathOf(endpoints);
  const handlers = endpoints
    .map((ep) => {
      const spec = methodSpec(ep);
      const opPascal = toPascalCase(ep.operation);
      const requestType = spec.hasBody ? `${opPascal}Request` : null;
      const responseType = `${opPascal}Response`;
      const params = [];
      if (spec.hasPath) {
        const paramName = pathParamName(ep.path);
        params.push(`@PathVariable UUID ${paramName}`);
      }
      if (spec.hasBody) params.push(`@Valid @RequestBody ${requestType} request`);
      const paramList = params.join(', ');

      const annotation = springAnnotation(spec.method);
      // 상대 path = ep.path - pathPrefix. 같으면 빈 문자열, 아니면 잘라낸 자리.
      const relativeRaw =
        ep.path && ep.path.startsWith(pathPrefix) ? ep.path.slice(pathPrefix.length) : ep.path;
      const path = relativeRaw ? `"${relativeRaw}"` : '""';

      return `  // ${ep.operation} ${ep.method} ${ep.path}
  @${annotation}(${path})
  @ResponseStatus(HttpStatus.valueOf(${spec.status}))
  public ${responseType} ${ep.operation}(${paramList}) {
    // TODO: ${camel}Service.${ep.operation}(...) 호출
    throw new UnsupportedOperationException("Not Implemented Yet: ${ep.operation}");
  }`;
    })
    .join('\n\n');

  // Nested DTO records. schema가 채워지면 record 필드로 자동 변환(ADR 0023).
  const dtos = endpoints
    .map((ep) => {
      const spec = methodSpec(ep);
      const opPascal = toPascalCase(ep.operation);
      const requestRecord = spec.hasBody
        ? `  // ${ep.operation} 요청 필드. Bean Validation 어노테이션(@NotBlank 등)은 사용자가 추가.
  public record ${opPascal}Request(${schemaToJavaRecordFields(ep.request_schema)}) {}`
        : '';
      const responseRecord = `  // ${ep.operation} 응답 필드.
  public record ${opPascal}Response(${schemaToJavaRecordFields(ep.response_schema)}) {}`;
      return [requestRecord, responseRecord].filter(Boolean).join('\n\n');
    })
    .join('\n\n');

  return `package ${GROUP}.${projectPackage}.${featurePackage}.web;

import ${GROUP}.${projectPackage}.${featurePackage}.application.${className}Service;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

// ${blockName} 웹 컨트롤러. ADR 0019 결정 4의 web 영역.
// 모든 엔드포인트가 입력 검증(@Valid)을 거치고 응답은 record DTO로(ADR 0017 결정 1).
@RestController
@RequestMapping("${pathPrefix}")
public class ${className}Controller {
  private final ${className}Service ${camel}Service;

  public ${className}Controller(${className}Service ${camel}Service) {
    this.${camel}Service = ${camel}Service;
  }

${handlers}

  // ── DTO records (Java 14+) ─────────────────────────────────

${dtos}
}
`;
}

// ── 본체 ─────────────────────────────────────────────────────

// generateJavaBackend는 architecture.language='java'일 때 set이 호출.
// generatedDir(.byeorim/project/generated) 안에 backend/ 트리를 만든다.
//
// 입력:
//   inputs        - set.js의 loadInputs 결과
//   generatedDir  - .byeorim/project/generated 절대 경로
//   now           - 테스트용 결정적 시각(현재 사용 안 함)
//
// 반환: { backendDir, featureCount, fileCount }
export function generateJavaBackend({ inputs, generatedDir, now: _now } = {}) {
  if (!inputs) throw new Error('generateJavaBackend({ inputs })가 필요합니다');
  if (!generatedDir) throw new Error('generateJavaBackend({ generatedDir })가 필요합니다');

  const publicContracts = getPublicContracts(inputs);

  const projectPackage = buildProjectPackage(inputs.intent);
  const projectName = buildProjectName(inputs.intent);
  const backendDir = join(generatedDir, 'backend');

  const features = publicContracts.map((c) => ({
    blockId: c.block_id,
    name: c.name,
    dir: c.block_id,
    package: toJavaPackage(c.block_id),
    className: toPascalCase(c.block_id),
    endpoints: c.endpoints || [],
  }));

  // 루트 파일들
  mkdirSync(backendDir, { recursive: true });
  writeFileSync(
    join(backendDir, 'settings.gradle.kts'),
    buildSettingsGradle(projectName, features),
    'utf8',
  );
  writeFileSync(join(backendDir, 'build.gradle.kts'), buildRootBuildGradle(), 'utf8');
  writeFileSync(join(backendDir, 'gradle.properties'), buildGradleProperties(), 'utf8');
  writeFileSync(
    join(backendDir, 'README.md'),
    buildBackendReadme(projectName, features.length),
    'utf8',
  );
  writeFileSync(join(backendDir, '.gitignore'), buildGitignore(), 'utf8');

  // app 모듈
  const appDir = join(backendDir, 'app');
  const appJavaDir = join(appDir, 'src', 'main', 'java', GROUP.replace(/\./g, '/'), projectPackage);
  const appConfigDir = join(appJavaDir, 'config');
  const appResourcesDir = join(appDir, 'src', 'main', 'resources');
  mkdirSync(appConfigDir, { recursive: true });
  mkdirSync(appResourcesDir, { recursive: true });
  writeFileSync(
    join(appDir, 'build.gradle.kts'),
    buildAppBuildGradle(features, projectPackage),
    'utf8',
  );
  writeFileSync(join(appJavaDir, 'Application.java'), buildApplicationJava(projectPackage), 'utf8');
  // ADR 0046: /health 표준 endpoint
  writeFileSync(
    join(appJavaDir, 'HealthController.java'),
    buildHealthControllerJava(projectPackage),
    'utf8',
  );
  // ADR 0046 결정 4 안전망 2: production profile에서 placeholder 검출 throw
  writeFileSync(
    join(appConfigDir, 'EnvSecretsValidator.java'),
    buildEnvSecretsValidatorJava(projectPackage),
    'utf8',
  );

  // ADR 0046 결정 2: dev application.yml과 prod 템플릿 둘 다 자동 생성.
  // 이미 있으면 사용자가 채운 prod 값을 보호하기 위해 덮어쓰지 않는다.
  const applicationYml = join(appResourcesDir, 'application.yml');
  const applicationProdYml = join(appResourcesDir, 'application-production.yml');
  let envFileCount = 0;
  if (!existsSync(applicationYml)) {
    writeFileSync(applicationYml, buildApplicationYml(), 'utf8');
    envFileCount += 1;
  }
  if (!existsSync(applicationProdYml)) {
    writeFileSync(applicationProdYml, buildApplicationProductionYml(), 'utf8');
    envFileCount += 1;
  }

  // root(4) + .gitignore(1) + app(build.gradle + Application + HealthController + EnvSecretsValidator) + env files
  let fileCount = 4 + 1 + 4 + envFileCount;

  // 각 feature 모듈
  for (const f of features) {
    const moduleDir = join(backendDir, 'modules', f.dir);
    const featureJavaBase = join(
      moduleDir,
      'src',
      'main',
      'java',
      GROUP.replace(/\./g, '/'),
      projectPackage,
      f.package,
    );
    const domainDir = join(featureJavaBase, 'domain');
    const applicationDir = join(featureJavaBase, 'application');
    const infrastructureDir = join(featureJavaBase, 'infrastructure');
    const webDir = join(featureJavaBase, 'web');

    for (const dir of [domainDir, applicationDir, infrastructureDir, webDir]) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(join(moduleDir, 'build.gradle.kts'), buildFeatureBuildGradle(), 'utf8');
    writeFileSync(
      join(domainDir, `${f.className}.java`),
      buildDomainClassJava(projectPackage, f.package, f.className, f.name),
      'utf8',
    );
    writeFileSync(
      join(domainDir, `${f.className}Repository.java`),
      buildDomainRepositoryJava(projectPackage, f.package, f.className, f.name),
      'utf8',
    );
    writeFileSync(
      join(applicationDir, `${f.className}Service.java`),
      buildApplicationServiceJava(projectPackage, f.package, f.className, f.name),
      'utf8',
    );
    writeFileSync(
      join(infrastructureDir, `Jpa${f.className}Repository.java`),
      buildInfrastructureRepositoryJava(projectPackage, f.package, f.className, f.name),
      'utf8',
    );
    writeFileSync(
      join(webDir, `${f.className}Controller.java`),
      buildControllerJava(projectPackage, f.package, f.className, f.name, f.blockId, f.endpoints),
      'utf8',
    );
    fileCount += 6; // build.gradle.kts + 5 Java files
  }

  return {
    backendDir,
    featureCount: features.length,
    fileCount,
  };
}
