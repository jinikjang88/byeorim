#!/usr/bin/env node
// 벼름 CLI 엔트리포인트. 6단계 명령어와 status, init만 등록한다

import { Command } from 'commander';

const program = new Command();

program
  .name('beoreum')
  .description('AI로 자신의 서비스를 만들고 싶은 사람을 위한 협업 프로토콜')
  .version('0.1.0');

const notImplemented = (label) => () => {
  console.log(`${label} 단계는 아직 구현 예정입니다.`);
};

program
  .command('init')
  .description('새 벼름 프로젝트를 초기화한다')
  .action(() => {
    console.log('init 명령어는 아직 구현 예정입니다.');
  });

program
  .command('status')
  .description('현재 프로젝트의 단계와 상태를 본다')
  .action(() => {
    console.log('status 명령어는 아직 구현 예정입니다.');
  });

program
  .command('prospect')
  .alias('prs')
  .description('탐광. 도메인 카탈로그 발견과 Reality Check')
  .action(notImplemented('탐광(prospect)'));

program
  .command('smelt')
  .alias('sml')
  .description('제련. 의도 추출, 블럭 선택, 의존성 해결')
  .action(notImplemented('제련(smelt)'));

program
  .command('shape')
  .alias('shp')
  .description('빚다. 아키텍처 결정과 ADR 기록')
  .action(notImplemented('빚다(shape)'));

program
  .command('forge')
  .alias('frg')
  .description('단조. 계약 우선 구현과 코드 생성')
  .action(notImplemented('단조(forge)'));

program
  .command('temper')
  .alias('tmr')
  .description('다듬. 자동 검증과 Given-When-Then 테스트')
  .action(notImplemented('다듬(temper)'));

program
  .command('inspect')
  .alias('ins')
  .description('비춤. 다관점 리뷰')
  .action(notImplemented('비춤(inspect)'));

program.parse(process.argv);
