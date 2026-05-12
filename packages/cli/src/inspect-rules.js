// inspect 정적 규칙 인덱스. ADR 0049를 따른다.
// 언어 무관 규칙 + architecture.language별 언어 규칙을 합쳐 finding 배열을 반환한다.
// 각 규칙은 순수 함수: { cwd, architecture, ... } → finding[].
//
// finding 결: { area, severity, title, detail, file?, source }
//   area     - '보안' | '성능' | '운영' | '확장성' | '법적 리스크' | '시장 재검'
//   severity - 'pass' | 'warning' | 'concern'
//   title    - 한국어 제목 한 줄
//   detail   - 한국어 본문 (줄바꿈 가능)
//   file     - 선택. 관련 파일의 상대 경로
//   source   - 'static' | 'ai'. inspect-rules.js는 항상 'static' (ADR 0050 결정 8)

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── 언어 무관 규칙 ─────────────────────────────────────────

// state.yml이 inspect 단계까지 왔는지 검사. 운영 영역.
function checkStageReady({ cwd }) {
  const stateFile = join(cwd, '.byeorim', 'state.yml');
  if (!existsSync(stateFile)) {
    return [
      {
        area: '운영',
        severity: 'concern',
        title: '.byeorim/state.yml이 없습니다',
        detail: '먼저 byeorim init을 실행해주세요.',
        file: '.byeorim/state.yml',
      },
    ];
  }
  return [
    {
      area: '운영',
      severity: 'pass',
      title: 'state.yml이 존재합니다',
      detail: '7단계 흐름 상태가 추적되고 있습니다.',
      file: '.byeorim/state.yml',
    },
  ];
}

// shape-architecture.yml이 박혀있고 language가 정해졌는지. 운영 영역.
function checkArchitectureSet({ architecture }) {
  if (!architecture || !architecture.language) {
    return [
      {
        area: '운영',
        severity: 'warning',
        title: 'shape-architecture.yml의 language가 비어있습니다',
        detail:
          'shape 단계에서 backend 언어를 정해야 set이 코드를 생성할 수 있습니다. 비춤이 의지할 결을 잃습니다.',
        file: '.byeorim/project/shape-architecture.yml',
      },
    ];
  }
  return [];
}

// generated/ 디렉토리가 있는지. 운영 영역.
function checkGeneratedExists({ cwd }) {
  const generatedDir = join(cwd, '.byeorim', 'project', 'generated');
  if (!existsSync(generatedDir)) {
    return [
      {
        area: '운영',
        severity: 'concern',
        title: 'generated 디렉토리가 없습니다',
        detail: 'set이 아직 실행되지 않았거나 generated/ 트리가 지워진 상태입니다.',
        file: '.byeorim/project/generated/',
      },
    ];
  }
  return [];
}

export function runRulesLanguageAgnostic(args) {
  return [...checkStageReady(args), ...checkArchitectureSet(args), ...checkGeneratedExists(args)];
}

// ── 언어별 검사 ───────────────────────────────────────────

// 파일 안전 읽기. 없거나 못 읽으면 null.
function readSafe(path) {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// ── Backend (Node) ────────────────────────────────────────

function checkNodeBackend({ cwd }) {
  const backendDir = join(cwd, '.byeorim', 'project', 'generated', 'backend');
  if (!existsSync(backendDir)) return [];
  const findings = [];
  const serverFile = join(backendDir, 'src', 'server.js');
  const server = readSafe(serverFile);

  if (server === null) {
    findings.push({
      area: '보안',
      severity: 'concern',
      title: 'server.js가 없습니다',
      detail: 'Node backend의 엔트리가 빠져 있습니다. set을 다시 실행해보세요.',
      file: 'src/server.js',
    });
    return findings;
  }

  // /health endpoint
  if (/app\.get\(['"]\/health['"]/.test(server)) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: '/health endpoint가 인증 없이 공개됩니다',
      detail: 'ADR 0046 결정 1의 표준 endpoint가 emit되었습니다.',
      file: 'src/server.js',
    });
    findings.push({
      area: '운영',
      severity: 'pass',
      title: '/health endpoint가 박혀 있습니다',
      detail: 'byeorim run의 readiness 폴링과 verify --smoke가 의지하는 endpoint입니다.',
      file: 'src/server.js',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'warning',
      title: '/health endpoint가 안 보입니다',
      detail:
        'ADR 0046 baseline이 박힌 코드라면 자동 emit되어야 합니다. set을 다시 실행하거나 사용자가 지운 자리인지 확인해주세요.',
      file: 'src/server.js',
    });
  }

  // JWT_SECRET startup 검사
  if (/JWT_SECRET/.test(server) && /throw new Error/.test(server)) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: 'JWT_SECRET startup 검사가 박혀 있습니다',
      detail: '시크릿 누락 시 시작이 실패합니다(ADR 0017 결정 1).',
      file: 'src/server.js',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'concern',
      title: 'JWT_SECRET 검사가 안 보입니다',
      detail: '시크릿 누락이 startup에서 잡히지 않으면 prod에서 인증이 깨질 수 있습니다.',
      file: 'src/server.js',
    });
  }

  // prod placeholder 가드 (ADR 0046)
  if (server.includes('BYEORIM_DEV_PLACEHOLDER_') && /NODE_ENV.*production/.test(server)) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: 'prod placeholder 가드가 박혀 있습니다',
      detail:
        'NODE_ENV=production에서 dev placeholder 값이 검출되면 시작이 거부됩니다(ADR 0046 결정 4).',
      file: 'src/server.js',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'concern',
      title: 'prod placeholder 가드가 안 보입니다',
      detail:
        'dev 시크릿이 prod에 흘러들어갈 수 있습니다. ADR 0046 결정 4의 두 안전망 중 하나가 빠진 결.',
      file: 'src/server.js',
    });
  }

  // 보안 plugin (helmet/cors/rate-limit)
  const securityPlugins = ['helmet', 'cors', 'rateLimit'];
  const missingPlugins = securityPlugins.filter((p) => !server.includes(p));
  if (missingPlugins.length === 0) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: '보안 plugin이 모두 등록되었습니다',
      detail: 'helmet, cors, rate-limit이 server.js에서 register됩니다(ADR 0017 결정 1).',
      file: 'src/server.js',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'warning',
      title: `보안 plugin ${missingPlugins.join(', ')}가 안 보입니다`,
      detail: 'ADR 0017 결정 1의 보안 baseline이 약해진 자리입니다.',
      file: 'src/server.js',
    });
  }

  // 로깅 (pino)
  if (/logger:/.test(server) || /pino/.test(server)) {
    findings.push({
      area: '운영',
      severity: 'pass',
      title: '로깅이 구성되었습니다',
      detail: 'fastify의 logger 옵션이 박혀 있습니다(redact 결로 시크릿 마스킹).',
      file: 'src/server.js',
    });
  }

  // .env.production 존재
  const envProd = join(backendDir, '.env.production');
  if (existsSync(envProd)) {
    findings.push({
      area: '운영',
      severity: 'pass',
      title: '.env.production 템플릿이 존재합니다',
      detail: 'prod 배포 전에 BYEORIM_DEV_PLACEHOLDER_ 값을 채워야 합니다(ADR 0046 결정 2).',
      file: '.env.production',
    });
  } else {
    findings.push({
      area: '운영',
      severity: 'warning',
      title: '.env.production이 없습니다',
      detail: 'prod 환경 변수 템플릿이 없으면 배포 시 채워야 할 값이 분명하지 않습니다.',
      file: '.env.production',
    });
  }

  // .gitignore에 .env
  const gitignore = readSafe(join(backendDir, '.gitignore'));
  if (gitignore && /^\.env$/m.test(gitignore)) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: '.gitignore가 .env를 제외합니다',
      detail: '시크릿이 git에 올라가지 않도록 보호됩니다.',
      file: '.gitignore',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'concern',
      title: '.gitignore에 .env가 없습니다',
      detail: '시크릿이 commit될 위험이 있습니다.',
      file: '.gitignore',
    });
  }

  // routes.js의 schema 검증
  const featuresDir = join(backendDir, 'src', 'features');
  if (existsSync(featuresDir)) {
    // 한 feature만 샘플로 검사. 전수는 무거움
    try {
      // Simple check: read all routes.js files and check for `schema:`
      const featureDirs = readdirSync(featuresDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      let allHaveSchema = true;
      for (const fd of featureDirs) {
        const routes = readSafe(join(featuresDir, fd, 'routes.js'));
        if (routes && !/schema:\s*schemas/.test(routes)) {
          allHaveSchema = false;
          break;
        }
      }
      if (featureDirs.length > 0) {
        findings.push({
          area: '보안',
          severity: allHaveSchema ? 'pass' : 'warning',
          title: allHaveSchema
            ? '모든 routes.js가 schema 검증을 사용합니다'
            : '일부 routes.js에 schema 검증이 빠진 자리가 있습니다',
          detail: 'fastify의 schema 옵션으로 입력/출력 검증이 강제되어야 합니다(ADR 0018 결정 5).',
          file: 'src/features/*/routes.js',
        });
      }
    } catch {
      // 디렉토리 읽기 실패는 무시(이전 단계 검사가 잡음)
    }
  }

  return findings;
}

// ── Backend (Java) ────────────────────────────────────────

function checkJavaBackend({ cwd }) {
  const backendDir = join(cwd, '.byeorim', 'project', 'generated', 'backend');
  if (!existsSync(backendDir)) return [];
  const findings = [];

  // HealthController.java
  const groupPath = join(backendDir, 'app', 'src', 'main', 'java', 'com', 'example');
  // app 모듈의 패키지는 동적이라 readdirSync로 첫 디렉토리 탐색
  let packageDir = null;
  if (existsSync(groupPath)) {
    try {
      const dirs = readdirSync(groupPath, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      if (dirs.length > 0) {
        packageDir = join(groupPath, dirs[0]);
      }
    } catch {
      // 디렉토리 읽기 실패는 무시
    }
  }

  if (packageDir) {
    const healthCtrl = readSafe(join(packageDir, 'HealthController.java'));
    if (healthCtrl && /@GetMapping\("\/health"\)/.test(healthCtrl)) {
      findings.push({
        area: '보안',
        severity: 'pass',
        title: '/health endpoint가 박혀 있습니다',
        detail: 'HealthController가 ADR 0046 baseline의 표준 endpoint를 emit합니다.',
        file: 'app/.../HealthController.java',
      });
      findings.push({
        area: '운영',
        severity: 'pass',
        title: '/health endpoint가 운영 신호로 박혀 있습니다',
        detail: 'byeorim run과 verify --smoke가 이 endpoint에 의지합니다.',
        file: 'app/.../HealthController.java',
      });
    } else {
      findings.push({
        area: '보안',
        severity: 'warning',
        title: 'HealthController가 안 보입니다',
        detail: 'ADR 0046 baseline의 /health endpoint가 빠진 자리입니다.',
        file: 'app/.../HealthController.java',
      });
    }

    // EnvSecretsValidator
    const validator = readSafe(join(packageDir, 'config', 'EnvSecretsValidator.java'));
    if (validator && /@Profile\("production"\)/.test(validator)) {
      findings.push({
        area: '보안',
        severity: 'pass',
        title: 'production profile에서 placeholder 가드가 동작합니다',
        detail:
          'EnvSecretsValidator가 dev placeholder 값을 검출하면 startup이 거부됩니다(ADR 0046 결정 4).',
        file: 'app/.../config/EnvSecretsValidator.java',
      });
    } else {
      findings.push({
        area: '보안',
        severity: 'concern',
        title: 'prod placeholder 가드가 안 보입니다',
        detail: 'dev 시크릿이 prod로 흘러갈 수 있습니다.',
        file: 'app/.../config/EnvSecretsValidator.java',
      });
    }
  }

  // application-production.yml 존재
  const appProdYml = join(
    backendDir,
    'app',
    'src',
    'main',
    'resources',
    'application-production.yml',
  );
  if (existsSync(appProdYml)) {
    findings.push({
      area: '운영',
      severity: 'pass',
      title: 'application-production.yml 템플릿이 존재합니다',
      detail: 'prod profile의 시크릿 템플릿이 박혀 있습니다(ADR 0046 결정 2).',
      file: 'app/src/main/resources/application-production.yml',
    });
  } else {
    findings.push({
      area: '운영',
      severity: 'warning',
      title: 'application-production.yml이 없습니다',
      detail:
        'prod 시크릿 템플릿이 없으면 배포 시 spring.profiles.active=production 결이 깨집니다.',
      file: 'app/src/main/resources/application-production.yml',
    });
  }

  // .gitignore
  const gitignore = readSafe(join(backendDir, '.gitignore'));
  if (gitignore && /application-production\.yml/.test(gitignore)) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: '.gitignore가 application-production.yml을 제외합니다',
      detail: 'prod 시크릿이 git에 올라가지 않도록 보호됩니다.',
      file: '.gitignore',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'warning',
      title: '.gitignore에 application-production.yml이 없습니다',
      detail: 'prod 시크릿이 commit될 위험이 있습니다.',
      file: '.gitignore',
    });
  }

  return findings;
}

// ── Backend (Python) ──────────────────────────────────────

function checkPythonBackend({ cwd }) {
  const backendDir = join(cwd, '.byeorim', 'project', 'generated', 'backend');
  if (!existsSync(backendDir)) return [];
  const findings = [];

  // src/{pkg}/main.py와 config.py 탐색
  const srcDir = join(backendDir, 'src');
  let pkgDir = null;
  if (existsSync(srcDir)) {
    try {
      const dirs = readdirSync(srcDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      if (dirs.length > 0) pkgDir = join(srcDir, dirs[0]);
    } catch {
      // 디렉토리 읽기 실패는 무시
    }
  }

  if (pkgDir) {
    const main = readSafe(join(pkgDir, 'main.py'));
    if (main && /@app\.get\("\/health"\)/.test(main)) {
      findings.push({
        area: '보안',
        severity: 'pass',
        title: '/health endpoint가 박혀 있습니다',
        detail: 'main.py의 표준 endpoint가 emit되었습니다(ADR 0046 결정 1).',
        file: 'src/{pkg}/main.py',
      });
      findings.push({
        area: '운영',
        severity: 'pass',
        title: '/health endpoint가 운영 신호로 박혀 있습니다',
        detail: 'byeorim run과 verify --smoke가 이 endpoint에 의지합니다.',
        file: 'src/{pkg}/main.py',
      });
    } else {
      findings.push({
        area: '보안',
        severity: 'warning',
        title: 'main.py에 /health endpoint가 안 보입니다',
        detail: 'ADR 0046 baseline이 빠진 자리입니다.',
        file: 'src/{pkg}/main.py',
      });
    }

    // config.py의 prod 가드
    const config = readSafe(join(pkgDir, 'config.py'));
    if (
      config &&
      config.includes('BYEORIM_DEV_PLACEHOLDER_') &&
      /PYTHON_ENV.*production/.test(config)
    ) {
      findings.push({
        area: '보안',
        severity: 'pass',
        title: 'PYTHON_ENV=production에서 placeholder 가드가 동작합니다',
        detail:
          'config.py의 model_validator가 dev placeholder를 검출하면 startup이 거부됩니다(ADR 0046 결정 4).',
        file: 'src/{pkg}/config.py',
      });
    } else {
      findings.push({
        area: '보안',
        severity: 'concern',
        title: 'prod placeholder 가드가 안 보입니다',
        detail: 'dev 시크릿이 prod로 흘러갈 수 있습니다.',
        file: 'src/{pkg}/config.py',
      });
    }

    // secure 미들웨어
    if (main && /Secure/.test(main)) {
      findings.push({
        area: '보안',
        severity: 'pass',
        title: 'secure 미들웨어가 등록되었습니다',
        detail: 'CSP, HSTS 등 보안 헤더가 자동 적용됩니다(ADR 0017 결정 1).',
        file: 'src/{pkg}/main.py',
      });
    }
  }

  // .env.production 존재
  if (existsSync(join(backendDir, '.env.production'))) {
    findings.push({
      area: '운영',
      severity: 'pass',
      title: '.env.production 템플릿이 존재합니다',
      detail: 'prod 환경 변수 템플릿이 박혀 있습니다(ADR 0046 결정 2).',
      file: '.env.production',
    });
  }

  // .gitignore
  const gitignore = readSafe(join(backendDir, '.gitignore'));
  if (gitignore && /^\.env$/m.test(gitignore)) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: '.gitignore가 .env를 제외합니다',
      detail: '시크릿이 git에 올라가지 않도록 보호됩니다.',
      file: '.gitignore',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'concern',
      title: '.gitignore에 .env가 없습니다',
      detail: '시크릿이 commit될 위험이 있습니다.',
      file: '.gitignore',
    });
  }

  return findings;
}

// ── Frontend (Vite + React) ──────────────────────────────

function checkFrontend({ cwd }) {
  const frontendDir = join(cwd, '.byeorim', 'project', 'generated', 'frontend');
  if (!existsSync(frontendDir)) return [];
  const findings = [];

  // index.html의 CSP meta
  const indexHtml = readSafe(join(frontendDir, 'index.html'));
  if (indexHtml && /Content-Security-Policy/.test(indexHtml)) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: 'index.html에 CSP meta가 박혀 있습니다',
      detail:
        '스크립트 출처를 self로 제한하는 보안 baseline입니다(ADR 0017 결정 1, ADR 0021 결정 8).',
      file: 'index.html',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'warning',
      title: 'index.html에 CSP meta가 안 보입니다',
      detail: 'ADR 0021 결정 8의 보안 baseline이 빠진 자리입니다.',
      file: 'index.html',
    });
  }

  // vite.config의 prod 빌드 가드
  const viteConfig = readSafe(join(frontendDir, 'vite.config.ts'));
  if (
    viteConfig &&
    viteConfig.includes('BYEORIM_DEV_PLACEHOLDER_') &&
    /mode === 'production'/.test(viteConfig)
  ) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: 'prod build에서 placeholder 가드가 동작합니다',
      detail: 'vite.config.ts가 dev placeholder를 검출하면 빌드를 거부합니다(ADR 0046 결정 4).',
      file: 'vite.config.ts',
    });
  } else {
    findings.push({
      area: '보안',
      severity: 'concern',
      title: 'vite.config의 prod 빌드 가드가 안 보입니다',
      detail: 'dev 시크릿/주소가 prod 번들로 흘러갈 수 있습니다.',
      file: 'vite.config.ts',
    });
  }

  // .env.production
  if (existsSync(join(frontendDir, '.env.production'))) {
    findings.push({
      area: '운영',
      severity: 'pass',
      title: '.env.production 템플릿이 존재합니다',
      detail: 'prod 빌드 시 사용되는 환경 변수 템플릿(ADR 0046 결정 2).',
      file: '.env.production',
    });
  }

  // .gitignore
  const gitignore = readSafe(join(frontendDir, '.gitignore'));
  if (gitignore && /^\.env$/m.test(gitignore)) {
    findings.push({
      area: '보안',
      severity: 'pass',
      title: '.gitignore가 .env를 제외합니다',
      detail: '시크릿/dev 설정이 git에 올라가지 않습니다.',
      file: '.gitignore',
    });
  }

  // package.json의 dev 스크립트
  const pkg = readSafe(join(frontendDir, 'package.json'));
  if (pkg && /"dev":/.test(pkg)) {
    findings.push({
      area: '운영',
      severity: 'pass',
      title: 'package.json에 dev 스크립트가 있습니다',
      detail: 'byeorim run이 npm run dev로 frontend를 띄울 수 있습니다.',
      file: 'package.json',
    });
  }

  return findings;
}

// ── 인덱스 ─────────────────────────────────────────────

// runAllRules는 언어 무관 + architecture.language별 규칙을 합쳐 finding 배열을 반환한다.
// 모든 finding에 source='static'이 박힌다(ADR 0050 결정 8).
//
// 입력:
//   cwd            - 프로젝트 루트
//   architecture   - shape-architecture.yml (또는 null)
//
// 반환: finding 배열 (모두 source='static')
export function runAllRules({ cwd, architecture }) {
  const args = { cwd, architecture };
  const findings = [...runRulesLanguageAgnostic(args)];

  const language = architecture && architecture.language;
  if (language === 'node') findings.push(...checkNodeBackend(args));
  else if (language === 'java') findings.push(...checkJavaBackend(args));
  else if (language === 'python') findings.push(...checkPythonBackend(args));

  // frontend는 architecture.language 무관 (ADR 0021의 standard)
  findings.push(...checkFrontend(args));

  // ADR 0050 결정 8: 모든 정적 finding에 source='static' 박는다.
  return findings.map((f) => ({ ...f, source: 'static' }));
}
