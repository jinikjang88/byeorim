#!/usr/bin/env node
// 벼름 CLI 엔트리포인트. 7단계 명령어(prospect, smelt, shape, forge, temper, set, inspect)와
// status, init을 등록한다. 각 명령어 본체는 @beoreum/cli 패키지의 src/<명령어>.js에 산다.

import { Command } from 'commander';
import {
  runInit,
  runProspect,
  interactiveProspect,
  runSmelt,
  interactiveSmelt,
  interactiveShape,
  runForge,
  runTemper,
  runSet,
  runInspect,
  interactiveAnswer,
  runStatus,
  runVerify,
} from '@beoreum/cli';
import { selectAdapter } from '@beoreum/ai';

const program = new Command();

program
  .name('beoreum')
  .description('AI로 자신의 서비스를 만들고 싶은 사람을 위한 협업 프로토콜')
  .version('0.1.0');

program
  .command('init')
  .description('현재 디렉토리에 .beoreum/ 작업 공간을 만든다')
  .action(() => {
    try {
      const { beoreumDir } = runInit({ cwd: process.cwd() });
      console.log(`벼름 작업 공간을 만들었습니다: ${beoreumDir}`);
      console.log('다음 단계: beoreum prospect');
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('현재 프로젝트의 단계와 상태를 본다')
  .action(() => {
    try {
      const status = runStatus({ cwd: process.cwd() });
      if (!status.initialized) {
        console.log('벼름 작업 공간이 없습니다.');
        console.log('beoreum init을 먼저 실행해주세요.');
        return;
      }

      console.log(`벼름 작업 공간: ${status.beoreumDir}`);
      console.log(`시작 시각: ${status.created_at}`);
      console.log('');
      console.log('진행 상황:');
      for (const stage of status.stages) {
        const marker =
          stage.status === 'completed'
            ? '[완료]'
            : stage.status === 'current'
              ? '[현재]'
              : '[대기]';
        console.log(`  ${marker} ${stage.id} (${stage.korean})`);
      }

      if (status.decisions) {
        console.log('');
        console.log(
          `cascade 결정: 총 ${status.decisions.total}개 중 ${status.decisions.answered}개 답함, ${status.decisions.pending}개 남음`,
        );
      }

      console.log('');
      if (status.is_done) {
        console.log('7단계 흐름이 끝났습니다.');
        if (status.artifacts.generated_readme) {
          console.log(`  합성 README: ${status.beoreumDir}/project/generated/README.md`);
        }
        if (status.artifacts.inspect_report) {
          console.log(`  체크리스트: ${status.beoreumDir}/project/inspect-report.md`);
        }
      } else if (status.next_stage) {
        console.log(`다음 단계: beoreum ${status.next_stage}`);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('생성된 backend/frontend의 컴파일과 테스트를 실행한다')
  .action(async () => {
    try {
      const result = await runVerify({ cwd: process.cwd() });
      console.log(`검증 리포트: ${result.reportFile}`);
      console.log(`전체: ${result.passedCount} 성공, ${result.failedCount} 실패`);
      for (const target of result.targets) {
        const status = target.passed ? '성공' : '실패';
        console.log(`  [${status}] ${target.label} (마지막 명령: ${target.lastCommand})`);
      }
      if (!result.allPassed) {
        console.error('');
        console.error('일부 대상이 실패했습니다. verify-report.md에서 자세한 내용을 보세요.');
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('answer')
  .description('cascade 결정 답안에 답한다 (decisions.yml의 빈 자리 채우기)')
  .action(async () => {
    try {
      const result = await interactiveAnswer({ cwd: process.cwd() });
      if (result.totalCount === 0) {
        console.log('아직 결정이 없습니다. 먼저 beoreum smelt를 실행해주세요.');
        return;
      }
      if (result.unansweredBefore === 0) {
        console.log(`모든 결정에 이미 답하셨습니다 (${result.totalCount}개).`);
        return;
      }
      console.log(`답한 결정 ${result.answeredCount}개, 건너뛴 결정 ${result.skippedCount}개`);
      if (result.allAnswered) {
        console.log('모든 결정에 답을 채웠습니다.');
      } else {
        console.log(
          `아직 답하지 않은 결정이 ${result.unansweredBefore - result.answeredCount}개 남아있습니다. 다음에 다시 beoreum answer로 채울 수 있습니다.`,
        );
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('prospect')
  .alias('prs')
  .description('탐광. 도메인 카탈로그 발견과 Reality Check')
  .argument('[input...]', '무엇을 만들고 싶은지 한 마디로(생략 시 인터랙티브 모드)')
  .action(async (input) => {
    try {
      const cwd = process.cwd();
      const adapter = selectAdapter();
      const result =
        Array.isArray(input) && input.length > 0
          ? await runProspect({ cwd, userInput: input.join(' '), adapter })
          : await interactiveProspect({ cwd, adapter });
      console.log(`템플릿을 가져왔습니다: ${result.suggestedTemplate}`);
      console.log(`의도가 기록되었습니다: ${result.intentFile}`);
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('smelt')
  .alias('sml')
  .description('제련. 의도 추출, 블럭 선택, 의존성 해결')
  .argument('[block-ids...]', '선택할 블럭 ID(생략 시 인터랙티브 모드)')
  .action(async (blockIds) => {
    try {
      const cwd = process.cwd();
      const result =
        Array.isArray(blockIds) && blockIds.length > 0
          ? await runSmelt({ cwd, blockIds })
          : await interactiveSmelt({ cwd });
      console.log(`선택한 블럭: ${result.selected.join(', ')}`);
      if (result.autoAdded.length > 0) {
        console.log(`자동 추가된 블럭(requires): ${result.autoAdded.join(', ')}`);
      }
      if (result.affected.length > 0) {
        console.log(`영향 받는 블럭(affects): ${result.affected.join(', ')}`);
      }
      if (result.prerequisites.length > 0) {
        console.log(
          `World 0 준비물 ${result.prerequisites.length}개: ${result.prerequisites.map((p) => p.name).join(', ')}`,
        );
      }
      if (result.decisions.length > 0) {
        console.log(
          `수집된 결정 ${result.decisions.length}개. ${result.decisionsFile}에서 답을 적어주세요`,
        );
      }
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('shape')
  .alias('shp')
  .description('빚다. 아키텍처 결정과 ADR 기록')
  .action(async () => {
    try {
      const result = await interactiveShape({ cwd: process.cwd() });
      const { context, choices } = result;
      console.log('');
      console.log('맥락 요약');
      console.log(
        `  선택한 블럭 ${context.selectedCount}개, 자동 추가 ${context.autoAddedCount}개, 영향 ${context.affectedCount}개`,
      );
      console.log(`  World 0 준비물 ${context.prerequisitesCount}개`);
      console.log(
        `  cascade 결정 ${context.decisionsTotal}개 중 ${context.decisionsAnswered}개 답함, ${context.decisionsPending}개 남음`,
      );
      console.log('');
      console.log('확정된 결정');
      console.log(`  언어: ${choices.language}`);
      console.log(`  저장소: ${choices.database}`);
      console.log(`  API: ${choices.api_style}`);
      console.log(`  구조: ${choices.architecture_pattern}`);
      console.log(`기록 자리: ${result.architectureFile}`);
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('forge')
  .alias('frg')
  .description('단조. 계약 우선 정의 (contracts.yml 생성, AI가 schema 채움)')
  .action(async () => {
    try {
      const adapter = selectAdapter();
      const result = await runForge({ cwd: process.cwd(), adapter });
      console.log(`계약을 만들었습니다: ${result.contractsFile}`);
      console.log(`블럭 ${result.blockCount}개, 엔드포인트 ${result.endpointCount}개`);
      if (result.schemaFilled) {
        console.log(`AI가 schema를 채웠습니다(${adapter.name} 어댑터).`);
      } else {
        console.log('schema가 TODO로 들어있습니다. 계약을 직접 채운 뒤 다음 단계로 가세요.');
      }
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('temper')
  .alias('tmr')
  .description('다듬. Given-When-Then 테스트 의도 (test-scenarios.yml 생성)')
  .action(async () => {
    try {
      const result = await runTemper({ cwd: process.cwd() });
      console.log(`테스트 의도를 만들었습니다: ${result.scenariosFile}`);
      console.log(`블럭 ${result.blockCount}개, 시나리오 ${result.scenarioCount}개`);
      console.log(
        'test_code가 TODO로 들어있습니다. 코드를 채운 뒤 다음 단계로 가거나, 다음 단계가 자동 채움을 도울 때까지 기다리세요.',
      );
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('set')
  .description('세움. 7단계 산출물을 한 README로 합성 (코드 생성은 미래 출시)')
  .action(async () => {
    try {
      const result = await runSet({ cwd: process.cwd() });
      console.log(`합성 README를 만들었습니다: ${result.readmeFile}`);
      console.log(`검증 리포트 자리: ${result.verifyFile}`);
      console.log(
        `블럭 ${result.blockCount}개, 엔드포인트 ${result.endpointCount}개, 시나리오 ${result.scenarioCount}개`,
      );
      if (result.backendDir) {
        console.log('');
        console.log(`백엔드 스켈레톤(${result.language}): ${result.backendDir}`);
        console.log(`파일 ${result.backendFileCount}개 생성. backend/README.md를 먼저 읽으세요.`);
      } else if (result.language) {
        console.log('');
        console.log(
          `언어 "${result.language}"의 코드 생성기는 미래 출시 자리입니다. README 합성만 만들었습니다.`,
        );
      }
      if (result.frontendDir) {
        console.log('');
        console.log(`프론트엔드 스켈레톤(React): ${result.frontendDir}`);
        console.log(`파일 ${result.frontendFileCount}개 생성. frontend/README.md를 먼저 읽으세요.`);
      }
      console.log('');
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('inspect')
  .alias('ins')
  .description('비춤. 6영역 다관점 체크리스트 (보안/성능/운영/확장성/법적/시장 재검)')
  .action(async () => {
    try {
      const result = await runInspect({ cwd: process.cwd() });
      console.log(`체크리스트를 만들었습니다: ${result.reportFile}`);
      console.log(`영역 ${result.areaCount}개, 질문 ${result.questionCount}개`);
      console.log('');
      console.log('7단계 흐름이 끝났습니다.');
      console.log(
        '체크리스트를 채워가며 출시를 준비하세요. 답하지 못한 자리는 다이어리에 남겨두세요.',
      );
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
