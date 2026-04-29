// generators/util.js 단위 테스트. 식별자 변환과 contract 필터의 동작을 한 자리에서 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  toPascalCase,
  toCamelCase,
  toSnakeCase,
  getPublicContracts,
  getIntentWhat,
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
