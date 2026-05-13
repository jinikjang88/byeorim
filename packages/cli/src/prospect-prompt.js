// catalog-prompt.md 합성. ADR 0028의 외부 프롬프트 경로 자리.
// 사용자가 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 더 자세한 카탈로그를 받을 수 있는 프롬프트.
// 받은 응답은 `byeorim prospect import-catalog <file>` 명령으로 가져온다.
//
// API 어댑터(claude.js)의 CATALOG_SYSTEM_PROMPT와 별도다. API는 structured output schema가 강제하지만
// 외부 AI는 YAML 형식을 자연어로 안내해야 한다. 두 자리는 같은 결을 따르되 텍스트는 다르다.

import { FIELDS, QUESTIONS } from './prospect-questions.js';

const HEADER = `# 카탈로그 생성 프롬프트

이 프롬프트를 외부 AI(Claude.ai, ChatGPT, Gemini 등)에 붙여넣어 더 자세한 도메인 카탈로그를 받을 수 있어요.
응답으로 YAML 파일을 받으면 다음 명령으로 가져옵니다.

    byeorim prospect import-catalog <받은-파일.yml>

가져오기 전에 받은 파일이 catalog.schema.json 형식을 따르는지 자동 검증됩니다.
형식이 어긋나면 한국어 안내를 받으니 외부 AI에 다시 형식을 맞춰달라고 부탁하면 됩니다.

---

## AI에게 보낼 자리 (아래 ─── 사이를 모두 복사하세요)

──────────────────────────────────────────
`;

const FOOTER = `──────────────────────────────────────────
`;

// 외부 AI용 프롬프트 본문. structured output schema가 없으므로 YAML 형식과 예시를 자연어로 안내한다.
const SYSTEM_TEXT = `너는 사용자가 만들고 싶은 서비스의 도메인 카탈로그를 만드는 도우미다.
사용자의 7항목 답변을 보고 그 도메인에 맞는 worlds, blocks, dependencies, cascades, prerequisites를 합성한다.

규칙.
- worlds는 역할별 또는 활동 영역별 세계 3~6개. 각 세계는 id(소문자/숫자/하이픈, 첫 글자 영문, 예 w-customer), title, description.
- blocks는 각 세계 안에서 의미 있는 기능 단위 5~12개. id(예 b-order), name, user_desc(비기술 창업자가 읽는 일상 한국어), tech_desc(엔지니어가 읽는 기술 설명).
- dependencies는 명확한 인과만. source/target과 type("requires" 또는 "affects"), reason. 추측은 비운다.
- cascades는 한 블럭이 트리거됐을 때 사용자에게 더 묻고 싶은 질문(ask_questions). 도메인 상식 기반. 비어도 됨.
- prerequisites는 외부 조건(비용, 시간, 허가, 인프라). name과 enables 배열. 떠오르지 않으면 빈 배열.
- ID 패턴: ^[a-z][a-z0-9-]*$. 반드시 영문 소문자/숫자/하이픈만. 한국어 ID는 import에서 거부됩니다(예: 'order' OK, '주문' 거부). ADR 0042
- block에 옵셔널 path 필드를 박을 수 있어요. 자동 복수화 결과가 어색한 자리(mass noun, 동사형, 싱글톤 자원)를 정밀 조정. 예: shipping → "path: /shipments". ADR 0042

추측을 강요하지 않는다. 사용자 답변에서 근거를 찾지 못한 자리는 비운다(빈 dependencies, cascades, prerequisites).
시드 템플릿이 주어지면 그 worlds/blocks 구조를 참고하되 사용자 도메인에 맞춰 변형한다.

비기술 창업자가 다음 단계(블럭 선택)에서 읽을 자리이므로 user_desc는 일상 한국어로 쓴다.
마케팅 카피 형용사("강력한", "획기적인") 금지. 단정적 표현 대신 사실 묘사.`;

const OUTPUT_GUIDE = `## 출력 형식

다른 설명 없이 YAML 한 덩어리로 답한다. 코드 블럭 표시(\`\`\`yaml)도 빼고 YAML 본문만.

다음 모양을 따른다(필드 이름 그대로).

name: 사람이 읽는 한 줄 카탈로그 표시명
domain: 영문 슬러그 (소문자/숫자/하이픈)
worlds:
  - id: w-customer
    title: 손님 세계
    description: 한 줄 설명
  - id: w-operator
    title: 운영자 세계
    description: 한 줄 설명
blocks:
  - id: b-order
    name: 주문
    user_desc: 손님이 메뉴를 보고 주문을 넣는 자리
    tech_desc: 주문 데이터를 받아 결제와 묶는 자리
dependencies:
  - source: b-order
    target: b-payment
    type: requires
    reason: 주문이 끝나려면 결제가 필요함
cascades: []
prerequisites: []

## 예시 응답 (이 결을 참고해서 답해주세요)

특히 cascades.ask_questions는 반드시 \`{question: "..."}\` 객체 결로 박아주세요. 문자열 결로 박으면 import에서 거부됩니다. dependencies와 prerequisites도 비어 있지 않다면 같은 결로 채웁니다.

name: 동네 카페 주문 앱 카탈로그
domain: cafe-order
worlds:
  - id: w-customer
    title: 손님 세계
    description: 메뉴를 보고 주문하는 사람
  - id: w-operator
    title: 운영자 세계
    description: 메뉴와 주문을 관리하는 카페 사장님
blocks:
  - id: b-menu
    name: 메뉴
    user_desc: 카페의 메뉴 목록과 가격
    tech_desc: 메뉴 항목과 가격 정보 CRUD
  - id: b-order
    name: 주문
    user_desc: 손님이 메뉴를 골라 주문을 넣는 자리
    tech_desc: 주문 데이터를 받아 결제와 묶는 자리
  - id: b-payment
    name: 결제
    user_desc: 카드 또는 계좌이체로 값을 받는 자리
    tech_desc: PG 결제대행사 호출
dependencies:
  - source: b-order
    target: b-menu
    type: requires
    reason: 주문하려면 메뉴가 있어야 함
  - source: b-order
    target: b-payment
    type: requires
    reason: 주문이 끝나려면 결제가 필요함
cascades:
  - trigger: b-order
    ask_questions:
      - question: 주문 후 환불을 받을 수 있나요?
        options:
          - 가능
          - 불가능
          - 부분 환불만
        cascade_effects:
          - b-refund
      - question: 주문에 메모(특이사항)를 받을까요?
prerequisites:
  - name: PG 결제대행사 계정(카카오페이/네이버페이/토스페이먼츠 등)
    enables:
      - b-payment
`;

function formatAnswers(answers) {
  const lines = [];
  for (const key of FIELDS) {
    const label = (QUESTIONS[key] && QUESTIONS[key].label) || key;
    const value = answers[key] || '';
    lines.push(`- ${key} (${label}): ${value || '(비어있음)'}`);
  }
  return lines.join('\n');
}

// catalog-prompt.md 본문을 합성한다. 사용자가 외부 AI에 붙여넣을 자리(──── 사이)를 명확히 표시한다.
//
// 입력:
//   answers          - ProspectAnswers (7항목 답변)
//   suggestedTemplate - 빌트인 추천 이름 또는 null
//
// 반환: 마크다운 문자열
export function buildCatalogPromptMarkdown({ answers, suggestedTemplate } = {}) {
  const seed = suggestedTemplate
    ? `참고할 빌트인 시드 템플릿: ${suggestedTemplate}`
    : '참고할 빌트인 시드 템플릿: 없음 (처음부터 만들어줘)';
  const answersBlock = formatAnswers(answers || {});
  const body = [
    SYSTEM_TEXT,
    '',
    '## 사용자 답변 (7항목)',
    '',
    answersBlock,
    '',
    seed,
    '',
    OUTPUT_GUIDE,
  ].join('\n');
  return HEADER + body + '\n' + FOOTER;
}
