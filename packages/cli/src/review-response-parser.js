// 외부 AI 검토 응답에서 "## 제안된 변경 사항" 섹션의 ```yaml 블록을 찾아 changes 배열을 추출한다.
// ADR 0039(forge import-review)와 ADR 0040(temper import-review)이 같은 결로 사용한다.
// ADR 0051(inspect import-review)는 "## 검수 결과" 섹션의 findings 배열을 같은 결로 추출.
// CLAUDE.md 섹션 8(파일당 책임): 파서는 자유 형식 마크다운 → 구조화 changes/findings 한 자리.
// 검증(form 검증 vs 위치 검증)은 호출자(applyForgeReview, applyTemperReview, applyInspectReview)가 한다.
// graceful degrade: 섹션 못 찾거나 yaml 깨지면 빈 배열 + parseError 안내.

import yaml from 'js-yaml';

// "## 제안된 변경 사항" 헤딩을 본다. 영문/공백 변형을 살짝 허용.
const SECTION_HEADING_REGEX = /^##\s*제안된\s*변경(?:\s*사항)?\s*$/m;

// "## 검수 결과" 헤딩을 본다(ADR 0051).
const FINDINGS_SECTION_HEADING_REGEX = /^##\s*검수\s*결과\s*$/m;

// 코드 펜스(```yaml 또는 ```yml). ADR 0039 결정 1.
// 첫 펜스만 매치. 뒤에 또 펜스가 와도 첫 자리만 본다.
const YAML_FENCE_REGEX = /```ya?ml\s*\n([\s\S]*?)\n```/;

// 마지막 "## 제안된 변경 사항" 섹션을 찾는다.
// 외부 AI가 같은 헤딩을 두 번 적었을 때(예: 다시 답하라고 부탁한 자리) 가장 마지막 결을 신뢰.
function findLastSectionStart(markdown) {
  const re = /^##\s*제안된\s*변경(?:\s*사항)?\s*$/gm;
  let lastMatch = null;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    lastMatch = m;
  }
  return lastMatch ? lastMatch.index : -1;
}

// 입력 본문 전체를 순수 YAML로 시도해 expectedKey 배열을 뽑는다.
// 외부 AI가 마크다운 결을 건너뛰고 YAML 한 덩어리로 답한 결을 살린다.
// 깨지면 null. 호출자가 마크다운 결 안내로 폴백한다.
function tryParseRawYaml(markdown, expectedKey) {
  try {
    const parsed = yaml.load(markdown);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed[expectedKey])) {
      return parsed[expectedKey];
    }
  } catch {
    // 결이 YAML로 안 풀리면 마크다운 결 안내로 폴백
  }
  return null;
}

// 마지막 "## 검수 결과" 섹션을 찾는다.
function findLastFindingsSectionStart(markdown) {
  const re = /^##\s*검수\s*결과\s*$/gm;
  let lastMatch = null;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    lastMatch = m;
  }
  return lastMatch ? lastMatch.index : -1;
}

// parseReviewResponse는 외부 AI 응답 마크다운에서 changes 배열을 뽑는다.
//
// 입력:
//   markdown - 외부 AI가 돌려준 응답 텍스트(자유 형식 + 구조화 섹션)
//
// 반환:
//   {
//     hasStructuredSection: boolean,   // "## 제안된 변경 사항" 섹션을 찾았는가
//     changes: Array<RawChange>,       // 파싱된 changes 배열(비어있을 수 있음)
//     parseError: string | null,       // 파싱 단계 에러 메시지(graceful 신호)
//   }
//
// 검증(block_id 존재 등)은 호출자가 한다(applyForgeReview에서 forge-contracts.yml과 비교).
// 이 함수는 형식 파싱만 책임진다.
export function parseReviewResponse(markdown) {
  if (typeof markdown !== 'string' || markdown.trim() === '') {
    return { hasStructuredSection: false, changes: [], parseError: '응답이 비어있어요' };
  }

  const sectionStart = findLastSectionStart(markdown);
  if (sectionStart < 0) {
    if (!SECTION_HEADING_REGEX.test(markdown)) {
      // raw YAML 결로 폴백: 외부 AI가 마크다운 건너뛰고 YAML 한 덩어리로 답한 결
      const rawChanges = tryParseRawYaml(markdown, 'changes');
      if (rawChanges !== null) {
        return { hasStructuredSection: true, changes: rawChanges, parseError: null };
      }
      return {
        hasStructuredSection: false,
        changes: [],
        parseError:
          '"## 제안된 변경 사항" 섹션을 못 찾았어요. 순수 YAML 결로 답하려면 `changes:` 키로 시작하는 결로 박아주세요',
      };
    }
  }

  const after = sectionStart >= 0 ? markdown.slice(sectionStart) : markdown;
  const yamlMatch = after.match(YAML_FENCE_REGEX);
  if (!yamlMatch) {
    return {
      hasStructuredSection: true,
      changes: [],
      parseError: '"## 제안된 변경 사항" 섹션 안에 ```yaml 코드 블록을 못 찾았어요',
    };
  }

  let parsed;
  try {
    parsed = yaml.load(yamlMatch[1]);
  } catch (err) {
    return {
      hasStructuredSection: true,
      changes: [],
      parseError: `yaml 파싱 실패: ${err.message || err}`,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      hasStructuredSection: true,
      changes: [],
      parseError: 'yaml 본문이 비어있거나 객체가 아니에요',
    };
  }

  const rawChanges = parsed.changes;
  if (rawChanges === undefined || rawChanges === null) {
    return {
      hasStructuredSection: true,
      changes: [],
      parseError: '`changes` 키를 못 찾았어요',
    };
  }
  if (!Array.isArray(rawChanges)) {
    return {
      hasStructuredSection: true,
      changes: [],
      parseError: '`changes`가 배열이 아니에요',
    };
  }

  return {
    hasStructuredSection: true,
    changes: rawChanges,
    parseError: null,
  };
}

// parseFindingsResponse는 외부 AI 응답에서 "## 검수 결과" 섹션의 findings 배열을 뽑는다.
// ADR 0051. parseReviewResponse(forge/temper)와 결이 평행이지만 키 이름이 findings.
//
// 반환:
//   {
//     hasStructuredSection: boolean,
//     findings: Array<RawFinding>,
//     parseError: string | null,
//   }
export function parseFindingsResponse(markdown) {
  if (typeof markdown !== 'string' || markdown.trim() === '') {
    return { hasStructuredSection: false, findings: [], parseError: '응답이 비어있어요' };
  }

  const sectionStart = findLastFindingsSectionStart(markdown);
  if (sectionStart < 0) {
    if (!FINDINGS_SECTION_HEADING_REGEX.test(markdown)) {
      // raw YAML 결로 폴백: 외부 AI가 마크다운 건너뛰고 YAML 한 덩어리로 답한 결
      const rawFindings = tryParseRawYaml(markdown, 'findings');
      if (rawFindings !== null) {
        return { hasStructuredSection: true, findings: rawFindings, parseError: null };
      }
      return {
        hasStructuredSection: false,
        findings: [],
        parseError:
          '"## 검수 결과" 섹션을 못 찾았어요. 순수 YAML 결로 답하려면 `findings:` 키로 시작하는 결로 박아주세요',
      };
    }
  }

  const after = sectionStart >= 0 ? markdown.slice(sectionStart) : markdown;
  const yamlMatch = after.match(YAML_FENCE_REGEX);
  if (!yamlMatch) {
    return {
      hasStructuredSection: true,
      findings: [],
      parseError: '"## 검수 결과" 섹션 안에 ```yaml 코드 블록을 못 찾았어요',
    };
  }

  let parsed;
  try {
    parsed = yaml.load(yamlMatch[1]);
  } catch (err) {
    return {
      hasStructuredSection: true,
      findings: [],
      parseError: `yaml 파싱 실패: ${err.message || err}`,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      hasStructuredSection: true,
      findings: [],
      parseError: 'yaml 본문이 비어있거나 객체가 아니에요',
    };
  }

  const rawFindings = parsed.findings;
  if (rawFindings === undefined || rawFindings === null) {
    return {
      hasStructuredSection: true,
      findings: [],
      parseError: '`findings` 키를 못 찾았어요',
    };
  }
  if (!Array.isArray(rawFindings)) {
    return {
      hasStructuredSection: true,
      findings: [],
      parseError: '`findings`가 배열이 아니에요',
    };
  }

  return {
    hasStructuredSection: true,
    findings: rawFindings,
    parseError: null,
  };
}

// 한 finding 객체가 inspect import에 쓸 수 있는 모양인지 본다(ADR 0051).
// applyInspectReview가 호출. 반환: { valid: true } 또는 { valid: false, reason: string }.
const VALID_AREAS = new Set(['보안', '성능', '운영', '확장성', '법적 리스크', '시장 재검']);
const VALID_SEVERITIES = new Set(['pass', 'warning', 'concern']);

export function validateInspectFinding(finding) {
  if (!finding || typeof finding !== 'object') {
    return { valid: false, reason: '객체 아님' };
  }
  if (!VALID_AREAS.has(finding.area)) {
    return { valid: false, reason: `area가 6영역 중 하나가 아닙니다(받은 값: ${finding.area})` };
  }
  if (!VALID_SEVERITIES.has(finding.severity)) {
    return {
      valid: false,
      reason: `severity가 pass/warning/concern 중 하나가 아닙니다(받은 값: ${finding.severity})`,
    };
  }
  if (typeof finding.title !== 'string' || finding.title.trim() === '') {
    return { valid: false, reason: 'title 누락' };
  }
  if (typeof finding.detail !== 'string' || finding.detail.trim() === '') {
    return { valid: false, reason: 'detail 누락' };
  }
  if (finding.file !== undefined && typeof finding.file !== 'string') {
    return { valid: false, reason: 'file이 문자열 아님' };
  }
  return { valid: true };
}

// 한 변경 객체가 shape import에 쓸 수 있는 모양인지 본다(ADR 0053).
// applyShapeReview가 호출. 표준 옵션 enum 검증은 호출자에서(shape.js의 getValidArchitectureValues 사용).
// 반환: { valid: true } 또는 { valid: false, reason: string }
const SHAPE_DECISION_KEYS = new Set(['language', 'database', 'api_style', 'architecture_pattern']);

export function validateShapeChange(change) {
  if (!change || typeof change !== 'object') {
    return { valid: false, reason: '객체 아님' };
  }
  if (change.kind !== 'decision_modify') {
    return {
      valid: false,
      reason: `알 수 없는 kind: ${change.kind} (decision_modify만 지원)`,
    };
  }
  if (!SHAPE_DECISION_KEYS.has(change.target_key)) {
    return {
      valid: false,
      reason: `target_key가 4개 결정 중 하나가 아닙니다(받은 값: ${change.target_key})`,
    };
  }
  if (typeof change.new_value !== 'string' || change.new_value.trim() === '') {
    return { valid: false, reason: 'new_value 누락 또는 비어있음' };
  }
  return { valid: true };
}

// 한 변경 객체가 smelt import에 쓸 수 있는 모양인지 본다(ADR 0052).
// applySmeltReview가 호출. 위치 검증(catalog 대비)은 호출자에서.
// 반환: { valid: true } 또는 { valid: false, reason: string }
export function validateSmeltChange(change) {
  if (!change || typeof change !== 'object') {
    return { valid: false, reason: '객체 아님' };
  }
  const kind = change.kind;
  if (typeof kind !== 'string') {
    return { valid: false, reason: 'kind 누락' };
  }
  if (typeof change.block_id !== 'string' || change.block_id.trim() === '') {
    return { valid: false, reason: 'block_id 누락' };
  }
  if (kind !== 'block_add' && kind !== 'block_remove') {
    return { valid: false, reason: `알 수 없는 kind: ${kind} (block_add 또는 block_remove)` };
  }
  return { valid: true };
}

// 한 변경 객체가 forge import에 쓸 수 있는 모양인지 본다.
// applyForgeReview가 호출(파싱과 분리, 데이터 무관성 정신).
// 반환: { valid: true } 또는 { valid: false, reason: string }
export function validateForgeChange(change) {
  if (!change || typeof change !== 'object') {
    return { valid: false, reason: '객체 아님' };
  }
  const kind = change.kind;
  if (typeof kind !== 'string') {
    return { valid: false, reason: 'kind 누락' };
  }
  if (typeof change.block_id !== 'string' || change.block_id.trim() === '') {
    return { valid: false, reason: 'block_id 누락' };
  }

  switch (kind) {
    case 'endpoint_add': {
      const ep = change.new_endpoint;
      if (!ep || typeof ep !== 'object') {
        return { valid: false, reason: 'new_endpoint 누락' };
      }
      if (typeof ep.method !== 'string' || typeof ep.path !== 'string') {
        return { valid: false, reason: 'new_endpoint.method/path 누락' };
      }
      return { valid: true };
    }
    case 'endpoint_remove': {
      const ep = change.target_endpoint;
      if (!ep || typeof ep !== 'object') {
        return { valid: false, reason: 'target_endpoint 누락' };
      }
      if (typeof ep.method !== 'string' || typeof ep.path !== 'string') {
        return { valid: false, reason: 'target_endpoint.method/path 누락' };
      }
      return { valid: true };
    }
    case 'schema_modify': {
      const ep = change.target_endpoint;
      if (!ep || typeof ep !== 'object') {
        return { valid: false, reason: 'target_endpoint 누락' };
      }
      if (typeof ep.method !== 'string' || typeof ep.path !== 'string') {
        return { valid: false, reason: 'target_endpoint.method/path 누락' };
      }
      if (change.target_field !== 'request_schema' && change.target_field !== 'response_schema') {
        return { valid: false, reason: 'target_field가 request_schema/response_schema 아님' };
      }
      if (change.new_value === undefined) {
        return { valid: false, reason: 'new_value 누락' };
      }
      return { valid: true };
    }
    case 'description_modify': {
      const ep = change.target_endpoint;
      if (!ep || typeof ep !== 'object') {
        return { valid: false, reason: 'target_endpoint 누락' };
      }
      if (typeof ep.method !== 'string' || typeof ep.path !== 'string') {
        return { valid: false, reason: 'target_endpoint.method/path 누락' };
      }
      if (typeof change.new_value !== 'string') {
        return { valid: false, reason: 'new_value가 문자열 아님' };
      }
      return { valid: true };
    }
    default:
      return { valid: false, reason: `알 수 없는 kind: ${kind}` };
  }
}

// 한 변경 객체가 temper import에 쓸 수 있는 모양인지 본다(ADR 0040).
// applyTemperReview가 호출. 위치 검증(temper-scenarios.yml 대비)은 호출자에서.
// 반환: { valid: true } 또는 { valid: false, reason: string }
export function validateTemperChange(change) {
  if (!change || typeof change !== 'object') {
    return { valid: false, reason: '객체 아님' };
  }
  const kind = change.kind;
  if (typeof kind !== 'string') {
    return { valid: false, reason: 'kind 누락' };
  }
  if (typeof change.block_id !== 'string' || change.block_id.trim() === '') {
    return { valid: false, reason: 'block_id 누락' };
  }
  // 모든 temper kind는 target_endpoint(method/path)가 필요
  const ep = change.target_endpoint;
  if (!ep || typeof ep !== 'object') {
    return { valid: false, reason: 'target_endpoint 누락' };
  }
  if (typeof ep.method !== 'string' || typeof ep.path !== 'string') {
    return { valid: false, reason: 'target_endpoint.method/path 누락' };
  }

  switch (kind) {
    case 'scenario_add': {
      const ns = change.new_scenario;
      if (!ns || typeof ns !== 'object') {
        return { valid: false, reason: 'new_scenario 누락' };
      }
      if (typeof ns.kind !== 'string' || ns.kind.trim() === '') {
        return { valid: false, reason: 'new_scenario.kind 누락' };
      }
      // given/when/then은 권장이지만 빈 자리도 허용(외부 AI가 일부만 박을 수 있음)
      return { valid: true };
    }
    case 'scenario_remove': {
      if (typeof change.target_scenario_kind !== 'string') {
        return { valid: false, reason: 'target_scenario_kind 누락' };
      }
      return { valid: true };
    }
    case 'gwt_modify': {
      if (typeof change.target_scenario_kind !== 'string') {
        return { valid: false, reason: 'target_scenario_kind 누락' };
      }
      const v = change.new_value;
      if (!v || typeof v !== 'object') {
        return { valid: false, reason: 'new_value 객체 누락' };
      }
      // given/when/then 중 하나 이상 박혀야 함(빈 객체는 의미 없음)
      const hasAny =
        typeof v.given === 'string' || typeof v.when === 'string' || typeof v.then === 'string';
      if (!hasAny) {
        return { valid: false, reason: 'given/when/then 중 하나 이상 박아주세요' };
      }
      return { valid: true };
    }
    case 'test_code_modify': {
      if (typeof change.target_scenario_kind !== 'string') {
        return { valid: false, reason: 'target_scenario_kind 누락' };
      }
      if (typeof change.new_value !== 'string') {
        return { valid: false, reason: 'new_value가 문자열 아님' };
      }
      return { valid: true };
    }
    default:
      return { valid: false, reason: `알 수 없는 kind: ${kind}` };
  }
}
