// forge picker 헬퍼들. 순수 함수 모음. I/O 없음, prompt 호출 없음.
// forge.js의 defaultConfirmContracts가 사용한다.
// CLAUDE.md 섹션 8(파일당 책임)과 데이터 무관성 정신.

// block.api_style별 한국어 라벨. 검토 화면에서 사용자에게 풀어 보여줄 자리.
const API_STYLE_LABELS = {
  resource: 'resource',
  query: 'query',
  internal: 'internal',
  singleton: 'singleton',
};

// HTTP 메서드를 6자리로 정렬해 path와 줄을 맞춘다.
function padMethod(method) {
  return String(method || '').padEnd(6, ' ');
}

// path를 보기 좋게 패딩한다(가장 긴 path에 맞춤).
function padPath(path, width) {
  return String(path || '').padEnd(width, ' ');
}

// 한 contract(블럭 단위)의 검토 줄들을 만든다. internal은 한 줄로 표시.
//
// 인자: contract - { block_id, name, api_style, endpoints, internal? }
// 반환: 여러 줄 문자열 배열
function formatContractLines(contract) {
  const c = contract || {};
  const name = c.name || c.block_id || '(이름 없음)';
  const style = API_STYLE_LABELS[c.api_style] || c.api_style || 'resource';
  const lines = [];

  if (c.internal === true) {
    lines.push(`  ${name} (${style} — 공개 API 없음)`);
    return lines;
  }

  const endpoints = Array.isArray(c.endpoints) ? c.endpoints : [];
  lines.push(`  ${name} (${style}, ${endpoints.length}개 endpoint)`);
  if (endpoints.length === 0) return lines;

  // path 폭 결정(가장 긴 path 기준). 화면 정렬을 위함.
  const pathWidth = endpoints.reduce((max, ep) => {
    const len = String(ep.path || '').length;
    return len > max ? len : max;
  }, 0);

  for (const ep of endpoints) {
    const method = padMethod(ep.method);
    const path = padPath(ep.path, pathWidth);
    const desc = (ep.description || '').trim();
    lines.push(`    ${method} ${path}  ${desc}`);
  }
  return lines;
}

// schema 채움 통계를 만든다. TODO가 아닌 자리만 카운트.
//
// 인자: contracts - 블럭별 contract 배열
// 반환: { total, filled } - total은 endpoint*2(request+response), filled는 채워진 자리 수
function countSchemas(contracts) {
  let total = 0;
  let filled = 0;
  for (const c of contracts || []) {
    const endpoints = Array.isArray(c.endpoints) ? c.endpoints : [];
    for (const ep of endpoints) {
      total += 2;
      if (ep.request_schema !== 'TODO' && ep.request_schema !== undefined) filled += 1;
      if (ep.response_schema !== 'TODO' && ep.response_schema !== undefined) filled += 1;
    }
  }
  return { total, filled };
}

// 검토 화면 전체 텍스트를 만든다. confirm select의 message 자리에 들어갈 본문.
//
// 인자:
//   contracts        - 블럭별 contract 배열
//   blockCount       - 사람이 읽는 블럭 개수
//   endpointCount    - 사람이 읽는 endpoint 개수
//   adapter          - { name } 또는 null. null이면 어댑터 없는 결로 안내
//   schemaFilled     - 어댑터가 schema를 채웠는가
//   adapterIsDeterministic - mock처럼 결정적 어댑터인가(redo 헛흐름 안내용)
//
// 반환: 여러 줄 문자열(앞뒤 줄바꿈 없음)
export function formatContractsSummary({
  contracts,
  blockCount,
  endpointCount,
  adapter,
  schemaFilled,
  adapterIsDeterministic,
} = {}) {
  const lines = [];
  lines.push('지금까지 만든 자리');
  lines.push(`  블럭 ${blockCount || 0}개, 엔드포인트 ${endpointCount || 0}개`);

  if (schemaFilled && adapter && adapter.name) {
    const { total, filled } = countSchemas(contracts);
    lines.push(`  (AI 어댑터: ${adapter.name} — schema ${filled}/${total}개 채워짐)`);
  } else {
    lines.push('  (어댑터가 schema 채움을 지원하지 않아 모두 TODO로 남아있어요)');
  }

  lines.push('');
  lines.push('블럭별 자리');
  for (const contract of contracts || []) {
    for (const line of formatContractLines(contract)) {
      lines.push(line);
    }
  }

  if (adapterIsDeterministic) {
    lines.push('');
    lines.push('어댑터가 결정적이라 다시 만들어도 같은 schema가 채워질 거예요.');
  }

  return lines.join('\n');
}
