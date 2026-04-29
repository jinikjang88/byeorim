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
