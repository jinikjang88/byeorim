// 어댑터 선택 단위 테스트. ADR 0024 결정 3의 환경 변수 표를 검증한다.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { selectAdapter } from '../../packages/ai/index.js';

// 각 테스트마다 환경 변수를 깨끗이 시작하고 끝낸다. 다른 테스트와의 leak을 막는 자리.
function withEnv(overrides, fn) {
  const keys = [
    'BEOREUM_AI_ADAPTER',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_BASE_URL',
    'BEOREUM_AI_MODEL',
  ];
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

test('claude 선택 시 키도 baseURL도 없으면 두 경로를 안내하는 한국어 에러', () => {
  // ADR 0025 결정 2의 표 첫 행. 사용자에게 두 가지 경로를 모두 안내한다.
  withEnv({ BEOREUM_AI_ADAPTER: 'claude' }, () => {
    assert.throws(
      () => selectAdapter(),
      (err) => {
        assert.match(err.message, /ANTHROPIC_API_KEY를 설정/);
        assert.match(err.message, /ANTHROPIC_BASE_URL/);
        assert.match(err.message, /Claude Code/);
        return true;
      },
    );
  });
});

test('ANTHROPIC_BASE_URL만 있으면 키 없이도 claude 어댑터를 만든다', () => {
  // ADR 0025 결정 2의 표 셋째 행. 외부 브릿지 사용 시 키 검증을 완화한다.
  withEnv({ BEOREUM_AI_ADAPTER: 'claude', ANTHROPIC_BASE_URL: 'http://localhost:3000' }, () => {
    const adapter = selectAdapter();
    assert.equal(adapter.name, 'claude');
  });
});

test('ANTHROPIC_BASE_URL과 ANTHROPIC_API_KEY 둘 다 있으면 claude 어댑터를 만든다', () => {
  // ADR 0025 결정 2의 표 넷째 행. 둘 다 있으면 사용자 키와 baseURL을 모두 SDK에 넘긴다.
  withEnv(
    {
      BEOREUM_AI_ADAPTER: 'claude',
      ANTHROPIC_API_KEY: 'sk-test',
      ANTHROPIC_BASE_URL: 'http://localhost:3000',
    },
    () => {
      const adapter = selectAdapter();
      assert.equal(adapter.name, 'claude');
    },
  );
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
