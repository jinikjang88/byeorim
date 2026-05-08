// 언어별 backend generator(node.js, java.js, python.js)가 공유하는 헬퍼 모음.
// 식별자 변환과 contract 필터처럼 세 generator에서 동일하게 쓰이는 자리만 모은다.
// 언어별 차이가 있는 자리(buildProjectPackage, OPERATION_HTTP 매핑 등)는 각 generator에 둔다.

// pg-integration → PgIntegration. 클래스/팩토리 이름 형식.
export function toPascalCase(blockId) {
  return blockId
    .split('-')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

// pg-integration → pgIntegration. JS/Java 변수 이름 형식.
export function toCamelCase(blockId) {
  const pascal = toPascalCase(blockId);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// pg-integration → pg_integration. Python 식별자 형식.
export function toSnakeCase(blockId) {
  return blockId.replace(/-/g, '_').toLowerCase();
}

// 카탈로그에서 public(internal 제외, 빈 endpoints 제외) contract만 추린다.
// ADR 0013 결정 5(internal은 빌드 자리가 아님), ADR 0018/0019/0020의 features 디렉토리 정책과 짝.
export function getPublicContracts(inputs) {
  const contracts = (inputs && inputs.contracts && inputs.contracts.contracts) || [];
  return contracts.filter((c) => !c.internal && (c.endpoints || []).length > 0);
}

// intent.extracted.what을 안전하게 가져온다. 없으면 null.
// 세 generator가 project name/package를 만들 때 첫 단계로 사용.
export function getIntentWhat(intent) {
  const what = intent && intent.extracted && intent.extracted.what;
  if (typeof what !== 'string' || !what.trim()) return null;
  return what.trim();
}

// endpoint의 HTTP method 결을 풀어쓴다. ep.method가 진실(forge가 박은 자리).
// resource는 PUT, singleton은 PATCH(ADR 0044), 그 외도 forge가 박은 method 그대로.
//
// 반환:
//   {
//     method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' (대문자),
//     hasBody: boolean   // 요청 body가 있는 method인가(POST/PUT/PATCH)
//     hasPath: boolean   // path에 {id} 같은 path param이 있는가
//     status: '200' | '201' | '204' (성공 응답 코드 관습)
//   }
export function methodSpec(endpoint) {
  const method = String((endpoint && endpoint.method) || 'GET').toUpperCase();
  const path = String((endpoint && endpoint.path) || '');
  const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
  const hasPath = /\{[^}]+\}/.test(path);
  // 성공 응답 코드 관습. 생성=201, 삭제=204, 그 외=200.
  // operation 이름 우선(create/delete가 명확), 없으면 method 기반(POST=201, DELETE=204).
  const op = endpoint && endpoint.operation;
  let status;
  if (op === 'create' || (method === 'POST' && op !== 'search')) {
    status = '201';
  } else if (op === 'delete' || method === 'DELETE') {
    status = '204';
  } else {
    status = '200';
  }
  return { method, hasBody, hasPath, status };
}

// HTTP method를 Spring annotation 이름으로 매핑.
// java generator가 사용. ADR 0044 결정 2(singleton update → PATCH).
export function springAnnotation(method) {
  const m = String(method || 'GET').toUpperCase();
  const map = {
    POST: 'PostMapping',
    GET: 'GetMapping',
    PUT: 'PutMapping',
    PATCH: 'PatchMapping',
    DELETE: 'DeleteMapping',
  };
  return map[m] || 'GetMapping';
}

// dev placeholder 표준 마커. ADR 0046 결정 5.
// .env / application.yml / .env.production 등에 박히는 dev-only 값의 prefix.
// 모든 generator의 prod-mode 가드가 이 prefix를 검사한다.
export const DEV_PLACEHOLDER_PREFIX = 'BYEORIM_DEV_PLACEHOLDER_';

// dev placeholder 값을 만든다. 키 이름을 받아 prefix + 키 + suffix로 한 줄 마커.
// 예: devPlaceholder('jwt_secret') → 'BYEORIM_DEV_PLACEHOLDER_jwt_secret_change_before_production'
export function devPlaceholder(keyName) {
  const safe = String(keyName || 'value')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  return `${DEV_PLACEHOLDER_PREFIX}${safe}_change_before_production`;
}
