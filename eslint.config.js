// 벼림 ESLint 설정. CLAUDE.md 섹션 3의 의존성 방향을 import 경로 차단으로 강제한다.
// 의존성 방향:
//   templates → 데이터, 의존성 없음
//   core      → 내부 의존성 없음
//   catalog   → core
//   ai        → core
//   cli       → core, catalog, ai
//   tests     → 전부

import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

const PACKAGES = {
  CORE: './packages/core',
  CATALOG: './packages/catalog',
  AI: './packages/ai',
  CLI: './packages/cli',
  TEMPLATES: './packages/templates',
};

// 어떤 패키지가 어떤 패키지를 import하면 안 되는지 한 자리에 모은다.
// CLAUDE.md 섹션 3의 의존성 방향이 바뀌면 이 표만 갱신한다.
const FORBIDDEN_EDGES = [
  // core는 내부 의존성 없음
  [PACKAGES.CORE, PACKAGES.CATALOG],
  [PACKAGES.CORE, PACKAGES.AI],
  [PACKAGES.CORE, PACKAGES.CLI],
  [PACKAGES.CORE, PACKAGES.TEMPLATES],

  // catalog는 core만
  [PACKAGES.CATALOG, PACKAGES.AI],
  [PACKAGES.CATALOG, PACKAGES.CLI],
  [PACKAGES.CATALOG, PACKAGES.TEMPLATES],

  // ai는 core만
  [PACKAGES.AI, PACKAGES.CATALOG],
  [PACKAGES.AI, PACKAGES.CLI],
  [PACKAGES.AI, PACKAGES.TEMPLATES],

  // templates는 데이터만, 어떤 패키지도 import 안 함
  [PACKAGES.TEMPLATES, PACKAGES.CORE],
  [PACKAGES.TEMPLATES, PACKAGES.CATALOG],
  [PACKAGES.TEMPLATES, PACKAGES.AI],
  [PACKAGES.TEMPLATES, PACKAGES.CLI],
];

const restrictedZones = FORBIDDEN_EDGES.map(([target, from]) => ({
  target,
  from,
  message: `${target}는 ${from}를 import할 수 없다 (CLAUDE.md 섹션 3 의존성 방향)`,
}));

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'import/no-restricted-paths': ['error', { zones: restrictedZones }],
    },
  },
  {
    // 테스트는 모든 패키지를 자유롭게 import한다(CLAUDE.md 섹션 3: tests → 전부)
    files: ['tests/**/*.js'],
    rules: {
      'import/no-restricted-paths': 'off',
    },
  },
  {
    // ESLint 자체와 빌드 산출물은 검사 대상에서 제외
    ignores: ['node_modules/**', '.byeorim/**', 'coverage/**'],
  },
];
