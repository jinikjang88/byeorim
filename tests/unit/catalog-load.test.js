// 카탈로그 로더 단위 테스트. Given-When-Then 패턴 (CLAUDE.md 섹션 4)

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalog } from '../../packages/catalog/index.js';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'beoreum-catalog-load-'));
}

function writeYaml(dir, name, content) {
  const path = join(dir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

const validCatalogYaml = `
worlds:
  - id: w-one
    title: 세계 1
blocks:
  - id: block-a
    name: A
    user_desc: 블럭 A 설명
`;

test('정상 카탈로그 YAML을 객체로 로드한다', () => {
  // Given: 검증을 통과할 최소 YAML 파일
  const dir = makeTempDir();
  try {
    const path = writeYaml(dir, 'catalog.yml', validCatalogYaml);
    // When: 로더를 호출한다
    const catalog = loadCatalog(path);
    // Then: 파싱된 객체가 돌아오고 핵심 필드가 살아있다
    assert.equal(typeof catalog, 'object');
    assert.equal(catalog.worlds.length, 1);
    assert.equal(catalog.worlds[0].id, 'w-one');
    assert.equal(catalog.blocks.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('존재하지 않는 파일 경로는 한국어 메시지로 거부한다', () => {
  // Given: 어디에도 없는 경로
  const path = join(tmpdir(), 'no-such-catalog-' + Date.now() + '.yml');
  // When/Then: loadCatalog가 한국어 메시지의 Error를 던지고 cause에 원본을 보존한다
  assert.throws(
    () => loadCatalog(path),
    (err) => {
      assert.match(err.message, /카탈로그 파일을 읽지 못했습니다/);
      assert.ok(err.cause, 'cause에 원본 에러가 보존되어야 한다');
      return true;
    },
  );
});

test('YAML 문법이 망가지면 한국어 메시지로 거부한다', () => {
  // Given: 따옴표가 닫히지 않은 망가진 YAML
  const dir = makeTempDir();
  try {
    const path = writeYaml(dir, 'broken.yml', 'worlds:\n  - id: "unclosed\nblocks: []\n');
    // When/Then: YAML 파서 오류가 한국어 메시지로 감싸져 던져진다
    assert.throws(
      () => loadCatalog(path),
      (err) => {
        assert.match(err.message, /YAML 문법이 올바르지 않습니다/);
        assert.ok(err.cause, 'cause에 원본 파서 에러가 보존되어야 한다');
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('루트가 객체가 아닌 YAML은 거부한다', () => {
  // Given: 루트가 리스트인 YAML
  const dir = makeTempDir();
  try {
    const path = writeYaml(dir, 'list.yml', '- one\n- two\n');
    // When/Then: 객체 형태여야 한다는 메시지로 거부된다
    assert.throws(
      () => loadCatalog(path),
      (err) => {
        assert.match(err.message, /객체 형태여야 합니다/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('검증을 통과하지 못한 카탈로그는 errors 배열을 Error에 실어 던진다', () => {
  // Given: blocks가 없는 YAML(스키마 위반)
  const dir = makeTempDir();
  try {
    const path = writeYaml(dir, 'invalid.yml', 'worlds:\n  - id: w-one\n    title: 세계 1\n');
    // When/Then: 검증 실패 메시지와 함께 errors가 Error에 실린다
    assert.throws(
      () => loadCatalog(path),
      (err) => {
        assert.match(err.message, /카탈로그 검증을 통과하지 못했습니다/);
        assert.ok(Array.isArray(err.errors), 'err.errors가 배열이어야 한다');
        assert.ok(err.errors.length > 0, '검증 오류가 비어있지 않아야 한다');
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('참조 무결성 위반은 검증 실패 메시지에 함께 담긴다', () => {
  // Given: 존재하지 않는 block을 가리키는 dependency가 있는 YAML
  const dir = makeTempDir();
  try {
    const yamlText = `
worlds:
  - id: w-one
    title: 세계 1
blocks:
  - id: block-a
    name: A
    user_desc: 설명
dependencies:
  - source: block-a
    target: ghost
    type: requires
`;
    const path = writeYaml(dir, 'reference.yml', yamlText);
    // When/Then: 참조 위반이 errors에 들어있다
    assert.throws(
      () => loadCatalog(path),
      (err) => {
        assert.match(err.message, /카탈로그 검증을 통과하지 못했습니다/);
        assert.ok(err.errors.some((e) => e.kind === 'reference'));
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
