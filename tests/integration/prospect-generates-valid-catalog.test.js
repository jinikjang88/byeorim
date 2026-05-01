// 통합 테스트: prospect가 mock 어댑터로 카탈로그를 생성하면 결과가 loadCatalog를 통과하고
// 다음 단계(smelt)가 그 위에서 안 끊긴다.
// ADR 0026의 picker → generator 전환과 ADR 0027의 인터페이스를 end-to-end로 검증한다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runInit, runProspect, runSmelt } from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';
import { loadCatalog } from '../../packages/catalog/index.js';

async function withTempCwd(fn) {
  const cwd = mkdtempSync(join(tmpdir(), 'beoreum-prospect-int-'));
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('prospect 카탈로그가 loadCatalog 통과 (스키마 + 참조 무결성)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 시드 키워드와 안 닿는 도메인 입력
    runInit({ cwd });
    // When: prospect를 돌린다(mock이 commerce default seed로 변형)
    const result = await runProspect({
      cwd,
      userInput: '도자기 공방 주문받기',
      adapter: createMockAdapter(),
    });
    // Then: 결과 카탈로그가 loadCatalog를 통과한다(throw 안 함)
    const catalog = loadCatalog(result.catalogFile);
    assert.ok(Array.isArray(catalog.worlds));
    assert.ok(catalog.worlds.length >= 1);
    assert.ok(Array.isArray(catalog.blocks));
    assert.ok(catalog.blocks.length >= 1);
    // name과 domain이 사용자 입력에서 뽑힌 값으로 갈아끼워졌는지
    assert.equal(catalog.name, '도자기 공방 주문받기');
  });
});

test('prospect 다음에 smelt가 새 카탈로그 위에서 끊김 없이 돈다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init + prospect 끝낸 자리(commerce default seed로 빚어진 카탈로그)
    runInit({ cwd });
    const prospectResult = await runProspect({
      cwd,
      userInput: '신규 도메인 서비스',
      adapter: createMockAdapter(),
    });
    // 카탈로그에서 첫 블럭 한 개를 골라 smelt에 넘김
    const catalog = loadCatalog(prospectResult.catalogFile);
    const firstBlockId = catalog.blocks[0].id;
    // When: smelt를 돌린다
    const smeltResult = await runSmelt({ cwd, blockIds: [firstBlockId] });
    // Then: smelt가 정상 결과를 돌려주고 다음 단계(shape)로 넘어감
    assert.deepEqual(smeltResult.selected, [firstBlockId]);
    assert.equal(smeltResult.nextStage, 'shape');
    assert.ok(existsSync(smeltResult.selectedBlocksFile));
  });
});

test('prospect의 design.md가 사람이 읽을 수 있는 마크다운 헤딩 트리를 가진다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
      now: new Date('2026-05-01T00:00:00.000Z'),
    });
    const body = readFileSync(result.designFile, 'utf8');
    // 헤더 한 자리, world 헤딩 한 자리 이상, block 헤딩 한 자리 이상
    const h1 = (body.match(/^# /gm) || []).length;
    const h2 = (body.match(/^## /gm) || []).length;
    const h4 = (body.match(/^#### /gm) || []).length;
    assert.ok(h1 >= 1, '한 자리 이상의 H1');
    assert.ok(h2 >= 1, '한 자리 이상의 H2 (world 헤딩)');
    assert.ok(h4 >= 1, '한 자리 이상의 H4 (block 헤딩)');
    // 트레이드오프 한 자리 이상
    const tradeoffs = (body.match(/^트레이드오프:/gm) || []).length;
    assert.ok(tradeoffs >= 1);
  });
});

test('source 매트릭스: ai-generated 분기에서 catalog의 name이 시드 이름과 다르다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    assert.equal(result.source, 'ai-generated:hybrid:commerce');
    // 시드 commerce의 name은 보통 비어있거나 다른 자리. mock은 사용자 입력에서 뽑은 값으로 갈아끼움
    const catalog = yaml.load(readFileSync(result.catalogFile, 'utf8'));
    assert.equal(catalog.name, '쇼핑몰');
  });
});
