// temper picker 헬퍼들. 순수 함수 모음. I/O 없음, prompt 호출 없음.
// temper.js의 defaultConfirmScenarios가 사용한다.
// CLAUDE.md 섹션 8(파일당 책임)과 데이터 무관성 정신.
// 결의 짝: forge-picker-helpers.js (ADR 0034 결정 2와 같은 결).

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

// 한 블럭(시나리오 묶음)의 검토 줄들을 만든다. internal은 한 줄로 표시.
//
// 인자: scenarioBlock - { block_id, name, api_style, endpoints }
// 반환: 여러 줄 문자열 배열
function formatScenarioBlockLines(scenarioBlock) {
  const b = scenarioBlock || {};
  const name = b.name || b.block_id || '(이름 없음)';
  const style = API_STYLE_LABELS[b.api_style] || b.api_style || 'resource';
  const lines = [];

  if (b.api_style === 'internal') {
    lines.push(`  ${name} (${style} — 시나리오 없음)`);
    return lines;
  }

  const endpoints = Array.isArray(b.endpoints) ? b.endpoints : [];
  const scenarioCount = endpoints.reduce(
    (sum, ep) => sum + (Array.isArray(ep.scenarios) ? ep.scenarios.length : 0),
    0,
  );
  lines.push(`  ${name} (${style}, ${scenarioCount}개 시나리오)`);
  if (endpoints.length === 0) return lines;

  // path 폭 결정(가장 긴 path 기준). 화면 정렬을 위함.
  const pathWidth = endpoints.reduce((max, ep) => {
    const len = String(ep.path || '').length;
    return len > max ? len : max;
  }, 0);

  for (const ep of endpoints) {
    const method = padMethod(ep.method);
    const path = padPath(ep.path, pathWidth);
    const scenarios = Array.isArray(ep.scenarios) ? ep.scenarios : [];
    if (scenarios.length === 0) {
      lines.push(`    ${method} ${path}  (시나리오 없음)`);
      continue;
    }
    // 한 endpoint에 시나리오 한 개면 한 줄, 여러 개면 첫 줄에 첫 시나리오, 그 다음 줄들에 나머지.
    const [first, ...rest] = scenarios;
    lines.push(`    ${method} ${path}  ${first.kind || 'happy_path'}`);
    for (const s of rest) {
      const blank = ' '.repeat(method.length + 1 + path.length);
      lines.push(`    ${blank}  ${s.kind || 'happy_path'}`);
    }
  }
  return lines;
}

// test_code 채움 통계를 만든다. TODO가 아닌 자리만 카운트.
//
// 인자: scenarios - 블럭별 시나리오 묶음 배열
// 반환: { total, filled } - total은 시나리오 총 개수, filled는 채워진 자리 수
function countTestCodes(scenarios) {
  let total = 0;
  let filled = 0;
  for (const b of scenarios || []) {
    const endpoints = Array.isArray(b.endpoints) ? b.endpoints : [];
    for (const ep of endpoints) {
      const eps = Array.isArray(ep.scenarios) ? ep.scenarios : [];
      for (const s of eps) {
        total += 1;
        if (s.test_code !== 'TODO' && s.test_code !== undefined && s.test_code !== '') {
          filled += 1;
        }
      }
    }
  }
  return { total, filled };
}

// 검토 화면 전체 텍스트를 만든다. confirm select의 message 자리에 들어갈 본문.
//
// 인자:
//   scenarios              - 블럭별 시나리오 묶음 배열
//   blockCount             - 사람이 읽는 블럭 개수
//   scenarioCount          - 사람이 읽는 시나리오 개수
//   adapter                - { name } 또는 null. null이면 어댑터 없는 결로 안내
//   testCodeFilled         - 어댑터가 test_code를 채웠는가
//   adapterIsDeterministic - mock처럼 결정적 어댑터인가(redo 헛흐름 안내용)
//
// 반환: 여러 줄 문자열(앞뒤 줄바꿈 없음)
export function formatScenariosSummary({
  scenarios,
  blockCount,
  scenarioCount,
  adapter,
  testCodeFilled,
  adapterIsDeterministic,
} = {}) {
  const lines = [];
  lines.push('지금까지 만든 자리');
  lines.push(`  블럭 ${blockCount || 0}개, 시나리오 ${scenarioCount || 0}개`);

  if (testCodeFilled && adapter && adapter.name) {
    const { total, filled } = countTestCodes(scenarios);
    lines.push(`  (AI 어댑터: ${adapter.name} — test_code ${filled}/${total}개 채워짐)`);
  } else {
    lines.push('  (어댑터가 test_code 채움을 지원하지 않아 모두 TODO로 남아있어요)');
  }

  lines.push('');
  lines.push('블럭별 자리');
  for (const block of scenarios || []) {
    for (const line of formatScenarioBlockLines(block)) {
      lines.push(line);
    }
  }

  if (adapterIsDeterministic) {
    lines.push('');
    lines.push('어댑터가 결정적이라 다시 만들어도 같은 test_code가 채워질 거예요.');
  }

  return lines.join('\n');
}
