// Node.js 백엔드 코드 생성기. ADR 0018을 따른다.
// architecture.yml의 language='node'일 때 set 단계가 호출.
// internal 블럭은 features 디렉토리에 만들지 않는다(공개 API 없음).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toCamelCase, toPascalCase, getPublicContracts, getIntentWhat } from './util.js';

// operation → Fastify HTTP 메서드 매핑. ADR 0013 결정 3 매핑 표와 짝.
const OPERATION_HTTP_METHOD = {
  create: 'post',
  list: 'get',
  get: 'get',
  update: 'put',
  delete: 'delete',
  search: 'get',
};

// /orders/{id} → /orders/:id. Fastify 경로 형식으로 변환.
function pathToFastify(path) {
  return path.replace(/\{(\w+)\}/g, ':$1');
}

// 사용자 입력에서 npm 패키지 이름 후보를 만든다. 하이픈 허용 형식.
// 한국어 what이 들어와도 안전한 fallback.
function buildPackageName(intent) {
  const what = getIntentWhat(intent);
  if (!what) return 'beoreum-project';
  const ascii = what
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'beoreum-project';
}

// ── 파일 빌더들 ─────────────────────────────────────────────

function buildPackageJson(packageName) {
  const doc = {
    name: packageName,
    version: '0.1.0',
    type: 'module',
    private: true,
    engines: { node: '>=18.0.0' },
    scripts: {
      start: 'node src/server.js',
      test: 'node --test "test/**/*.test.js"',
    },
    dependencies: {
      '@fastify/auth': '^5.0.0',
      '@fastify/cors': '^10.0.0',
      '@fastify/helmet': '^12.0.0',
      '@fastify/jwt': '^9.0.0',
      '@fastify/rate-limit': '^10.0.0',
      '@fastify/sensible': '^6.0.0',
      argon2: '^0.40.0',
      dotenv: '^16.4.0',
      fastify: '^5.0.0',
      pino: '^9.0.0',
    },
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

function buildServerJs(features) {
  const imports = features
    .map((f) => `import { ${f.routesFunction} } from './features/${f.dir}/routes.js';`)
    .join('\n');

  const registrations = features
    .map((f) => `await app.register(${f.routesFunction}, { prefix: '${f.prefix}' });`)
    .join('\n');

  return `// 자동 생성된 Fastify 서버. ADR 0018을 따른다.
// JWT_SECRET, CORS_ORIGIN 같은 시크릿은 .env에서 읽는다(ADR 0017 결정 1).

import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';

${imports}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 환경 변수가 필요합니다. .env 파일에 추가하세요.');
}

const app = Fastify({
  logger: {
    redact: ['password', 'token', 'authorization', 'req.headers.authorization'],
  },
});

await app.register(helmet);
await app.register(cors, { origin: process.env.CORS_ORIGIN || false });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(sensible);
await app.register(jwt, { secret: process.env.JWT_SECRET });

${registrations}

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });
app.log.info({ port }, '서버가 시작되었습니다');
`;
}

function buildBackendReadme(packageName, featureCount) {
  return `# ${packageName}

벼름이 자동 생성한 Fastify 백엔드 스켈레톤입니다. ADR 0018을 따릅니다.

## 시작하기

1. \`.env\` 파일을 만들고 시크릿을 채우세요(특히 \`JWT_SECRET\`은 필수).
2. 의존성 설치: \`npm install\`
3. 실행: \`npm start\`
4. 테스트: \`npm test\`

## 구조

\`\`\`
backend/
├── package.json
└── src/
    ├── server.js              # 엔트리, plugin 등록
    └── features/              # ${featureCount}개 feature
        └── {feature-name}/
            ├── domain.js       # 도메인 (순수 자바스크립트)
            ├── service.js      # use case
            ├── repository.js   # 데이터 접근
            ├── routes.js       # Fastify 라우트
            └── schemas.js      # JSON Schema
\`\`\`

각 feature는 한 폴더에 모입니다. 미래 MSA 분리 시 한 폴더가 한 마이크로서비스로 빠집니다.

## 다음 일

각 feature의 도메인/서비스/저장소/스키마가 TODO로 들어있습니다. 다음 순서로 채우세요.

1. \`domain.js\`: 엔티티와 값 객체 정의
2. \`schemas.js\`: 입력/출력 JSON Schema 채우기
3. \`repository.js\`: DB 또는 외부 API 연결
4. \`service.js\`: use case 메서드 구현
5. \`routes.js\`: 핸들러를 service 호출로 교체

## 보안

이 스켈레톤은 ADR 0017 결정 1(보안 최우선)을 따릅니다. helmet, cors, rate-limit, jwt가 기본 등록되어 있고 \`JWT_SECRET\`이 없으면 시작이 실패합니다. .env는 \`.gitignore\`에 넣어 git에 올리지 마세요.
`;
}

function buildDomainJs(blockId, blockName) {
  const className = toPascalCase(blockId);
  return `// ${blockName} 도메인 모델. 순수 자바스크립트(I/O 없음).
// ADR 0018 결정 4의 domain 레이어. 다른 레이어를 import하지 않습니다.
// TODO: 엔티티와 값 객체를 정의하세요.

export class ${className} {
  // TODO: 엔티티 필드와 도메인 메서드 추가
}
`;
}

function buildServiceJs(blockId, blockName) {
  const factoryName = `create${toPascalCase(blockId)}Service`;
  const repoVar = `${toCamelCase(blockId)}Repository`;
  return `// ${blockName} 응용 서비스. use case 단위 함수.
// ADR 0018 결정 4의 application 레이어. domain만 import.
// TODO: 도메인 객체와 repository를 받아 use case를 구현하세요.

export function ${factoryName}({ ${repoVar} }) {
  return {
    // TODO: use case 메서드 추가 (예: placeOrder, cancelOrder)
  };
}
`;
}

function buildRepositoryJs(blockId, blockName) {
  const factoryName = `create${toPascalCase(blockId)}Repository`;
  return `// ${blockName} repository 구현. 데이터 접근 자리.
// ADR 0018 결정 4의 infrastructure 레이어. domain/application만 import.
// TODO: DB 또는 외부 API 연결을 구현하세요.

export function ${factoryName}({ db }) {
  return {
    // TODO: repository 메서드 추가 (예: findById, save)
  };
}
`;
}

// schema가 객체면 JSON Schema 그대로 emit, 아니면 빈 placeholder.
// Fastify는 JSON Schema를 그대로 받으므로 변환 없음(ADR 0023 결정 4).
function jsonSchemaOrEmpty(schema, indent = '  ') {
  if (schema && typeof schema === 'object') {
    return JSON.stringify(schema, null, 2)
      .split('\n')
      .map((line, i) => (i === 0 ? line : indent + line))
      .join('\n');
  }
  return "{ type: 'object', properties: {} }";
}

function buildSchemasJs(blockId, blockName, endpoints) {
  const exports = endpoints
    .map((ep) => {
      const op = toCamelCase(ep.operation);
      const body = jsonSchemaOrEmpty(ep.request_schema);
      const responseSchema = jsonSchemaOrEmpty(ep.response_schema, '    ');
      return `export const ${op}Schema = {
  body: ${body},
  response: {
    200: ${responseSchema},
  },
};`;
    })
    .join('\n\n');

  return `// ${blockName} JSON Schema. ADR 0018 결정 5의 입력/출력 검증.
// schema가 contracts.yml에서 채워지면 그 형식이 여기에 그대로 들어옵니다.
// block_id: ${blockId}

${exports}
`;
}

function buildRoutesJs(blockId, blockName, endpoints) {
  const camel = toCamelCase(blockId);
  const pascal = toPascalCase(blockId);
  const routesFunc = `${camel}Routes`;
  const serviceFactory = `create${pascal}Service`;
  const repoFactory = `create${pascal}Repository`;
  const repoVar = `${camel}Repository`;
  const serviceVar = `${camel}Service`;

  const handlers = endpoints
    .map((ep) => {
      const httpMethod = OPERATION_HTTP_METHOD[ep.operation] || 'get';
      const fastifyPath = pathToFastify(ep.path);
      const op = toCamelCase(ep.operation);
      return `  // ${ep.operation} ${ep.method} ${ep.path}
  fastify.${httpMethod}('${fastifyPath}', { schema: schemas.${op}Schema }, async (request, reply) => {
    // TODO: ${serviceVar}.${ep.operation}(...)을 호출해 비즈니스 로직 실행
    return reply.code(501).send({ error: 'Not Implemented Yet', operation: '${ep.operation}' });
  });`;
    })
    .join('\n\n');

  return `// ${blockName} Fastify 라우트. ADR 0018 결정 4와 8을 따른다.
// 모든 라우트가 schema 검증을 거치고(ADR 0017 결정 1), 의존성은 factory로 주입(ADR 0018 결정 8).

import { ${serviceFactory} } from './service.js';
import { ${repoFactory} } from './repository.js';
import * as schemas from './schemas.js';

export async function ${routesFunc}(fastify) {
  const ${repoVar} = ${repoFactory}({ db: fastify.db });
  const ${serviceVar} = ${serviceFactory}({ ${camel}Repository: ${repoVar} });

${handlers}

  // 미사용 변수 경고를 막기 위한 자리. service를 위 핸들러에서 호출하면 자연스럽게 해결됨
  void ${serviceVar};
}
`;
}

// ── 본체 ─────────────────────────────────────────────────────

// generateNodeBackend는 architecture.language='node'일 때 set이 호출하는 함수.
// generatedDir(.beoreum/project/generated) 안에 backend/ 트리를 만든다.
//
// 입력:
//   inputs        - set.js의 loadInputs 결과. intent, contracts, scenarios 사용
//   generatedDir  - .beoreum/project/generated 절대 경로
//   now           - 테스트용 결정적 시각(현재는 사용하지 않음. 미래 자리)
//
// 반환: { backendDir, featureCount, fileCount }
export function generateNodeBackend({ inputs, generatedDir, now: _now } = {}) {
  if (!inputs) throw new Error('generateNodeBackend({ inputs })가 필요합니다');
  if (!generatedDir) throw new Error('generateNodeBackend({ generatedDir })가 필요합니다');

  // internal 블럭은 features 디렉토리에 만들지 않는다(공개 API 없음, ADR 0013 결정 3).
  const publicContracts = getPublicContracts(inputs);

  const packageName = buildPackageName(inputs.intent);
  const backendDir = join(generatedDir, 'backend');
  const srcDir = join(backendDir, 'src');
  const featuresDir = join(srcDir, 'features');

  mkdirSync(featuresDir, { recursive: true });

  const features = publicContracts.map((c) => ({
    blockId: c.block_id,
    name: c.name,
    dir: c.block_id,
    routesFunction: `${toCamelCase(c.block_id)}Routes`,
    prefix: '/',
    endpoints: c.endpoints || [],
  }));

  // 최상위 파일들
  writeFileSync(join(backendDir, 'package.json'), buildPackageJson(packageName), 'utf8');
  writeFileSync(
    join(backendDir, 'README.md'),
    buildBackendReadme(packageName, features.length),
    'utf8',
  );
  writeFileSync(join(srcDir, 'server.js'), buildServerJs(features), 'utf8');

  let fileCount = 3; // package.json + README.md + server.js

  // feature별 5개 파일
  for (const f of features) {
    const featureDir = join(featuresDir, f.dir);
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, 'domain.js'), buildDomainJs(f.blockId, f.name), 'utf8');
    writeFileSync(join(featureDir, 'service.js'), buildServiceJs(f.blockId, f.name), 'utf8');
    writeFileSync(join(featureDir, 'repository.js'), buildRepositoryJs(f.blockId, f.name), 'utf8');
    writeFileSync(
      join(featureDir, 'schemas.js'),
      buildSchemasJs(f.blockId, f.name, f.endpoints),
      'utf8',
    );
    writeFileSync(
      join(featureDir, 'routes.js'),
      buildRoutesJs(f.blockId, f.name, f.endpoints),
      'utf8',
    );
    fileCount += 5;
  }

  return {
    backendDir,
    featureCount: features.length,
    fileCount,
  };
}
