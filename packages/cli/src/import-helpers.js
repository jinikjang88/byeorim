// import-review 모듈 공통 헬퍼. ADR 0054.
// forge/temper/smelt/shape/inspect 다섯 모듈이 같은 결로 짜여있는 자리를 한 곳에 모은다.
// CLAUDE.md 섹션 8(패턴 일관성, 단일 진실 소스).
//
// 모듈별 차이는 함수 인자(validate/locate/describe/applyOne)로 주입한다(ADR 0054 결정 2).

import { readFileSync } from 'node:fs';
import { select } from '@inquirer/prompts';

// readResponseFile은 외부 AI 응답 파일을 읽고 ENOENT를 한국어 메시지로 변환한다.
// 다른 에러는 그대로 throw.
export function readResponseFile(responsePath) {
  try {
    return readFileSync(responsePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`응답 파일을 찾지 못했어요: ${responsePath}`);
    }
    throw err;
  }
}

// logGracefulDegrade는 응답 형식이 어긋났을 때 사용자에게 한국어 안내를 출력한다.
// ADR 0039 결정 6(forge), 0040(temper), 0051(inspect), 0052(smelt), 0053(shape)이 같은 결.
//
// 입력:
//   log         - 콘솔 출력 함수
//   parseResult - parseReviewResponse 또는 parseFindingsResponse의 결과 (parseError 필드 사용)
//   ymlName     - 사용자가 손으로 다듬을 yml 또는 md 파일 이름(예: 'contracts.yml')
//   sectionName - 응답에서 찾던 섹션 이름(기본: '## 제안된 변경 사항')
export function logGracefulDegrade({
  log,
  parseResult,
  ymlName,
  sectionName = '## 제안된 변경 사항',
}) {
  log('');
  log(`응답에서 "${sectionName}" 섹션을 못 알아봤어요.`);
  if (parseResult && parseResult.parseError) {
    log(`  사유: ${parseResult.parseError}`);
  }
  log('외부 AI가 자유 형식으로만 답했거나 형식이 어긋났을 수 있어요.');
  log(
    `응답을 직접 보시고 ${ymlName}을 손으로 다듬으시거나, 외부 AI에 형식대로 다시 답해달라고 부탁해주세요.`,
  );
}

// runValidationLoop는 외부 AI가 준 raw items 배열에 대해 형식 + 위치 검증을 돌린다.
// 모든 모듈에서 같은 결로 박혀있던 for 루프를 한 곳으로.
//
// 입력:
//   proposed - parseReviewResponse의 changes 또는 parseFindingsResponse의 findings 배열
//   validate(item) - 형식 검증. { valid, reason } 반환. (필수)
//   locate(item) - 위치 검증. { ok, ... } 또는 { ok: false, reason } 반환. (선택, 없으면 형식만 검증)
//   describe(item) - invalid 안내에 박힐 한 줄. (선택, 없으면 빈 문자열)
//
// 반환: { validItems, invalidNotes }
//   validItems - [{ change, located? }] (locate가 있으면 located 포함)
//   invalidNotes - 한국어 한 줄 배열. invalid 사유를 사용자에게 보여줄 자리
export function runValidationLoop({ proposed, validate, locate, describe }) {
  const validItems = [];
  const invalidNotes = [];
  for (let i = 0; i < proposed.length; i += 1) {
    const item = proposed[i];
    const formatCheck = validate(item);
    if (!formatCheck.valid) {
      invalidNotes.push(`#${i + 1} 형식 어긋남: ${formatCheck.reason}`);
      continue;
    }
    if (locate) {
      const located = locate(item);
      if (!located.ok) {
        const desc = describe ? describe(item) : '';
        invalidNotes.push(`#${i + 1} ${desc} - ${located.reason}`.trim());
        continue;
      }
      validItems.push({ change: item, located });
    } else {
      validItems.push({ change: item });
    }
  }
  return { validItems, invalidNotes };
}

// runChangePicker는 valid items를 한 자리씩 사용자에게 보여주고 batch picker로 적용/건너뛰기 결정.
// ADR 0045의 batch 모드 결: apply / skip / apply_all_remaining / skip_all_remaining / stop.
//
// 입력:
//   items - runValidationLoop의 validItems
//   applyOne(item) - 한 변경을 적용 (in-place mutation). item은 { change, located? }
//   confirmChange({ change, located, index, total, log }) - 사용자에게 묻는 함수. decision 문자열 반환
//   log - 콘솔 출력 함수
//
// 반환: { appliedCount, skippedCount, stopped }
export async function runChangePicker({ items, applyOne, confirmChange, log }) {
  let appliedCount = 0;
  let skippedCount = 0;
  let stopped = false;
  let mode = 'prompt'; // 'prompt' | 'apply_all' | 'skip_all'

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    let decision;
    if (mode === 'apply_all') decision = 'apply';
    else if (mode === 'skip_all') decision = 'skip';
    else
      decision = await confirmChange({
        change: item.change,
        located: item.located,
        index: i,
        total: items.length,
        log,
      });

    if (decision === 'apply_all_remaining') {
      mode = 'apply_all';
      decision = 'apply';
    } else if (decision === 'skip_all_remaining') {
      mode = 'skip_all';
      decision = 'skip';
    }

    if (decision === 'apply') {
      applyOne(item);
      appliedCount += 1;
    } else if (decision === 'skip') {
      skippedCount += 1;
    } else if (decision === 'stop') {
      stopped = true;
      break;
    }
  }

  return { appliedCount, skippedCount, stopped };
}

// batchPickerSelect는 ADR 0045 batch 5지선다 결을 한 곳에서 박는다.
// 각 모듈의 defaultConfirmChange가 description/reason을 빌드해 호출.
//
// 입력:
//   description - picker에 표시할 한 줄 (예: '[1/3] payment 추가')
//   reason - 외부 AI가 준 이유 (선택)
//   log - 콘솔 출력 함수
//
// 반환: 'apply' | 'skip' | 'apply_all_remaining' | 'skip_all_remaining' | 'stop'
export async function batchPickerSelect({ description, reason, log = console.log } = {}) {
  log('');
  if (description) log(description);
  if (reason) log(`  이유: ${reason}`);
  log('');
  return select({
    message: '어떻게 할까요?',
    choices: [
      { name: '적용하기', value: 'apply' },
      { name: '건너뛰기', value: 'skip' },
      { name: '이번부터 모두 적용', value: 'apply_all_remaining' },
      { name: '이번부터 모두 건너뛰기', value: 'skip_all_remaining' },
      { name: '여기서 멈추기', value: 'stop' },
    ],
    default: 'apply',
  });
}

// logSummary는 picker가 끝난 뒤 정리 한 줄을 출력한다.
//
// 입력:
//   log - 콘솔 출력 함수
//   appliedCount, skippedCount - runChangePicker 결과
//   stopped - 사용자가 stop으로 끊었는지
//   total - 검토했던 총 valid items 수
export function logSummary({ log, appliedCount, skippedCount, stopped, total }) {
  log('');
  const remaining = stopped ? total - appliedCount - skippedCount : 0;
  log(
    `정리. 적용 ${appliedCount}개, 건너뜀 ${skippedCount}개${
      stopped ? `, 멈춤(남은 ${remaining}개)` : ''
    }.`,
  );
}
