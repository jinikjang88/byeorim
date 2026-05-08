// import-catalog 명령의 본체. ADR 0028의 사용자 카탈로그 import 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini 등)에서 받은 yml 파일을 검증하고 catalog.yml로 교체한다.
// intent.yml의 source는 ADR 0008 결정 3의 예약 자리 그대로 'custom'으로 박힌다.
// ADR 0042: ID 패턴 위반은 한국어로 풀어서 안내. ajv 에러 객체를 formatError로 풀어쓴다.
// 후속 보강: 다른 ajv 에러(required, enum, type 등)도 한국어로 풀어쓴다.
//
// reality-check.md는 갱신하지 않는다(ADR 0028 결정 2). 사용자에게 한국어로 안내만 한다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { validateCatalog, loadCatalog } from '@byeorim/catalog';

// ajv schema 에러를 한국어로 풀어쓴다. params 자리에서 자세한 정보를 꺼낸다.
// reference 에러(kind: 'reference')는 이미 한국어라 그대로 두고 schema kind만 번역한다.
function translateSchemaError(err) {
  if (!err || typeof err !== 'object' || err.kind !== 'schema') {
    return null;
  }
  const path = String(err.path || '/');
  const message = String(err.message || '');
  const params = err.params || {};

  if (/must have required property/.test(message)) {
    const field = params.missingProperty || '?';
    return `${path}에 필수 필드 "${field}"가 빠져있어요`;
  }
  if (/must match pattern/.test(message)) {
    const pattern = params.pattern || '';
    return `${path}의 값 형식이 안 맞아요 (패턴: ${pattern})`;
  }
  if (/must be equal to one of the allowed values/.test(message)) {
    const allowed = Array.isArray(params.allowedValues) ? params.allowedValues.join(', ') : '';
    return `${path}는 [${allowed}] 중 하나여야 해요`;
  }
  if (/must NOT have fewer than \d+ items/.test(message)) {
    const limit = params.limit !== undefined ? params.limit : '?';
    return `${path}에 최소 ${limit}개 이상 항목이 필요해요`;
  }
  if (/must NOT have more than \d+ items/.test(message)) {
    const limit = params.limit !== undefined ? params.limit : '?';
    return `${path}에 최대 ${limit}개까지만 가능해요`;
  }
  if (/must NOT have fewer than \d+ characters/.test(message)) {
    const limit = params.limit !== undefined ? params.limit : '?';
    return `${path}는 최소 ${limit}자 이상이어야 해요`;
  }
  if (/must NOT have more than \d+ characters/.test(message)) {
    const limit = params.limit !== undefined ? params.limit : '?';
    return `${path}는 최대 ${limit}자까지만 가능해요`;
  }
  if (/must NOT have additional properties/.test(message)) {
    const extra = params.additionalProperty || '?';
    return `${path}에 정의되지 않은 필드 "${extra}"가 있어요`;
  }
  if (/must be (string|object|array|number|integer|boolean|null)/.test(message)) {
    const expected = (message.match(/must be (\w+)/) || [])[1] || '?';
    return `${path}의 타입이 ${expected}여야 해요`;
  }
  if (/must be >= /.test(message)) {
    const limit = params.limit !== undefined ? params.limit : '?';
    return `${path}는 ${limit} 이상이어야 해요`;
  }
  if (/must be <= /.test(message)) {
    const limit = params.limit !== undefined ? params.limit : '?';
    return `${path}는 ${limit} 이하여야 해요`;
  }
  // fallback: path와 영문 메시지 그대로
  return `${path}: ${message}`;
}

function loadYamlFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`파일을 찾지 못했어요: ${filePath}`);
    }
    throw err;
  }
  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`YAML 형식이 어긋났어요: ${err.message || err}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('YAML 본문이 비어있거나 객체가 아닙니다.');
  }
  return parsed;
}

// importCatalog는 외부 AI에서 받은 카탈로그 파일을 가져와 .byeorim/project/catalog/catalog.yml로 교체한다.
//
// 입력:
//   cwd        - 프로젝트 루트 절대 경로
//   sourcePath - 사용자가 가져올 yml 파일 경로(절대 또는 상대)
//   log        - 콘솔 출력 함수(선택)
//
// 반환: { catalogFile, intentFile, replacedSource, previousSource, warnings }
//   warnings는 사용자에게 띄울 한국어 안내 배열(예: RC가 이전 카탈로그 기준)
export function importCatalog({ cwd, sourcePath, log = console.log } = {}) {
  if (!cwd) throw new Error('importCatalog({ cwd })가 필요합니다');
  if (!sourcePath) {
    throw new Error(
      'importCatalog({ sourcePath })가 필요합니다. 가져올 yml 파일 경로를 적어주세요',
    );
  }

  const byeorimDir = join(cwd, '.byeorim');
  const intentFile = join(byeorimDir, 'project', 'intent.yml');
  const catalogFile = join(byeorimDir, 'project', 'catalog', 'catalog.yml');

  if (!existsSync(intentFile)) {
    throw new Error(
      'intent.yml이 없습니다. 먼저 byeorim init과 prospect를 한 번 끝내주세요.\n' +
        'import-catalog는 prospect를 거쳐 자리잡은 .byeorim/ 위에서만 동작합니다',
    );
  }
  if (!existsSync(catalogFile)) {
    throw new Error(
      'catalog.yml이 없습니다. import는 기존 카탈로그를 교체하는 자리입니다. ' +
        '먼저 prospect를 한 번 끝내주세요',
    );
  }

  // 사용자가 가져온 파일을 파싱하고 catalog.schema.json으로 검증
  const candidate = loadYamlFile(sourcePath);
  const { valid, errors } = validateCatalog(candidate);
  if (!valid) {
    // 한 에러 객체를 사용자에게 띄울 한국어 한 줄로 풀어쓴다.
    // schema kind는 translateSchemaError로 풀고, reference kind는 이미 한국어라 그대로.
    const formatError = (e) => {
      if (!e || typeof e !== 'object') return String(e);
      const translated = translateSchemaError(e);
      if (translated) return translated;
      // reference kind 또는 폴백
      return `${e.path || '/'} ${e.message || ''}`.trim();
    };

    // ID 패턴 위반 자리는 한국어로 풀어서 안내(ADR 0042 결정 3).
    // schema의 id 정의가 ^[a-z][a-z0-9-]*$ 패턴이라 한국어 ID가 들어오면 여기서 잡힌다.
    // ajv 에러는 { kind: 'schema', path: '/blocks/0/id', message: 'must match pattern ...', params: { pattern: ... } } 결.
    const idPatternErrors = errors.filter((e) => {
      if (!e || typeof e !== 'object') return false;
      const path = String(e.path || '');
      const message = String(e.message || '');
      // path가 .../id로 끝나거나 message가 pattern 위반이면 ID 자리
      return /\/id$/.test(path) && /pattern/.test(message);
    });
    if (idPatternErrors.length > 0) {
      throw new Error(
        '카탈로그에 한국어 ID 또는 잘못된 형식의 ID가 있어요.\n' +
          '외부 AI에게 "ID는 영문 소문자/숫자/하이픈만 쓰세요"라고 다시 부탁해주세요.\n' +
          "예: 'order' OK, '주문' 거부.\n" +
          `검증 오류: ${idPatternErrors.slice(0, 3).map(formatError).join('; ')}`,
      );
    }
    const detail = errors.slice(0, 3).map(formatError).join('; ');
    throw new Error(
      'AI에서 받은 카탈로그가 형식 검증에 걸렸어요. 외부 AI에 다음 오류를 보여주고 형식을 맞춰달라고 부탁하세요.\n' +
        `검증 오류: ${detail}`,
    );
  }

  // 검증 통과. catalog.yml 교체 + intent.yml의 source를 custom으로 박는다(ADR 0008 결정 3).
  const intent = yaml.load(readFileSync(intentFile, 'utf8')) || {};
  const previousSource = intent.source || '(알 수 없음)';
  intent.source = 'custom';
  writeFileSync(catalogFile, yaml.dump(candidate, { sortKeys: false }), 'utf8');
  writeFileSync(intentFile, yaml.dump(intent, { sortKeys: false }), 'utf8');

  // 교체된 카탈로그가 검증을 통과하는지 한 번 더 본다(loadCatalog 경로로). 안전망.
  loadCatalog(catalogFile);

  const warnings = [];
  warnings.push(
    'reality-check.md는 이전 카탈로그 기준이에요. 새 카탈로그로 다시 보고 싶으시면 LLM 어댑터로 prospect를 다시 돌리거나, 다음 단계(smelt 이후)에서 자연스럽게 검토됩니다.',
  );

  log(`카탈로그를 새로 가져왔어요: ${catalogFile}`);
  log(`이전 source: ${previousSource}  →  새 source: custom`);
  for (const w of warnings) {
    log(w);
  }

  return {
    catalogFile,
    intentFile,
    replacedSource: 'custom',
    previousSource,
    warnings,
  };
}
