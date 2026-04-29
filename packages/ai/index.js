// 모델 무관 AI 어댑터. Claude, GPT, Gemini, mock 모두 같은 인터페이스를 따른다.
// 인터페이스 계약은 src/adapter.js의 JSDoc, 어댑터별 구현은 src/<name>.js 한 파일에 둔다
// (CLAUDE.md 섹션 8 파일당 책임).
export { createMockAdapter } from './src/mock.js';
export { createClaudeAdapter } from './src/claude.js';
export { selectAdapter } from './src/select.js';
