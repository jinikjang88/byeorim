// byeorim answer. decisions.yml의 빈 answer 항목을 하나씩 사용자에게 물어 채운다.
// ADR 0010(decisions.yml 형식)과 ADR 0011(인터랙티브 prompt 정책)을 따른다.
// ADR 0003의 동행 톤: "나중에 답하기"로 건너뛸 수 있다. 건너뛴 항목은 빈 answer로 남는다.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { select } from '@inquirer/prompts';

// answer 명령어는 단계에 묶이지 않는다. smelt가 decisions.yml을 만든 뒤 언제든 부를 수 있다.

function ensureFile(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${path}이(가) 없습니다. ${hint}`);
  }
}

// 기본 askAnswer. @inquirer/prompts의 select로 옵션 + "나중에 답하기"를 보여준다.
// 사용자가 "나중에 답하기"를 고르면 null을 돌려준다(건너뜀 신호).
async function defaultAskAnswer(decision) {
  const choices = [
    ...decision.options.map((opt) => ({ name: opt, value: opt })),
    { name: '나중에 답하기 (건너뜀)', value: null },
  ];
  return select({
    message: `[${decision.trigger}] ${decision.question}`,
    choices,
  });
}

function isUnanswered(decision) {
  return !decision || !decision.answer;
}

// interactiveAnswer는 decisions.yml의 빈 answer를 채우는 자리.
// askAnswer 함수는 의존성 주입(ADR 0011 결정 5)이라 단위 테스트가 결정적이다.
//
// 입력:
//   cwd        - 프로젝트 루트 절대 경로
//   askAnswer  - async (decision) => string|null. 사용자가 고른 옵션 또는 null(건너뜀)
//   now        - 테스트용 결정적 시각(선택)
//
// 반환: { totalCount, unansweredBefore, answeredCount, skippedCount, allAnswered }
export async function interactiveAnswer({ cwd, askAnswer = defaultAskAnswer, now } = {}) {
  if (!cwd) throw new Error('interactiveAnswer({ cwd })가 필요합니다');

  const decisionsFile = join(cwd, '.byeorim', 'project', 'decisions.yml');
  ensureFile(decisionsFile, '먼저 byeorim smelt를 실행해주세요');

  const doc = yaml.load(readFileSync(decisionsFile, 'utf8')) || {};
  const decisions = Array.isArray(doc.decisions) ? doc.decisions : [];

  const totalCount = decisions.length;
  const unansweredIndexes = decisions
    .map((d, i) => (isUnanswered(d) ? i : -1))
    .filter((i) => i >= 0);
  const unansweredBefore = unansweredIndexes.length;

  if (unansweredBefore === 0) {
    return {
      totalCount,
      unansweredBefore: 0,
      answeredCount: 0,
      skippedCount: 0,
      allAnswered: totalCount > 0,
    };
  }

  const updated = [...decisions];
  let answeredCount = 0;
  let skippedCount = 0;

  for (const i of unansweredIndexes) {
    const answer = await askAnswer(decisions[i]);
    if (answer === null || answer === undefined) {
      skippedCount += 1;
      continue;
    }
    updated[i] = {
      ...decisions[i],
      answer,
      answered_at: (now || new Date()).toISOString(),
    };
    answeredCount += 1;
  }

  if (answeredCount > 0) {
    const newDoc = { ...doc, decisions: updated };
    writeFileSync(decisionsFile, yaml.dump(newDoc, { sortKeys: false }), 'utf8');
  }

  return {
    totalCount,
    unansweredBefore,
    answeredCount,
    skippedCount,
    allAnswered: answeredCount === unansweredBefore,
  };
}
