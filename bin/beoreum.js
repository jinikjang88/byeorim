#!/usr/bin/env node
// 벼름 CLI 엔트리포인트. 7단계 명령어(prospect, smelt, shape, forge, temper, set, inspect)와
// status, init을 등록한다. 각 명령어 본체는 @beoreum/cli 패키지의 src/<명령어>.js에 산다.

import { Command } from 'commander';
import {
  runInit,
  runProspect,
  interactiveProspect,
  importCatalog,
  runSmelt,
  interactiveSmelt,
  interactiveShape,
  interactiveForge,
  applyForgeReview,
  interactiveTemper,
  applyTemperReview,
  runSet,
  runInspect,
  interactiveAnswer,
  runStatus,
  runVerify,
  runRun,
} from '@beoreum/cli';
import { selectAdapter } from '@beoreum/ai';

const program = new Command();

program
  .name('beoreum')
  .description('AI로 자신의 서비스를 만들고 싶은 사람을 위한 협업 프로토콜')
  .version('0.1.0');

program.addHelpText(
  'after',
  `
환경 변수
  BEOREUM_AI_ADAPTER   사용할 AI 어댑터. mock(기본) 또는 claude
  ANTHROPIC_API_KEY    Anthropic API에 직접 호출할 때 필요한 키
  ANTHROPIC_BASE_URL   Claude Code 등 브릿지 서버를 거칠 때의 URL. 키 대신 사용 가능
  BEOREUM_AI_MODEL     사용할 모델 (기본 claude-opus-4-7)

예시
  $ beoreum prospect "온라인 책방"                                          # mock으로 흐름만 확인
  $ BEOREUM_AI_ADAPTER=claude ANTHROPIC_API_KEY=sk-... beoreum prospect "..."   # 직접 호출
  $ BEOREUM_AI_ADAPTER=claude ANTHROPIC_BASE_URL=http://localhost:3000 \\
      beoreum prospect "..."                                                # 브릿지 경유

자세한 안내는 README.md의 "AI 어댑터 설정" 절을 보세요.
`,
);

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
  .command('run')
  .description('생성된 backend + frontend를 한 명령으로 동시 기동한다(ADR 0047)')
  .option('--backend-only', 'backend만 기동')
  .option('--frontend-only', 'frontend만 기동')
  .action(async (options) => {
    if (options.backendOnly && options.frontendOnly) {
      console.error('--backend-only와 --frontend-only를 동시에 쓸 수 없습니다.');
      process.exit(1);
    }
    const target = options.backendOnly ? 'backend' : options.frontendOnly ? 'frontend' : 'both';

    const ac = new AbortController();
    const onSignal = () => {
      if (!ac.signal.aborted) ac.abort();
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    try {
      const result = await runRun({
        cwd: process.cwd(),
        target,
        signal: ac.signal,
      });
      const exitName = result.firstExit && result.firstExit.name;
      const exitCode =
        exitName === 'signal' ? 130 : (result.firstExit && result.firstExit.code) || 0;
      process.exit(exitCode);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
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

const prospectCmd = program
  .command('prospect')
  .alias('prs')
  .description('탐광. 7항목 동행 질문과 도메인 카탈로그 가져오기')
  .argument('[what...]', '만들고 싶은 것의 이름(생략 시 7항목 인터랙티브 모드, ADR 0026)')
  .action(async (what) => {
    try {
      const cwd = process.cwd();
      const adapter = selectAdapter();
      // 인자로 무엇을 적었으면 그 자리만 채우고 나머지 6항목은 빈 채로 다이어리에 흘려보낸다.
      // 인자 없으면 인터랙티브 모드로 7항목을 차례차례 묻는다(ADR 0026).
      const result =
        Array.isArray(what) && what.length > 0
          ? await runProspect({ cwd, answers: { what: what.join(' ') }, adapter })
          : await interactiveProspect({ cwd, adapter });
      console.log(`템플릿을 가져왔습니다: ${result.suggestedTemplate}`);
      console.log(`의도가 기록되었습니다: ${result.intentFile}`);
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

// prospect 보조 명령(ADR 0028). 외부 AI에서 받은 카탈로그 yml을 가져와 catalog.yml로 교체한다.
// 예: beoreum prospect import-catalog ./received-catalog.yml
prospectCmd
  .command('import-catalog')
  .alias('import')
  .description('외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 카탈로그 yml을 가져온다(ADR 0028)')
  .argument('<file>', '가져올 yml 파일 경로')
  .action((file) => {
    try {
      const cwd = process.cwd();
      importCatalog({ cwd, sourcePath: file });
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

program
  .command('smelt')
  .alias('sml')
  .description('제련. 블럭 선택(AI 추천 + 의존성 해결 + 검토)')
  .argument('[block-ids...]', '선택할 블럭 ID(생략 시 인터랙티브 모드, ADR 0029)')
  .action(async (blockIds) => {
    try {
      const cwd = process.cwd();
      const adapter = selectAdapter();
      const result =
        Array.isArray(blockIds) && blockIds.length > 0
          ? await runSmelt({ cwd, blockIds })
          : await interactiveSmelt({ cwd, adapter });
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
      if (result.blockReviewPromptFile) {
        console.log(
          '더 자세한 블럭 검토를 원하시면 .beoreum/project/prompts/block-review-prompt.md를 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 보세요(ADR 0030).',
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
  .description('빚다. 아키텍처 결정(AI 추천 + 검토)과 ADR 기록')
  .action(async () => {
    try {
      const adapter = selectAdapter();
      const result = await interactiveShape({ cwd: process.cwd(), adapter });
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
      if (result.architectureReviewPromptFile) {
        console.log(
          '더 자세한 아키텍처 검토를 원하시면 .beoreum/project/prompts/architecture-review-prompt.md를 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 보세요(ADR 0033).',
        );
      }
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

const forgeCmd = program
  .command('forge')
  .alias('frg')
  .description('단조. 계약 우선 정의(contracts.yml 생성, AI가 schema 채움, 검토)')
  .action(async () => {
    try {
      const adapter = selectAdapter();
      const result = await interactiveForge({ cwd: process.cwd(), adapter });
      console.log('');
      console.log(`계약을 만들었습니다: ${result.contractsFile}`);
      console.log(`블럭 ${result.blockCount}개, 엔드포인트 ${result.endpointCount}개`);
      if (result.schemaFilled) {
        console.log(`AI가 schema를 채웠습니다(${adapter.name} 어댑터).`);
      } else {
        console.log('schema가 TODO로 들어있습니다. 계약을 직접 채운 뒤 다음 단계로 가세요.');
      }
      if (result.contractsReviewPromptFile) {
        console.log(
          '더 자세한 계약 검토를 원하시면 .beoreum/project/prompts/contracts-review-prompt.md를 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 보세요(ADR 0035).',
        );
      }
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

// forge 보조 명령(ADR 0039). 외부 AI에서 받은 검토 응답 마크다운을 가져와 contracts.yml에 인터랙티브로 반영한다.
// 예: beoreum forge import-review ./response.md
forgeCmd
  .command('import-review')
  .description(
    '외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 검토 응답을 contracts.yml에 반영(ADR 0039)',
  )
  .argument('<file>', '가져올 응답 마크다운 파일 경로')
  .action(async (file) => {
    try {
      await applyForgeReview({ cwd: process.cwd(), responsePath: file });
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

const temperCmd = program
  .command('temper')
  .alias('tmr')
  .description('다듬. Given-When-Then 테스트 의도 + AI test_code 채움 (test-scenarios.yml 생성)')
  .action(async () => {
    try {
      const adapter = selectAdapter();
      const result = await interactiveTemper({ cwd: process.cwd(), adapter });
      console.log('');
      console.log(`테스트 의도를 만들었습니다: ${result.scenariosFile}`);
      console.log(`블럭 ${result.blockCount}개, 시나리오 ${result.scenarioCount}개`);
      if (result.testCodeFilled) {
        console.log(`AI가 test_code를 채웠습니다(${adapter.name} 어댑터).`);
      } else {
        console.log(
          'test_code가 TODO로 들어있습니다. 코드를 채운 뒤 다음 단계로 가거나, 어댑터 설정을 확인해주세요.',
        );
      }
      if (result.scenariosReviewPromptFile) {
        console.log(
          '더 자세한 시나리오 검토를 원하시면 .beoreum/project/prompts/test-scenarios-review-prompt.md를 외부 AI(Claude.ai/ChatGPT/Gemini)에 붙여넣어 보세요(ADR 0038).',
        );
      }
      console.log(`다음 단계: beoreum ${result.nextStage}`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  });

// temper 보조 명령(ADR 0040). 외부 AI에서 받은 시나리오 검토 응답을 test-scenarios.yml에 인터랙티브로 반영한다.
// 예: beoreum temper import-review ./response.md
temperCmd
  .command('import-review')
  .description(
    '외부 AI(Claude.ai/ChatGPT/Gemini)에서 받은 시나리오 검토 응답을 test-scenarios.yml에 반영(ADR 0040)',
  )
  .argument('<file>', '가져올 응답 마크다운 파일 경로')
  .action(async (file) => {
    try {
      await applyTemperReview({ cwd: process.cwd(), responsePath: file });
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
