// runInit 단위 테스트. Given-When-Then 패턴 (CLAUDE.md 섹션 4)

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { runInit } from '../../packages/cli/index.js';

function makeTempCwd() {
  return mkdtempSync(join(tmpdir(), 'beoreum-init-'));
}

test('빈 디렉토리에서 .beoreum/ 작업 공간을 만든다', () => {
  // Given: 비어있는 임시 디렉토리
  const cwd = makeTempCwd();
  try {
    // When: runInit을 호출
    const result = runInit({ cwd });
    // Then: ADR 0007이 정한 자리에 디렉토리와 파일이 모두 생성된다
    assert.equal(existsSync(result.beoreumDir), true);
    assert.equal(existsSync(join(result.beoreumDir, 'project')), true);
    assert.equal(existsSync(result.stateFile), true);
    assert.equal(existsSync(result.diaryFile), true);
    assert.equal(existsSync(result.gitignoreFile), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('state.yml 형식이 ADR 0007의 결정을 따른다', () => {
  // Given: init이 끝난 임시 디렉토리
  const cwd = makeTempCwd();
  try {
    const fixedNow = new Date('2026-04-28T12:00:00.000Z');
    runInit({ cwd, now: fixedNow });
    // When: state.yml을 읽어 파싱한다
    const state = yaml.load(readFileSync(join(cwd, '.beoreum', 'state.yml'), 'utf8'));
    // Then: ADR 0007의 네 필드가 그대로 들어있다
    assert.equal(state.schema_version, 1);
    assert.equal(state.created_at, '2026-04-28T12:00:00.000Z');
    assert.equal(state.current_stage, 'prospect');
    assert.deepEqual(state.completed_stages, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('diary.md는 사용자에게 다이어리 의도를 안내하는 한국어 헤더로 시작한다', () => {
  // Given: init이 끝난 자리
  const cwd = makeTempCwd();
  try {
    runInit({ cwd });
    // When: diary.md 내용을 읽는다
    const content = readFileSync(join(cwd, '.beoreum', 'project', 'diary.md'), 'utf8');
    // Then: 다이어리 제목과 답하지 못한 질문을 적는 자리라는 안내가 들어있다
    assert.match(content, /^# 다이어리/);
    assert.match(content, /답하지 못한 질문/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('.gitignore는 project/generated/만 무시한다', () => {
  // Given: init이 끝난 자리
  const cwd = makeTempCwd();
  try {
    runInit({ cwd });
    // When: .beoreum/.gitignore를 읽는다
    const content = readFileSync(join(cwd, '.beoreum', '.gitignore'), 'utf8');
    // Then: project/generated/만 들어있다 (ADR 0007 결정 5)
    assert.match(content, /project\/generated\//);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('이미 .beoreum/이 있으면 한국어 메시지로 거부한다', () => {
  // Given: 한 번 init한 자리
  const cwd = makeTempCwd();
  try {
    runInit({ cwd });
    // When/Then: 같은 자리에 다시 init하면 한국어 메시지의 Error가 던져진다
    assert.throws(
      () => runInit({ cwd }),
      (err) => {
        assert.match(err.message, /\.beoreum\/ 작업 공간이 이미 있습니다/);
        assert.match(err.message, /직접 삭제한 뒤/);
        return true;
      },
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('cwd 인자가 없으면 한국어 메시지로 거부한다', () => {
  // Given: 인자 없음
  // When/Then: cwd가 필요하다는 한국어 메시지가 던져진다
  assert.throws(() => runInit(), /cwd.*필요합니다/);
});
