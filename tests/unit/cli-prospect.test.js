// runProspect 단위 테스트. init → prospect 흐름 + mock 어댑터 주입.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runInit, runProspect, interactiveProspect } from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';
import { loadCatalog } from '../../packages/catalog/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-prospect-'));
}

// 비동기 fn이 끝난 뒤 임시 디렉토리를 청소한다. await로 finally가 fn 완료 후에 도는 것을 보장.
async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('init 직후 prospect를 돌리면 ADR 0007의 자리가 모두 채워진다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init이 완료된 자리
    runInit({ cwd });
    const adapter = createMockAdapter();
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    // When: 쇼핑 키워드 입력으로 prospect를 돌린다
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter,
      now: fixedNow,
    });
    // Then: 카탈로그, intent.yml, reality-check.md placeholder가 모두 자리잡았다
    assert.equal(existsSync(result.catalogFile), true);
    assert.equal(existsSync(result.intentFile), true);
    assert.equal(existsSync(result.realityCheckFile), true);
    assert.equal(result.suggestedTemplate, 'commerce');
    assert.equal(result.nextStage, 'smelt');
  });
});

test('intent.yml 형식이 ADR 0008 결정을 따르고 source는 ADR 0026의 ai-generated:hybrid 매트릭스를 따른다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 prospect (mock generateCatalog가 시드를 변형해 카탈로그를 빚음)
    runInit({ cwd });
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
      now: fixedNow,
    });
    // When: intent.yml을 읽어 파싱한다
    const intent = yaml.load(readFileSync(join(cwd, '.beoreum', 'project', 'intent.yml'), 'utf8'));
    // Then: ADR 0008의 모든 필드 + ADR 0026의 source 매트릭스
    assert.equal(intent.schema_version, 1);
    assert.equal(intent.created_at, '2026-04-28T12:00:00.000Z');
    assert.equal(intent.user_input, '쇼핑몰 만들어줘');
    assert.equal(intent.source, 'ai-generated:hybrid:commerce');
    assert.equal(intent.extracted.what, '쇼핑몰');
    assert.equal(intent.extracted.who, '');
    assert.equal(intent.extracted.why, '');
    assert.equal(intent.reality_check_status, 'pending');
  });
});

test('복사된 카탈로그가 검증을 통과한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 prospect
    runInit({ cwd });
    await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    // When: 복사된 catalog.yml을 loadCatalog로 검증한다
    const catalog = loadCatalog(join(cwd, '.beoreum', 'project', 'catalog', 'catalog.yml'));
    // Then: 검증을 통과한 카탈로그 객체가 돌아온다
    assert.ok(Array.isArray(catalog.worlds));
    assert.ok(Array.isArray(catalog.blocks));
  });
});

test('state.yml이 prospect 완료를 반영한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 prospect
    runInit({ cwd });
    await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    // When: state.yml을 읽는다
    const state = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    // Then: current_stage가 smelt로 넘어가고 prospect가 완료 목록에 있다
    assert.equal(state.current_stage, 'smelt');
    assert.deepEqual(state.completed_stages, ['prospect']);
  });
});

test('채용 키워드는 job-aggregator를 시드로 받아 ai-generated 카탈로그를 빚는다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 prospect 채용 키워드
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      userInput: '채용 사이트 만들어줘',
      adapter: createMockAdapter(),
    });
    // Then: job-aggregator 추천이 시드로 잡히고, mock generateCatalog가 변형해 source는 ai-generated
    assert.equal(result.suggestedTemplate, 'job-aggregator');
    assert.equal(result.seedName, 'job-aggregator');
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.source, 'ai-generated:hybrid:job-aggregator');
  });
});

test('init 없이 prospect를 돌리면 한국어 에러로 init 실행을 안내한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init이 없는 빈 디렉토리
    // When/Then: state.yml 부재 메시지 + init 안내
    await assert.rejects(
      runProspect({ cwd, userInput: '쇼핑몰', adapter: createMockAdapter() }),
      /beoreum init을 실행해주세요/,
    );
  });
});

test('현재 단계가 prospect가 아니면 한국어 에러로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 한 번 prospect를 끝낸 자리(current_stage = smelt)
    runInit({ cwd });
    await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    // When/Then: 두 번째 prospect는 단계 불일치로 거부
    await assert.rejects(
      runProspect({ cwd, userInput: '쇼핑몰', adapter: createMockAdapter() }),
      /현재 단계가 prospect가 아닙니다/,
    );
  });
});

test('어댑터가 추천하지 못해도 commerce를 default seed로 잡고 흐름을 막지 않는다 (ADR 0026 결정 2)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 시드 키워드 어디에도 안 닿는 도메인 입력
    runInit({ cwd });
    // When: prospect가 막히지 않고 끝까지 돈다(매니페스토 V 동행 톤)
    const result = await runProspect({
      cwd,
      userInput: '우주여행 가이드 서비스',
      adapter: createMockAdapter(),
    });
    // Then: suggestedTemplate은 null이지만 seedName은 commerce default
    assert.equal(result.suggestedTemplate, null);
    assert.equal(result.seedName, 'commerce');
    const intent = yaml.load(readFileSync(result.intentFile, 'utf8'));
    assert.equal(intent.source, 'ai-generated:hybrid:commerce');
    // catalog와 design.md 둘 다 자리잡았다
    assert.equal(existsSync(result.catalogFile), true);
    assert.equal(existsSync(result.designFile), true);
  });
});

test('design.md가 prospect의 두 번째 산출물로 만들어진다 (ADR 0028)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 prospect
    runInit({ cwd });
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: createMockAdapter(),
    });
    // Then: design.md가 자리잡고 헤더와 worlds 헤딩 한 자리가 보임
    assert.equal(existsSync(result.designFile), true);
    const body = readFileSync(result.designFile, 'utf8');
    assert.match(body, /^# .+ 설계$/m);
    assert.match(body, /^## .+\(`w-/m); // 한 줄 이상의 world 헤딩
    assert.match(body, /^#### .+\(`/m); // 한 줄 이상의 block 헤딩
    assert.match(body, /트레이드오프:/);
  });
});

test('fallback: adapter generateCatalog가 invalid catalog를 돌려주면 시드로 돌아가고 source가 fallback', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init 후 generateCatalog가 invalid catalog를 돌려주는 fixture adapter
    runInit({ cwd });
    const baseAdapter = createMockAdapter();
    const brokenAdapter = {
      ...baseAdapter,
      async generateCatalog() {
        // 의도적으로 schema를 깨뜨림(worlds 누락)
        return { catalog: { blocks: [{ id: 'broken', name: 'x', user_desc: 'y' }] } };
      },
    };
    // When: prospect가 막히지 않고 fallback 분기로 진행
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: brokenAdapter,
    });
    // Then: source가 fallback으로 잡히고 design.md 맨 위에 banner
    assert.equal(result.source, 'fallback:template:commerce');
    const design = readFileSync(result.designFile, 'utf8');
    assert.match(design, /^> 이번 prospect는 AI 카탈로그 생성에 실패해/);
    // catalog는 시드 그대로
    const catalog = yaml.load(readFileSync(result.catalogFile, 'utf8'));
    assert.ok(Array.isArray(catalog.worlds), 'fallback 시 시드의 worlds가 보존되어야 한다');
  });
});

test('fallback: adapter generateCatalog가 throw하면 시드로 돌아가고 사유가 banner에 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const baseAdapter = createMockAdapter();
    const throwingAdapter = {
      ...baseAdapter,
      async generateCatalog() {
        throw new Error('테스트 사유: API timeout');
      },
    };
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: throwingAdapter,
    });
    assert.equal(result.source, 'fallback:template:commerce');
    const design = readFileSync(result.designFile, 'utf8');
    assert.match(design, /테스트 사유: API timeout/);
  });
});

test('adapter-optional: generateCatalog 없는 어댑터는 시드 그대로 복사 결로 동작 (source: template:)', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const noGenAdapter = {
      name: 'no-gen',
      async extractIntent(input) {
        const base = createMockAdapter();
        return base.extractIntent(input);
      },
      // generateCatalog와 generateTradeOffDoc 둘 다 누락
    };
    const result = await runProspect({
      cwd,
      userInput: '쇼핑몰 만들어줘',
      adapter: noGenAdapter,
    });
    assert.equal(result.source, 'template:commerce');
    // design.md는 fallback 본문(generateTradeOffDoc 미구현)
    const design = readFileSync(result.designFile, 'utf8');
    assert.match(design, /설계 거울 미생성/);
  });
});

test('필수 인자 누락은 한국어로 거부한다', async () => {
  // cwd 누락
  await assert.rejects(runProspect({}), /cwd.*필요합니다/);
  // userInput 누락
  await assert.rejects(
    runProspect({ cwd: '/tmp', adapter: createMockAdapter() }),
    /userInput.*필요합니다/,
  );
  // adapter 누락
  await assert.rejects(runProspect({ cwd: '/tmp', userInput: '쇼핑몰' }), /adapter.*필요합니다/);
});

// ── interactiveProspect: ADR 0011 askInput 의존성 주입 ─────────────────────

test('interactiveProspect: askInput이 받은 텍스트로 prospect가 끝까지 동작한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init만 한 자리(current_stage = prospect)
    runInit({ cwd });
    // mock askInput이 고정된 한국어 자유 텍스트를 돌려준다
    const askInput = async () => '쇼핑몰 만들어줘';
    // When: 인자 없이 인터랙티브 흐름
    const result = await interactiveProspect({
      cwd,
      adapter: createMockAdapter(),
      askInput,
    });
    // Then: runProspect와 같은 결과 형태
    assert.equal(result.suggestedTemplate, 'commerce');
    assert.equal(result.nextStage, 'smelt');
  });
});

test('interactiveProspect: 단계 검증이 askInput 호출 전에 일어난다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: init조차 안 된 자리(state.yml 부재)
    let askCalled = false;
    const askInput = async () => {
      askCalled = true;
      return '쇼핑몰';
    };
    // When/Then: state.yml 부재로 거부되고 askInput은 호출되지 않는다.
    //           사용자가 자유 텍스트를 입력한 뒤 거부당하는 일을 막는 자리
    await assert.rejects(
      interactiveProspect({
        cwd,
        adapter: createMockAdapter(),
        askInput,
      }),
      /beoreum init을 실행해주세요/,
    );
    assert.equal(askCalled, false, 'askInput은 단계 검증 통과 후에만 호출되어야 한다');
  });
});

test('interactiveProspect: 현재 단계가 prospect가 아니면 한국어로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: prospect까지 끝낸 자리(current_stage = smelt)
    runInit({ cwd });
    await runProspect({
      cwd,
      userInput: '쇼핑몰',
      adapter: createMockAdapter(),
    });
    let askCalled = false;
    const askInput = async () => {
      askCalled = true;
      return '두 번째 시도';
    };
    // When/Then: 단계 불일치로 거부, askInput 호출 안 됨
    await assert.rejects(
      interactiveProspect({
        cwd,
        adapter: createMockAdapter(),
        askInput,
      }),
      /현재 단계가 prospect가 아닙니다/,
    );
    assert.equal(askCalled, false);
  });
});

test('interactiveProspect: cwd와 adapter 누락은 한국어로 거부한다', async () => {
  await assert.rejects(interactiveProspect({}), /cwd.*필요합니다/);
  await assert.rejects(interactiveProspect({ cwd: '/tmp' }), /adapter.*필요합니다/);
});
