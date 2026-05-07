// generators/util.js 단위 테스트. 식별자 변환과 contract 필터의 동작을 한 자리에서 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  toPascalCase,
  toCamelCase,
  toSnakeCase,
  getPublicContracts,
  getIntentWhat,
  methodSpec,
  springAnnotation,
  devPlaceholder,
  DEV_PLACEHOLDER_PREFIX,
} from '../../packages/cli/src/generators/util.js';

// ── toPascalCase ──────────────────────────────────────

test('toPascalCase: 단일 단어는 첫 글자만 대문자로', () => {
  assert.equal(toPascalCase('order'), 'Order');
});

test('toPascalCase: 하이픈 분리는 각 단어를 대문자로 시작해 합친다', () => {
  assert.equal(toPascalCase('cancel-return'), 'CancelReturn');
  assert.equal(toPascalCase('pg-integration'), 'PgIntegration');
});

test('toPascalCase: 다중 하이픈도 안전하게 처리', () => {
  assert.equal(toPascalCase('a-b-c'), 'ABC');
});

// ── toCamelCase ──────────────────────────────────────

test('toCamelCase: 첫 글자는 소문자, 나머지는 PascalCase 결', () => {
  assert.equal(toCamelCase('order'), 'order');
  assert.equal(toCamelCase('cancel-return'), 'cancelReturn');
  assert.equal(toCamelCase('pg-integration'), 'pgIntegration');
});

// ── toSnakeCase ──────────────────────────────────────

test('toSnakeCase: 하이픈을 underscore로, 모두 lowercase', () => {
  assert.equal(toSnakeCase('order'), 'order');
  assert.equal(toSnakeCase('cancel-return'), 'cancel_return');
  assert.equal(toSnakeCase('pg-integration'), 'pg_integration');
});

// ── getPublicContracts ────────────────────────────────

test('getPublicContracts: internal=true 블럭을 제외한다', () => {
  const inputs = {
    contracts: {
      contracts: [
        { block_id: 'order', endpoints: [{ operation: 'create' }] },
        { block_id: 'pg-integration', internal: true, endpoints: [] },
      ],
    },
  };
  const result = getPublicContracts(inputs);
  assert.equal(result.length, 1);
  assert.equal(result[0].block_id, 'order');
});

test('getPublicContracts: 빈 endpoints 블럭을 제외한다', () => {
  const inputs = {
    contracts: {
      contracts: [
        { block_id: 'order', endpoints: [{ operation: 'create' }] },
        { block_id: 'empty', endpoints: [] },
      ],
    },
  };
  const result = getPublicContracts(inputs);
  assert.equal(result.length, 1);
  assert.equal(result[0].block_id, 'order');
});

test('getPublicContracts: contracts가 비어있거나 누락되면 빈 배열', () => {
  assert.deepEqual(getPublicContracts({}), []);
  assert.deepEqual(getPublicContracts({ contracts: {} }), []);
  assert.deepEqual(getPublicContracts({ contracts: { contracts: [] } }), []);
});

test('getPublicContracts: 입력이 null/undefined여도 안전', () => {
  assert.deepEqual(getPublicContracts(null), []);
  assert.deepEqual(getPublicContracts(undefined), []);
});

// ── getIntentWhat ────────────────────────────────────

test('getIntentWhat: extracted.what이 있으면 trim해서 돌려준다', () => {
  const intent = { extracted: { what: '  쇼핑몰  ' } };
  assert.equal(getIntentWhat(intent), '쇼핑몰');
});

test('getIntentWhat: 빈 문자열이나 공백만 있으면 null', () => {
  assert.equal(getIntentWhat({ extracted: { what: '' } }), null);
  assert.equal(getIntentWhat({ extracted: { what: '   ' } }), null);
});

test('getIntentWhat: extracted나 intent가 없으면 null', () => {
  assert.equal(getIntentWhat({}), null);
  assert.equal(getIntentWhat(null), null);
  assert.equal(getIntentWhat(undefined), null);
  assert.equal(getIntentWhat({ extracted: null }), null);
});

test('getIntentWhat: what이 문자열이 아니면 null', () => {
  assert.equal(getIntentWhat({ extracted: { what: 123 } }), null);
  assert.equal(getIntentWhat({ extracted: { what: null } }), null);
});

// ── methodSpec ───────────────────────────────────────

test('methodSpec: forge가 박은 method를 그대로 대문자로 돌려준다', () => {
  assert.equal(methodSpec({ method: 'POST', path: '/orders' }).method, 'POST');
  assert.equal(methodSpec({ method: 'patch', path: '/me' }).method, 'PATCH');
  assert.equal(methodSpec({ method: 'GeT', path: '/x' }).method, 'GET');
});

test('methodSpec: hasBody는 POST/PUT/PATCH일 때만 true', () => {
  assert.equal(methodSpec({ method: 'POST', path: '/x' }).hasBody, true);
  assert.equal(methodSpec({ method: 'PUT', path: '/x' }).hasBody, true);
  assert.equal(methodSpec({ method: 'PATCH', path: '/x' }).hasBody, true);
  assert.equal(methodSpec({ method: 'GET', path: '/x' }).hasBody, false);
  assert.equal(methodSpec({ method: 'DELETE', path: '/x' }).hasBody, false);
});

test('methodSpec: hasPath는 path에 {param}이 있을 때 true', () => {
  assert.equal(methodSpec({ method: 'GET', path: '/orders' }).hasPath, false);
  assert.equal(methodSpec({ method: 'GET', path: '/orders/{id}' }).hasPath, true);
  assert.equal(methodSpec({ method: 'GET', path: '/orders/{orderId}/items' }).hasPath, true);
  // singleton (path param 없음)
  assert.equal(methodSpec({ method: 'PATCH', path: '/me' }).hasPath, false);
});

test('methodSpec: status는 create=201, delete=204, 그 외 200', () => {
  assert.equal(methodSpec({ method: 'POST', path: '/x', operation: 'create' }).status, '201');
  assert.equal(methodSpec({ method: 'DELETE', path: '/x', operation: 'delete' }).status, '204');
  assert.equal(methodSpec({ method: 'GET', path: '/x', operation: 'list' }).status, '200');
  assert.equal(methodSpec({ method: 'PATCH', path: '/me', operation: 'update' }).status, '200');
});

test('methodSpec: operation 없어도 method로 status 폴백', () => {
  assert.equal(methodSpec({ method: 'POST', path: '/x' }).status, '201');
  assert.equal(methodSpec({ method: 'DELETE', path: '/x' }).status, '204');
  assert.equal(methodSpec({ method: 'GET', path: '/x' }).status, '200');
});

test('methodSpec: search operation은 GET이지만 list 결로 200', () => {
  assert.equal(methodSpec({ method: 'GET', path: '/x', operation: 'search' }).status, '200');
});

// ── springAnnotation ─────────────────────────────────

test('springAnnotation: 5개 method 모두 매핑', () => {
  assert.equal(springAnnotation('POST'), 'PostMapping');
  assert.equal(springAnnotation('GET'), 'GetMapping');
  assert.equal(springAnnotation('PUT'), 'PutMapping');
  assert.equal(springAnnotation('PATCH'), 'PatchMapping');
  assert.equal(springAnnotation('DELETE'), 'DeleteMapping');
});

test('springAnnotation: 소문자/대소문자 혼용도 안전', () => {
  assert.equal(springAnnotation('patch'), 'PatchMapping');
  assert.equal(springAnnotation('Post'), 'PostMapping');
});

test('springAnnotation: 알 수 없는 method는 GetMapping 폴백', () => {
  assert.equal(springAnnotation('UNKNOWN'), 'GetMapping');
  assert.equal(springAnnotation(''), 'GetMapping');
  assert.equal(springAnnotation(null), 'GetMapping');
});

// ── devPlaceholder (ADR 0046 결정 5) ──────────────────

test('DEV_PLACEHOLDER_PREFIX는 표준 마커 BEOREUM_DEV_PLACEHOLDER_', () => {
  assert.equal(DEV_PLACEHOLDER_PREFIX, 'BEOREUM_DEV_PLACEHOLDER_');
});

test('devPlaceholder: 키 이름을 받아 prefix + 키 + suffix로 만든다', () => {
  const v = devPlaceholder('jwt_secret');
  assert.ok(v.startsWith('BEOREUM_DEV_PLACEHOLDER_'));
  assert.ok(v.includes('jwt_secret'));
  assert.ok(v.endsWith('_change_before_production'));
});

test('devPlaceholder: 안전하지 않은 문자는 underscore로 정리된다', () => {
  const v = devPlaceholder('Database-URL!');
  assert.match(v, /database_url/);
  assert.ok(v.startsWith('BEOREUM_DEV_PLACEHOLDER_'));
});

test('devPlaceholder: 빈 키 이름은 value 폴백', () => {
  assert.match(devPlaceholder(), /value/);
  assert.match(devPlaceholder(''), /value/);
  assert.match(devPlaceholder(null), /value/);
});

test('devPlaceholder: 결과가 prod 가드의 prefix 검사를 통과한다', () => {
  // 모든 generator의 가드는 startsWith(DEV_PLACEHOLDER_PREFIX)로 검사한다.
  for (const key of ['jwt_secret', 'database_url', 'cors_origin']) {
    assert.ok(devPlaceholder(key).startsWith(DEV_PLACEHOLDER_PREFIX));
  }
});
