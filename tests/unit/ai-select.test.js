// 어댑터 선택 단위 테스트. ADR 0024 결정 3의 환경 변수 표를 검증한다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { selectAdapter } from '../../packages/ai/index.js';

// 각 테스트마다 환경 변수를 깨끗이 시작하고 끝낸다. 다른 테스트와의 leak을 막는 자리.
function withEnv(overrides, fn) {
  const keys = ['BEOREUM_AI_ADAPTER', 'ANTHROPIC_API_KEY', 'BEOREUM_AI_MODEL'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('환경 변수가 없으면 mock 어댑터를 만든다', () => {
  withEnv({}, () => {
    const adapter = selectAdapter();
    assert.equal(adapter.name, 'mock');
  });
});

test('BEOREUM_AI_ADAPTER=mock는 mock 어댑터를 만든다', () => {
  withEnv({ BEOREUM_AI_ADAPTER: 'mock' }, () => {
    const adapter = selectAdapter();
    assert.equal(adapter.name, 'mock');
  });
});

test('대소문자가 섞여도 mock으로 정상화된다', () => {
  withEnv({ BEOREUM_AI_ADAPTER: 'MOCK' }, () => {
    const adapter = selectAdapter();
    assert.equal(adapter.name, 'mock');
  });
});

test('인자로 들어온 name이 환경 변수보다 우선시된다', () => {
  withEnv({ BEOREUM_AI_ADAPTER: 'claude' }, () => {
    const adapter = selectAdapter({ name: 'mock' });
    assert.equal(adapter.name, 'mock');
  });
});

test('BEOREUM_AI_ADAPTER=claude는 ANTHROPIC_API_KEY가 있으면 claude 어댑터를 만든다', () => {
  withEnv({ BEOREUM_AI_ADAPTER: 'claude', ANTHROPIC_API_KEY: 'sk-test' }, () => {
    const adapter = selectAdapter();
    assert.equal(adapter.name, 'claude');
  });
});

test('claude 선택 시 ANTHROPIC_API_KEY가 없으면 한국어 안내 에러', () => {
  withEnv({ BEOREUM_AI_ADAPTER: 'claude' }, () => {
    assert.throws(() => selectAdapter(), /ANTHROPIC_API_KEY가 설정되어 있지 않습니다/);
  });
});

test('알 수 없는 어댑터 이름은 지원 목록과 함께 한국어 에러', () => {
  withEnv({ BEOREUM_AI_ADAPTER: 'gemini' }, () => {
    assert.throws(
      () => selectAdapter(),
      (err) => {
        assert.match(err.message, /알 수 없는 AI 어댑터입니다: "gemini"/);
        assert.match(err.message, /mock, claude/);
        return true;
      },
    );
  });
});
