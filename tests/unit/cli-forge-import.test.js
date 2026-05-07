// applyForgeReview 단위 테스트. ADR 0039의 forge import-review 본체.
// 응답 파일 파싱은 cli-review-response-parser.test.js에서 따로 검증. 여기서는 적용 흐름을 본다.

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
  applyForgeReview,
} from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-forge-import-'));
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
}

function readContracts(cwd) {
  return yaml.load(readFileSync(join(cwd, '.beoreum', 'project', 'contracts.yml'), 'utf8'));
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

test('contracts.yml이 없으면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const responsePath = writeResponse(cwd, buildResponse([]));
    await assert.rejects(
      applyForgeReview({ cwd, responsePath, log: () => {} }),
      /beoreum forge를 실행해주세요/,
    );
  });
});

test('응답 파일이 없으면 한국어 메시지로 거부한다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    await assert.rejects(
      applyForgeReview({ cwd, responsePath: '/no/such/file.md', log: () => {} }),
      /응답 파일을 찾지 못했어요/,
    );
  });
});

test('cwd 또는 responsePath 누락은 한국어로 거부한다', async () => {
  await assert.rejects(applyForgeReview({}), /cwd.*필요합니다/);
  await assert.rejects(applyForgeReview({ cwd: '/tmp' }), /responsePath.*필요합니다/);
});

test('형식이 어긋나면 graceful: contracts.yml은 그대로, parseError 안내', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 자유 형식 응답만(섹션 없음)
    await setupReadyForImport(cwd);
    const before = readContracts(cwd);
    const responsePath = writeResponse(cwd, '자유 형식 검토만 있어요. 섹션은 없네요.');
    // When
    const result = await applyForgeReview({ cwd, responsePath, log: () => {} });
    // Then
    assert.equal(result.hasStructuredSection, false);
    assert.ok(result.parseError);
    assert.equal(result.appliedCount, 0);
    const after = readContracts(cwd);
    assert.deepEqual(after, before, 'contracts.yml이 그대로여야 한다');
  });
});

test('적용: endpoint_add가 적용되면 contracts.yml에 새 endpoint가 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: order 블럭(resource → 5 endpoint)
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'endpoint_add',
          block_id: 'order',
          new_endpoint: {
            method: 'GET',
            path: '/orders/by-customer/{customerId}',
            operation: 'list_by_customer',
            description: '고객별 주문 조회',
          },
          reason: '자주 필요해요',
        },
      ]),
    );
    // When: 모두 적용
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    // Then
    assert.equal(result.proposedCount, 1);
    assert.equal(result.invalidCount, 0);
    assert.equal(result.appliedCount, 1);
    assert.equal(result.skippedCount, 0);
    const doc = readContracts(cwd);
    const order = doc.contracts.find((c) => c.block_id === 'order');
    const added = order.endpoints.find(
      (e) => e.method === 'GET' && e.path === '/orders/by-customer/{customerId}',
    );
    assert.ok(added, '새 endpoint가 박혀야 한다');
    assert.equal(added.operation, 'list_by_customer');
    assert.equal(added.description, '고객별 주문 조회');
    // schema는 TODO로 박힘(ADR 0039 결정 3 정신)
    assert.equal(added.request_schema, 'TODO');
    assert.equal(added.response_schema, 'TODO');
  });
});

test('적용: endpoint_remove가 적용되면 contracts.yml에서 endpoint가 빠진다', async () => {
  await withTempCwd(async (cwd) => {
    // Given
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'endpoint_remove',
          block_id: 'order',
          target_endpoint: { method: 'DELETE', path: '/orders/{id}' },
          reason: '영구 삭제는 안 해요',
        },
      ]),
    );
    // When
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    // Then
    assert.equal(result.appliedCount, 1);
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    const stillThere = order.endpoints.find(
      (e) => e.method === 'DELETE' && e.path === '/orders/{id}',
    );
    assert.equal(stillThere, undefined, 'DELETE endpoint가 빠져야 한다');
    assert.equal(order.endpoints.length, 4, 'resource 5개 - 1 = 4');
  });
});

test('적용: schema_modify가 적용되면 target_field가 새 값으로 바뀐다', async () => {
  await withTempCwd(async (cwd) => {
    // Given
    await setupReadyForImport(cwd);
    const newSchema = {
      type: 'object',
      properties: { items: { type: 'array' }, customer_id: { type: 'string' } },
      required: ['items', 'customer_id'],
    };
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'schema_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_field: 'request_schema',
          new_value: newSchema,
          reason: '핵심 필드 두 자리',
        },
      ]),
    );
    // When
    await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    // Then
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    const create = order.endpoints.find((e) => e.method === 'POST' && e.path === '/orders');
    assert.deepEqual(create.request_schema, newSchema);
  });
});

test('적용: description_modify가 적용되면 description이 바뀐다', async () => {
  await withTempCwd(async (cwd) => {
    // Given
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: '고객 본인의 주문 목록 조회',
          reason: '권한 자리 풀이',
        },
      ]),
    );
    // When
    await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    // Then
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    const list = order.endpoints.find((e) => e.method === 'GET' && e.path === '/orders');
    assert.equal(list.description, '고객 본인의 주문 목록 조회');
  });
});

test('skip: confirmChange가 skip을 돌려주면 변경이 안 박힌다', async () => {
  await withTempCwd(async (cwd) => {
    // Given
    await setupReadyForImport(cwd);
    const before = readContracts(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'endpoint_remove',
          block_id: 'order',
          target_endpoint: { method: 'DELETE', path: '/orders/{id}' },
          reason: 'r',
        },
      ]),
    );
    // When
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'skip',
      log: () => {},
    });
    // Then
    assert.equal(result.appliedCount, 0);
    assert.equal(result.skippedCount, 1);
    const after = readContracts(cwd);
    assert.deepEqual(after, before, 'contracts.yml이 그대로여야 한다');
  });
});

test('stop: 사용자가 멈추면 그 이후 변경은 안 보고 끝낸다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 변경 3개
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: '첫째',
          reason: 'r',
        },
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          new_value: '둘째',
          reason: 'r',
        },
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'DELETE', path: '/orders/{id}' },
          new_value: '셋째',
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    // When: 첫 번째 apply → 두 번째 stop
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        calls += 1;
        if (calls === 1) return 'apply';
        return 'stop';
      },
      log: () => {},
    });
    // Then: confirmChange는 두 번만 불림(stop 이후 안 부름)
    assert.equal(calls, 2);
    assert.equal(result.appliedCount, 1);
    assert.equal(result.stopped, true);
    const order = readContracts(cwd).contracts.find((c) => c.block_id === 'order');
    const list = order.endpoints.find((e) => e.method === 'GET' && e.path === '/orders');
    assert.equal(list.description, '첫째');
    // 둘째와 셋째는 적용 안 됨
    const create = order.endpoints.find((e) => e.method === 'POST' && e.path === '/orders');
    assert.notEqual(create.description, '둘째');
  });
});

test('invalid: 형식 어긋난 변경은 picker 안 보여주고 invalidCount로 카운트', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 두 변경 중 하나는 형식 어긋남(target_field 잘못된 값)
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'schema_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          target_field: 'description', // 형식 어긋남
          new_value: 'x',
          reason: 'r',
        },
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: '정상',
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    // When
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        calls += 1;
        return 'apply';
      },
      log: () => {},
    });
    // Then: picker는 정상 한 자리만 받음
    assert.equal(calls, 1);
    assert.equal(result.proposedCount, 2);
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 1);
  });
});

test('invalid: contracts에 없는 block_id는 invalid로 본다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'endpoint_remove',
          block_id: 'no-such-block',
          target_endpoint: { method: 'GET', path: '/x' },
          reason: 'r',
        },
      ]),
    );
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('invalid: endpoint_add에서 (method, path) 중복이면 invalid', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    // resource order에는 POST /orders가 이미 있음
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'endpoint_add',
          block_id: 'order',
          new_endpoint: { method: 'POST', path: '/orders', operation: 'create' },
          reason: 'r',
        },
      ]),
    );
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('test-scenarios.yml이 있으면 안내 한 줄이 warnings에 들어간다', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝낸 자리 + test-scenarios.yml을 가짜로 박음
    await setupReadyForImport(cwd);
    const scenariosFile = join(cwd, '.beoreum', 'project', 'test-scenarios.yml');
    writeFileSync(scenariosFile, 'schema_version: 1\nscenarios: []\n', 'utf8');
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: '새 설명',
          reason: 'r',
        },
      ]),
    );
    // When
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    // Then
    assert.equal(result.appliedCount, 1);
    assert.ok(result.warnings.some((w) => /test-scenarios.yml/.test(w)));
    assert.ok(result.warnings.some((w) => /beoreum temper/.test(w)));
  });
});

test('appliedCount=0이면 contracts.yml은 안 쓴다(파일 mtime 보존)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: 모두 skip
    await setupReadyForImport(cwd);
    const before = readContracts(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: 'x',
          reason: 'r',
        },
      ]),
    );
    // When
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'skip',
      log: () => {},
    });
    // Then
    assert.equal(result.appliedCount, 0);
    const after = readContracts(cwd);
    assert.deepEqual(after, before);
  });
});

test('state는 안 건드린다(import 후에도 current_stage가 그대로)', async () => {
  await withTempCwd(async (cwd) => {
    // Given: forge까지 끝나서 current_stage = temper
    await setupReadyForImport(cwd);
    const stateBefore = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    assert.equal(stateBefore.current_stage, 'temper');
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: 'x',
          reason: 'r',
        },
      ]),
    );
    // When
    await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    // Then
    const stateAfter = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    assert.equal(stateAfter.current_stage, 'temper', 'state.current_stage가 그대로여야 한다');
  });
});

test('빈 changes 배열이면 적용 가능 변경이 0개로 안내', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(cwd, buildResponse([]));
    const result = await applyForgeReview({ cwd, responsePath, log: () => {} });
    assert.equal(result.proposedCount, 0);
    assert.equal(result.appliedCount, 0);
    assert.equal(result.hasStructuredSection, true);
  });
});

test('confirmChange에 change/index/total/log가 전달된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: 'x',
          reason: 'r',
        },
      ]),
    );
    let captured = null;
    await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async (args) => {
        captured = args;
        return 'apply';
      },
      log: () => {},
    });
    assert.ok(captured);
    assert.equal(captured.index, 0);
    assert.equal(captured.total, 1);
    assert.equal(captured.change.kind, 'description_modify');
    assert.equal(typeof captured.log, 'function');
  });
});

// ADR 0045: 일괄 적용 단축.

test('apply_all_remaining: 첫 자리에서 누르면 나머지도 묻지 않고 모두 적용', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: '첫째',
          reason: 'r',
        },
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          new_value: '둘째',
          reason: 'r',
        },
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'DELETE', path: '/orders/{id}' },
          new_value: '셋째',
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        calls += 1;
        return 'apply_all_remaining';
      },
      log: () => {},
    });
    // confirmChange는 한 번만 불림(첫 자리). 나머지는 일괄 적용
    assert.equal(calls, 1);
    assert.equal(result.appliedCount, 3);
    assert.equal(result.skippedCount, 0);
  });
});

test('skip_all_remaining: 첫 자리에서 누르면 나머지도 묻지 않고 모두 건너뜀', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const before = readContracts(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: '첫째',
          reason: 'r',
        },
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          new_value: '둘째',
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    const result = await applyForgeReview({
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
    // contracts.yml은 그대로
    const after = readContracts(cwd);
    assert.deepEqual(after, before);
  });
});

test('apply 한 번 + apply_all_remaining 한 번: 첫 두 자리는 묻고 그 다음은 일괄', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: '첫째',
          reason: 'r',
        },
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'POST', path: '/orders' },
          new_value: '둘째',
          reason: 'r',
        },
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'DELETE', path: '/orders/{id}' },
          new_value: '셋째',
          reason: 'r',
        },
      ]),
    );
    let calls = 0;
    const result = await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        calls += 1;
        if (calls === 1) return 'apply';
        return 'apply_all_remaining';
      },
      log: () => {},
    });
    // confirmChange는 두 번만 불림(첫째, 둘째). 셋째는 일괄
    assert.equal(calls, 2);
    assert.equal(result.appliedCount, 3);
  });
});

test('contracts-review-prompt.md가 있는 흐름에서도 import는 그 경로 안 건드린다', async () => {
  await withTempCwd(async (cwd) => {
    // Given
    await setupReadyForImport(cwd);
    const promptFile = join(cwd, '.beoreum', 'project', 'prompts', 'contracts-review-prompt.md');
    assert.equal(existsSync(promptFile), true, '부산물 프롬프트가 있어야 한다');
    const promptBefore = readFileSync(promptFile, 'utf8');
    const responsePath = writeResponse(
      cwd,
      buildResponse([
        {
          kind: 'description_modify',
          block_id: 'order',
          target_endpoint: { method: 'GET', path: '/orders' },
          new_value: 'x',
          reason: 'r',
        },
      ]),
    );
    // When
    await applyForgeReview({
      cwd,
      responsePath,
      confirmChange: async () => 'apply',
      log: () => {},
    });
    // Then
    const promptAfter = readFileSync(promptFile, 'utf8');
    assert.equal(promptAfter, promptBefore, '프롬프트 부산물은 import에서 안 건드림');
  });
});
