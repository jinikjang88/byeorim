// 통합 테스트: prospect가 generateCatalog 실패에서 시드 fallback으로 끊김 없이 진행하는지.
// ADR 0026 결정 3과 ADR 0028 결정 4의 fallback 정책을 end-to-end로 검증한다.
// 매니페스토 V 동행 톤: 사용자가 막히지 않는다.

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
  const cwd = mkdtempSync(join(tmpdir(), 'beoreum-prospect-fallback-'));
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function makeBrokenAdapter(brokenCatalog) {
  const base = createMockAdapter();
  return {
    ...base,
    async generateCatalog() {
      return { catalog: brokenCatalog };
    },
  };
}

test('fallback: invalid catalog → 시드 그대로 + intent.source가 fallback:template:<seed>', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    // worlds 누락으로 schema 검증 실패 유도
    const adapter = makeBrokenAdapter({
      blocks: [{ id: 'broken', name: 'X', user_desc: 'Y' }],
    });
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter,
    });
    // source가 fallback 분기로 잡힘
    assert.equal(result.source, 'fallback:template:commerce');
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.source, 'fallback:template:commerce');
  });
});

test('fallback: design.md 맨 위에 banner 한 줄이 들어가고 본문은 시드 카탈로그 결로 빚어진다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const adapter = makeBrokenAdapter({ wrongShape: true });
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter,
    });
    const design = readFileSync(result.designFile, 'utf8');
    // banner가 첫 줄에 인용으로 들어감
    assert.match(design, /^> 이번 prospect는 AI 카탈로그 생성에 실패해 commerce seed로 대체됐습니다/);
    // banner 뒤 본문에 헤더와 헤딩 한 자리 이상
    assert.match(design, /^# .+ 설계$/m);
    assert.match(design, /^## /m);
  });
});

test('fallback: 시드 카탈로그가 통째로 catalog.yml에 들어가 다음 단계가 안 깨진다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const adapter = makeBrokenAdapter({ blocks: [{ id: 'b', name: 'B', user_desc: 'd' }] });
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter,
    });
    // catalog가 loadCatalog 통과(시드 그대로라 무결성 보존)
    const catalog = loadCatalog(result.catalogFile);
    assert.ok(Array.isArray(catalog.worlds));
    assert.ok(catalog.worlds.length >= 1);
    // smelt가 그 위에서 정상 동작
    const smeltResult = await runSmelt({ cwd, blockIds: [catalog.blocks[0].id] });
    assert.equal(smeltResult.nextStage, 'shape');
  });
});

test('fallback: generateCatalog가 throw하면 사유가 banner에 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const base = createMockAdapter();
    const throwingAdapter = {
      ...base,
      async generateCatalog() {
        throw new Error('네트워크 timeout 5초 경과');
      },
    };
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: throwingAdapter,
    });
    assert.equal(result.source, 'fallback:template:commerce');
    const design = readFileSync(result.designFile, 'utf8');
    assert.match(design, /네트워크 timeout 5초 경과/);
    // catalog와 design이 둘 다 자리잡았음(사용자가 막히지 않음, 매니페스토 V)
    assert.equal(existsSync(result.catalogFile), true);
    assert.equal(existsSync(result.designFile), true);
  });
});
