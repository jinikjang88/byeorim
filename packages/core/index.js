// 벼름 핵심 도메인: World, Bundle, Block, Dependency, CascadeRule
// 이 패키지는 순수 함수만 노출한다. I/O와 CLI 의존성은 두지 않는다 (CLAUDE.md 섹션 3)
export { resolveAll, resolveRequired } from './src/dependency.js';
export { collectDecisions } from './src/decisions.js';
