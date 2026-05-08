// 벼림 핵심 도메인: World, Bundle, Block, Dependency, CascadeRule, Reality Check
// 이 패키지는 순수 함수와 데이터만 노출한다. I/O와 CLI 의존성은 두지 않는다 (CLAUDE.md 섹션 3)
export { resolveAll, resolveRequired } from './src/dependency.js';
export { collectDecisions } from './src/decisions.js';
export {
  AREAS as REALITY_CHECK_AREAS,
  AREA_TITLES as REALITY_CHECK_AREA_TITLES,
  SEED_QUESTIONS as REALITY_CHECK_SEED_QUESTIONS,
} from './src/reality-check-questions.js';
