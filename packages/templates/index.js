// 도메인 카탈로그 데이터
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const templates = {
  commerce: resolve(here, 'commerce', 'catalog.yml'),
  'job-aggregator': resolve(here, 'job-aggregator', 'catalog.yml'),
};

export function templatePath(name) {
  const path = templates[name];
  if (!path) throw new Error(`알 수 없는 템플릿: ${name}`);
  return path;
}
