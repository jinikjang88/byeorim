// 어댑터 선택. ADR 0024 결정 3의 환경 변수 BEOREUM_AI_ADAPTER 표가 한 자리에 모인다.
// 미래에 GPT/Gemini 어댑터가 들어오면 ADAPTERS 표만 갱신한다.
//
// CLAUDE.md 섹션 4의 결정성 약속을 위해 단위 테스트는 이 함수를 우회하고 어댑터를 직접 주입한다
// (ADR 0009 결정 4의 의존성 주입). 이 함수는 bin/beoreum.js 같은 엔트리에서만 호출된다.

import { createMockAdapter } from './mock.js';
import { createClaudeAdapter } from './claude.js';

const DEFAULT_ADAPTER_NAME = 'mock';

// 어댑터 이름 → 팩토리 표. ADR 0024 결정 3의 표.
const ADAPTERS = {
  mock: () => createMockAdapter(),
  claude: () => createClaudeAdapter(),
};

// 환경 변수 또는 인자로 들어온 이름을 보고 어댑터 인스턴스를 만든다.
//
// 입력:
//   name - 어댑터 이름. 미지정 시 process.env.BEOREUM_AI_ADAPTER 사용. 둘 다 없으면 mock
//
// 알 수 없는 이름이면 한국어 에러로 안내(CLAUDE.md 섹션 8 사용자 출력 정책).
export function selectAdapter({ name } = {}) {
  const resolved = (name || process.env.BEOREUM_AI_ADAPTER || DEFAULT_ADAPTER_NAME).toLowerCase();
  const factory = ADAPTERS[resolved];
  if (!factory) {
    const supported = Object.keys(ADAPTERS).join(', ');
    throw new Error(
      `알 수 없는 AI 어댑터입니다: "${resolved}". 지원하는 값: ${supported}. ` +
        `BEOREUM_AI_ADAPTER 환경 변수를 확인해주세요`,
    );
  }
  if (resolved === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY가 설정되어 있지 않습니다. ' +
        'https://console.anthropic.com에서 키를 발급받아 환경 변수에 두세요. ' +
        '비용 없이 흐름만 확인하려면 BEOREUM_AI_ADAPTER=mock으로 두세요',
    );
  }
  return factory();
}
