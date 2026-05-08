// applyTemperReview 단위 테스트. ADR 0040의 temper import-review 본체.
// 응답 파싱은 cli-review-response-parser.test.js, 검증 검증은 validateTemperChange로 따로.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import {
  runInit,
  runProspect,
  runSmelt,
  interactiveShape,
  interactiveForge,
  interactiveTemper,
  applyTemperReview,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'byeorim-temper-import-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const REST_CHOICES = {
  language: 'node',
  database: 'postgresql',
  api_style: 'rest',
  architecture_pattern: 'modular-monolith',
};

async function setupReadyForImport(cwd, blockIds = ['order']) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  await runSmelt({ cwd, blockIds });
  await interactiveShape({
    cwd,
    askArchitecture: async () => REST_CHOICES,
    confirmArchitecture: async () => 'proceed',
  });
  await interactiveForge({
    cwd,
    adapter: createMockAdapter(),
    confirmContracts: async () => 'proceed',
    log: () => {},
  });
  await interactiveTemper({
    cwd,
    adapter: createMockAdapter(),
    confirmScenarios: async () => 'proceed',
    log: () => {},
  });
}

function readScenariosDoc(cwd) {
  return yaml.load(readFileSync(join(cwd, '.byeorim', 'project', 'test-scenarios.yml'), 'utf8'));
}

function writeResponse(cwd, body) {
  const path = join(cwd, 'response.md');
  writeFileSync(path, body, 'utf8');
  return path;
}

function buildResponse(changes) {
  return [
    '자유 형식 검토.',
    '',
    '## 제안된 변경 사항',
    '',
    '```yaml',
    yaml.dump({ changes }, { sortKeys: false }).trimEnd(),
    '```',
    '',
  ].join('\n');
}

test('test-scenarios.yml이 없으면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const responsePath = writeResponse(cwd, buildResponse([]));
    await assert.rejects(
      applyTemperReview({ cwd, responsePath, log: () => {} }),
      /byeorim temper를 실행해주세요/,
    );
  });
});

test('응답 파일이 없으면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    await assert.rejects(
      applyTemperReview({ cwd, responsePath: '/no/such/file.md', log: () => {} }),
      /응답 파일을 찾지 못했어요/,
    );
  });
});

test('cwd 또는 responsePath 누락은 한국어로 거부한다', async () => {
  await assert.rejects(applyTemperReview({}), /cwd.*필요합니다/);
  await assert.rejects(applyTemperReview({ cwd: '/tmp' }), /responsePath.*필요합니다/);
});

test('형식이 어긋나면 graceful: test-scenarios.yml은 그대로', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const before = readScenariosDoc(cwd);
    const responsePath = writeResponse(cwd, '자유 형식 검토만 있어요. 섹션은 없네요.');
    const result = await applyTemperReview({ cwd, responsePath, log: () => {} });
    assert.equal(result.hasStructuredSection, false);
    assert.ok(result.parseError);
    assert.equal(result.appliedCount, 0);
    const after = readScenariosDoc(cwd);
    assert.deepEqual(after, before);
  });
});

test('적용: scenario_add가 적용되면 endpoint에 새 시나리오가 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'scenario_add',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          new_scenario: {
            kind: 'error_invalid_input',
            given: '잘못된 입력 데이터가 준비되어 있다',
            when: 'POST /orders로 요청한다',
            then: '400 응답과 함께 검증 오류가 돌아온다',
            test_code: '// error case test',
          },
          reason: '입력 검증 자리',
        },
      ]),
    );
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    assert.equal(result.appliedCount, 1);
    const order = readScenariosDoc(cwd).scenarios.find((b) => b.block_id === 'order');
    const create = order.endpoints.find((e) => e.method === 'POST' && e.path === '/orders');
    const errScenario = create.scenarios.find((s) => s.kind === 'error_invalid_input');
    assert.ok(errScenario, '새 에러 시나리오가 박혀야 한다');
    assert.equal(errScenario.test_code, '// error case test');
  });
});

test('적용: scenario_remove가 적용되면 시나리오가 빠진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'scenario_remove',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          reason: '다른 자리로 옮김',
        },
      ]),
    );
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    assert.equal(result.appliedCount, 1);
    const order = readScenariosDoc(cwd).scenarios.find((b) => b.block_id === 'order');
    const create = order.endpoints.find((e) => e.method === 'POST' && e.path === '/orders');
    assert.equal(create.scenarios.length, 0, 'happy_path가 빠져야 한다');
  });
});

test('적용: gwt_modify가 적용되면 given/when/then 일부가 갱신된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: {
            given: '새 given 텍스트',
            then: '새 then 텍스트',
            // when은 안 박음(부분 갱신)
          },
          reason: '텍스트 다듬기',
        },
      ]),
    );
    await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    const order = readScenariosDoc(cwd).scenarios.find((b) => b.block_id === 'order');
    const create = order.endpoints.find((e) => e.method === 'POST' && e.path === '/orders');
    const s = create.scenarios.find((sc) => sc.kind === 'happy_path');
    assert.equal(s.given, '새 given 텍스트');
    assert.equal(s.then, '새 then 텍스트');
    // when은 원래 값 그대로
    assert.match(s.when, /POST .* 생성을 요청한다/);
  });
});

test('적용: test_code_modify가 적용되면 test_code가 바뀐다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'test_code_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: 'const res = await test_helpers.makeOrder();\nassert(res.status === 201);',
          reason: '코드 다듬기',
        },
      ]),
    );
    await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    const order = readScenariosDoc(cwd).scenarios.find((b) => b.block_id === 'order');
    const create = order.endpoints.find((e) => e.method === 'POST' && e.path === '/orders');
    const s = create.scenarios.find((sc) => sc.kind === 'happy_path');
    assert.match(s.test_code, /test_helpers\.makeOrder/);
  });
});

test('skip: confirmChange가 skip을 돌려주면 변경이 안 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const before = readScenariosDoc(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'scenario_remove',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          reason: 'r',
        },
      ]),
    );
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'skip',
      log: () => {},
    });
    assert.equal(result.appliedCount, 0);
    assert.equal(result.skippedCount, 1);
    const after = readScenariosDoc(cwd);
    assert.deepEqual(after, before);
  });
});

test('stop: 사용자가 멈추면 그 이후 변경은 안 본다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: '첫째' },
          reason: 'r',
        },
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: '둘째' },
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        calls += 1;
        if (calls === 1) return 'apply';
        return 'stop';
      },
      log: () => {},
    });
    assert.equal(calls, 2);
    assert.equal(result.appliedCount, 1);
    assert.equal(result.stopped, true);
  });
});

test('invalid: 형식 어긋난 변경(given/when/then 모두 누락)은 picker 안 보임', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: {}, // 빈 객체. given/when/then 중 하나도 없음
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        calls += 1;
        return 'apply';
      },
      log: () => {},
    });
    assert.equal(calls, 0);
    assert.equal(result.invalidCount, 1);
  });
});

test('invalid: scenarios에 없는 block_id는 invalid', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'scenario_remove',
          block_id: 'no-such-block',
          target_endpoint: { method: 'GET', path: '/x' },
          target_scenario_kind: 'happy_path',
          reason: 'r',
        },
      ]),
    );
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('invalid: scenario_add에서 kind가 같은 endpoint에 이미 있으면 invalid', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    // commerce order의 POST /orders에 happy_path가 이미 있음
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'scenario_add',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          new_scenario: { kind: 'happy_path', given: 'x', when: 'y', then: 'z' },
          reason: 'r',
        },
      ]),
    );
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
  });
});

test('appliedCount=0이면 test-scenarios.yml은 안 쓴다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const before = readScenariosDoc(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: '안 박힐 자리' },
          reason: 'r',
        },
      ]),
    );
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'skip',
      log: () => {},
    });
    assert.equal(result.appliedCount, 0);
    const after = readScenariosDoc(cwd);
    assert.deepEqual(after, before);
  });
});

test('state는 안 건드린다(import 후에도 current_stage 그대로)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const stateBefore = yaml.load(readFileSync(join(cwd, '.byeorim', 'state.yml'), 'utf8'));
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: 'x' },
          reason: 'r',
        },
      ]),
    );
    await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    const stateAfter = yaml.load(readFileSync(join(cwd, '.byeorim', 'state.yml'), 'utf8'));
    assert.equal(stateAfter.current_stage, stateBefore.current_stage);
  });
});

test('빈 changes 배열이면 적용 가능 변경이 0개로 안내', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(cwd, buildResponse([]));
    const result = await applyTemperReview({ cwd, responsePath, log: () => {} });
    assert.equal(result.proposedCount, 0);
    assert.equal(result.appliedCount, 0);
    assert.equal(result.hasStructuredSection, true);
  });
});

// ADR 0045: 일괄 적용 단축.

test('apply_all_remaining: 첫 자리에서 누르면 나머지도 모두 적용', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: '첫째 given' },
          reason: 'r',
        },
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: '둘째 given' },
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        calls += 1;
        return 'apply_all_remaining';
      },
      log: () => {},
    });
    assert.equal(calls, 1);
    assert.equal(result.appliedCount, 2);
  });
});

test('skip_all_remaining: 첫 자리에서 누르면 나머지도 모두 건너뜀', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const before = readScenariosDoc(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: '첫째' },
          reason: 'r',
        },
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: '둘째' },
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    const result = await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        calls += 1;
        return 'skip_all_remaining';
      },
      log: () => {},
    });
    assert.equal(calls, 1);
    assert.equal(result.appliedCount, 0);
    assert.equal(result.skippedCount, 2);
    const after = readScenariosDoc(cwd);
    assert.deepEqual(after, before);
  });
});

test('test-scenarios-review-prompt.md가 import에서 안 건드려진다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const promptFile = join(
      cwd,
      '.byeorim',
      'project',
      'prompts',
      'test-scenarios-review-prompt.md',
    );
    assert.equal(existsSync(promptFile), true);
    const before = readFileSync(promptFile, 'utf8');
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'gwt_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_scenario_kind: 'happy_path',
          new_value: { given: 'x' },
          reason: 'r',
        },
      ]),
    );
    await applyTemperReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    const after = readFileSync(promptFile, 'utf8');
    assert.equal(after, before);
  });
});
