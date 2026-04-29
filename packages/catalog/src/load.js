// 카탈로그 로더. YAML 파일 경로를 받아 읽고 파싱하고 검증해 통과한 카탈로그 객체를 돌려준다.
// 세 자리(파일 없음, YAML 문법 오류, 검증 실패)에서 한국어 메시지의 Error를 던진다.
// 원본 에러는 cause로 보존한다. 사용자 출력 톤은 cli 단계가 한 번 더 풀어 쓴다.

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { validateCatalog } from './validate.js';

function formatErrors(errors) {
  return errors.map((e) => `  - [${e.kind}] ${e.path} ${e.message}`).join('\n');
}

export function loadCatalog(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`카탈로그 파일을 읽지 못했습니다: ${path}`, { cause });
  }

  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (cause) {
    throw new Error(`카탈로그 YAML 문법이 올바르지 않습니다: ${path}`, { cause });
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`카탈로그가 객체 형태여야 합니다: ${path}`);
  }

  const result = validateCatalog(parsed);
  if (!result.valid) {
    const error = new Error(
      `카탈로그 검증을 통과하지 못했습니다: ${path}\n${formatErrors(result.errors)}`,
    );
    error.errors = result.errors;
    throw error;
  }

  return parsed;
}
