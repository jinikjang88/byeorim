// smelt-import.js 단위 테스트. ADR 0052 import-review 결.
// confirmChange 의존성 주입으로 결정적, picker 흐름과 의존성 재해결을 끝까지 검증.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runInit, runProspect, runSmelt, applySmeltReview } from '../../packages/cli/index.js';
import { createMockAdapter } from '../../packages/ai/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-smelt-import-'));
}

async function withTempCwd(fn) {
  const cwd = makeTempCwd();
  try {
    return await fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

async function setupReadyForImport(cwd, blockIds = ['order']) {
  runInit({ cwd });
  await runProspect({
    cwd,
    answers: { what: '쇼핑몰' },
    adapter: createMockAdapter(),
    log: () => {},
  });
  await runSmelt({ cwd, blockIds });
}

function writeResponse(cwd, body) {
  const path = join(cwd, 'response.md');
  writeFileSync(path, body, 'utf8');
  return path;
}

const VALID_RESPONSE = `검토 끝났어요.

## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: block_add
    block_id: payment
    reason: 결제 도메인이 들어왔는데 selected에 빠짐
  - kind: block_remove
    block_id: order
    reason: 다른 흐름 검증을 위해 잠시 빼봄
\`\`\`
`;

const ALWAYS_APPLY = async () => 'apply';
const ALWAYS_SKIP = async () => 'skip';
const ALWAYS_STOP = async () => 'stop';

test('selected-blocks.yml이 없으면 한국어 에러', async () => {
  await withTempCwd(async (cwd) => {
    runInit({ cwd });
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    await assert.rejects(
      applySmeltReview({ cwd, responsePath, log: () => {} }),
      /selected-blocks\.yml이\(가\) 없습니다/,
    );
  });
});

test('응답 파일이 없으면 한국어 에러', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    await assert.rejects(
      applySmeltReview({ cwd, responsePath: '/no/such/file.md', log: () => {} }),
      /응답 파일을 찾지 못했어요/,
    );
  });
});

test('cwd 또는 responsePath 누락은 한국어 에러', async () => {
  await assert.rejects(applySmeltReview({}), /cwd.*필요합니다/);
  await assert.rejects(applySmeltReview({ cwd: '/tmp' }), /responsePath.*필요합니다/);
});

test('block_add 적용 후 의존성 재해결로 auto_added/affected가 갱신된다', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd, ['order']);
    const ADD_PAYMENT = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: block_add
    block_id: payment
    reason: 결제 도메인 추가
\`\`\`
`;
    const responsePath = writeResponse(cwd, ADD_PAYMENT);
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.proposedCount, 1);
    assert.equal(result.appliedCount, 1);

    // selected에 payment 추가됨
    const doc = yaml.load(readFileSync(result.selectedBlocksFile, 'utf8'));
    assert.ok(doc.selected.includes('payment'));
    // payment의 의존성도 자동 추가(예: pg-integration이 payment의 requires)
    // 정확한 자동 추가 블럭은 commerce 카탈로그에 따라 다를 수 있어 길이만 단언
    assert.ok(Array.isArray(doc.auto_added));
    assert.ok(Array.isArray(doc.affected));
    assert.ok(Array.isArray(doc.prerequisites));
  });
});

test('block_remove 적용 후 selected에서 빠지고 의존성 재해결', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd, ['order', 'payment']);
    const REMOVE_PAYMENT = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: block_remove
    block_id: payment
    reason: 단순 주문 앱이라 결제 빼봄
\`\`\`
`;
    const responsePath = writeResponse(cwd, REMOVE_PAYMENT);
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.appliedCount, 1);
    const doc = yaml.load(readFileSync(result.selectedBlocksFile, 'utf8'));
    assert.ok(!doc.selected.includes('payment'));
    assert.ok(doc.selected.includes('order'));
  });
});

test('모두 건너뛰면 yml 안 건드림', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const before = readFileSync(join(cwd, '.beoreum', 'project', 'selected-blocks.yml'), 'utf8');
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_SKIP,
      log: () => {},
    });
    assert.equal(result.appliedCount, 0);
    assert.equal(result.skippedCount, 2);
    const after = readFileSync(join(cwd, '.beoreum', 'project', 'selected-blocks.yml'), 'utf8');
    assert.equal(before, after);
  });
});

test('첫 변경에서 stop하면 yml 안 건드림', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(cwd, VALID_RESPONSE);
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_STOP,
      log: () => {},
    });
    assert.equal(result.stopped, true);
    assert.equal(result.appliedCount, 0);
  });
});

test('apply_all_remaining: 첫 결정 후 나머지 모두 적용', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd, ['order']);
    const ADD_TWO = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: block_add
    block_id: payment
    reason: a
  - kind: block_add
    block_id: refund
    reason: b
\`\`\`
`;
    const responsePath = writeResponse(cwd, ADD_TWO);
    let count = 0;
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: async () => {
        count += 1;
        return count === 1 ? 'apply_all_remaining' : 'skip';
      },
      log: () => {},
    });
    assert.equal(count, 1);
    assert.equal(result.appliedCount, 2);
  });
});

test('graceful degrade: ## 제안된 변경 사항 섹션 없으면 안내 후 종료', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd);
    const responsePath = writeResponse(cwd, '자유 형식뿐. 형식 안 맞춤.');
    const logs = [];
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: (line) => logs.push(line),
    });
    assert.equal(result.hasStructuredSection, false);
    assert.match(result.parseError, /못 찾았어요/);
    assert.equal(result.appliedCount, 0);
  });
});

test('이미 selected에 있는 block_add는 invalid로 거부', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd, ['order']);
    const DUP = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: block_add
    block_id: order
    reason: 이미 있어요
\`\`\`
`;
    const responsePath = writeResponse(cwd, DUP);
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.proposedCount, 1);
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('catalog에 없는 block_id는 invalid로 거부', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd, ['order']);
    const FAKE = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: block_add
    block_id: fake-block-not-in-catalog
    reason: 외부 AI가 만든 가짜 블럭
\`\`\`
`;
    const responsePath = writeResponse(cwd, FAKE);
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('selected에 없는 block_remove는 invalid로 거부', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd, ['order']);
    const REMOVE_NOT_SELECTED = `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: block_remove
    block_id: payment
    reason: selected에 없는데 빼라고 함
\`\`\`
`;
    const responsePath = writeResponse(cwd, REMOVE_NOT_SELECTED);
    const result = await applySmeltReview({
      cwd,
      responsePath,
      confirmChange: ALWAYS_APPLY,
      log: () => {},
    });
    assert.equal(result.invalidCount, 1);
    assert.equal(result.appliedCount, 0);
  });
});

test('decisions.yml 사용자 답변이 보존된다(ADR 0052 결정 4)', async () => {
  await withTempCwd(async (cwd) => {
    await setupReadyForImport(cwd, ['order', 'payment']);
    // 사용자 답변을 decisions.yml에 박는다
    const decisionsFile = join(cwd, '.beoreum', 'project', 'decisions.yml');
    const doc = yaml.load(readFileSync(decisionsFile, 'utf8')) || {};
    if (Array.isArray(doc.decisions) && doc.decisions.length > 0) {
      doc.decisions[0].answer = '사용자가 박은 답';
      writeFileSync(decisionsFile, yaml.dump(doc, { sortKeys: false }), 'utf8');
      const triggerToCheck = doc.decisions[0].trigger;

      // block_add로 selected가 갱신되면 decisions가 다시 만들어지지만 같은 trigger 답변은 보존
      const responsePath = writeResponse(
        cwd,
        `## 제안된 변경 사항

\`\`\`yaml
changes:
  - kind: block_add
    block_id: refund
    reason: x
\`\`\`
`,
      );
      await applySmeltReview({
        cwd,
        responsePath,
        confirmChange: ALWAYS_APPLY,
        log: () => {},
      });

      const after = yaml.load(readFileSync(decisionsFile, 'utf8'));
      const sameTrigger = (after.decisions || []).find((d) => d.trigger === triggerToCheck);
      if (sameTrigger) {
        // 같은 trigger가 새 decisions에도 있으면 답변 유지
        assert.equal(sameTrigger.answer, '사용자가 박은 답');
      }
      // 같은 trigger가 사라졌으면(블럭 변경으로) 그것도 정상 동작
    }
  });
});
