// Frontend 코드 생성기. ADR 0021을 따른다(React + Vite + TypeScript + feature-based).
// architecture.yml의 frontend_framework는 아직 없음. 이번 출시는 React 표준 고정.
// internal 블럭은 frontend features에 만들지 않는다(공개 API 없음).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toPascalCase, getPublicContracts, getIntentWhat } from './util.js';

// ADR 0013 결정 3의 operation에서 JS/TS 함수 이름. delete는 예약어라 remove로 매핑.
const OPERATION_FUNCTION_NAME = {
  create: 'create',
  list: 'list',
  get: 'get',
  update: 'update',
  delete: 'remove',
  search: 'search',
};

// operation → HTTP method.
const OPERATION_HTTP_METHOD = {
  create: 'POST',
  list: 'GET',
  get: 'GET',
  update: 'PUT',
  delete: 'DELETE',
  search: 'GET',
};

// fetch URL에서 path parameter를 변수로 치환할 때 쓰는 형식.
// /orders/{id} → `${BASE}/orders/${id}` 형태의 템플릿 리터럴.
// React Router는 라우트 path에 `/{block-id}/*` 와일드카드만 쓰므로 별도 변환이 없다.
function pathToTemplate(path) {
  return path.replace(/\{(\w+)\}/g, '${$1}');
}

function buildProjectName(intent) {
  const what = getIntentWhat(intent);
  if (!what) return 'beoreum-frontend';
  const slug = what
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${slug}-frontend` : 'beoreum-frontend';
}

// ── 루트 파일 ───────────────────────────────────────────────

function buildPackageJson(name) {
  const doc = {
    name,
    version: '0.1.0',
    type: 'module',
    private: true,
    scripts: {
      dev: 'vite',
      build: 'tsc -b && vite build',
      preview: 'vite preview',
      test: 'vitest',
    },
    dependencies: {
      react: '^18.3.0',
      'react-dom': '^18.3.0',
      'react-router-dom': '^6.27.0',
    },
    devDependencies: {
      '@testing-library/react': '^16.0.0',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.0',
      typescript: '^5.5.0',
      vite: '^5.4.0',
      vitest: '^2.0.0',
    },
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

function buildViteConfig() {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ADR 0021: Vite + React. dev server는 backend의 CORS origin 화이트리스트에 등록되어야 한다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
`;
}

function buildTsconfig() {
  const doc = {
    compilerOptions: {
      target: 'ES2022',
      useDefineForClassFields: true,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['src'],
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

function buildIndexHtml(name) {
  // CSP meta는 ADR 0017 결정 1과 ADR 0021 결정 8의 핵심. 운영에서는 서버 헤더로 추가 강화.
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' \${VITE_API_BASE}"
    />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function buildFrontendReadme(name, featureCount) {
  return `# ${name}

벼름이 자동 생성한 React + Vite + TypeScript 프론트엔드 스켈레톤입니다. ADR 0021을 따릅니다.

## 시작하기

1. \`.env\` 파일을 만들고 backend API 주소를 채우세요(\`VITE_API_BASE=http://localhost:3000\` 등).
2. 의존성 설치: \`npm install\`
3. 개발 서버: \`npm run dev\` (기본 포트 5173)
4. 빌드: \`npm run build\`
5. 테스트: \`npm test\`

## 구조

\`\`\`
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── router.tsx
    ├── api/                # ${featureCount}개 feature의 API 클라이언트
    │   └── {feature}.ts
    ├── types/              # contracts.yml schema에서 변환된 TS 타입
    │   └── {feature}.ts
    └── features/           # feature별 페이지 컴포넌트
        └── {feature}/
            └── {Feature}Page.tsx
\`\`\`

backend의 features/와 1:1 짝(ADR 0017 결정 2). 미래 MSA 분리 시 한 feature가 BE 모듈 + FE 자리로 함께 빠집니다.

## 다음 일

각 feature의 자리에 TODO가 들어있습니다.

1. \`types/{feature}.ts\`: contracts.yml의 request/response schema가 채워지면 여기에 옮기세요.
2. \`api/{feature}.ts\`: API 클라이언트는 자동 생성. 필요한 경우 에러 처리, 인증 헤더를 보강하세요.
3. \`features/{feature}/{Feature}Page.tsx\`: API 클라이언트를 호출해 UI를 만드세요.

## 보안

이 스켈레톤은 ADR 0017 결정 1과 ADR 0021 결정 8을 따릅니다.

- index.html의 CSP meta가 스크립트 출처를 self로 제한
- fetch에 \`credentials: 'include'\`가 기본 적용. backend는 secure cookie로 인증 토큰을 관리
- \`.env\`의 \`VITE_\` prefix 변수는 클라이언트 번들에 노출되므로 시크릿(JWT 토큰 등)을 넣지 마세요. 시크릿은 backend의 자리
- React JSX는 자동으로 escape하므로 XSS 방어가 기본. \`dangerouslySetInnerHTML\` 사용을 회피하세요
- TypeScript strict 모드로 컴파일 타임 검증
`;
}

function buildMainTsx() {
  return `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;
}

function buildAppTsx() {
  return `import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './router';

export function App() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
`;
}

function buildRouterTsx(features) {
  const imports = features
    .map((f) => `import { ${f.className}Page } from './features/${f.dir}/${f.className}Page';`)
    .join('\n');

  const routes = features
    .map((f) => `        <Route path="/${f.dir}/*" element={<${f.className}Page />} />`)
    .join('\n');

  return `import { Routes, Route } from 'react-router-dom';
${imports}

export function AppRouter() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <main>
            <h1>벼름 프로젝트</h1>
            <p>왼쪽 경로에서 feature를 선택하세요.</p>
          </main>
        }
      />
${routes}
    </Routes>
  );
}
`;
}

// ── feature 파일 ────────────────────────────────────────────

// JSON Schema → TypeScript 타입 (ADR 0023 결정 4).
function tsType(schema) {
  if (!schema || typeof schema !== 'object') return 'unknown';
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return `${tsType(schema.items)}[]`;
    case 'object':
      // 평면 schema 정책. 깊은 중첩은 미래 ADR.
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

// schema가 type='object'이면 interface 본문(필드들). 아니면 빈 placeholder 주석.
function tsInterfaceBody(schema) {
  if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
    return '  // empty placeholder';
  }
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const fields = Object.entries(props).map(([name, sub]) => {
    const optional = required.has(name) ? '' : '?';
    return `  ${name}${optional}: ${tsType(sub)};`;
  });
  if (fields.length === 0) return '  // empty placeholder';
  return fields.join('\n');
}

function buildTypesTs(blockName, blockId, endpoints) {
  const declarations = endpoints
    .map((ep) => {
      const opPascal = toPascalCase(ep.operation);
      // ADR 0013 매핑: hasBody operation은 Request 타입이 필요. 모든 operation은 Response 타입.
      const hasBody = ['create', 'update'].includes(ep.operation);
      const requestBlock = hasBody
        ? `// ${ep.operation} 요청 본문. contracts.yml의 ${ep.operation}.request_schema 거울.
export interface ${opPascal}Request {
${tsInterfaceBody(ep.request_schema)}
}
`
        : '';
      const responseBlock = `// ${ep.operation} 응답 본문. contracts.yml의 ${ep.operation}.response_schema 거울.
export interface ${opPascal}Response {
${tsInterfaceBody(ep.response_schema)}
}
`;
      return [requestBlock, responseBlock].filter(Boolean).join('\n');
    })
    .join('\n');

  return `// ${blockName} TypeScript 타입. ADR 0021 결정 6의 BE/FE 타입 공유.
// block_id: ${blockId}
// schema가 contracts.yml에서 채워지면 그 필드가 여기에 들어옵니다(ADR 0023).

${declarations}`;
}

function buildApiTs(blockName, blockId, endpoints) {
  const typeImports = endpoints
    .flatMap((ep) => {
      const opPascal = toPascalCase(ep.operation);
      const hasBody = ['create', 'update'].includes(ep.operation);
      return hasBody ? [`${opPascal}Request`, `${opPascal}Response`] : [`${opPascal}Response`];
    })
    .filter((v, i, a) => a.indexOf(v) === i);

  const importStatement = typeImports.length
    ? `import type {\n  ${typeImports.join(',\n  ')},\n} from '../types/${blockId}';`
    : '';

  const handlers = endpoints
    .map((ep) => {
      const opSpec = OPERATION_FUNCTION_NAME[ep.operation] || ep.operation;
      const httpMethod = OPERATION_HTTP_METHOD[ep.operation] || 'GET';
      const opPascal = toPascalCase(ep.operation);
      const hasBody = ['create', 'update'].includes(ep.operation);
      const hasPath = ep.path.includes('{');
      const pathTpl = pathToTemplate(ep.path);

      // 함수 인자
      const params = [];
      if (hasPath) {
        // {id} 같은 path 변수 추출
        const matches = [...ep.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        for (const p of matches) params.push(`${p}: string`);
      }
      if (hasBody) params.push(`input: ${opPascal}Request`);
      const paramList = params.join(', ');

      const body = hasBody ? '\n    body: JSON.stringify(input),' : '';
      const successStatus = ep.operation === 'create' ? 201 : ep.operation === 'delete' ? 204 : 200;
      const returnHandling =
        ep.operation === 'delete'
          ? `if (!response.ok) throw new Error(\`\${response.status}: \${await response.text()}\`);
  return;`
          : `if (!response.ok) throw new Error(\`\${response.status}: \${await response.text()}\`);
  return (await response.json()) as ${opPascal}Response;`;

      const returnType = ep.operation === 'delete' ? 'void' : `${opPascal}Response`;

      return `// ${ep.operation} ${ep.method} ${ep.path} (성공 ${successStatus})
export async function ${opSpec}(${paramList}): Promise<${returnType}> {
  const response = await fetch(\`\${BASE}${pathTpl}\`, {
    method: '${httpMethod}',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',${body}
  });
  ${returnHandling}
}`;
    })
    .join('\n\n');

  return `// ${blockName} API 클라이언트. ADR 0021 결정 6의 contracts.yml 자동 생성.
// 모든 fetch가 secure cookie를 자동 송수신한다(ADR 0021 결정 8).

${importStatement}

const BASE = import.meta.env.VITE_API_BASE ?? '';

${handlers}
`;
}

function buildPageTsx(blockName, blockId, className) {
  return `// ${blockName} 페이지. ADR 0021 결정 5의 feature-based 구조.
// API 클라이언트(../../api/${blockId})를 호출해 UI를 채우세요.

export function ${className}Page() {
  return (
    <main>
      <h1>${blockName}</h1>
      <p>TODO: ${className} feature의 UI를 만드세요.</p>
      <p>API 클라이언트: <code>src/api/${blockId}.ts</code></p>
    </main>
  );
}
`;
}

// ── 본체 ─────────────────────────────────────────────────────

// generateFrontend는 set이 항상 호출(ADR 0021의 standard frontend 정책).
//
// 입력:
//   inputs        - set.js의 loadInputs 결과
//   generatedDir  - .beoreum/project/generated 절대 경로
//   now           - 테스트용 결정적 시각(현재 사용 안 함)
//
// 반환: { frontendDir, featureCount, fileCount }
export function generateFrontend({ inputs, generatedDir, now: _now } = {}) {
  if (!inputs) throw new Error('generateFrontend({ inputs })가 필요합니다');
  if (!generatedDir) throw new Error('generateFrontend({ generatedDir })가 필요합니다');

  const publicContracts = getPublicContracts(inputs);
  const features = publicContracts.map((c) => ({
    blockId: c.block_id,
    name: c.name,
    dir: c.block_id,
    className: toPascalCase(c.block_id),
    endpoints: c.endpoints || [],
  }));

  const projectName = buildProjectName(inputs.intent);

  const frontendDir = join(generatedDir, 'frontend');
  const srcDir = join(frontendDir, 'src');
  const apiDir = join(srcDir, 'api');
  const typesDir = join(srcDir, 'types');
  const featuresDir = join(srcDir, 'features');

  mkdirSync(srcDir, { recursive: true });
  mkdirSync(apiDir, { recursive: true });
  mkdirSync(typesDir, { recursive: true });
  mkdirSync(featuresDir, { recursive: true });

  // 루트 파일 8개
  writeFileSync(join(frontendDir, 'package.json'), buildPackageJson(projectName), 'utf8');
  writeFileSync(join(frontendDir, 'vite.config.ts'), buildViteConfig(), 'utf8');
  writeFileSync(join(frontendDir, 'tsconfig.json'), buildTsconfig(), 'utf8');
  writeFileSync(join(frontendDir, 'index.html'), buildIndexHtml(projectName), 'utf8');
  writeFileSync(
    join(frontendDir, 'README.md'),
    buildFrontendReadme(projectName, features.length),
    'utf8',
  );
  writeFileSync(join(srcDir, 'main.tsx'), buildMainTsx(), 'utf8');
  writeFileSync(join(srcDir, 'App.tsx'), buildAppTsx(), 'utf8');
  writeFileSync(join(srcDir, 'router.tsx'), buildRouterTsx(features), 'utf8');

  let fileCount = 8;

  // feature별 3개 파일
  for (const f of features) {
    writeFileSync(
      join(typesDir, `${f.dir}.ts`),
      buildTypesTs(f.name, f.blockId, f.endpoints),
      'utf8',
    );
    writeFileSync(join(apiDir, `${f.dir}.ts`), buildApiTs(f.name, f.blockId, f.endpoints), 'utf8');
    const featurePageDir = join(featuresDir, f.dir);
    mkdirSync(featurePageDir, { recursive: true });
    writeFileSync(
      join(featurePageDir, `${f.className}Page.tsx`),
      buildPageTsx(f.name, f.blockId, f.className),
      'utf8',
    );
    fileCount += 3;
  }

  return {
    frontendDir,
    featureCount: features.length,
    fileCount,
  };
}
