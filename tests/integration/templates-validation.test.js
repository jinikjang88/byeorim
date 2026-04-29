// 실제 templates/ 카탈로그 데이터가 검증을 통과하는지 확인한다.
// loadCatalog가 읽기 → 파싱 → 검증을 한 번에 묶어준다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { loadCatalog } from '../../packages/catalog/index.js';
import { templatePath, templates } from '../../packages/templates/index.js';

test('commerce 템플릿이 카탈로그 스키마와 참조 무결성을 통과한다', () => {
  // Given: 실제 packages/templates/commerce/catalog.yml
  // When: 로더로 한 번에 읽고 검증한다
  // Then: 예외 없이 객체가 돌아온다
  const catalog = loadCatalog(templatePath('commerce'));
  assert.equal(typeof catalog, 'object');
  assert.ok(Array.isArray(catalog.blocks));
});

test('job-aggregator 템플릿이 카탈로그 스키마와 참조 무결성을 통과한다', () => {
  // Given: 실제 packages/templates/job-aggregator/catalog.yml
  // When: 로더 호출
  // Then: 통과
  const catalog = loadCatalog(templatePath('job-aggregator'));
  assert.equal(typeof catalog, 'object');
  assert.ok(Array.isArray(catalog.blocks));
});

test('등록된 모든 템플릿 경로가 실제로 로드된다', () => {
  // Given: templates 객체에 등록된 경로 전부
  // When: 각 경로를 loadCatalog로 읽는다
  // Then: 예외 없이 worlds와 blocks 배열을 가진 객체가 돌아온다
  for (const name of Object.keys(templates)) {
    const catalog = loadCatalog(templatePath(name));
    assert.ok(Array.isArray(catalog.worlds), `${name}에 worlds 배열이 없다`);
    assert.ok(Array.isArray(catalog.blocks), `${name}에 blocks 배열이 없다`);
  }
});

test('알려지지 않은 템플릿 이름은 명확한 한국어 오류로 알린다', () => {
  // Given: 등록되지 않은 템플릿 이름
  // When: templatePath를 호출한다
  // Then: 한국어 메시지의 Error가 던져진다
  assert.throws(() => templatePath('ghost-domain'), /알 수 없는 템플릿/);
});
