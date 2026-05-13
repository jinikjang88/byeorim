// review-response-parser 단위 테스트. ADR 0039의 응답 형식 파싱 자리.
// graceful degrade를 함께 검증(섹션 못 찾음, yaml 깨짐, changes 누락 등).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseReviewResponse,
  parseFindingsResponse,
  validateForgeChange,
  validateTemperChange,
  validateInspectFinding,
  validateSmeltChange,
  validateShapeChange,
} from '../../packages/cli/src/review-response-parser.js';

const VALID_RESPONSE = `
자유 형식 검토 시작.
endpoint가 좋아 보여요.

## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: endpoint_add
    block_id: order
    new_endpoint:
      method: GET
      path: "/orders/by-customer/{customerId}"
      operation: list_by_customer
      description: 고객별 주문 조회
    reason: 고객 도메인에서 자주 필요해요

  - kind: endpoint_remove
    block_id: order
    target_endpoint:
      method: DELETE
      path: "/orders/{id}"
    reason: 영구 삭제는 안 해요
\`\`\`
`;

test('parse: 정상 응답에서 changes 배열을 뽑는다', () => {
  // Given
  const md = VALID_RESPONSE;
  // When
  const result = parseReviewResponse(md);
  // Then
  assert.equal(result.hasStructuredSection, true);
  assert.equal(result.parseError, null);
  assert.equal(result.changes.length, 2);
  assert.equal(result.changes[0].kind, 'endpoint_add');
  assert.equal(result.changes[1].kind, 'endpoint_remove');
});

test('parse: changes가 빈 배열이어도 정상으로 본다', () => {
  // Given
  const md = `## 제안된 변경 사항\n\n\`\`\`yaml\nchanges: []\n\`\`\`\n`;
  // When
  const result = parseReviewResponse(md);
  // Then
  assert.equal(result.hasStructuredSection, true);
  assert.equal(result.parseError, null);
  assert.deepEqual(result.changes, []);
});

test('parse: ```yml 펜스도 ```yaml처럼 받는다', () => {
  // Given
  const md = `## 제안된 변경 사항\n\n\`\`\`yml\nchanges:\n  - kind: endpoint_remove\n    block_id: order\n    target_endpoint:\n      method: DELETE\n      path: "/orders/{id}"\n    reason: r\n\`\`\`\n`;
  // When
  const result = parseReviewResponse(md);
  // Then
  assert.equal(result.parseError, null);
  assert.equal(result.changes.length, 1);
});

test('parse: 같은 헤딩이 두 번 나오면 마지막 자리를 신뢰한다', () => {
  // Given: 첫 번째 섹션은 빈 changes, 두 번째 섹션은 한 개
  const md = `
## 제안된 변경 사항

\`\`\`yaml
changes: []
\`\`\`

이건 잊어주세요. 다시 답할게요.

## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: endpoint_remove
    block_id: order
    target_endpoint:
      method: DELETE
      path: "/orders/{id}"
    reason: r
\`\`\`
`;
  // When
  const result = parseReviewResponse(md);
  // Then
  assert.equal(result.changes.length, 1);
});

test('graceful: 입력이 빈 문자열이면 안내', () => {
  const result = parseReviewResponse('');
  assert.equal(result.hasStructuredSection, false);
  assert.match(result.parseError, /비어있어요/);
  assert.deepEqual(result.changes, []);
});

test('graceful: 헤딩이 없으면 hasStructuredSection=false', () => {
  const result = parseReviewResponse('자유 형식 응답만 있어요.');
  assert.equal(result.hasStructuredSection, false);
  assert.match(result.parseError, /못 찾았어요/);
});

test('raw yaml: 마크다운 헤딩 없이 changes 키로 시작하는 YAML도 받는다', () => {
  const md = `changes:
  - kind: block_remove
    block_id: b-foo
    reason: 가벼운 시작 결을 위해
  - kind: block_add
    block_id: b-bar
    reason: 도메인에 어울려요
`;
  const result = parseReviewResponse(md);
  assert.equal(result.hasStructuredSection, true);
  assert.equal(result.parseError, null);
  assert.equal(result.changes.length, 2);
  assert.equal(result.changes[0].kind, 'block_remove');
});

test('raw yaml: YAML이지만 changes 키가 없으면 안내로 폴백', () => {
  const md = 'random_key: 1\nother: value\n';
  const result = parseReviewResponse(md);
  assert.equal(result.hasStructuredSection, false);
  assert.match(result.parseError, /못 찾았어요/);
  assert.match(result.parseError, /순수 YAML 결로 답하려면/);
});

test('graceful: 헤딩은 있는데 ```yaml 블록이 없으면 안내', () => {
  const md = '## 제안된 변경 사항\n\n자유 형식 결로만 답했어요.\n';
  const result = parseReviewResponse(md);
  assert.equal(result.hasStructuredSection, true);
  assert.match(result.parseError, /코드 블록을 못 찾았어요/);
});

test('graceful: yaml 본문이 깨졌으면 parseError 안내', () => {
  const md = `## 제안된 변경 사항\n\n\`\`\`yaml\nchanges:\n  - kind: endpoint_add\n    block_id: order\n  invalid: : :\n\`\`\`\n`;
  const result = parseReviewResponse(md);
  assert.equal(result.hasStructuredSection, true);
  assert.match(result.parseError, /yaml 파싱 실패/);
});

test('graceful: yaml에 changes 키가 없으면 안내', () => {
  const md = `## 제안된 변경 사항\n\n\`\`\`yaml\nother: value\n\`\`\`\n`;
  const result = parseReviewResponse(md);
  assert.equal(result.hasStructuredSection, true);
  assert.match(result.parseError, /changes/);
});

test('graceful: changes가 배열이 아니면 안내', () => {
  const md = `## 제안된 변경 사항\n\n\`\`\`yaml\nchanges: not-an-array\n\`\`\`\n`;
  const result = parseReviewResponse(md);
  assert.equal(result.hasStructuredSection, true);
  assert.match(result.parseError, /배열이 아니에요/);
});

// validateForgeChange.

test('validate endpoint_add: new_endpoint와 method/path가 있으면 valid', () => {
  const r = validateForgeChange({
    kind: 'endpoint_add',
    block_id: 'order',
    new_endpoint: { method: 'GET', path: '/orders' },
  });
  assert.equal(r.valid, true);
});

test('validate endpoint_add: new_endpoint 누락이면 invalid', () => {
  const r = validateForgeChange({ kind: 'endpoint_add', block_id: 'order' });
  assert.equal(r.valid, false);
  assert.match(r.reason, /new_endpoint/);
});

test('validate endpoint_remove: target_endpoint 필요', () => {
  const ok = validateForgeChange({
    kind: 'endpoint_remove',
    block_id: 'order',
    target_endpoint: { method: 'DELETE', path: '/orders/{id}' },
  });
  assert.equal(ok.valid, true);
  const bad = validateForgeChange({ kind: 'endpoint_remove', block_id: 'order' });
  assert.equal(bad.valid, false);
});

test('validate schema_modify: target_field가 schema 자리여야 valid', () => {
  const ok = validateForgeChange({
    kind: 'schema_modify',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    target_field: 'request_schema',
    new_value: { type: 'object' },
  });
  assert.equal(ok.valid, true);
  const bad = validateForgeChange({
    kind: 'schema_modify',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    target_field: 'description',
    new_value: 'x',
  });
  assert.equal(bad.valid, false);
});

test('validate schema_modify: new_value undefined면 invalid', () => {
  const r = validateForgeChange({
    kind: 'schema_modify',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    target_field: 'request_schema',
  });
  assert.equal(r.valid, false);
});

test('validate description_modify: new_value 문자열이어야 valid', () => {
  const ok = validateForgeChange({
    kind: 'description_modify',
    block_id: 'order',
    target_endpoint: { method: 'GET', path: '/orders' },
    new_value: '새 설명',
  });
  assert.equal(ok.valid, true);
  const bad = validateForgeChange({
    kind: 'description_modify',
    block_id: 'order',
    target_endpoint: { method: 'GET', path: '/orders' },
    new_value: { not: 'string' },
  });
  assert.equal(bad.valid, false);
});

test('validate: block_id 누락 또는 알 수 없는 kind는 invalid', () => {
  const r1 = validateForgeChange({ kind: 'endpoint_add' });
  assert.equal(r1.valid, false);
  const r2 = validateForgeChange({ kind: 'unknown_kind', block_id: 'order' });
  assert.equal(r2.valid, false);
  assert.match(r2.reason, /알 수 없는 kind/);
});

// validateTemperChange (ADR 0040).

test('validateTemperChange: scenario_add는 new_scenario.kind 필요', () => {
  const ok = validateTemperChange({
    kind: 'scenario_add',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    new_scenario: { kind: 'error_invalid_input' },
  });
  assert.equal(ok.valid, true);
  const bad = validateTemperChange({
    kind: 'scenario_add',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    new_scenario: {},
  });
  assert.equal(bad.valid, false);
  assert.match(bad.reason, /new_scenario\.kind/);
});

test('validateTemperChange: scenario_remove는 target_scenario_kind 필요', () => {
  const ok = validateTemperChange({
    kind: 'scenario_remove',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    target_scenario_kind: 'happy_path',
  });
  assert.equal(ok.valid, true);
  const bad = validateTemperChange({
    kind: 'scenario_remove',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
  });
  assert.equal(bad.valid, false);
});

test('validateTemperChange: gwt_modify는 given/when/then 중 하나 필요', () => {
  const ok = validateTemperChange({
    kind: 'gwt_modify',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    target_scenario_kind: 'happy_path',
    new_value: { given: '새 텍스트' },
  });
  assert.equal(ok.valid, true);
  const bad = validateTemperChange({
    kind: 'gwt_modify',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    target_scenario_kind: 'happy_path',
    new_value: {},
  });
  assert.equal(bad.valid, false);
  assert.match(bad.reason, /given\/when\/then/);
});

test('validateTemperChange: test_code_modify는 new_value 문자열 필요', () => {
  const ok = validateTemperChange({
    kind: 'test_code_modify',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    target_scenario_kind: 'happy_path',
    new_value: 'const r = ...;',
  });
  assert.equal(ok.valid, true);
  const bad = validateTemperChange({
    kind: 'test_code_modify',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
    target_scenario_kind: 'happy_path',
    new_value: { not: 'string' },
  });
  assert.equal(bad.valid, false);
});

test('validateTemperChange: target_endpoint 누락 또는 알 수 없는 kind는 invalid', () => {
  const r1 = validateTemperChange({ kind: 'scenario_remove', block_id: 'order' });
  assert.equal(r1.valid, false);
  const r2 = validateTemperChange({
    kind: 'unknown',
    block_id: 'order',
    target_endpoint: { method: 'POST', path: '/orders' },
  });
  assert.equal(r2.valid, false);
});

// ── ADR 0051: parseFindingsResponse + validateInspectFinding ──

const VALID_FINDINGS_RESPONSE = `자유 형식 검토.

## 검수 결과

\`\`\`yaml
findings:
  - area: 보안
    severity: concern
    title: 외부 AI가 본 결함
    detail: 도메인-특화 결함입니다.
    file: src/server.js

  - area: 성능
    severity: warning
    title: N+1 가능 자리
    detail: list endpoint 봐주세요.
\`\`\`
`;

test('parseFindingsResponse: 정상 응답에서 findings 배열을 뽑는다', () => {
  const r = parseFindingsResponse(VALID_FINDINGS_RESPONSE);
  assert.equal(r.hasStructuredSection, true);
  assert.equal(r.parseError, null);
  assert.equal(r.findings.length, 2);
  assert.equal(r.findings[0].area, '보안');
  assert.equal(r.findings[1].area, '성능');
});

test('parseFindingsResponse: ## 검수 결과 섹션 없으면 hasStructuredSection=false', () => {
  const r = parseFindingsResponse('자유 형식뿐.');
  assert.equal(r.hasStructuredSection, false);
  assert.match(r.parseError, /못 찾았어요/);
});

test('parseFindingsResponse raw yaml: findings 키로 시작하는 YAML도 받는다', () => {
  const md = `findings:
  - area: 보안
    severity: concern
    title: 인증 미들웨어 누락
    detail: 일부 endpoint가 외부에서 직접 호출 가능
  - area: 성능
    severity: warning
    title: N+1 쿼리 결
    detail: list endpoint가 자식 자원을 자식별로 조회
`;
  const r = parseFindingsResponse(md);
  assert.equal(r.hasStructuredSection, true);
  assert.equal(r.parseError, null);
  assert.equal(r.findings.length, 2);
  assert.equal(r.findings[0].area, '보안');
});

test('parseFindingsResponse: 빈 응답은 한국어 안내', () => {
  const r = parseFindingsResponse('');
  assert.equal(r.hasStructuredSection, false);
  assert.match(r.parseError, /비어있어요/);
});

test('parseFindingsResponse: yaml에 findings 키 없으면 안내', () => {
  const md = `## 검수 결과

\`\`\`yaml
other_key: 1
\`\`\`
`;
  const r = parseFindingsResponse(md);
  assert.equal(r.hasStructuredSection, true);
  assert.match(r.parseError, /findings/);
});

test('parseFindingsResponse: 마지막 ## 검수 결과 섹션을 신뢰', () => {
  const md = `## 검수 결과

\`\`\`yaml
findings:
  - area: 보안
    severity: warning
    title: 첫 시도
    detail: ...
\`\`\`

다시 한 번.

## 검수 결과

\`\`\`yaml
findings:
  - area: 운영
    severity: pass
    title: 마지막 시도
    detail: ...
\`\`\`
`;
  const r = parseFindingsResponse(md);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].area, '운영');
});

test('validateInspectFinding: 6영역 이외 area는 invalid', () => {
  const r = validateInspectFinding({
    area: '잘못된 영역',
    severity: 'warning',
    title: 't',
    detail: 'd',
  });
  assert.equal(r.valid, false);
});

test('validateInspectFinding: severity가 셋 외면 invalid', () => {
  const r = validateInspectFinding({
    area: '보안',
    severity: 'invalid',
    title: 't',
    detail: 'd',
  });
  assert.equal(r.valid, false);
});

test('validateInspectFinding: title/detail 누락은 invalid', () => {
  const r1 = validateInspectFinding({ area: '보안', severity: 'warning', detail: 'd' });
  assert.equal(r1.valid, false);
  const r2 = validateInspectFinding({ area: '보안', severity: 'warning', title: 't' });
  assert.equal(r2.valid, false);
});

test('validateInspectFinding: file 옵셔널 (없으면 valid, 문자열이면 valid)', () => {
  const r1 = validateInspectFinding({
    area: '보안',
    severity: 'warning',
    title: 't',
    detail: 'd',
  });
  assert.equal(r1.valid, true);
  const r2 = validateInspectFinding({
    area: '보안',
    severity: 'warning',
    title: 't',
    detail: 'd',
    file: 'src/x.js',
  });
  assert.equal(r2.valid, true);
});

test('validateInspectFinding: 6영역 모두 통과한다', () => {
  for (const area of ['보안', '성능', '운영', '확장성', '법적 리스크', '시장 재검']) {
    const r = validateInspectFinding({
      area,
      severity: 'pass',
      title: 't',
      detail: 'd',
    });
    assert.equal(r.valid, true, `${area}는 valid여야 한다`);
  }
});

// ── ADR 0052: validateSmeltChange ──

test('validateSmeltChange: block_add는 valid', () => {
  const r = validateSmeltChange({ kind: 'block_add', block_id: 'order' });
  assert.equal(r.valid, true);
});

test('validateSmeltChange: block_remove는 valid', () => {
  const r = validateSmeltChange({ kind: 'block_remove', block_id: 'order' });
  assert.equal(r.valid, true);
});

test('validateSmeltChange: block_id 누락은 invalid', () => {
  const r = validateSmeltChange({ kind: 'block_add' });
  assert.equal(r.valid, false);
});

test('validateSmeltChange: block_id가 빈 문자열이면 invalid', () => {
  const r = validateSmeltChange({ kind: 'block_add', block_id: '' });
  assert.equal(r.valid, false);
});

test('validateSmeltChange: 알 수 없는 kind는 invalid', () => {
  const r = validateSmeltChange({ kind: 'block_modify', block_id: 'order' });
  assert.equal(r.valid, false);
  assert.match(r.reason, /알 수 없는 kind/);
});

test('validateSmeltChange: 객체 아니면 invalid', () => {
  assert.equal(validateSmeltChange(null).valid, false);
  assert.equal(validateSmeltChange('string').valid, false);
});

// ── ADR 0053: validateShapeChange ──

test('validateShapeChange: 4개 결정 키 모두 valid', () => {
  for (const key of ['language', 'database', 'api_style', 'architecture_pattern']) {
    const r = validateShapeChange({
      kind: 'decision_modify',
      target_key: key,
      new_value: 'foo',
    });
    assert.equal(r.valid, true, `${key}는 valid여야 한다(형식 검증만, enum 강제는 호출자)`);
  }
});

test('validateShapeChange: target_key가 4개 외면 invalid', () => {
  const r = validateShapeChange({
    kind: 'decision_modify',
    target_key: 'foo_bar',
    new_value: 'python',
  });
  assert.equal(r.valid, false);
});

test('validateShapeChange: kind가 decision_modify 외면 invalid', () => {
  const r = validateShapeChange({
    kind: 'option_add',
    target_key: 'language',
    new_value: 'rust',
  });
  assert.equal(r.valid, false);
});

test('validateShapeChange: new_value 누락 또는 빈 문자열은 invalid', () => {
  const r1 = validateShapeChange({
    kind: 'decision_modify',
    target_key: 'language',
    new_value: '',
  });
  assert.equal(r1.valid, false);
  const r2 = validateShapeChange({
    kind: 'decision_modify',
    target_key: 'language',
  });
  assert.equal(r2.valid, false);
});

test('validateShapeChange: 객체 아니면 invalid', () => {
  assert.equal(validateShapeChange(null).valid, false);
  assert.equal(validateShapeChange(42).valid, false);
});
