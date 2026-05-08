// Python 백엔드 코드 생성기. ADR 0020을 따른다.
// architecture.yml의 language='python'일 때 set 단계가 호출.
// internal 블럭은 features에 만들지 않는다(공개 API 없음).
// ep.method가 진실(forge가 박은 자리). resource는 PUT, singleton은 PATCH(ADR 0044).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  toPascalCase,
  toSnakeCase,
  getPublicContracts,
  getIntentWhat,
  methodSpec,
  devPlaceholder,
} from './util.js';

const PROJECT_PACKAGE_FALLBACK = 'byeorim';
const PYTHON_VERSION = '^3.11';

// endpoints의 base path 결정. forge가 첫 endpoint를 컬렉션/싱글톤 base로 박는다.
function basePathOf(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) return '';
  return String(endpoints[0].path || '');
}

// ep.path에서 path param 이름을 뽑는다. 없으면 'id' 폴백.
function pathParamName(path) {
  const m = String(path || '').match(/\{(\w+)\}/);
  return m ? m[1] : 'id';
}

function buildProjectPackage(intent) {
  const what = getIntentWhat(intent);
  if (!what) return PROJECT_PACKAGE_FALLBACK;
  // 한국어가 들어와도 안전한 ASCII fallback. Python 식별자라 underscore 허용.
  const ascii = what.toLowerCase().replace(/[^a-z0-9_]/g, '');
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

// ── 루트 파일 ──────────────────────────────────────────────

function buildPyprojectToml(projectName, projectPackage) {
  return `[tool.poetry]
name = "${projectName}"
version = "0.1.0"
description = "벼림이 자동 생성한 FastAPI 백엔드. ADR 0020을 따른다."
authors = ["DevSmith"]
packages = [{ include = "${projectPackage}", from = "src" }]

[tool.poetry.dependencies]
python = "${PYTHON_VERSION}"
fastapi = "^0.115.0"
uvicorn = { extras = ["standard"], version = "^0.30.0" }
pydantic = "^2.0"
pydantic-settings = "^2.0"
"python-jose" = { extras = ["cryptography"], version = "^3.3" }
passlib = { extras = ["argon2"], version = "^1.7" }
sqlalchemy = "^2.0"
structlog = "^24.0"
secure = "^1.0.1"

[tool.poetry.group.dev.dependencies]
pytest = "^8.0"
pytest-asyncio = "^0.23"
mypy = "^1.0"
ruff = "^0.6"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"

[tool.ruff]
line-length = 100

[tool.mypy]
strict = true

[tool.pytest.ini_options]
testpaths = ["tests"]
`;
}

function buildBackendReadme(projectName, projectPackage, featureCount) {
  return `# ${projectName} (Python)

벼림이 자동 생성한 FastAPI 백엔드 스켈레톤입니다. ADR 0020과 ADR 0046을 따릅니다.

## 시작하기 (dev)

\`.env\`가 dev 값으로 미리 채워져 있어 즉시 띄울 수 있습니다.

1. 의존성 설치: \`poetry install\`
2. 개발 실행: \`poetry run uvicorn ${projectPackage}.main:app --reload\`
3. 살아있는지 확인: \`curl http://localhost:8000/health\` → \`{"status":"ok"}\`
4. 테스트: \`poetry run pytest\`
5. 타입 검사: \`poetry run mypy src\`
6. 린트: \`poetry run ruff check\`

## prod로 옮기기

\`.env.production\`이 템플릿으로 같이 만들어져 있습니다. 모든 \`BYEORIM_DEV_PLACEHOLDER_\` 값을 실제 prod 값으로 교체한 뒤 다음으로 띄웁니다.

\`\`\`
PYTHON_ENV=production poetry run uvicorn ${projectPackage}.main:app
\`\`\`

값을 안 채우고 띄우면 시작이 거부됩니다. 한국어 안내 메시지가 나옵니다.

## 구조

\`\`\`
backend/
├── .env                       # dev 환경 변수 (gitignore, 자동 생성)
├── .env.production            # prod 템플릿 (gitignore, 자동 생성, 사용자가 채움)
├── .gitignore
├── pyproject.toml
└── src/
    └── {project_package}/
        ├── __init__.py
        ├── main.py             # FastAPI 엔트리, /health 라우트
        ├── config.py           # pydantic-settings + prod 가드
        └── features/           # ${featureCount}개 feature
            └── {feature_name}/
                ├── __init__.py
                ├── domain.py
                ├── application.py
                ├── infrastructure.py
                ├── routes.py
                └── schemas.py
\`\`\`

각 feature는 한 패키지에 모입니다. 미래 MSA 분리 시 한 패키지가 한 마이크로서비스로 빠집니다.

## 다음 일

각 feature의 다섯 자리가 TODO로 들어있습니다.

1. \`domain.py\`: dataclass 엔티티와 Protocol 메서드 시그니처
2. \`schemas.py\`: Pydantic 모델 필드
3. \`infrastructure.py\`: SQLAlchemy 또는 외부 API 연결
4. \`application.py\`: use case 함수 본문
5. \`routes.py\`: 핸들러를 application 함수 호출로 교체

## 보안

이 스켈레톤은 ADR 0017 결정 1(보안 최우선)과 ADR 0046 결정 4(prod 가드)를 따릅니다.

- Pydantic이 모든 입력/출력 자동 검증(FastAPI 빌트인)
- \`config.py\`의 Settings 클래스가 \`JWT_SECRET\` 누락 시 시작 실패
- \`secure\` 라이브러리로 보안 헤더 자동 적용
- \`.env\`와 \`.env.production\`은 \`.gitignore\`로 git에서 제외
- production 모드에서 시크릿이 dev placeholder면 시작 거부
- \`mypy strict\` 모드로 인터페이스(Protocol) 위반을 정적 검증
`;
}

// ── src/{pkg}/__init__.py 와 main.py, config.py ───────────

function buildProjectInit(projectPackage) {
  return `"""${projectPackage} 패키지 루트. ADR 0020을 따른다."""
`;
}

function buildMainPy(projectPackage, features) {
  const imports = features
    .map((f) => `from .features.${f.snake}.routes import router as ${f.snake}_router`)
    .join('\n');
  const registrations = features.map((f) => `app.include_router(${f.snake}_router)`).join('\n');

  return `"""FastAPI 엔트리. 자동 생성. ADR 0020과 ADR 0046을 따른다."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from secure import Secure

from .config import settings

${imports}

app = FastAPI(title="${projectPackage}")

# 보안 헤더(secure 라이브러리). ADR 0017 결정 1.
secure_headers = Secure()


@app.middleware("http")
async def set_secure_headers(request, call_next):
    response = await call_next(request)
    secure_headers.framework.fastapi(response)
    return response


# CORS는 화이트리스트 명시. 기본은 빈 배열(차단).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 표준 healthcheck endpoint(ADR 0046 결정 1). 인증 없이 한 URL로 살아있음을 본다.
@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# feature 라우터 등록
${registrations}
`;
}

function buildConfigPy() {
  return `"""환경 변수 로드. pydantic-settings로 검증한 자리에서만 시크릿이 들어온다.

ADR 0017 결정 1: JWT_SECRET이 없으면 시작 시 즉시 실패.
ADR 0046 결정 4 안전망 1: PYTHON_ENV로 .env / .env.production 분기 로드.
ADR 0046 결정 4 안전망 2: production에서 placeholder가 그대로면 시작 거부.
"""

import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# dev placeholder 표준 마커(ADR 0046 결정 5).
# 모든 generator의 prod-mode 가드가 이 prefix를 검사한다.
DEV_PLACEHOLDER_PREFIX = "BYEORIM_DEV_PLACEHOLDER_"

# PYTHON_ENV로 dev/.env 또는 prod/.env.production 분기 로드.
_env_file = ".env.production" if os.environ.get("PYTHON_ENV") == "production" else ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_env_file, env_file_encoding="utf-8")

    PYTHON_ENV: str = "development"

    # 필수: .env에 없으면 ValidationError로 시작 실패
    JWT_SECRET: str

    # 옵션
    DATABASE_URL: str = "sqlite:///./dev.db"
    CORS_ORIGINS: list[str] = []
    LOG_LEVEL: str = "INFO"

    @model_validator(mode="after")
    def _check_prod_secrets(self) -> "Settings":
        if self.PYTHON_ENV != "production":
            return self
        for name, value in (
            ("JWT_SECRET", self.JWT_SECRET),
            ("DATABASE_URL", self.DATABASE_URL),
        ):
            if value.startswith(DEV_PLACEHOLDER_PREFIX):
                raise ValueError(
                    f"PROD 모드에서 {name} 값이 dev placeholder입니다. "
                    f".env.production의 {name}을 prod 값으로 채운 뒤 다시 시작하세요."
                )
        return self


settings = Settings()  # type: ignore[call-arg]
`;
}

// .env (dev에서 즉시 동작). ADR 0046 결정 2.
function buildEnvDev() {
  return `# 자동 생성된 dev 환경 변수. ADR 0046을 따른다.
# 이 파일은 dev에서만 동작하는 값들이 들어있다. prod에서 이 파일을 그대로 쓰지 않는다.
# prod 환경 변수는 .env.production에 별도로 채운다.

PYTHON_ENV=development

# 시크릿. dev placeholder는 prod 가드가 검출해서 막는다(ADR 0046 결정 4).
JWT_SECRET=${devPlaceholder('jwt_secret')}

# 데이터베이스. dev는 SQLite 파일로 외부 의존성 없이 기동(ADR 0046 결정 3).
DATABASE_URL=sqlite:///./dev.db

# CORS. dev는 frontend dev 서버(Vite default 포트)를 허용.
CORS_ORIGINS=["http://localhost:5173"]

LOG_LEVEL=DEBUG
`;
}

// .env.production (prod 템플릿). ADR 0046 결정 2.
function buildEnvProduction() {
  return `# 자동 생성된 prod 환경 변수 템플릿. ADR 0046을 따른다.
# 이 파일을 prod에 배포하기 전에 모든 BYEORIM_DEV_PLACEHOLDER_ 값을 실제 값으로 채운다.
# 채우지 않은 채로 PYTHON_ENV=production으로 기동하면 시작이 거부된다.

PYTHON_ENV=production

# 시크릿. 반드시 안전한 random 값으로 교체.
JWT_SECRET=${devPlaceholder('jwt_secret')}

# 데이터베이스. architecture.yml에서 고른 DB의 connection string으로 교체.
DATABASE_URL=${devPlaceholder('database_url')}

# CORS. 실제 배포 도메인으로 교체.
CORS_ORIGINS=["${devPlaceholder('cors_origin')}"]

LOG_LEVEL=INFO
`;
}

// .gitignore. ADR 0046 결정 2의 안전 결.
function buildGitignore() {
  return `__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/
.venv/
venv/
dist/
build/
*.egg-info/
.DS_Store
.coverage
htmlcov/

# 시크릿 파일(ADR 0046)
.env
.env.production

# dev SQLite
*.db
*.sqlite
`;
}

function buildFeaturesInit() {
  return `"""features 네임스페이스. 각 하위 패키지가 한 feature."""
`;
}

// ── feature 파일들 ──────────────────────────────────────────

function buildFeatureInit(blockName) {
  return `"""${blockName} feature 패키지. ADR 0020 결정 4의 헥사고날 4영역."""
`;
}

function buildDomainPy(className, blockName) {
  return `"""${blockName} 도메인 모델. 순수 Python(I/O 없음).

ADR 0020 결정 4의 domain 영역. 다른 영역을 import하지 않습니다.
"""

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class ${className}:
    """${blockName} 엔티티.

    TODO: 필드를 정의하세요.
    """

    id: UUID


class ${className}Repository(Protocol):
    """${blockName} repository 인터페이스. ADR 0020 결정 8(Protocol로 인터페이스 우선)."""

    def find_by_id(self, id: UUID) -> ${className} | None: ...

    def save(self, aggregate: ${className}) -> None: ...
`;
}

function buildApplicationPy(className, blockName, snake) {
  return `"""${blockName} 응용 서비스. use case 단위 함수.

ADR 0020 결정 4의 application 영역. domain만 import.
"""

from .domain import ${className}, ${className}Repository

# TODO: use case 함수를 추가하세요.
# 예시:
#
# def place_${snake}(command, repository: ${className}Repository) -> ${className}:
#     # 도메인 로직 ...
#     repository.save(aggregate)
#     return aggregate
`;
}

function buildInfrastructurePy(className, blockName) {
  return `"""${blockName} repository 구현. ADR 0020 결정 4의 infrastructure 영역.

domain의 Protocol을 만족합니다. 외부 도구(SQLAlchemy, HTTP 클라이언트 등)는
이 자리에서만 알고 다른 영역은 모릅니다.
"""

from uuid import UUID

from .domain import ${className}, ${className}Repository  # noqa: F401  # Protocol 호환성 표시용


class Sql${className}Repository:
    """SQLAlchemy 기반 ${className}Repository 구현."""

    def __init__(self, session) -> None:
        self._session = session

    def find_by_id(self, id: UUID) -> ${className} | None:
        # TODO: ORM 쿼리
        return None

    def save(self, aggregate: ${className}) -> None:
        # TODO: ORM 저장
        ...
`;
}

// JSON Schema → Python 타입 (ADR 0023 결정 4 매핑 표).
function pythonType(schema) {
  if (!schema || typeof schema !== 'object') return 'object';
  switch (schema.type) {
    case 'string':
      return 'str';
    case 'integer':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    case 'array':
      return `list[${pythonType(schema.items)}]`;
    case 'object':
      return 'dict';
    default:
      return 'object';
  }
}

// schema가 type='object'면 Pydantic 클래스 본문(필드들). 아니면 빈 placeholder.
function pydanticBody(schema, indent = '    ') {
  if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
    return `${indent}# empty placeholder`;
  }
  const props = schema.properties || {};
  const required = new Set(schema.required || []);
  const fields = Object.entries(props).map(([name, sub]) => {
    const type = pythonType(sub);
    return required.has(name)
      ? `${indent}${name}: ${type}`
      : `${indent}${name}: ${type} | None = None`;
  });
  if (fields.length === 0) return `${indent}# empty placeholder`;
  return fields.join('\n');
}

function buildSchemasPy(blockName, endpoints) {
  const models = endpoints
    .map((ep) => {
      const opPascal = toPascalCase(ep.operation);
      const spec = methodSpec(ep);
      const requestBlock = spec.hasBody
        ? `class ${opPascal}Request(BaseModel):
    """${ep.operation} 요청 본문. contracts.yml의 ${ep.operation}.request_schema 거울."""

${pydanticBody(ep.request_schema)}
`
        : '';
      const responseBlock = `class ${opPascal}Response(BaseModel):
    """${ep.operation} 응답 본문. contracts.yml의 ${ep.operation}.response_schema 거울."""

${pydanticBody(ep.response_schema)}
`;
      return [requestBlock, responseBlock].filter(Boolean).join('\n');
    })
    .join('\n\n');

  return `"""${blockName} Pydantic 스키마. ADR 0020 결정 5의 입력/출력 검증.

contracts.yml의 schema가 채워지면 그 필드가 여기에 들어옵니다(ADR 0023).
"""

from pydantic import BaseModel


${models}
`;
}

function buildRoutesPy(blockId, className, blockName, snake, endpoints) {
  const pathPrefix = basePathOf(endpoints);
  const handlers = endpoints
    .map((ep) => {
      const spec = methodSpec(ep);
      const opPascal = toPascalCase(ep.operation);
      // 상대 path = ep.path - pathPrefix. 같으면 빈 문자열.
      const relativeRaw =
        ep.path && ep.path.startsWith(pathPrefix) ? ep.path.slice(pathPrefix.length) : ep.path;
      const path = relativeRaw ? `"${relativeRaw}"` : '""';
      const httpMethod = spec.method.toLowerCase();
      const params = [];
      if (spec.hasPath) {
        const paramName = pathParamName(ep.path);
        params.push(`${paramName}: UUID`);
      }
      if (spec.hasBody) params.push(`request: ${opPascal}Request`);
      params.push(`repository: Sql${className}Repository = Depends(get_repository)`);
      const paramList = params.join(',\n    ');

      return `@router.${httpMethod}(${path}, status_code=${spec.status}, response_model=${opPascal}Response)
async def ${ep.operation}(
    ${paramList},
) -> ${opPascal}Response:
    """${ep.operation} ${ep.method} ${ep.path}"""
    # TODO: application 함수 호출로 교체
    raise NotImplementedError("${ep.operation}")`;
    })
    .join('\n\n\n');

  const requestImports = endpoints
    .filter((ep) => methodSpec(ep).hasBody)
    .map((ep) => `${toPascalCase(ep.operation)}Request`);
  const responseImports = endpoints.map((ep) => `${toPascalCase(ep.operation)}Response`);
  const allImports = [...requestImports, ...responseImports];

  return `"""${blockName} FastAPI 라우터. ADR 0020 결정 8의 Depends + Pydantic.

각 엔드포인트가 Pydantic으로 입력/출력을 자동 검증(ADR 0017 결정 1).
"""

from uuid import UUID

from fastapi import APIRouter, Depends

from .infrastructure import Sql${className}Repository
from .schemas import (
    ${allImports.join(',\n    ')},
)

router = APIRouter(prefix="${pathPrefix}", tags=["${blockId}"])


def get_repository() -> Sql${className}Repository:
    """Repository 주입 자리. TODO: 실제 DB 세션을 받아 넘기세요."""
    return Sql${className}Repository(None)


${handlers}
`;
}

// ── 본체 ─────────────────────────────────────────────────────

// generatePythonBackend는 architecture.language='python'일 때 set이 호출.
//
// 입력:
//   inputs        - set.js의 loadInputs 결과
//   generatedDir  - .byeorim/project/generated 절대 경로
//   now           - 테스트용 결정적 시각(현재 사용 안 함)
//
// 반환: { backendDir, featureCount, fileCount }
export function generatePythonBackend({ inputs, generatedDir, now: _now } = {}) {
  if (!inputs) throw new Error('generatePythonBackend({ inputs })가 필요합니다');
  if (!generatedDir) throw new Error('generatePythonBackend({ generatedDir })가 필요합니다');

  const publicContracts = getPublicContracts(inputs);

  const projectPackage = buildProjectPackage(inputs.intent);
  const projectName = buildProjectName(inputs.intent);

  const backendDir = join(generatedDir, 'backend');
  const pkgDir = join(backendDir, 'src', projectPackage);
  const featuresDir = join(pkgDir, 'features');
  mkdirSync(featuresDir, { recursive: true });

  const features = publicContracts.map((c) => ({
    blockId: c.block_id,
    name: c.name,
    snake: toSnakeCase(c.block_id),
    className: toPascalCase(c.block_id),
    endpoints: c.endpoints || [],
  }));

  // 루트
  writeFileSync(
    join(backendDir, 'pyproject.toml'),
    buildPyprojectToml(projectName, projectPackage),
    'utf8',
  );
  writeFileSync(
    join(backendDir, 'README.md'),
    buildBackendReadme(projectName, projectPackage, features.length),
    'utf8',
  );
  writeFileSync(join(backendDir, '.gitignore'), buildGitignore(), 'utf8');

  // ADR 0046 결정 2: dev .env와 prod 템플릿 둘 다 자동 생성.
  // 이미 있으면 사용자가 채운 prod 값을 보호하기 위해 덮어쓰지 않는다.
  const envFile = join(backendDir, '.env');
  const envProdFile = join(backendDir, '.env.production');
  let envFileCount = 0;
  if (!existsSync(envFile)) {
    writeFileSync(envFile, buildEnvDev(), 'utf8');
    envFileCount += 1;
  }
  if (!existsSync(envProdFile)) {
    writeFileSync(envProdFile, buildEnvProduction(), 'utf8');
    envFileCount += 1;
  }

  // src/{pkg}/
  writeFileSync(join(pkgDir, '__init__.py'), buildProjectInit(projectPackage), 'utf8');
  writeFileSync(join(pkgDir, 'main.py'), buildMainPy(projectPackage, features), 'utf8');
  writeFileSync(join(pkgDir, 'config.py'), buildConfigPy(), 'utf8');

  // src/{pkg}/features/__init__.py
  writeFileSync(join(featuresDir, '__init__.py'), buildFeaturesInit(), 'utf8');

  // pyproject + README + .gitignore + env files + 3 src files + features/__init__
  let fileCount = 7 + envFileCount;

  // feature별 6개 파일
  for (const f of features) {
    const featureDir = join(featuresDir, f.snake);
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, '__init__.py'), buildFeatureInit(f.name), 'utf8');
    writeFileSync(join(featureDir, 'domain.py'), buildDomainPy(f.className, f.name), 'utf8');
    writeFileSync(
      join(featureDir, 'application.py'),
      buildApplicationPy(f.className, f.name, f.snake),
      'utf8',
    );
    writeFileSync(
      join(featureDir, 'infrastructure.py'),
      buildInfrastructurePy(f.className, f.name),
      'utf8',
    );
    writeFileSync(join(featureDir, 'schemas.py'), buildSchemasPy(f.name, f.endpoints), 'utf8');
    writeFileSync(
      join(featureDir, 'routes.py'),
      buildRoutesPy(f.blockId, f.className, f.name, f.snake, f.endpoints),
      'utf8',
    );
    fileCount += 6;
  }

  return {
    backendDir,
    featureCount: features.length,
    fileCount,
  };
}
