// 어댑터 선택. ADR 0024 결정 3의 환경 변수 BEOREUM_AI_ADAPTER 표가 한 자리에 모인다.
// ADR 0025로 ANTHROPIC_BASE_URL 분기가 추가되어 외부 브릿지 사용 시 키 검증을 완화한다.
// 미래에 GPT/Gemini 어댑터가 들어오면 ADAPTERS 표만 갱신한다.
//
// CLAUDE.md 섹션 4의 결정성 약속을 위해 단위 테스트는 이 함수를 우회하고 어댑터를 직접 주입한다
// (ADR 0009 결정 4의 의존성 주입). 이 함수는 bin/beoreum.js 같은 엔트리에서만 호출된다.

import { createMockAdapter } from './mock.js';
import { createClaudeAdapter } from './claude.js';

const DEFAULT_ADAPTER_NAME = 'mock';
// ADR 0025 결정 2: baseURL이 있고 키가 없을 때 SDK 인스턴스화를 위한 placeholder.
// 실제 인증은 브릿지가 처리한다.
const BRIDGE_PLACEHOLDER_KEY = 'beoreum-bridge-placeholder';

// claude 어댑터 팩토리. ADR 0025 결정 2의 분기 표를 한 자리에서 다룬다.
function buildClaudeAdapter() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  if (!apiKey && !baseURL) {
    throw new Error(
      'Claude 어댑터를 쓰려면 ANTHROPIC_API_KEY를 설정해주세요. ' +
        'https://console.anthropic.com에서 키를 발급받을 수 있습니다. ' +
        'Claude Code 같은 브릿지 서버를 통해 호출하려면 ANTHROPIC_BASE_URL을 대신 설정해주세요. ' +
        '비용 없이 흐름만 확인하려면 BEOREUM_AI_ADAPTER=mock으로 두세요',
    );
  }
  return createClaudeAdapter({
    apiKey: apiKey || BRIDGE_PLACEHOLDER_KEY,
    baseURL: baseURL || undefined,
  });
}

// 어댑터 이름 → 팩토리 표. ADR 0024 결정 3의 표.
const ADAPTERS = {
  mock: () => createMockAdapter(),
  claude: () => buildClaudeAdapter(),
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
  return factory();
}
