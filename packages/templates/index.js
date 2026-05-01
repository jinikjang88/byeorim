// 도메인 카탈로그 시드. ADR 0026이 prospect의 출력 결정점을 picker에서 generator로 바꾼 뒤,
// 이 디렉토리는 결정점이 아니라 AI 카탈로그 생성의 few-shot 예시 자리가 되었다.
// 새 도메인을 진짜로 빚는 것은 prospect의 generateCatalog가 한다(claude 어댑터의 후속 PR).
// 시드를 늘리려면 새 디렉토리(<domain>/catalog.yml)를 더하고 아래 templates 표에 등록.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const templates = {
  commerce: resolve(here, 'commerce', 'catalog.yml'),
  'job-aggregator': resolve(here, 'job-aggregator', 'catalog.yml'),
  reservation: resolve(here, 'reservation', 'catalog.yml'),
};

export function templatePath(name) {
  const path = templates[name];
  if (!path) throw new Error(`알 수 없는 템플릿: ${name}`);
  return path;
}
