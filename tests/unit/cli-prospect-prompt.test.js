// catalog-prompt.md 부산물 테스트(ADR 0028 결정 1).
// prospect 끝에 항상 prompts/catalog-prompt.md가 자리잡는지, 본문에 7항목과 시드가 들어가는지 본다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit, runProspect, buildCatalogPromptMarkdown } from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-prompt-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const silentLog = () => {};

test('prospect 끝에 prompts/catalog-prompt.md가 부산물로 만들어진다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      answers: { what: '쇼핑몰', who: '단골 손님' },
      adapter: createMockAdapter(),
      log: silentLog,
    });
    // Then: 부산물 자리가 자리잡았다
    assert.ok(result.catalogPromptFile, 'result.catalogPromptFile이 빠짐');
    assert.equal(existsSync(result.catalogPromptFile), true);
    assert.match(result.catalogPromptFile, /prompts\/catalog-prompt\.md$/);
  });
});

test('catalog-prompt.md 본문에 7항목 답변과 시드 템플릿이 한국어로 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      answers: { what: '동네 빵집 단골 주문 앱', who: '카페 단골' },
      adapter: createMockAdapter(),
      log: silentLog,
    });
    const md = readFileSync(result.catalogPromptFile, 'utf8');
    assert.match(md, /카탈로그 생성 프롬프트/);
    assert.match(md, /import-catalog/);
    assert.match(md, /동네 빵집 단골 주문 앱/);
    assert.match(md, /카페 단골/);
    assert.match(md, /commerce/); // 추천 시드가 적힘
  });
});

test('빌트인 매칭 안 되는 도메인에서도 prompt가 만들어지고 시드는 "없음"으로 표기', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      answers: { what: '우주여행 가이드' },
      adapter: createMockAdapter(),
      source: { kind: 'ai' }, // 빌트인 추천 null이라 ai로 강제
      log: silentLog,
    });
    const md = readFileSync(result.catalogPromptFile, 'utf8');
    assert.match(md, /시드 템플릿: 없음/);
    assert.match(md, /우주여행 가이드/);
  });
});

test('buildCatalogPromptMarkdown은 외부 AI 형식 안내(YAML 출력)를 포함한다', () => {
  const md = buildCatalogPromptMarkdown({
    answers: { what: '쇼핑몰' },
    suggestedTemplate: 'commerce',
  });
  assert.match(md, /worlds:/);
  assert.match(md, /blocks:/);
  assert.match(md, /YAML/);
  // ID 패턴 안내
  assert.match(md, /\^\[a-z\]\[a-z0-9-\]\*\$/);
});

test('buildCatalogPromptMarkdown은 비어있는 답변도 안전하게 다룬다', () => {
  const md = buildCatalogPromptMarkdown({});
  assert.match(md, /비어있음/);
  assert.match(md, /시드 템플릿: 없음/);
});
