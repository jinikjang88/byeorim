// beoreum inspect. 7단계의 마지막. 6영역 다관점 체크리스트로 inspect-report.md를 만든다.
// ADR 0007의 자리, ADR 0016의 6영역과 형식, ADR 0003 결정 3의 강한 신호 정신을 따른다.
// 사용자 입력 없는 변환 단계라 picker 없음. 정적 체크리스트(프로젝트 맞춤은 미래 ADR).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const STAGE = 'inspect';
const DONE_MARKER = 'done';

// 6영역 정의(ADR 0016 결정 1). 영역 추가/제거나 이름 변경은 ADR로 결정한다.
// 각 영역의 questions는 정적 한국어 체크리스트(ADR 0016 결정 2).
const INSPECT_AREAS = [
  {
    title: '보안',
    questions: [
      '사용자 인증과 권한 관리는 어떻게 하시나요? (로그인, 세션, 토큰)',
      '사용자 데이터(개인정보, 결제 정보)는 어떻게 보호하시나요? (암호화, 접근 제어)',
      '입력값 검증과 SQL injection/XSS 방어는 어디에 두시나요?',
      'HTTPS/TLS는 출시 시점부터 적용되시나요?',
    ],
  },
  {
    title: '성능',
    questions: [
      '첫 출시 예상 사용자 수와 동시 접속자 수는 얼마인가요?',
      '가장 자주 호출될 엔드포인트는 무엇이고, 응답 시간 목표는 얼마인가요?',
      '데이터베이스 쿼리 중 N+1 문제가 생길 만한 자리는 없나요?',
      '캐싱이 필요한 자리(상품 목록, 정적 데이터)는 어디인가요?',
    ],
  },
  {
    title: '운영',
    questions: [
      '에러 로그는 어디에 모이고 누가 보시나요?',
      '사용자 문의가 들어오면 어떤 채널로 받으시나요?',
      '데이터 백업 주기와 복구 방법은 정하셨나요?',
      '배포(첫 출시, 이후 업데이트)는 어떻게 하시나요?',
    ],
  },
  {
    title: '확장성',
    questions: [
      '사용자가 10배 늘어나면 가장 먼저 막히는 자리는 어디인가요?',
      '데이터베이스가 커지면 어떻게 대응하시나요? (인덱스, 파티셔닝, 샤딩)',
      '정적 자원(이미지, 동영상)은 어디에 두시나요?',
      '비동기 처리가 필요한 작업은 무엇인가요? (알림, 정산, 배치)',
    ],
  },
  {
    title: '법적 리스크',
    // ADR 0016 결정 3: 영역 머리에 blockquote 경고 인용구.
    // ADR 0003 결정 3의 강한 신호 정신.
    warning:
      '⚠ 이 영역은 출시 직전 강한 신호 자리입니다(ADR 0003 결정 3). 사용자 데이터, 인허가, 미성년자 보호처럼 법령 위반 시 즉각적 손해가 발생하는 자리는 변호사 자문을 받으세요.',
    questions: [
      '사용자 데이터를 처리하시는 사업이라면 개인정보보호법 검토를 받으셨나요?',
      '업종별 인허가가 필요한 사업이라면 신고/등록을 마치셨나요?',
      '미성년자가 사용할 수 있는 서비스라면 보호 장치를 갖추셨나요?',
      '결제, 환불 정책이 전자상거래법에 맞나요?',
      'AI를 사용하는 자리에서 알고리즘 차별 가능성은 없나요?',
    ],
  },
  {
    title: '시장 재검',
    // ADR 0016 결정 4: reality-check.md 경로 명시.
    intro:
      'prospect 단계에서 본 시장을 다시 봅니다. 만들기 시작했을 때와 출시 직전의 시각은 다릅니다.\n\n`.beoreum/project/reality-check.md`를 다시 읽어보세요. 그때와 시장이 달라진 자리가 있나요?',
    questions: [
      '첫 100명의 사용자를 어떻게 모으실 건가요?',
      '6개월 동안 운영비를 지탱할 자금이 있으신가요?',
      '같은 도메인에서 망한 서비스를 다시 한 번 보세요. 그들이 망한 이유와 우리가 다른 점은 무엇인가요?',
      '출시 후 첫 일주일 동안 어떤 신호(가입 수, 매출, 사용자 피드백)를 어떻게 모으실 건가요?',
    ],
  },
];

function ensureFile(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${path}이(가) 없습니다. ${hint}`);
  }
}

function loadState(stateFile) {
  ensureFile(stateFile, '먼저 beoreum init을 실행해주세요');
  return yaml.load(readFileSync(stateFile, 'utf8'));
}

function ensureStage(state, expected) {
  if (state.current_stage !== expected) {
    throw new Error(
      `현재 단계가 ${expected}가 아닙니다(현재: ${state.current_stage}). 단계 순서대로 진행해주세요`,
    );
  }
}

function buildAreaSection(area, index) {
  const lines = [`## ${index}. ${area.title}`, ''];
  if (area.warning) {
    lines.push(`> ${area.warning}`, '');
  }
  if (area.intro) {
    lines.push(area.intro, '');
  }
  for (const q of area.questions) {
    lines.push(`- [ ] ${q}`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildReport(now) {
  const createdAt = (now || new Date()).toISOString();
  const header = `# Inspect Report

벼름의 마지막 단계 비춤. 도구를 빛에 비춰 결함을 봅니다. 6영역으로 점검합니다.

생성 시각: ${createdAt}
`;
  const sections = INSPECT_AREAS.map((area, i) => buildAreaSection(area, i + 1)).join('\n');
  const closing = `## 마무리

이 체크리스트는 자동으로 채워지지 않습니다. 답하지 못한 자리는 다이어리(\`.beoreum/project/diary.md\`)에 같이 남겨두세요. 만들면서, 출시 전에, 첫 사용자를 만났을 때, 그 질문이 다시 찾아옵니다.

7단계 흐름이 끝났습니다. 합성 README(\`.beoreum/project/generated/README.md\`)를 보면서 다음 일을 정해주세요.
`;
  return `${header}\n${sections}\n${closing}`;
}

// inspect는 7단계의 마지막. completed_stages에 inspect를 추가하고 current_stage는 'done' marker로.
// ADR 0016 결정 5.
function advanceState(state, stage) {
  const completed = Array.isArray(state.completed_stages) ? state.completed_stages : [];
  return {
    ...state,
    current_stage: DONE_MARKER,
    completed_stages: completed.includes(stage) ? completed : [...completed, stage],
  };
}

// runInspect는 7단계의 마지막 단계의 본체. 6영역 정적 체크리스트로 inspect-report.md를 만들고
// state.yml의 current_stage를 'done'으로 갱신한다.
//
// 입력:
//   cwd  - 프로젝트 루트 절대 경로
//   now  - 테스트용 결정적 시각(선택)
//
// 반환: { reportFile, areaCount, questionCount, isDone }
export async function runInspect({ cwd, now } = {}) {
  if (!cwd) throw new Error('runInspect({ cwd })가 필요합니다');

  const beoreumDir = join(cwd, '.beoreum');
  const stateFile = join(beoreumDir, 'state.yml');
  const reportFile = join(beoreumDir, 'project', 'inspect-report.md');

  const state = loadState(stateFile);
  ensureStage(state, STAGE);

  writeFileSync(reportFile, buildReport(now), 'utf8');
  writeFileSync(stateFile, yaml.dump(advanceState(state, STAGE), { sortKeys: false }), 'utf8');

  const questionCount = INSPECT_AREAS.reduce((sum, a) => sum + a.questions.length, 0);

  return {
    reportFile,
    areaCount: INSPECT_AREAS.length,
    questionCount,
    isDone: true,
  };
}
